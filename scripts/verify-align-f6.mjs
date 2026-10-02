/**
 * F6 — 绘境 / Pop 语音 (G1 G2 G3; G5 场景工坊已移除; no G4).
 * Run: node scripts/verify-align-f6.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

const {
  validateImagegenJob,
  degradeImagegenJob,
} = await import("../src/imagegen/schema.js");
const {
  isImagegenConfigured,
  getImagegenSettings,
  normalizeImagegenSettings,
} = await import("../src/settings/imagegen-preferences.js");
const { AI_GROUP_ID } = await import("../src/imagegen/constants.js");
const { SCENE_APP_IDS, sceneAppLabel } = await import("../src/prompt/scene-tags.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { importGeneratedImageBlob, ensureAiPhotoGroup } = await import("../src/media/import-image.js");

const fixture = JSON.parse(
  readFileSync(join(root, "src/imagegen/fixtures/job-succeeded.json"), "utf8"),
);
const okJob = validateImagegenJob(fixture);
check("validateImagegenJob fixture succeeded", okJob.ok === true, okJob.ok ? okJob.value.id : String(okJob.errors));

let degraded;
let degradeThrew = false;
try {
  degraded = degradeImagegenJob(null);
} catch {
  degradeThrew = true;
}
check(
  "degradeImagegenJob null → schemaVersion 1",
  !degradeThrew && degraded?.schemaVersion === 1 && degraded.status === "failed",
  JSON.stringify(degraded),
);

const degradedBad = degradeImagegenJob({ status: "nope" });
check("degradeImagegenJob bad status", degradedBad.schemaVersion === 1);

check(
  "isImagegenConfigured with key",
  isImagegenConfigured({ enabled: true, apiKey: "x" }) === true,
);
check(
  "isImagegenConfigured empty key",
  isImagegenConfigured({ enabled: true, apiKey: "" }) === false,
);
check(
  "isImagegenConfigured disabled",
  isImagegenConfigured({ enabled: false, apiKey: "x" }) === false,
);

const defaults = getImagegenSettings();
check("getImagegenSettings defaults", defaults.schemaVersion === 1 && defaults.model === "dall-e-3");
check(
  "normalizeImagegenSettings size clamp",
  normalizeImagegenSettings({ defaultSize: "nope" }).defaultSize === "1024x1024",
);

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhUkUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const blob = new Blob([tinyPng], { type: "image/png" });
const imported = await importGeneratedImageBlob({
  blob,
  title: "验图",
  summary: "fixture",
  storeMediaFile: async (file) => ({
    id: "image-verify-1",
    kind: "image",
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: new Date().toISOString(),
    filePath: "",
    blob: file,
  }),
});
check(
  "importGeneratedImageBlob shape",
  Boolean(imported.mediaId)
    && Boolean(imported.photo?.id)
    && imported.photo.groupId === AI_GROUP_ID,
  `${imported.mediaId}/${imported.photo?.groupId}`,
);
const group = ensureAiPhotoGroup();
check("ensureAiPhotoGroup id", group?.id === AI_GROUP_ID, group?.id);

check("SCENE_APP_IDS has studio", SCENE_APP_IDS.includes("studio"));
check("SCENE_APP_IDS has no workshop", !SCENE_APP_IDS.includes("workshop"));
check("sceneAppLabel studio", sceneAppLabel("studio") === "绘境");

const modules = listDataModuleIds();
check("DATA_MODULES imagegen", modules.includes("imagegen"));
check("DATA_MODULES no sceneWorkshop", !modules.includes("sceneWorkshop"));

const serverSrc = readFileSync(join(root, "server/index.mjs"), "utf8");
check(
  "server POST /image/generate",
  /app\.post\(\s*["']\/image\/generate["']/.test(serverSrc)
    || serverSrc.includes('"/image/generate"'),
);

const voiceSrc = readFileSync(join(root, "src/phone-shell/phone-voice.js"), "utf8");
const shellSrc = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check(
  "phone-voice data-phone-mic",
  voiceSrc.includes("data-phone-mic") || shellSrc.includes("data-phone-mic"),
);
check(
  "phone-voice data-phone-speak",
  voiceSrc.includes("data-phone-speak") || shellSrc.includes("data-phone-speak"),
);
check("phone-shell mounts phone-voice", shellSrc.includes("mountPhoneVoice") || shellSrc.includes("phone-voice"));
check("phone-shell has no workshop", !shellSrc.includes("workshop") && !shellSrc.includes("Workshop"));

const catalog = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check('consumer apps-catalog has no studio', !/id:\s*"studio"/.test(catalog));
check('apps-catalog has no workshop', !/id:\s*"workshop"/.test(catalog));

check("studio-app.js exists", existsSync(join(root, "src/imagegen/ui/studio-app.js")));
check("workshop dir removed", !existsSync(join(root, "src/scene-workshop")));
check("package.json has no three", !JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies?.three);
check("F6 scope excludes G4", true, "G4 not implemented");

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((c) => c.name).join(", "));
  process.exit(1);
}
