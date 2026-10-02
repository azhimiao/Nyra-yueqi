/**
 * Xingche pet poses — from-scratch pipeline (NO girl reference):
 *   1) T2I 日系帅哥三视图 (7.5头身)
 *   2) I2I 微缩桌宠三视图 (3头身)
 *   3) I2I 定妆待机锁
 *   4) I2I 迭代动作
 *
 * Usage:
 *   node scripts/generate-pet-poses.mjs
 *   node scripts/generate-pet-poses.mjs --from sheet        # rebuild from step1
 *   node scripts/generate-pet-poses.mjs --from chibi        # rebuild from step2
 *   node scripts/generate-pet-poses.mjs --from lock         # only actions from lock
 *   node scripts/generate-pet-poses.mjs --only greet,selfie
 *
 * Env: ARK_API_KEY, ARK_IMAGE_MODEL, ARK_BASE_URL
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "pet-poses");
const PUBLIC_DIR = path.join(ROOT, "public", "assets", "pet-poses");

const SHEET_HANDSOME = path.join(OUT_DIR, "_sheet_handsome.png");
const SHEET_CHIBI = path.join(OUT_DIR, "_sheet_chibi.png");
const LOCK_PATH = path.join(OUT_DIR, "_character-lock.png");

const BASE_URL = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com").replace(/\/$/, "");
const MODEL = process.env.ARK_IMAGE_MODEL || "doubao-seedream-4-5-251128";

/** Character bible — identity only, no girl-ref language */
const CHAR = {
  name: "Xingche / 星澈",
  // Handsome anime proportions first
  handsomeRatio: "7.5-head-tall proportions (七头半身), slim tall anime male body",
  // Desktop pet miniaturized proportions
  chibiRatio: "exactly 3-head-tall proportions (三头身), large head small body, desktop mascot scale",
  face: "handsome Japanese anime young man, sharp yet gentle features, almond brown eyes with soft highlights, straight nose, light pink blush, calm charming smile",
  hair: "short layered dark brown hair, slightly messy bangs, soft volume, clean anime hairline",
  outfit:
    "oversized navy zip-up hoodie worn open, soft pink graphic tee, dark charcoal cargo shorts, white crew socks, pink-and-white chunky sneakers, vintage camera on purple-white braided strap",
  style:
    "high-quality Japanese anime illustration, clean lineart, soft cel shading, polished digital painting, no photorealism, no 3D render",
  bg: "plain solid soft off-white background, no scenery, no text, no watermark, no UI, no logos",
};

const POSES = [
  {
    id: "idle_default",
    prompt:
      "Pose: front-facing idle standing, both hands in hoodie pockets, relaxed confident charming look, feet together, full body centered.",
  },
  {
    id: "sleep_pose",
    prompt:
      "Pose: sleeping curled on his side, eyes closed peaceful, one hand under cheek, soft sleepy expression, full body visible.",
  },
  {
    id: "greet",
    prompt:
      "Pose: standing greeting, waving right hand cheerfully, friendly bright smile, slight lean forward, welcoming gesture, full body.",
  },
  {
    id: "selfie",
    prompt:
      "Pose: taking a selfie, holding smartphone toward viewer with one hand, peace sign with the other, playful cute expression, full body.",
  },
  {
    id: "talking_default",
    prompt:
      "Pose: mid-conversation, mouth slightly open speaking, one hand gently raised chatting, lively warm eyes, full body.",
  },
  {
    id: "react_tap",
    prompt:
      "Pose: startled reaction after being tapped, slight jump, both hands near chest, blushing cheeks, surprised open mouth, full body.",
  },
  {
    id: "comfort",
    prompt:
      "Pose: comforting gesture, soft caring smile, both hands open gently toward viewer as if offering a hug, tender warm eyes, full body.",
  },
];

function parseFlag(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || true;
}

function parseOnly() {
  const raw = parseFlag("--only");
  if (!raw || raw === true) return null;
  return new Set(String(raw).split(",").map((s) => s.trim()).filter(Boolean));
}

async function loadEnvFile() {
  try {
    const raw = await fs.readFile(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

async function fileToDataUrl(filePath) {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".webp" ? "image/webp"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function generateOne({ prompt, imageDataUrls, outPath, size = "2K" }) {
  const body = {
    model: MODEL,
    prompt,
    size,
    response_format: "url",
    watermark: false,
    sequential_image_generation: "disabled",
  };
  if (imageDataUrls?.length) {
    body.image = imageDataUrls.length === 1 ? imageDataUrls[0] : imageDataUrls;
  }

  const res = await fetch(`${BASE_URL}/api/v3/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(json)}`);

  const url = json?.data?.[0]?.url;
  const b64 = json?.data?.[0]?.b64_json;
  if (!url && !b64) throw new Error(`No image in response: ${JSON.stringify(json).slice(0, 500)}`);

  let bytes;
  if (b64) bytes = Buffer.from(b64, "base64");
  else {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Download failed ${imgRes.status}`);
    bytes = Buffer.from(await imgRes.arrayBuffer());
  }
  await fs.writeFile(outPath, bytes);
  return outPath;
}

function promptHandsomeThreeView() {
  return [
    "Original character design sheet, Japanese anime handsome young man,",
    CHAR.name + ",",
    CHAR.handsomeRatio + ",",
    "THREE-VIEW turnaround on one sheet: front view, side view, back view, lined up left to right,",
    "same height, same outfit, orthographic character turnaround,",
    CHAR.face + ",",
    CHAR.hair + ",",
    CHAR.outfit + ",",
    CHAR.style + ",",
    CHAR.bg + ",",
    "full body, clear silhouette, professional anime character sheet, no chibi, no girl, no female.",
  ].join(" ");
}

function promptChibiThreeView() {
  return [
    "Miniaturize the SAME male character into a desktop-pet mascot turnaround.",
    "Keep identical face, hair, outfit, camera accessory, color palette.",
    "Change ONLY proportions to " + CHAR.chibiRatio + ".",
    "THREE-VIEW turnaround on one sheet: front, side, back, lined up left to right,",
    "same height, orthographic, cute but still handsome boyish face (not baby-ish),",
    CHAR.style + ",",
    CHAR.bg + ",",
    "full body, clear silhouette, no girl, no female, no text.",
  ].join(" ");
}

function promptIdleLock() {
  return [
    "Extract a SINGLE full-body front idle pose of this EXACT chibi boy for a floating desktop pet.",
    "Keep identical identity: face, hair, outfit, camera strap.",
    "Proportions MUST stay " + CHAR.chibiRatio + ".",
    "Pose: standing idle, hands in hoodie pockets, calm charming smile, facing viewer.",
    "ONLY one character, centered, feet near bottom, no turnaround sheet, no extra views,",
    CHAR.style + ",",
    CHAR.bg + ",",
    "clean sticker-ready asset, no text, no watermark.",
  ].join(" ");
}

function promptPose(posePrompt) {
  return [
    "Generate the SAME desktop-pet boy in a new action pose.",
    "STRICT identity lock: same face, hair, outfit, sneakers, camera accessory, color palette.",
    "STRICT proportion lock: " + CHAR.chibiRatio + ".",
    posePrompt,
    "ONLY one character, centered full body, feet near bottom,",
    CHAR.style + ",",
    CHAR.bg + ",",
    "no turnaround, no extra characters, no girl, no text, no watermark.",
  ].join(" ");
}

async function mirrorPublic(ids) {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  for (const id of ids) {
    const src = path.join(OUT_DIR, `${id}.png`);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(PUBLIC_DIR, `${id}.png`));
    }
  }
}

async function main() {
  await loadEnvFile();
  if (!process.env.ARK_API_KEY) {
    console.error("Missing ARK_API_KEY");
    process.exit(1);
  }
  await fs.mkdir(OUT_DIR, { recursive: true });

  const from = String(parseFlag("--from") || "sheet");
  const only = parseOnly();
  const poseList = only ? POSES.filter((p) => only.has(p.id)) : POSES;

  console.log(`Model: ${MODEL}`);
  console.log(`Pipeline from: ${from}`);
  console.log(`Poses: ${poseList.map((p) => p.id).join(", ") || "(none)"}`);
  console.log(`Ratio: handsome ${CHAR.handsomeRatio}`);
  console.log(`       chibi    ${CHAR.chibiRatio}`);

  // --- Step 1: handsome three-view (T2I) ---
  if (from === "sheet" || !(await exists(SHEET_HANDSOME))) {
    console.log("\n[1/4] T2I 日系帅哥三视图 (7.5头身) ...");
    await generateOne({
      prompt: promptHandsomeThreeView(),
      outPath: SHEET_HANDSOME,
      size: "2K",
    });
    console.log(`  saved ${SHEET_HANDSOME}`);
  } else {
    console.log("\n[1/4] reuse existing handsome sheet");
  }

  // --- Step 2: miniaturize to chibi three-view ---
  if (from === "sheet" || from === "chibi" || !(await exists(SHEET_CHIBI))) {
    console.log("\n[2/4] I2I 微缩三头身桌宠三视图 ...");
    await generateOne({
      prompt: promptChibiThreeView(),
      imageDataUrls: [await fileToDataUrl(SHEET_HANDSOME)],
      outPath: SHEET_CHIBI,
      size: "2K",
    });
    console.log(`  saved ${SHEET_CHIBI}`);
  } else {
    console.log("\n[2/4] reuse existing chibi sheet");
  }

  // --- Step 3: idle character lock ---
  const idleOut = path.join(OUT_DIR, "idle_default.png");
  const needLock =
    from === "sheet" || from === "chibi" || from === "lock" || !(await exists(LOCK_PATH));
  if (needLock || (only && only.has("idle_default")) || !(await exists(idleOut))) {
    console.log("\n[3/4] I2I 定妆待机锁 (三头身单立绘) ...");
    await generateOne({
      prompt: promptIdleLock(),
      imageDataUrls: [await fileToDataUrl(SHEET_CHIBI)],
      outPath: idleOut,
      size: "2K",
    });
    await fs.copyFile(idleOut, LOCK_PATH);
    console.log(`  saved ${idleOut}`);
  } else {
    console.log("\n[3/4] reuse existing character lock");
  }

  // --- Step 4: iterate poses from lock ---
  const lockDataUrl = await fileToDataUrl(LOCK_PATH);
  console.log("\n[4/4] I2I 动作迭代 ...");
  let i = 0;
  for (const pose of poseList) {
    i += 1;
    if (pose.id === "idle_default") {
      console.log(`  [${i}/${poseList.length}] skip idle_default (lock)`);
      continue;
    }
    const outPath = path.join(OUT_DIR, `${pose.id}.png`);
    console.log(`  [${i}/${poseList.length}] ${pose.id} ...`);
    await generateOne({
      prompt: promptPose(pose.prompt),
      imageDataUrls: [lockDataUrl],
      outPath,
      size: "2K",
    });
    console.log(`    saved ${outPath}`);
  }

  await mirrorPublic(POSES.map((p) => p.id));
  console.log("\nDone. Sheets: _sheet_handsome / _sheet_chibi / _character-lock");
  console.log("Poses mirrored to public/assets/pet-poses/");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message || err);
  process.exit(1);
});
