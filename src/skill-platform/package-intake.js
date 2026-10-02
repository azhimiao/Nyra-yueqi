/**
 * Unified Package Intake (R5) — zip / folder / yueqi-skill safety + install envelope.
 */
import { unzipSync, strFromU8 } from "fflate";
import { createPackageManifestV1, validatePackageManifestV1, mintId } from "../contracts/index.js";

export const INTAKE_LIMITS = Object.freeze({
  maxFiles: 200,
  maxUncompressedBytes: 8 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
});

const FORBIDDEN_EXT = /\.(exe|dll|bat|cmd|sh|ps1|msi|com|scr)$/i;

/**
 * @param {Uint8Array} bytes
 */
export function inspectZipBytes(bytes) {
  const errors = [];
  if (!(bytes instanceof Uint8Array) && !(bytes?.buffer)) {
    return { ok: false, errors: ["not_bytes"] };
  }
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let unzipped;
  try {
    unzipped = unzipSync(raw);
  } catch (e) {
    return { ok: false, errors: [`unzip_failed:${e?.message || e}`] };
  }
  const names = Object.keys(unzipped || {});
  if (names.length > INTAKE_LIMITS.maxFiles) errors.push("too_many_files");
  let total = 0;
  const files = {};
  for (const name of names) {
    const n = String(name || "").replace(/\\/g, "/");
    if (!n || n.endsWith("/")) continue;
    if (n.startsWith("/") || n.includes("..") || /^[A-Za-z]:/.test(n)) {
      errors.push("path_traversal");
      continue;
    }
    if (FORBIDDEN_EXT.test(n)) {
      errors.push("executable_rejected");
      continue;
    }
    const data = unzipped[name];
    const size = data?.byteLength || 0;
    total += size;
    if (size > INTAKE_LIMITS.maxEntryBytes) errors.push("entry_too_large");
    if (total > INTAKE_LIMITS.maxUncompressedBytes) errors.push("zip_bomb_or_too_large");
    try {
      files[n] = strFromU8(data);
    } catch {
      files[n] = "";
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)], files };
  const skillMd = Object.keys(files).find((k) => /(^|\/)SKILL\.md$/i.test(k));
  return { ok: true, files, skillMd: skillMd || "", fileCount: Object.keys(files).length };
}

/**
 * Build natural-language capability preview for users (no JSON/path exposure required).
 */
export function buildCapabilityPreview(manifest, files = {}) {
  const name = String(manifest?.name || "未命名能力包");
  const caps = Array.isArray(manifest?.requestedCapabilities) ? manifest.requestedCapabilities : [];
  const willRead = caps.filter((c) => /read|memory|context/i.test(String(c)));
  const mayWrite = caps.filter((c) => /write|task|tool|file/i.test(String(c)));
  return {
    title: name,
    summary: `「${name}」可以帮你完成一套专业工作流。`,
    willRead: willRead.length ? willRead.map(String) : ["仅你确认后的对话内容"],
    mayModify: mayWrite.length ? mayWrite.map(String) : ["不会在未授权时改动你的数据"],
    hasSkillMd: Boolean(Object.keys(files).some((k) => /(^|\/)SKILL\.md$/i.test(k))),
  };
}

export function buildInstallManifestFromFiles(files, opts = {}) {
  const skillMd = Object.keys(files || {}).find((k) => /(^|\/)SKILL\.md$/i.test(k)) || "";
  const manifest = createPackageManifestV1({
    packageId: opts.packageId || mintId("packageId"),
    packageType: opts.packageType || "skill",
    name: opts.name || "Imported Skill",
    version: opts.version || "1.0.0",
    contentHash: opts.contentHash || `sha256:${Object.keys(files || {}).length}`,
    requestedCapabilities: opts.requestedCapabilities || [],
    entry: skillMd || "SKILL.md",
    sourceLabel: opts.sourceLabel || "zip_intake",
  });
  const v = validatePackageManifestV1(manifest);
  return { ok: v.ok, manifest, errors: v.errors, preview: buildCapabilityPreview(manifest, files) };
}
