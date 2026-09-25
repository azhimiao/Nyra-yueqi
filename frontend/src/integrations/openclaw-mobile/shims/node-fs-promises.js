import { UnsupportedRuntimeCapabilityError } from "./kill-tree.js";

function deny(name) {
  return Promise.reject(
    new UnsupportedRuntimeCapabilityError(
      `fs/promises.${name} is unavailable in Nyra mobile runtime. Use App Workspace Adapter.`,
    ),
  );
}

export const readFile = (...a) => deny("readFile");
export const writeFile = (...a) => deny("writeFile");
export const appendFile = (...a) => deny("appendFile");
export const access = (...a) => deny("access");
export const mkdir = (...a) => deny("mkdir");
export const mkdtemp = (...a) => deny("mkdtemp");
export const readdir = (...a) => deny("readdir");
export const rm = (...a) => deny("rm");
export const unlink = (...a) => deny("unlink");
export const stat = (...a) => deny("stat");
export const lstat = (...a) => deny("lstat");
export const realpath = (...a) => deny("realpath");
export const open = (...a) => deny("open");
export default {
  readFile, writeFile, appendFile, access, mkdir, mkdtemp, readdir, rm, unlink, stat, lstat, realpath, open,
};
