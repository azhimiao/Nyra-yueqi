/**
 * Serialized JSON account store (users / sync / grants / usage).
 * Matches FileEconomyStore.transact — prevents lost credit updates under concurrency.
 */

import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
} from "node:fs/promises";
import { dirname } from "node:path";

export function emptyAccountStore() {
  return {
    users: {},
    sync: {},
    grants: {},
    usage: {},
    billingWallets: {},
    billingLedger: [],
    billingReservations: {},
    redeemCodes: {},
    referralCodes: {},
    referralCodesByUser: {},
    referralRedemptions: {},
    purchaseOrders: {},
    usageEvents: {},
    agentRuns: {},
    emailOtps: [],
    sessions: {},
    deviceRegistrations: {},
  };
}

export function createAccountStore(dataFile) {
  let queue = Promise.resolve();

  async function readStore() {
    try {
      const parsed = JSON.parse(await readFile(dataFile, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("account store root must be an object");
      }
      return {
        users: parsed.users || {},
        sync: parsed.sync || {},
        grants: parsed.grants || {},
        usage: parsed.usage || {},
        billingWallets: parsed.billingWallets || {},
        billingLedger: Array.isArray(parsed.billingLedger) ? parsed.billingLedger : [],
        billingReservations: parsed.billingReservations || {},
        redeemCodes: parsed.redeemCodes || {},
        referralCodes: parsed.referralCodes || {},
        referralCodesByUser: parsed.referralCodesByUser || {},
        referralRedemptions: parsed.referralRedemptions || {},
        purchaseOrders: parsed.purchaseOrders || {},
        usageEvents: parsed.usageEvents || {},
        agentRuns: parsed.agentRuns || {},
        emailOtps: Array.isArray(parsed.emailOtps) ? parsed.emailOtps : [],
        sessions: parsed.sessions || {},
        deviceRegistrations: parsed.deviceRegistrations || {},
      };
    } catch (error) {
      if (error?.code === "ENOENT") return emptyAccountStore();
      const corruption = new Error(
        `Account store is unreadable; refusing to replace durable data: ${dataFile}`,
        { cause: error },
      );
      corruption.code = "account_store_corrupt";
      throw corruption;
    }
  }

  async function writeStore(store) {
    const directory = dirname(dataFile);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const pendingFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(pendingFile, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(store, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await copyFile(dataFile, `${dataFile}.bak`);
      await chmod(`${dataFile}.bak`, 0o600);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(pendingFile, dataFile);
    await chmod(dataFile, 0o600);
    try {
      const directoryHandle = await open(directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      // Directory fsync is unsupported on Windows; Linux production supports it.
      if (process.platform !== "win32") throw error;
    }
    return store;
  }

  /**
   * @template T
   * @param {(store: ReturnType<typeof emptyAccountStore>) => Promise<T> | T} mutator
   * @returns {Promise<T>}
   */
  function transact(mutator) {
    const operation = queue.then(async () => {
      const store = await readStore();
      const result = await mutator(store);
      await writeStore(store);
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }

  return { readStore, writeStore, transact };
}
