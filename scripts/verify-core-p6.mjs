/**
 * PAIOS P6 contract checks — Character / World Studio.
 * Marks implementation_green readiness; not L3 / user_accepted / marketplace.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
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
  };
}

const requiredFiles = [
  "src/studio/schema.js",
  "src/studio/identity.js",
  "src/studio/appearance.js",
  "src/studio/action-voice-map.js",
  "src/studio/memory-policy.js",
  "src/studio/preview.js",
  "src/studio/consistency.js",
  "src/studio/asset-fallback.js",
  "src/studio/world-studio.js",
  "src/studio/privilege-gate.js",
  "src/studio/relation-events.js",
  "src/studio/signature.js",
  "src/studio/character-package.js",
  "src/studio/distribution.js",
  "src/studio/lifecycle.js",
  "src/studio/identity-contract.js",
  "src/studio/index.js",
  "sdk/character-package/template/character.json",
  "sdk/character-package/template/README.md",
  "sdk/world-package/template/world.json",
  "sdk/world-package/template/README.md",
  "docs/sdk/CHARACTER_WORLD_STUDIO.md",
  "docs/qa/paios/P6/REVIEW.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const studio = await import("../src/studio/index.js");
const characterTemplate = JSON.parse(
  readFileSync(join(root, "sdk/character-package/template/character.json"), "utf8"),
);
const worldTemplate = JSON.parse(
  readFileSync(join(root, "sdk/world-package/template/world.json"), "utf8"),
);

check("STUDIO_SDK_VERSION === 1", studio.STUDIO_SDK_VERSION === 1);
check("character schema id", studio.CHARACTER_JSON_SCHEMA_ID === "yueqi.character.package.v1");
check("world schema id", studio.WORLD_JSON_SCHEMA_ID === "yueqi.world.package.v1");
check("preview targets === 5", studio.PREVIEW_TARGETS.length === 5);
check("action contexts === 5", studio.ACTION_CONTEXTS.length === 5);
check("MIN_ACTIONS === 6", studio.MIN_ACTIONS === 6);
check("MIN_EXPRESSIONS === 8", studio.MIN_EXPRESSIONS === 8);
check(
  "distribution out of scope includes payment",
  studio.DISTRIBUTION_OUT_OF_SCOPE.includes("payment"),
);
check(
  "distribution out of scope includes public_catalog",
  studio.DISTRIBUTION_OUT_OF_SCOPE.includes("public_catalog"),
);

// --- Character template gate ---
{
  const built = studio.buildCharacterPackage(characterTemplate);
  check(
    "template character builds",
    built.ok === true,
    built.ok ? built.value.manifest.id : (built.errors || [built.reason]).join(","),
  );

  if (built.ok) {
    const app = built.value.manifest.appearance;
    check("template ≥6 actions", app.actions.length >= 6, String(app.actions.length));
    check("template ≥8 expressions", app.expressions.length >= 8, String(app.expressions.length));
    check("template has voice mapping", Boolean(app.voice?.defaultVoiceId));
    check(
      "template has relation policy",
      Boolean(built.value.manifest.relationPolicy?.defaultMode),
    );
    check(
      "template memory retain on upgrade",
      built.value.manifest.memoryPolicy.retainRelationMemoryOnUpgrade === true,
    );

    for (const ctx of studio.ACTION_CONTEXTS) {
      check(
        `template maps ${ctx}`,
        Boolean(built.value.manifest.actionVoiceMap[ctx]?.actionId),
      );
    }

    const contract = studio.runIdentityContract(built.value, {
      foreignCharacterIds: ["char-other", "xingli-foreign"],
    });
    check(
      "identity contract no drift",
      contract.ok === true,
      contract.ok ? contract.identityHash : contract.reason,
    );
    check(
      "identity covers desk_pet/pop/app/scenario",
      contract.ok &&
        ["desk_pet", "pop", "app", "scenario"].every((s) => contract.surfaces.includes(s)),
    );
  }
}

// --- Schema / drift / compatibility ---
{
  const badSchema = studio.validateCharacterManifest({
    ...characterTemplate,
    schemaId: "wrong",
  });
  check("character schema drift blocked", badSchema.ok === false && badSchema.reason === "schema_drift");

  const badWorldSchema = studio.validateWorldManifest({
    ...worldTemplate,
    schemaId: "wrong",
  });
  check("world schema drift blocked", badWorldSchema.ok === false);

  const compat = studio.checkStudioSdkCompatibility(characterTemplate);
  check("template studio sdk compatible", compat.ok === true);

  const badWin = studio.checkStudioSdkCompatibility({
    ...characterTemplate,
    minHostSdk: 99,
    maxHostSdk: 99,
  });
  check("incompatible studio sdk blocked", badWin.ok === false);

  const up = studio.checkPackageUpgradeCompatibility("1.0.0", "1.1.0");
  check("package upgrade ok", up.ok === true && up.requiresRollbackSlot === true);

  const down = studio.checkPackageUpgradeCompatibility("1.1.0", "1.0.0");
  check("package downgrade blocked", down.ok === false);
}

// --- Consistency auto-errors ---
{
  const missingAction = studio.buildCharacterPackage({
    ...characterTemplate,
    appearance: {
      ...characterTemplate.appearance,
      actions: characterTemplate.appearance.actions.slice(0, 3),
    },
  });
  check("missing actions → error", missingAction.ok === false);

  const wrongAspect = studio.buildCharacterPackage({
    ...characterTemplate,
    previewAspects: { ...characterTemplate.previewAspects, desk_pet: "16:9" },
  });
  check("wrong aspect → error", wrongAspect.ok === false);

  const opaque = studio.buildCharacterPackage({
    ...characterTemplate,
    appearance: {
      ...characterTemplate.appearance,
      actions: characterTemplate.appearance.actions.map((a, i) =>
        i === 0 ? { ...a, transparentBg: false } : a,
      ),
    },
  });
  check("non-transparent bg → error", opaque.ok === false);

  const crossId = studio.buildCharacterPackage({
    ...characterTemplate,
    appearance: {
      ...characterTemplate.appearance,
      actions: characterTemplate.appearance.actions.map((a, i) =>
        i === 0
          ? {
              ...a,
              characterId: "other-character",
              assetRef: "assets/characters/other-character/idle.png",
            }
          : a,
      ),
    },
  });
  check("cross-identity asset mix → error", crossId.ok === false);
}

// --- Same-character fallback only ---
{
  const built = studio.buildCharacterPackage(characterTemplate);
  const missing = studio.resolveAssetWithFallback({
    characterId: built.value.manifest.id,
    appearance: built.value.manifest.appearance,
    requested: { kind: "action", id: "nope" },
  });
  check("missing action degrades", missing.ok && missing.degraded === true);
  check(
    "fallback stays same character idle",
    missing.ok && missing.fallbackKind === "same_character_idle",
  );
  const cross = studio.assertSameCharacterAsset({
    characterId: built.value.manifest.id,
    assetRef: "/assets/characters/char-other/idle.png",
    foreignCharacterIds: ["char-other"],
  });
  check("cross-character fallback forbidden", cross.ok === false);
}

// --- World studio + privilege gate ---
{
  const world = studio.normalizeWorldPackage(worldTemplate);
  check(
    "template world builds",
    world.ok === true,
    world.ok ? world.value.id : (world.errors || [world.reason]).join(","),
  );
  if (world.ok) {
    check("world has places", world.value.places.length >= 1);
    check("world has events", world.value.events.length >= 1);
    check("world has props", world.value.props.length >= 1);
    check("world has backgrounds", world.value.backgrounds.length >= 1);
    check("world has scripts", world.value.scripts.length >= 1);
    check(
      "world has shared-experience templates",
      world.value.sharedExperienceTemplates.length >= 1,
    );
    check(
      "world skillDependencies declared",
      world.value.skillDependencies.includes("local-echo-status"),
    );
  }

  const withPerms = studio.normalizeWorldPackage({
    ...worldTemplate,
    permissions: ["network"],
  });
  check("world direct permissions blocked", withPerms.ok === false);

  const hidden = studio.assertWorldHasNoSystemPrivileges({
    ...worldTemplate,
    hiddenPermissions: ["network"],
  });
  check("hidden permissions blocked", hidden.ok === false);

  const evilScript = studio.normalizeWorldPackage({
    ...worldTemplate,
    scripts: [
      {
        id: "evil",
        title: "evil",
        beats: ["eval('1')"],
        body: "eval('1')",
        executable: true,
      },
    ],
  });
  check("arbitrary scripts blocked", evilScript.ok === false);

  const capDenied = studio.authorizeWorldCapability(worldTemplate, "network");
  check("direct system capability denied", capDenied.ok === false);

  const capNoSkill = studio.authorizeWorldCapability(worldTemplate, "echo.status");
  check("capability without skill dep denied", capNoSkill.ok === false);

  const capOk = studio.authorizeWorldCapability(
    worldTemplate,
    "echo.status",
    "local-echo-status",
  );
  check("capability via declared skill ok", capOk.ok === true);

  const charHidden = studio.assertCharacterHasNoHiddenPrivileges({
    ...characterTemplate,
    permissions: ["file"],
  });
  check("character hidden/direct perms blocked", charHidden.ok === false);
}

// --- Relation events need runtime validation ---
{
  const bad = studio.validateRelationEventWrite({
    characterId: "template-companion",
    kind: "hack",
    predicate: "x",
    object: "y",
  });
  check("invalid relation kind rejected", bad.ok === false);

  const forbidden = studio.validateRelationEventWrite({
    characterId: "template-companion",
    kind: "milestone",
    predicate: "steal_credential",
    object: "token",
  });
  check("forbidden predicate rejected", forbidden.ok === false);

  const deniedMem = studio.validateRelationEventWrite({
    characterId: "template-companion",
    kind: "milestone",
    predicate: "celebrated",
    object: "first rain",
    memoryPolicy: { allowRemember: ["preference"], denyRemember: [] },
  });
  check("memory policy omit relation rejected", deniedMem.ok === false);

  const okEv = studio.validateRelationEventWrite({
    characterId: "template-companion",
    kind: "shared_experience",
    predicate: "shared_umbrella",
    object: "first rain at cafe",
    source: "scene",
    sceneId: "script-rain-day",
    memoryPolicy: characterTemplate.memoryPolicy,
  });
  check("validated scene relation write ok", okEv.ok === true);
}

// --- Signature / distribution ---
{
  const built = studio.buildCharacterPackage(characterTemplate);
  const secret = "p6-verify-secret";
  const exported = studio.exportStudioPackage(
    "character",
    characterTemplate,
    built.value.assets,
    { publisherSecret: secret, mode: studio.DISTRIBUTION_MODE.privateShare },
  );
  check("export character bundle", exported.ok === true);
  check("export has signature", Boolean(exported.value?.signature));
  check("export has private share token", Boolean(exported.value?.privateShareToken));
  check("export marketplace null", exported.value?.marketplace === null);
  check("export payment null", exported.value?.payment === null);

  const imported = studio.importStudioPackage(exported.value, { publisherSecret: secret });
  check("import signed bundle", imported.ok === true);

  const payMode = studio.exportStudioPackage("character", characterTemplate, {}, {
    mode: "payment",
  });
  check("payment mode blocked", payMode.ok === false);

  const publicBundle = studio.importStudioPackage({
    ...exported.value,
    marketplace: { listed: true },
  });
  check("public marketplace import blocked", publicBundle.ok === false);

  const worldExport = studio.exportStudioPackage("world", worldTemplate, {}, {
    publisherSecret: secret,
  });
  check("export world bundle", worldExport.ok === true);
  const worldImport = studio.importStudioPackage(worldExport.value, {
    publisherSecret: secret,
  });
  check("import world bundle", worldImport.ok === true);

  const badHash = studio.importStudioPackage(
    { ...exported.value, hash: "0".repeat(64) },
    { publisherSecret: secret },
  );
  check("tampered hash rejected", badHash.ok === false);
}

// --- Lifecycle: upgrade must NOT overwrite relation memory ---
{
  const storage = memoryStorage();
  studio.__setStudioStorageForTests(storage);
  studio.__resetStudioLifecycleForTests();

  const secret = "p6-life-secret";
  const install = studio.installCharacterPackage({
    manifest: characterTemplate,
    publisherSecret: secret,
    source: "local-template",
  });
  check("install character template", install.ok === true, install.reason || "");

  const written = studio.writeValidatedRelationEvent({
    characterId: "template-companion",
    kind: "milestone",
    predicate: "met",
    object: "day-one",
    source: "user",
    memoryPolicy: characterTemplate.memoryPolicy,
  });
  check("seed relation memory", written.ok === true);

  const before = studio.getRelationMemory("template-companion");
  check("relation memory length 1", before.length === 1);

  const v2 = {
    ...characterTemplate,
    version: "1.0.1",
    description: characterTemplate.description + " (patch)",
    // Malicious attempt to ship relation memory inside package
    relationMemory: [{ kind: "wipe", predicate: "evil", object: "x" }],
  };
  const upgraded = studio.upgradeCharacterPackage({
    manifest: v2,
    publisherSecret: secret,
    assets: { "relation-memory.json": "[]" },
  });
  check("upgrade character ok", upgraded.ok === true, upgraded.reason || "");
  check("upgrade preserved flag", upgraded.relationMemoryPreserved === true);

  const after = studio.getRelationMemory("template-companion");
  check(
    "relation memory NOT overwritten",
    after.length === 1 && after[0].predicate === "met" && after[0].object === "day-one",
  );

  const worldInstall = studio.installWorldPackage({
    manifest: worldTemplate,
    publisherSecret: secret,
    source: "local-template",
  });
  check("install world template", worldInstall.ok === true, worldInstall.reason || "");
  check("world listed", Boolean(studio.getInstalledWorld("template-shared-world")));

  studio.__resetStudioLifecycleForTests();
}

// --- Memory policy helpers ---
{
  const policy = studio.normalizeMemoryPolicy(characterTemplate.memoryPolicy);
  check("memory policy ok", policy.ok === true);
  check("may remember relation", studio.mayRemember(policy.value, "relation") === true);
  check("may not remember credentials", studio.mayRemember(policy.value, "credentials") === false);
  check(
    "sensitive trauma avoid",
    studio.sensitiveTopicPolicy(policy.value, "trauma") === "avoid",
  );
}

// --- Action state machine ---
{
  const built = studio.buildCharacterPackage(characterTemplate);
  const sm = built.value.manifest.appearance.actionStateMachine;
  const t1 = studio.transitionAction(sm, "idle", "start_chat");
  check("state machine talk", t1.ok && t1.state === "talk");
  const t2 = studio.transitionAction(sm, "idle", "nope");
  check("state machine unknown blocked", t2.ok === false);
}

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
const score = checks.length ? Math.round((passed / checks.length) * 100) : 0;

const outDir = join(root, "docs/qa/paios/P6");
mkdirSync(outDir, { recursive: true });
const result = {
  wave: "P6",
  score,
  passed,
  failed,
  total: checks.length,
  at: new Date().toISOString(),
  checks,
};
writeFileSync(join(outDir, "LAST_VERIFY.json"), JSON.stringify(result, null, 2), "utf8");

console.log("");
console.log(`P6 verify: ${passed}/${checks.length} (${score}/100)`);
if (failed) {
  console.error("FAILED checks:");
  for (const c of checks.filter((x) => !x.pass)) {
    console.error(`  - ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
  }
  process.exit(1);
}
