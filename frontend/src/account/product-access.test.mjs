import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(String(key), String(value));
  },
  removeItem(key) {
    store.delete(String(key));
  },
};
globalThis.window = globalThis;

const {
  ensureLocalOfflineSession,
  isHostedModelSource,
  isLocalOfflineSession,
  isManagedProductMode,
  readProductAccess,
  writeProductAccess,
} = await import("./product-access.js");

assert.equal(isLocalOfflineSession(), true);
assert.equal(isHostedModelSource(), false);
assert.equal(isManagedProductMode(), false);

writeProductAccess({
  loggedIn: true,
  authMode: "online",
  modelSource: "hosted",
  token: "should-not-stick",
  credits: 99,
  username: "cloud-user",
});
const access = readProductAccess();
assert.equal(access.loggedIn, false);
assert.equal(access.authMode, "offline");
assert.equal(access.modelSource, "byok");
assert.equal(access.token, "");
assert.equal(access.credits, 0);
assert.equal(access.username, "本机");
assert.equal(access.userId, "local");

const session = ensureLocalOfflineSession();
assert.equal(session.authMode, "offline");
assert.equal(session.loggedIn, false);

console.log("PASS product-access stays local BYOK without login or credits");
