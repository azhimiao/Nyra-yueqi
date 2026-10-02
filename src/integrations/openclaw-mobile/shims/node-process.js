const proc = {
  env: {},
  platform: "browser",
  arch: "wasm32",
  versions: { node: "0.0.0-nyra-mobile" },
  cwd: () => "/",
  nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
  exit() {
    throw new Error("process.exit unavailable in Nyra mobile runtime");
  },
  kill() {
    throw new Error("process.kill unavailable in Nyra mobile runtime");
  },
  pid: 1,
  ppid: 0,
  browser: true,
  stdout: { write() {}, isTTY: false },
  stderr: { write() {}, isTTY: false },
  stdin: { isTTY: false },
};

if (!globalThis.process) globalThis.process = proc;
export default proc;
export const env = proc.env;
export const platform = proc.platform;
export const cwd = proc.cwd;
export const nextTick = proc.nextTick;
export const versions = proc.versions;
