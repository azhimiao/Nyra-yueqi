/**
 * YEOS sideload installer — dispatch by manifest kind
 */

import { unpackYeosFile, unpackYeosPackage } from "./package-io.js";
import { KIND_PHONE_EXT, KIND_GAME, KIND_POP_PLUGIN, kindLabelZh } from "./kinds.js";
import { upsertInstalledExtension } from "../phone-ext/registry.js";
import { upsertInstalledGame } from "./registry-games.js";
import { upsertInstalledPlugin } from "./registry-plugins.js";

/**
 * @param {object} unpacked
 * @param {{ source?: string, grantedPermissions?: string[] }} [opts]
 */
export function installUnpacked(unpacked, opts = {}) {
  if (!unpacked?.ok) return unpacked;
  const kind = unpacked.manifest?.kind;
  const payload = {
    manifest: unpacked.manifest,
    files: unpacked.files,
    iconDataUrl: unpacked.iconDataUrl,
    packageSha256: unpacked.packageSha256,
    source: opts.source === "cloud" ? "cloud" : "sideload",
    grantedPermissions: opts.grantedPermissions || [],
  };

  if (kind === KIND_PHONE_EXT) {
    const saved = upsertInstalledExtension(payload);
    if (!saved.ok) return saved;
    return { ok: true, kind, record: saved.extension };
  }

  if (kind === KIND_GAME) {
    const saved = upsertInstalledGame(payload);
    if (!saved.ok) return saved;
    return { ok: true, kind, record: saved.game };
  }

  if (kind === KIND_POP_PLUGIN) {
    const saved = upsertInstalledPlugin(payload);
    if (!saved.ok) return saved;
    return { ok: true, kind, record: saved.plugin };
  }

  return {
    ok: false,
    code: "unsupported_kind",
    message: `${kindLabelZh(kind)}侧载尚未在本版本开放，请等待后续更新`,
  };
}

/**
 * @param {File|Blob} file
 * @param {{ source?: string, grantedPermissions?: string[] }} [opts]
 */
export async function installPackage(file, opts = {}) {
  const unpacked = await unpackYeosFile(file);
  if (!unpacked.ok) return unpacked;
  return installUnpacked(unpacked, opts);
}

/**
 * @param {Uint8Array} bytes
 * @param {{ source?: string, grantedPermissions?: string[] }} [opts]
 */
export async function installPackageBytes(bytes, opts = {}) {
  const unpacked = await unpackYeosPackage(bytes);
  if (!unpacked.ok) return unpacked;
  return installUnpacked(unpacked, opts);
}

/**
 * Validate without installing — for preview UI.
 * @param {File|Blob} file
 */
export async function previewPackage(file) {
  return unpackYeosFile(file);
}

export { unpackYeosFile, unpackYeosPackage };
