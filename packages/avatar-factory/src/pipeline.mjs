import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  V1_ACTIONS,
  ACTION_META,
  validateCharacterSpec,
  validateAvatarManifest,
  RENDERER_ID,
} from "../../avatar-contract/src/index.mjs";
import { writeFixturePng } from "./fixture-art.mjs";
import {
  loadJob,
  saveJob,
  markStage,
  stageDone,
  hashFile,
  PACKS_DIR,
  writeJson,
  readJson,
} from "./job-store.mjs";
import { matteSources } from "./stages/matting.mjs";
import { runRegistrationStage } from "./stages/registration.mjs";
import {
  buildQualityReport,
  detectDuplicateActionFrames,
  evaluateFacePack,
} from "./stages/quality.mjs";
import { createProvider } from "./providers/real-provider.mjs";
import { ProviderError, PROVIDER_NOT_CONFIGURED } from "./providers/types.mjs";

async function setState(dir, job, state) {
  job.state = state;
  await saveJob(dir, job);
}

/** @type {Map<string, object>} */
const providerCache = new Map();

async function getProvider(job) {
  const key = String(job.jobId || job.provider || "default");
  if (!providerCache.has(key)) {
    providerCache.set(key, await createProvider(job.provider || "fixture"));
  }
  return providerCache.get(key);
}

async function failJob(dir, job, err) {
  job.state = "failed";
  job.error = {
    code: err?.code || PROVIDER_NOT_CONFIGURED,
    message: String(err?.message || err),
    errorClass: err?.errorClass || null,
    status: err?.status || null,
  };
  await saveJob(dir, job);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function motionFromSpec(spec) {
  const p = spec.personalityMotion;
  return {
    breathAmp: 0.008 + p.energy * 0.012,
    swayAmp: 0.004 + (1 - p.shyness) * 0.01,
    blinkRate: p.blinkRate,
    gazeAvoidance: p.gazeAvoidance,
    reactionSpeed: p.reactionSpeed,
  };
}

async function runIdentity(dir, job, spec) {
  const inputHash = createHash("sha256").update(JSON.stringify(spec.visual)).digest("hex");
  if (stageDone(job, "identity", inputHash) && (await exists(path.join(dir, "identity", "candidate-01.png")))) {
    return;
  }
  await setState(dir, job, "identity_generating");
  try {
    const provider = await getProvider(job);
    await provider.generateIdentity({
      spec,
      outDir: path.join(dir, "identity"),
      count: 4,
    });
    job.providerModel = provider.model;
    job.promptTemplateVersion = provider.promptTemplateVersion;
  } catch (e) {
    await failJob(dir, job, e instanceof ProviderError ? e : new ProviderError(e?.code || PROVIDER_NOT_CONFIGURED, String(e?.message || e)));
    throw e;
  }
  markStage(job, "identity", inputHash);
  if (job.autoLock) {
    await fs.copyFile(
      path.join(dir, "identity", "candidate-01.png"),
      path.join(dir, "identity", "locked.png"),
    );
    await writeJson(path.join(dir, "identity", "lock.json"), {
      lockedAt: new Date().toISOString(),
      source: "candidate-01.png",
      mode: job.provider === "real" ? "auto-lock-real" : "auto-lock-fixture",
    });
    await setState(dir, job, "canonical_generating");
  } else {
    await setState(dir, job, "awaiting_identity_lock");
  }
  await saveJob(dir, job);
}

async function ensureLock(dir, job) {
  if (await exists(path.join(dir, "identity", "locked.png"))) return true;
  if (job.autoLock) {
    await fs.copyFile(
      path.join(dir, "identity", "candidate-01.png"),
      path.join(dir, "identity", "locked.png"),
    );
    await writeJson(path.join(dir, "identity", "lock.json"), {
      lockedAt: new Date().toISOString(),
      source: "candidate-01.png",
      mode: "auto-lock-fixture",
    });
    return true;
  }
  return false;
}

async function runCanonical(dir, job, spec) {
  if (!(await ensureLock(dir, job))) {
    await setState(dir, job, "awaiting_identity_lock");
    return false;
  }
  const lockHash = await hashFile(path.join(dir, "identity", "locked.png"));
  if (stageDone(job, "canonical", lockHash)) return true;
  await setState(dir, job, "canonical_generating");
  const provider = await getProvider(job);
  const lockedPath = path.join(dir, "identity", "locked.png");
  try {
    await provider.generateCanonical({
      spec,
      lockedPath,
      outDir: path.join(dir, "canonical"),
    });
  } catch (e) {
    await failJob(dir, job, e);
    throw e;
  }
  markStage(job, "canonical", lockHash);
  await saveJob(dir, job);
  return true;
}

async function runActions(dir, job, spec) {
  const lockHash = await hashFile(path.join(dir, "identity", "locked.png"));
  if (stageDone(job, "actions", lockHash)) return;
  await setState(dir, job, "actions_generating");
  const provider = await getProvider(job);
  const lockedPath = path.join(dir, "identity", "locked.png");
  try {
    for (const action of V1_ACTIONS) {
      const n = ACTION_META[action].keyframes;
      for (let i = 1; i <= n; i++) {
        const outPath = path.join(dir, "actions", action, `frame-0${i}.png`);
        await provider.generateActionFrame({
          spec,
          lockedPath,
          action,
          frameIndex: i,
          outPath,
        });
      }
    }
  } catch (e) {
    await failJob(dir, job, e);
    throw e;
  }
  markStage(job, "actions", lockHash);
  await saveJob(dir, job);
}

async function runFace(dir, job, spec) {
  const lockHash = await hashFile(path.join(dir, "identity", "locked.png"));
  if (stageDone(job, "face", lockHash)) return;
  await setState(dir, job, "face_pack_generating");
  const provider = await getProvider(job);
  const faceRefPath = path.join(dir, "canonical", "face.png");
  const parts = [
    ["base.png", "base", "neutral"],
    ["eyes/open.png", "eyes", "open"],
    ["eyes/closed.png", "eyes", "closed"],
    ["eyes/half.png", "eyes", "half"],
    ["eyes/happy.png", "eyes", "happy"],
    ["brows/neutral.png", "brows", "neutral"],
    ["brows/happy.png", "brows", "happy"],
    ["brows/concerned.png", "brows", "concerned"],
    ["brows/annoyed.png", "brows", "annoyed"],
    ["mouth/closed.png", "mouth", "closed"],
    ["mouth/small.png", "mouth", "small"],
    ["mouth/medium.png", "mouth", "medium"],
    ["mouth/open.png", "mouth", "open"],
    ["mouth/smile.png", "mouth", "smile"],
    ["blush/soft.png", "blush", "soft"],
  ];
  const notes = [];
  for (const [rel, part, variant] of parts) {
    const outPath = path.join(dir, "face", rel);
    const r = await provider.inpaintFacePart({
      spec,
      faceRefPath: (await exists(faceRefPath)) ? faceRefPath : path.join(dir, "identity", "locked.png"),
      part,
      variant,
      outPath,
    });
    if (r?.degraded) {
      job.faceDegraded = true;
      notes.push(r.note || `${part}/${variant}`);
    }
  }
  await writeJson(path.join(dir, "face", "anchors.json"), {
    faceAnchor: { x: 512, y: 420 },
    leftEyeAnchor: { x: 470, y: 400 },
    rightEyeAnchor: { x: 554, y: 400 },
    mouthAnchor: { x: 512, y: 460 },
  });
  await writeJson(path.join(dir, "face", "degrade-notes.json"), notes);
  markStage(job, "face", lockHash);
  await saveJob(dir, job);
}

async function walkPngs(root) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.png$/i.test(e.name)) out.push(p);
    }
  }
  await walk(root);
  return out;
}

async function runMatting(dir, job) {
  const lockHash = await hashFile(path.join(dir, "identity", "locked.png"));
  if (stageDone(job, "matting", lockHash) && (await exists(path.join(dir, "matting-report.json")))) {
    return readJson(path.join(dir, "matting-report.json"));
  }
  await setState(dir, job, "matting");
  const sources = [
    ...(await walkPngs(path.join(dir, "actions"))),
    ...(await walkPngs(path.join(dir, "face"))),
    ...(await walkPngs(path.join(dir, "canonical"))),
  ];
  const report = await matteSources(dir, sources, {
    // Prefer isnet-anime when python+deps available; set AVATAR_SKIP_PYTHON_MATTE=1 to force gray flood.
    preferPython: process.env.AVATAR_SKIP_PYTHON_MATTE !== "1",
  });
  // On missing deps / failure → fallback_matting recorded in matting-report + provenance.
  await writeJson(path.join(dir, "matting-report.json"), report);
  job.matting = {
    primaryMode: report.primaryMode,
    usedIsnet: report.usedIsnet,
    usedFallback: report.usedFallback,
  };
  markStage(job, "matting", lockHash);
  await saveJob(dir, job);
  return report;
}

async function runRegister(dir, job) {
  const lockHash = await hashFile(path.join(dir, "identity", "locked.png"));
  if (stageDone(job, "register", lockHash) && (await exists(path.join(dir, "register-report.json")))) {
    return readJson(path.join(dir, "register-report.json"));
  }
  await setState(dir, job, "registering");
  const report = await runRegistrationStage(dir);
  await writeJson(path.join(dir, "register-report.json"), report);
  markStage(job, "register", lockHash);
  await saveJob(dir, job);
  return report;
}

async function runQaAndPackage(dir, job, spec, mattingReport, registerReport) {
  await setState(dir, job, "quality_checking");
  const isFixture = job.provider === "fixture";

  const duplicates = await detectDuplicateActionFrames(path.join(dir, "registered", "actions"));
  const faceEval = await evaluateFacePack(path.join(dir, "registered", "face"));
  const faceNotes = (await readJson(path.join(dir, "face", "degrade-notes.json"))) || [];
  // Fixture art is synthetic → cap publish tier presentation at D even if files are complete.
  // Real path without mask inpaint → DEGRADED_PASS face tier (does not fail whole pack).
  let face = faceEval;
  if (isFixture) {
    face = { ...faceEval, qualityTier: "D", result: "DEGRADED_PASS", note: "fixture_synthetic_face" };
  } else if (job.faceDegraded || job.provider === "real") {
    face = {
      ...faceEval,
      qualityTier: faceEval.qualityTier === "A" ? "C" : faceEval.qualityTier || "D",
      result: "DEGRADED_PASS",
      note: "no_mask_inpaint; best-effort I2I/crop face parts",
      degradeNotes: faceNotes,
    };
  }

  const qa = buildQualityReport({
    isFixture,
    matting: mattingReport,
    registration: registerReport,
    duplicates,
    face,
  });
  await writeJson(path.join(dir, "quality-report.json"), qa);

  await setState(dir, job, "packaging");
  const packRoot = isFixture
    ? path.join(PACKS_DIR, "_fixture", spec.characterId)
    : path.join(PACKS_DIR, spec.characterId);
  await fs.rm(packRoot, { recursive: true, force: true });
  await fs.mkdir(packRoot, { recursive: true });

  async function copyTree(from, to) {
    const files = await walkPngs(from);
    for (const src of files) {
      const rel = path.relative(from, src);
      const dest = path.join(to, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
  }
  await copyTree(path.join(dir, "registered", "actions"), path.join(packRoot, "actions"));
  await copyTree(path.join(dir, "registered", "face"), path.join(packRoot, "face"));
  await fs.mkdir(path.join(packRoot, "identity"), { recursive: true });
  await fs.copyFile(path.join(dir, "identity", "locked.png"), path.join(packRoot, "identity", "locked.png"));
  await fs.copyFile(path.join(dir, "face", "anchors.json"), path.join(packRoot, "face", "anchors.json")).catch(() => {});

  const qualityTier = qa.qualityTier;
  const actions = {};
  for (const id of V1_ACTIONS) {
    const meta = ACTION_META[id];
    const reg = registerReport?.actions?.[id];
    const n = reg?.keyframes > 0 ? reg.keyframes : meta.keyframes;
    const frames = [];
    for (let i = 1; i <= n; i++) {
      frames.push(`actions/${id}/frame-0${i}.png`);
    }
    actions[id] = {
      playback: meta.playback,
      returnAction: meta.returnAction || null,
      frames,
      fps: 8,
      degraded: Boolean(reg?.degraded),
    };
  }

  const hashParts = [];
  for (const id of V1_ACTIONS) {
    hashParts.push(await hashFile(path.join(packRoot, actions[id].frames[0])));
  }
  const assetsHash = createHash("sha256").update(hashParts.join("|")).digest("hex").slice(0, 24);

  const anchors = (await readJson(path.join(packRoot, "face", "anchors.json"))) || {};
  const manifest = {
    schemaVersion: 1,
    avatarId: `${spec.characterId}_v1`,
    characterId: spec.characterId,
    identityVersion: 1,
    renderer: RENDERER_ID,
    qualityTier,
    publishable: Boolean(qa.publishable),
    canvas: { width: 1024, height: 1024, baselineY: 880, centerX: 512 },
    actions,
    face: {
      qualityTier,
      anchors,
      layers: {
        base: "face/base.png",
        eyesOpen: "face/eyes/open.png",
        eyesClosed: "face/eyes/closed.png",
        mouthClosed: "face/mouth/closed.png",
        mouthOpen: "face/mouth/open.png",
      },
    },
    props: {
      diary: { atlas: "props/diary.png", anchor: { x: 0.7, y: 0.55 } },
      photo: { atlas: "props/photo.png", anchor: { x: 0.7, y: 0.55 } },
      book: { atlas: "props/book.png", anchor: { x: 0.7, y: 0.55 } },
      gift: { atlas: "props/gift.png", anchor: { x: 0.7, y: 0.55 } },
    },
    hitboxes: [{ id: "body", x: 300, y: 200, w: 424, h: 700 }],
    motionProfile: motionFromSpec(spec),
    assetsHash,
  };

  const v = validateAvatarManifest(manifest);
  if (!v.ok) throw new Error(`manifest invalid: ${v.errors.join("; ")}`);

  await writeJson(path.join(packRoot, "manifest.json"), manifest);
  await writeJson(path.join(packRoot, "quality-report.json"), qa);
  await writeJson(path.join(packRoot, "provenance.json"), {
    provider: job.provider,
    model: isFixture ? "fixture" : job.providerModel || "unknown",
    promptTemplateVersion: job.promptTemplateVersion || (isFixture ? "v1-fixture" : "v1-visual-protocol"),
    seed: spec.provider?.seed ?? null,
    generatedAt: new Date().toISOString(),
    retries: job.retries,
    estimatedCostUsd: 0,
    licenseNote: "internal-catalog-only",
    publishable: Boolean(qa.publishable),
    matting: {
      primaryMode: mattingReport?.primaryMode || null,
      usedIsnet: mattingReport?.usedIsnet ?? 0,
      usedFallback: mattingReport?.usedFallback ?? 0,
      fallbackPolicy: "fallback_matting",
    },
    registration: {
      mode: registerReport?.mode || null,
      result: registerReport?.result || null,
      thresholds: registerReport?.thresholds || null,
    },
    qaResult: qa.result,
  });
  if (isFixture) {
    await writeFixturePng(path.join(packRoot, "preview", "contact-sheet.png"), {
      kind: "idle",
      characterId: spec.characterId,
    });
  } else {
    await fs.mkdir(path.join(packRoot, "preview"), { recursive: true });
    await fs.copyFile(
      path.join(dir, "identity", "locked.png"),
      path.join(packRoot, "preview", "contact-sheet.png"),
    );
  }
  for (const prop of ["diary", "photo", "book", "gift"]) {
    await writeFixturePng(path.join(packRoot, "props", `${prop}.png`), {
      kind: "mouth_closed",
      characterId: prop,
      size: 256,
    });
  }

  const catalogPath = path.join(PACKS_DIR, "catalog.json");
  const catalog = (await readJson(catalogPath)) || { schemaVersion: 1, avatars: [] };
  const rel = path.relative(PACKS_DIR, packRoot).replace(/\\/g, "/");
  catalog.avatars = catalog.avatars.filter((a) => a.characterId !== spec.characterId);
  catalog.avatars.push({
    characterId: spec.characterId,
    avatarId: manifest.avatarId,
    manifestUrl: `/avatar-packs/${rel}/manifest.json`,
    publishable: Boolean(qa.publishable),
    fixture: isFixture,
    qaResult: qa.result,
  });
  await writeJson(catalogPath, catalog);

  job.qualityTier = qualityTier;
  job.publishable = Boolean(qa.publishable);
  job.packPath = packRoot;
  job.qaResult = qa.result;
  await setState(dir, job, "ready");
  await saveJob(dir, job);
  return packRoot;
}

export async function resumeJob(jobId, { retry = false } = {}) {
  const { job, dir, spec } = await loadJob(jobId);
  const v = validateCharacterSpec(spec);
  if (!v.ok) throw new Error(`bad spec: ${v.errors.join("; ")}`);

  if (job.state === "ready") return { job, packPath: job.packPath };
  if (job.state === "failed") {
    if (!retry) return { job, packPath: job.packPath, error: job.error };
    job.error = null;
    job.state = "created";
    await saveJob(dir, job);
  }

  await runIdentity(dir, job, spec);
  const locked = await runCanonical(dir, job, spec);
  if (!locked) return { job, waiting: "awaiting_identity_lock" };

  await runActions(dir, job, spec);
  await runFace(dir, job, spec);
  const mattingReport = await runMatting(dir, job);
  const registerReport = await runRegister(dir, job);
  const packPath = await runQaAndPackage(dir, job, spec, mattingReport, registerReport);
  return { job, packPath };
}

export async function createAndRun({ spec, provider = "fixture", autoLock = true }) {
  const v = validateCharacterSpec(spec);
  if (!v.ok) throw new Error(`bad spec: ${v.errors.join("; ")}`);
  const { createJob } = await import("./job-store.mjs");
  const { job } = await createJob({ spec, provider, autoLock });
  return resumeJob(job.jobId);
}
