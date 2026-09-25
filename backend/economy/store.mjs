import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
} from "node:fs/promises";
import { dirname } from "node:path";
import { ECONOMY_SCHEMA_VERSION } from "./catalog.mjs";

function emptyState() {
  return {
    schemaVersion: ECONOMY_SCHEMA_VERSION,
    actors: {},
    wallets: {},
    transactions: {},
    products: {},
    listings: {},
    orders: {},
    ownerships: {},
    resources: {},
    intents: {},
    productionRuns: {},
    generativeObjects: {},
    decisions: {},
    events: [],
    idempotency: {},
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeState(raw = {}) {
  const base = emptyState();
  for (const key of [
    "actors",
    "wallets",
    "transactions",
    "products",
    "listings",
    "orders",
    "ownerships",
    "resources",
    "intents",
    "productionRuns",
    "generativeObjects",
    "decisions",
    "idempotency",
  ]) {
    base[key] = raw?.[key] && typeof raw[key] === "object" && !Array.isArray(raw[key])
      ? raw[key]
      : {};
  }
  base.events = Array.isArray(raw?.events) ? raw.events : [];
  base.schemaVersion = ECONOMY_SCHEMA_VERSION;
  base.updatedAt = String(raw?.updatedAt || base.updatedAt);
  return base;
}

export class FileEconomyStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("economy store root must be an object");
      }
      return normalizeState(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") return emptyState();
      const corruption = new Error(
        `Economy store is unreadable; refusing to replace durable data: ${this.filePath}`,
        { cause: error },
      );
      corruption.code = "economy_store_corrupt";
      throw corruption;
    }
  }

  async write(state) {
    const next = normalizeState(state);
    next.updatedAt = new Date().toISOString();
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const pending = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(pending, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(next, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await copyFile(this.filePath, `${this.filePath}.bak`);
      await chmod(`${this.filePath}.bak`, 0o600);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(pending, this.filePath);
    await chmod(this.filePath, 0o600);
    try {
      const directoryHandle = await open(directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      if (process.platform !== "win32") throw error;
    }
    return next;
  }

  /** Serialize every mutation so postings and ownership cannot interleave. */
  async transact(mutator) {
    const operation = this.queue.then(async () => {
      const state = await this.read();
      const result = await mutator(state);
      await this.write(state);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}

export function createFileEconomyStore(filePath) {
  return new FileEconomyStore(filePath);
}
