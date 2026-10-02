import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

function deny(name) {
  throw new UnsupportedRuntimeCapabilityError(
    `fs.${name} is unavailable in Nyra mobile runtime. Use App Workspace Adapter.`,
  );
}

export function readFileSync() { deny("readFileSync"); }
export function writeFileSync() { deny("writeFileSync"); }
export function existsSync() { return false; }
export function statSync() { deny("statSync"); }
export function lstatSync() { deny("lstatSync"); }
export function readdirSync() { deny("readdirSync"); }
export function mkdirSync() { deny("mkdirSync"); }
export function rmSync() { deny("rmSync"); }
export function unlinkSync() { deny("unlinkSync"); }
export function createReadStream() { deny("createReadStream"); }
export function createWriteStream() { deny("createWriteStream"); }
export function openSync() { deny("openSync"); }
export function closeSync() { deny("closeSync"); }
export function realpathSync() { deny("realpathSync"); }
export function accessSync() { deny("accessSync"); }
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
export default {
  readFileSync, writeFileSync, existsSync, statSync, lstatSync, readdirSync,
  mkdirSync, rmSync, unlinkSync, createReadStream, createWriteStream,
  openSync, closeSync, realpathSync, accessSync, constants,
};
