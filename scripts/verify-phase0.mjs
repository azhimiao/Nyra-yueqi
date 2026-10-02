/**
 * Phase 0 verification 鈥?looks schema, protocol, action player, pack, backup ZIP, no Live2D stub.
 * Run: node scripts/verify-phase0.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { readAppBundle } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` 鈥?${detail}` : ""}`);
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
  },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

const {
  migrateAvatarState,
  createDefaultAvatarState,
  resolveActionForState,
} = await import("../src/avatar/looks-model.js");
const {
  normalizeRuntimeProtocol,
  applyActionFallback,
  PROTOCOL_VERSION,
} = await import("../src/runtime/protocol.js");
const {
  validateCharacterPack,
  avatarStateToPackDraft,
  PACK_SCHEMA_VERSION,
} = await import("../src/character-pack/schema.js");
const { createActionPlayer } = await import("../src/runtime/action-player.js");

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const characterPage = readFileSync(join(root, "src/avatar/character-page.js"), "utf8");
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");
const floatJs = readFileSync(join(root, "src/ui/companion-float.js"), "utf8");

check("No Live2D upload UI", !indexHtml.includes("data-live2d-upload"));
check("No Live2D trigger", !indexHtml.includes("data-live2d-upload-trigger"));
check(
  "Pet hub page tab",
  indexHtml.includes('data-companion-tab="character"')
    && indexHtml.includes('data-pet-open-view="library"'),
);
check("Desktop pet open/close UI", indexHtml.includes("data-desktop-pet-power") && indexHtml.includes("data-desktop-presence"));
check(
  "Custom pet contact UI",
  indexHtml.includes("data-custom-contact")
    && indexHtml.includes("data-custom-contact-title"),
);
check("Character pack import UI", indexHtml.includes("data-import-character-pack"));
check("Avatar stage preview", indexHtml.includes("data-avatar-stage"));
check("Full backup ZIP UI", indexHtml.includes("data-export-full-backup"));

check("Avatar media uses persistMediaFile", characterPage.includes("persistMediaFile") && characterPage.includes("filePath"));
check("Avatar reads via readMediaBlob", characterPage.includes("readMediaBlob"));
check("Full backup zip builders", backupJs.includes("buildFullBackupZip") && backupJs.includes("restoreFullBackupZip"));
check("Float renders look image", floatJs.includes("data-float-image") && floatJs.includes("lookUrl"));

const legacy = migrateAvatarState({
  characterMediaId: "char-1",
  characterFileName: "base.png",
  currentOutfitId: "home_casual",
  outfits: {
    home_casual: { mediaId: "out-1", fileName: "home.png", updatedAt: "2026-01-01" },
    rainy_night: { mediaId: "", fileName: "", updatedAt: "" },
    sleepwear: { mediaId: "", fileName: "", updatedAt: "" },
  },
  live2dModelName: "dead.moc3",
  characterKind: "live2d",
});
check("Migrate drops Live2D fields", !("live2dModelName" in legacy) && legacy.schemaVersion >= 2);
check("Migrate outfits 鈫?looks", Array.isArray(legacy.looks) && legacy.looks.length >= 3);
check("Migrate keeps outfit media", legacy.looks.find((l) => l.id === "home_casual")?.mediaId === "out-1");

const fresh = createDefaultAvatarState();
check("Default has actions", fresh.actions.some((a) => a.id === "idle_default"));
check("Default display params", fresh.display.scale === 1 && fresh.display.floatSize === 64);

const protocolBad = normalizeRuntimeProtocol({
  version: PROTOCOL_VERSION,
  text: "hi",
  emotion: "warm",
  expression: "soft_smile",
  actions: [{ id: "unknown_move", at: "start" }],
}, { actionIds: ["idle_default", "talking_default", "comfort"] });
check("Protocol rejects unknown action", !protocolBad.ok && protocolBad.errors.some((e) => e.includes("unknown_action")));

const protocolOk = normalizeRuntimeProtocol({
  version: PROTOCOL_VERSION,
  text: "You worked hard today.",
  emotion: "warm",
  expression: "",
  actions: [{ id: "comfort", at: "start" }],
  voice: { enabled: true, style: "soft", speed: 0.95 },
}, { actionIds: ["comfort", "idle_default"] });
check("Protocol accepts catalog action", protocolOk.ok && protocolOk.value.actions[0].id === "comfort");

const fallback = applyActionFallback(protocolBad, {
  hasAction: (id) => ["talking_default", "idle_default"].includes(id),
});
check("Action fallback to talking_default", fallback.value.actions[0]?.id === "talking_default");

let played = "";
const player = createActionPlayer({
  getAvatarState: () => fresh,
  resolveMediaUrl: async () => "",
  onChange: (snap) => {
    played = snap.playState;
  },
});
await player.talking();
check("ActionPlayer talking state", played === "talking");
await player.play("reacting", { actionId: "not_real" });
check(
  "ActionPlayer illegal id falls back",
  ["react_tap", "idle_default", "comfort"].includes(player.getState().actionId)
);
await player.idle();
check("ActionPlayer idle", player.getState().playState === "idle");

const draft = avatarStateToPackDraft(fresh, { name: "Test pack" });
const validation = validateCharacterPack(draft);
check("Pack draft schema version", draft.manifest.schemaVersion === PACK_SCHEMA_VERSION);
check("Pack draft validates with missing assets allowed", validation.ok || validation.errors.every((e) => e.startsWith("missing_asset:")));

const zipBytes = zipSync({
  "backup.json": strToU8(JSON.stringify({
    schema: "yueqi-companion-export",
    mediaManifest: [{ id: "m1", kind: "look", name: "a.png", type: "image/png", size: 3 }],
  })),
  "media/m1": new Uint8Array([1, 2, 3]),
});
const unzipped = unzipSync(zipBytes);
check("Backup ZIP roundtrip", strFromU8(unzipped["backup.json"]).includes("yueqi-companion-export") && unzipped["media/m1"].length === 3);

check("App wires full backup export", appJs.includes("exportFullBackupZip") || appJs.includes("buildFullBackupZip"));
check("App wires look subscription", appJs.includes("subscribeAvatarLook"));
check("App wires action player speaking", appJs.includes("onAiSpeaking") || appJs.includes("getAvatarActionPlayer"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Phase 0 verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Phase 0 verification passed: ${checks.length}/${checks.length}`);
