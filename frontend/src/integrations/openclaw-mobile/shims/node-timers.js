export function setTimeout(...args) { return globalThis.setTimeout(...args); }
export function clearTimeout(...args) { return globalThis.clearTimeout(...args); }
export function setInterval(...args) { return globalThis.setInterval(...args); }
export function clearInterval(...args) { return globalThis.clearInterval(...args); }
export function setImmediate(fn) { return globalThis.setTimeout(fn, 0); }
export function clearImmediate(id) { return globalThis.clearTimeout(id); }
export default { setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate };
