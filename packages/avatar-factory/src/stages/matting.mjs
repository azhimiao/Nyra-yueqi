/**
 * Matting stage: prefer Python rembg isnet-anime; fallback gray flood.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matteGrayFixture } from "../fixture-art.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const MATTE_PY = path.join(ROOT, "python", "avatar-media-worker", "matte.py");

export const MATTING_MODES = Object.freeze({
  ISNET: "isnet-anime",
  FALLBACK: "fallback_matting",
});

function resolvePythonBin() {
  return (
    process.env.AVATAR_MATTE_PYTHON ||
    process.env.XINGLI_REMBG_PYTHON ||
    process.env.PYTHON ||
    "python"
  );
}

/**
 * Spawn matte.py; resolves with parsed JSON summary or throws.
 * @param {string} inPath
 * @param {string} outPath
 * @param {{ pythonBin?: string, timeoutMs?: number }} [opts]
 */
export function spawnPythonMatte(inPath, outPath, opts = {}) {
  const pythonBin = opts.pythonBin || resolvePythonBin();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [MATTE_PY, inPath, outPath], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("matte.py timed out"));
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed = null;
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
      if (line) {
        try {
          parsed = JSON.parse(line);
        } catch {
          /* ignore */
        }
      }
      if (code === 0 && parsed?.ok) {
        resolve(parsed);
        return;
      }
      const detail = parsed?.detail || parsed?.error || stderr.slice(-500) || `exit ${code}`;
      reject(new Error(String(detail)));
    });
  });
}

/**
 * Probe whether python + rembg deps can run (cheap missing-file check + import via matte dry).
 * Cached per process.
 */
let _pythonReady = undefined;

export async function pythonMatteAvailable(opts = {}) {
  if (_pythonReady !== undefined) return _pythonReady;
  try {
    await fs.access(MATTE_PY);
    const pythonBin = opts.pythonBin || resolvePythonBin();
    const ok = await new Promise((resolve) => {
      const child = spawn(
        pythonBin,
        ["-c", "import rembg, PIL, numpy; print('ok')"],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, opts.probeTimeoutMs ?? 15_000);
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
    _pythonReady = ok;
  } catch {
    _pythonReady = false;
  }
  return _pythonReady;
}

/** Reset probe cache (tests). */
export function resetPythonMatteCache() {
  _pythonReady = undefined;
}

/**
 * Matte one image. Prefer isnet-anime; on failure → fallback_matting.
 * @returns {Promise<{ mode: string, ok: boolean, error?: string, model?: string, alphaCoverage?: number, elapsedMs?: number }>}
 */
export async function matteOne(inPath, outPath, opts = {}) {
  const preferPython = opts.preferPython !== false;
  if (preferPython && (await pythonMatteAvailable(opts))) {
    try {
      const result = await spawnPythonMatte(inPath, outPath, opts);
      return {
        mode: MATTING_MODES.ISNET,
        ok: true,
        model: result.model || MATTING_MODES.ISNET,
        alphaCoverage: result.alphaCoverage,
        elapsedMs: result.elapsedMs,
      };
    } catch (e) {
      // fall through
      const err = String(e.message || e);
      await matteGrayFixture(inPath, outPath);
      return {
        mode: MATTING_MODES.FALLBACK,
        ok: true,
        error: err,
        model: MATTING_MODES.FALLBACK,
      };
    }
  }
  await matteGrayFixture(inPath, outPath);
  return {
    mode: MATTING_MODES.FALLBACK,
    ok: true,
    error: preferPython ? "python_or_deps_unavailable" : "preferPython=false",
    model: MATTING_MODES.FALLBACK,
  };
}

/**
 * Matte many sources into destRoot mirroring relative paths from jobDir.
 */
export async function matteSources(jobDir, sources, opts = {}) {
  const files = [];
  let usedIsnet = 0;
  let usedFallback = 0;
  for (const src of sources) {
    const rel = path.relative(jobDir, src);
    const dest = path.join(jobDir, "processed", rel);
    const r = await matteOne(src, dest, opts);
    if (r.mode === MATTING_MODES.ISNET) usedIsnet += 1;
    else usedFallback += 1;
    files.push({ rel: rel.replace(/\\/g, "/"), ...r });
  }
  const primaryMode =
    usedIsnet > 0 && usedFallback === 0
      ? MATTING_MODES.ISNET
      : usedIsnet > 0
        ? "mixed"
        : MATTING_MODES.FALLBACK;
  return {
    primaryMode,
    usedIsnet,
    usedFallback,
    files,
    /** QA check result for matting stage */
    checkResult: primaryMode === MATTING_MODES.ISNET ? "PASS" : "DEGRADED_PASS",
  };
}
