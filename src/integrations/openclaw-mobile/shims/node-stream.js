import { EventEmitter } from "./node-events.js";

export class Readable extends EventEmitter {
  constructor() {
    super();
    this.readable = true;
  }
  pipe() { return this; }
  read() { return null; }
  destroy() { return this; }
}
export class Writable extends EventEmitter {
  constructor() {
    super();
    this.writable = true;
  }
  write(_chunk, _enc, cb) {
    if (typeof cb === "function") cb();
    return true;
  }
  end(cb) {
    if (typeof cb === "function") cb();
    this.emit("finish");
    return this;
  }
  destroy() { return this; }
}
export class PassThrough extends Readable {
  write(chunk, enc, cb) {
    this.emit("data", chunk);
    if (typeof cb === "function") cb();
    return true;
  }
  end(cb) {
    this.emit("end");
    if (typeof cb === "function") cb();
    return this;
  }
}
export class Transform extends PassThrough {}
export class Duplex extends PassThrough {}
export function pipeline(...args) {
  const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
  if (cb) queueMicrotask(() => cb());
  return args[0];
}
export function finished(stream, cb) {
  if (cb) queueMicrotask(() => cb());
  return stream;
}
export default { Readable, Writable, PassThrough, Transform, Duplex, pipeline, finished };
