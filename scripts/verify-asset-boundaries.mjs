import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const presentationAssets = [
  "public/assets/avatars/xingli/profile.png",
  "public/assets/scenario/characters/xingli/dialogue.png",
  "public/assets/vn/rainbound/portraits/xingli-neutral.png",
  "public/assets/vn/rainbound/portraits/xingli-shy.png",
  "public/assets/vn/rainbound/portraits/xingli-smile.png",
  "public/assets/vn/rainbound/portraits/xingli-thinking.png",
  "public/assets/vn/rainbound/portraits/xingli-open.png",
];

for (const asset of presentationAssets) {
  const full = join(root, asset);
  check(`presentation asset exists ${asset}`, existsSync(full));
}

const petFiles = [
  ...filesUnder(join(root, "public/assets/characters/xingli/clips")),
  ...filesUnder(join(root, "public/assets/pet-poses")),
].filter((path) => extname(path).toLowerCase() === ".png");
const petHashes = new Set(petFiles.map(hash));
const duplicatePresentation = presentationAssets
  .map((asset) => join(root, asset))
  .filter((path) => existsSync(path) && petHashes.has(hash(path)))
  .map((path) => relative(root, path).replaceAll("\\", "/"));
check(
  "presentation images are not copied pet frames",
  duplicatePresentation.length === 0,
  duplicatePresentation.join(", "),
);

const sourceFiles = [
  ...filesUnder(join(root, "src")),
  join(root, "index.html"),
].filter((path) => [".js", ".css", ".html"].includes(extname(path).toLowerCase()));
const illegalPetRefs = [];
for (const file of sourceFiles) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.startsWith("src/avatar/") || rel.startsWith("src/overlay/")) continue;
  const text = readFileSync(file, "utf8");
  if (/\/assets\/(characters|pet-poses)\//i.test(text)) illegalPetRefs.push(rel);
}
check("pet asset URLs stay inside pet runtime modules", illegalPetRefs.length === 0, illegalPetRefs.join(", "));

const scenarioFiles = filesUnder(join(root, "src/scenario")).filter((path) => extname(path) === ".js");
const scenarioText = scenarioFiles.map((path) => readFileSync(path, "utf8")).join("\n");
check("scenario never imports pet pose assets", !/character-pose-assets|default-pose-assets/.test(scenarioText));
check("scenario never references pet package URLs", !/\/assets\/(characters|pet-poses)\//.test(scenarioText));

const sidewriteText = readFileSync(join(root, "src/sidewrite/ui/sidewrite-app.js"), "utf8");
check("TA phone sanitizes character avatars", /resolveCharacterAvatarUrl/.test(sidewriteText));

const scrollText = readFileSync(join(root, "src/scroll/presets.js"), "utf8");
check("VN uses only VN portraits and avatar cover", !/characters\/xingli\/(clips|portrait)/.test(scrollText));

const {
  XINGLI_AVATAR_URL,
  XINGLI_SCENARIO_PORTRAIT_URL,
  isRealCharacterAvatar,
  resolveCharacterAvatarUrl,
  resolveScenarioPortraitUrl,
} = await import("../src/characters/avatar.js");
check("dedicated avatar namespace is accepted", isRealCharacterAvatar("/assets/avatars/user/profile.png"));
check("legacy Xingli sample is rejected as product avatar", !isRealCharacterAvatar(XINGLI_AVATAR_URL));
check("pet clip is rejected as avatar", !isRealCharacterAvatar("/assets/characters/xingli/clips/idle_loop.png"));
check("pet pose is rejected as avatar", !isRealCharacterAvatar("/assets/pet-poses/idle_default.png"));
check(
  "built-in character never injects a legacy sample avatar",
  resolveCharacterAvatarUrl({ id: "char-xingli" }) === "",
);
check(
  "scenario never injects a legacy sample portrait",
  resolveScenarioPortraitUrl({ id: "char-xingli" }) === "",
);
check("legacy scenario portrait remains rejected", !isRealCharacterAvatar(XINGLI_SCENARIO_PORTRAIT_URL));

console.log(`\nverify:asset-boundaries ${passed}/${passed + failed} ${failed ? "RED" : "GREEN"}`);
if (failed) process.exit(1);
