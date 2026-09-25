/** Frozen Nyra archive constants  */

export const NYRA_ARCHIVE_VERSION = 1;
export const NYRA_ARCHIVE_MIME = "application/vnd.nyra.archive";
export const NYRA_EXTENSION = ".nyra";
export const NYRA_MANIFEST_SCHEMA = "nyra.archive.manifest";
export const NYRA_RESOURCE_SCHEMA = "nyra.resource.metadata";

export const NYRA_LIMITS = Object.freeze({
  maxCiphertextBytes: 4 * 1024 * 1024 * 1024,
  maxEntries: 20_000,
  maxEntryBytes: 1 * 1024 * 1024 * 1024,
  maxManifestBytes: 512 * 1024,
  maxPathLength: 240,
  maxCompressionRatio: 100,
});

/** Fields / paths that must never be restored from client archives. */
export const SERVER_AUTHORITATIVE_DENYLIST = Object.freeze([
  "password",
  "passwordHash",
  "authCredential",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "gateSessionToken",
  "apiKey",
  "ttsApiKey",
  "sttApiKey",
  "billingCredit",
  "BillingCredit",
  "creditsBalance",
  "whop",
  "paymentOrder",
  "redemption",
  "serverWallet",
  "serverEconomy",
  "provider.apiKey",
]);

export const FORBIDDEN_RESTORE_TOP_KEYS = Object.freeze([
  "billingCredits",
  "serverLedger",
  "hostedSecrets",
  "auth",
  "credentials",
]);
