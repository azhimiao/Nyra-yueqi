/** Minimal EventEmitter for browser OpenClaw slice. */
export class EventEmitter {
  constructor() {
    this._e = new Map();
  }
  on(ev, fn) {
    if (!this._e.has(ev)) this._e.set(ev, new Set());
    this._e.get(ev).add(fn);
    return this;
  }
  once(ev, fn) {
    const wrap = (...a) => {
      this.off(ev, wrap);
      fn(...a);
    };
    return this.on(ev, wrap);
  }
  off(ev, fn) {
    this._e.get(ev)?.delete(fn);
    return this;
  }
  removeListener(ev, fn) { return this.off(ev, fn); }
  addListener(ev, fn) { return this.on(ev, fn); }
  emit(ev, ...args) {
    const set = this._e.get(ev);
    if (!set) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }
  removeAllListeners(ev) {
    if (ev) this._e.delete(ev);
    else this._e.clear();
    return this;
  }
  setMaxListeners() { return this; }
}
export default { EventEmitter };
