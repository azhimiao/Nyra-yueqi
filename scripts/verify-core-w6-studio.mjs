/**
 * Open Experience W6 — Experience Studio + package IO.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §12 / §13.2 package-io / §14 W6
 *
 * Assert:
 * - Studio UI + Creator Hub entry (作品工坊 / experience-studio) without colliding with 绘境 studio
 * - package-io: import/export, schema validate, resource licenses, migration, signature
 * - forbid arbitrary JS; restrict custom CSS / dangerous URLs
 * - round-trip original mist-harbor sample (NOT night-rain copy)
 * - export strips privacy/keys
 * - Do NOT claim product_review
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
    _map: map,
  };
}

const requiredFiles = [
  "src/experience/package-io.js",
  "src/experience/package-signature.js",
  "src/experience/studio/studio-ui.js",
  "src/experience/studio/sandbox.js",
  "src/experience/studio/studio.css",
  "src/experience/studio/index.js",
  "src/experience/presets/mist-harbor-lighthouse.js",
  "docs/qa/open-experience/W6_STUDIO.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const pkgIoSrc = readFileSync(join(root, "src/experience/package-io.js"), "utf8");
check(
  "package-io forbids arbitrary JS keys",
  /FORBIDDEN_PACKAGE_JS_KEYS/.test(pkgIoSrc) && /findForbiddenJsKeys/.test(pkgIoSrc),
);
check(
  "package-io scrubs privacy on export",
  /scrubPrivacyFromExport/.test(pkgIoSrc) && /EXPORT_SCRUB_KEYS/.test(pkgIoSrc) && /apiKey/.test(pkgIoSrc),
);
check(
  "package-io migrates schema versions",
  /migrateExperiencePackage/.test(pkgIoSrc),
);
check(
  "package-io validates resource licenses",
  /validateResourceLicenses/.test(pkgIoSrc) && /missing_license/.test(pkgIoSrc),
);
check(
  "package-io restricts custom CSS",
  /validateCustomCss/.test(pkgIoSrc) && /custom_css_not_permitted/.test(pkgIoSrc),
);

const mistSrc = readFileSync(
  join(root, "src/experience/presets/mist-harbor-lighthouse.js"),
  "utf8",
);
check(
  "mist-harbor is original (not night-rain copy)",
  /雾港灯塔/.test(mistSrc)
    && /exp-mist-harbor-lighthouse/.test(mistSrc)
    && !/exp-night-rain-station/.test(mistSrc)
    && !/rain_station/.test(mistSrc)
    && !/NIGHT_RAIN/.test(mistSrc),
);
check(
  "mist-harbor has ≥3 openings + lore + resources",
  (mistSrc.match(/id:\s*"opening-/g) || []).length >= 3
    && /embeddedLorebook|SHARED_LORE/.test(mistSrc)
    && /resources:/.test(mistSrc)
    && /license:/.test(mistSrc),
);

const hubSrc = existsSync(join(root, "src/creator/hub-ui.js"))
  ? readFileSync(join(root, "src/creator/hub-ui.js"), "utf8")
  : "";
check(
  "consumer shell no longer routes Creator Hub 作品工坊",
  !/mountCreatorHub/.test(readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8")),
);

const shellSrc = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check(
  "phone-shell does not mount experience studio consumer entry",
  !/mountExperienceStudio/.test(shellSrc)
    && !/data-experience-studio-mount/.test(shellSrc),
);

const catalogSrc = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check(
  "apps-catalog removed experience-studio and studio (绘境)",
  !/id:\s*"experience-studio"/.test(catalogSrc) && !/id:\s*"studio"/.test(catalogSrc),
);

const studioUiSrc = readFileSync(join(root, "src/experience/studio/studio-ui.js"), "utf8");
check(
  "studio UI edits openings/lore/director/stage/memory",
  /openings/.test(studioUiSrc)
    && /lore/.test(studioUiSrc)
    && /director/.test(studioUiSrc)
    && /memoryPolicy|记忆策略/.test(studioUiSrc)
    && /initialAssets|舞台/.test(studioUiSrc),
);
check(
  "studio UI wires Prompt Inspector + sandbox",
  /inspectStudioPrompt/.test(studioUiSrc) && /startStudioSandbox/.test(studioUiSrc),
);

const sandboxSrc = readFileSync(join(root, "src/experience/studio/sandbox.js"), "utf8");
check(
  "sandbox uses preview runKind + inspector",
  /runKind:\s*"preview"/.test(sandboxSrc)
    && /inspectPromptBlocks|inspectStudioPrompt/.test(sandboxSrc),
);

const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
check("EXECUTION_STATE has W6 row", /W6/.test(execState));
check(
  "EXECUTION_STATE does not self-sign user acceptance literally",
  !/\buser_accepted\b/.test(execState),
);
check(
  "EXECUTION_STATE does not claim product_review for W6 alone",
  !/W6[^\n]*product_review/.test(execState),
);

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
check(
  "consumer index does not load studio.css (作品工坊 unplugged)",
  !/experience\/studio\/studio\.css/.test(indexHtml),
);
check(
  "studio.css file still exists for module leftover",
  existsSync(join(root, "src/experience/studio/studio.css")),
);

const ls = memoryStorage();
globalThis.window = { localStorage: ls };
globalThis.localStorage = ls;

const {
  __setExperienceStorageForTests,
  __clearExperienceRegistryForTests,
  registerPackage,
  getRegisteredPackage,
  listRegisteredPackages,
  clearAllExperienceSessions,
  createMistHarborLighthousePackage,
  MIST_HARBOR_PACKAGE_ID,
  NIGHT_RAIN_PACKAGE_ID,
  exportExperiencePackage,
  importExperienceBundle,
  loadExperiencePackage,
  validateExperiencePackage,
  migrateExperiencePackage,
  scrubPrivacyFromExport,
  roundTripExperiencePackage,
  findForbiddenJsKeys,
  validateCustomCss,
} = await import("../src/experience/index.js");

const {
  signExperiencePackage,
  verifyExperiencePackageIntegrity,
} = await import("../src/experience/package-signature.js");

__setExperienceStorageForTests(ls);
__clearExperienceRegistryForTests();
clearAllExperienceSessions();

const original = createMistHarborLighthousePackage();
check(
  "sample package id is mist-harbor not night-rain",
  original.id === MIST_HARBOR_PACKAGE_ID && original.id !== NIGHT_RAIN_PACKAGE_ID,
);
check(
  "sample validates",
  validateExperiencePackage(original).ok,
  (validateExperiencePackage(original).errors || []).join(";"),
);
check(
  "sample openings ≥ 3",
  (original.openings || []).length >= 3,
  String((original.openings || []).length),
);
check(
  "sample has lore + asset refs + permissions",
  (original.embeddedLorebook || []).length >= 2
    && Boolean(original.initialAssets?.backgroundId)
    && original.permissions?.allowArbitraryJs === false,
);

// --- forbid arbitrary JS ---
const withJs = {
  ...original,
  hooks: { onEnter: "alert(1)" },
  entrySource: "console.log('pwn')",
};
const jsReject = validateExperiencePackage(withJs);
check(
  "rejects package with hooks/entrySource JS",
  !jsReject.ok
    && (jsReject.errors || []).some((e) => /forbidden_js_field/.test(e)),
  (jsReject.errors || []).join(";"),
);
check(
  "findForbiddenJsKeys detects script keys",
  findForbiddenJsKeys({ customJs: "x", nested: { eval: "1" } }).length >= 2,
);

const cssBad = validateCustomCss("@import url('https://evil'); body{behavior:url(x)}");
check("rejects dangerous custom CSS", !cssBad.ok);

const cssOkButNotPermitted = validateExperiencePackage({
  ...original,
  customCss: "div{color:red}",
  permissions: { ...original.permissions, allowCustomCss: false },
});
check(
  "custom CSS rejected when not permitted",
  !cssOkButNotPermitted.ok
    && (cssOkButNotPermitted.errors || []).includes("custom_css_not_permitted"),
);

const badUrl = validateExperiencePackage({
  ...original,
  cover: "javascript:alert(1)",
});
check(
  "rejects javascript: cover URL",
  !badUrl.ok && (badUrl.errors || []).some((e) => /dangerous_url|protocol/.test(e)),
);

// --- migration ---
const legacy = {
  schemaVersion: 0,
  id: "exp-legacy-migrate",
  title: "旧包",
  opening: {
    id: "opening-only",
    title: "唯一开场",
    initialSceneState: { location: "码头" },
  },
  resources: [
    { id: "r1", license: "original", source: "test", url: "/assets/x.png" },
  ],
};
const migrated = migrateExperiencePackage(legacy);
check("migrates v0 opening → openings", migrated.ok && migrated.migrated);
const migratedVal = validateExperiencePackage(migrated.value);
check(
  "migrated package validates",
  migratedVal.ok && migratedVal.value?.openings?.length === 1,
  (migratedVal.errors || []).join(";"),
);

// --- export scrub ---
const dirty = {
  ...original,
  apiKey: "sk-secret-should-not-export",
  chatHistory: [{ role: "user", content: "private" }],
  longTermMemory: ["secret memory"],
  nested: { publisherSecret: "shh", ok: true },
};
const scrubbed = scrubPrivacyFromExport(dirty);
check(
  "scrub removes apiKey and chatHistory",
  !("apiKey" in scrubbed)
    && !("chatHistory" in scrubbed)
    && !("longTermMemory" in scrubbed)
    && !("publisherSecret" in (scrubbed.nested || {})),
);

const dirtyExport = exportExperiencePackage(dirty);
check("dirty export succeeds after scrub", dirtyExport.ok);
check(
  "exported JSON has no apiKey / sk-secret",
  dirtyExport.ok
    && !/sk-secret-should-not-export/.test(dirtyExport.json)
    && !/"apiKey"/.test(dirtyExport.json)
    && !/"chatHistory"/.test(dirtyExport.json),
);

// --- signature ---
const secret = "w6-local-publisher-secret";
const signedExport = exportExperiencePackage(original, {
  sign: (body) => signExperiencePackage(body, secret),
});
check("signed export ok", signedExport.ok && Boolean(signedExport.bundle?.signature));
const signedImport = importExperienceBundle(JSON.parse(signedExport.json), {
  publisherSecret: secret,
  verifyIntegrity: (pkg, o) => verifyExperiencePackageIntegrity(pkg, o),
});
check(
  "signed import verifies",
  signedImport.ok,
  (signedImport.errors || []).join(";"),
);
const badSecretImport = importExperienceBundle(JSON.parse(signedExport.json), {
  publisherSecret: "wrong-secret",
  verifyIntegrity: (pkg, o) => verifyExperiencePackageIntegrity(pkg, o),
});
check(
  "wrong secret fails signature",
  !badSecretImport.ok
    && (badSecretImport.errors || []).some((e) => /signature/.test(e)),
);

// --- round-trip: create → export → clear → import ---
registerPackage(original);
check("registry has mist-harbor before export", Boolean(getRegisteredPackage(MIST_HARBOR_PACKAGE_ID)));

const exported = exportExperiencePackage(original);
check("export ok", exported.ok, (exported.errors || []).join(";"));

__clearExperienceRegistryForTests();
check(
  "registry cleared",
  !getRegisteredPackage(MIST_HARBOR_PACKAGE_ID) && listRegisteredPackages().length === 0,
);

const imported = loadExperiencePackage(exported.json);
check(
  "import after clear ok",
  imported.ok && imported.value?.id === MIST_HARBOR_PACKAGE_ID,
  (imported.errors || []).join(";"),
);

if (imported.ok && imported.value) {
  registerPackage(imported.value);
}
const again = getRegisteredPackage(MIST_HARBOR_PACKAGE_ID);
check("re-registered after import", Boolean(again));

const rt = roundTripExperiencePackage(original);
check(
  "roundTrip helper matches openings/lore/assets/permissions",
  rt.ok,
  (rt.errors || []).join(";"),
);

if (again) {
  check(
    "imported openings match",
    again.openings.length === original.openings.length
      && again.openings.every((o, i) => o.id === original.openings[i].id),
  );
  check(
    "imported lore count match",
    (again.embeddedLorebook || []).length === (original.embeddedLorebook || []).length,
  );
  check(
    "imported initialAssets match",
    JSON.stringify(again.initialAssets) === JSON.stringify(original.initialAssets),
  );
  check(
    "imported permissions match",
    JSON.stringify(again.permissions) === JSON.stringify(original.permissions),
  );
  check(
    "imported memoryPolicy match",
    JSON.stringify(again.memoryPolicy) === JSON.stringify(original.memoryPolicy),
  );
}

// marketplace forbidden
const marketReject = importExperienceBundle({
  format: "yueqi.experience.bundle.v1",
  package: original,
  marketplace: { listingId: "x" },
});
check(
  "rejects marketplace envelope",
  !marketReject.ok && (marketReject.errors || []).includes("marketplace_or_payment_forbidden"),
);

const { inspectStudioPrompt } = await import("../src/experience/studio/sandbox.js");
const insp = inspectStudioPrompt({
  pkg: original,
  openingId: original.openings[0].id,
  userInput: "一起看潮",
  characterName: "测试角色",
});
check(
  "Prompt Inspector hook returns report",
  insp.ok && Boolean(insp.text) && /total=/.test(insp.text),
  insp.reason || "",
);

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
console.log(`\nW6 Studio verify: ${passed}/${checks.length} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
