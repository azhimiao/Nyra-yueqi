/**
 * P2 selfie spine — DEL-03 / DEL-12#1 (static + unit, no browser).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectSelfieIntent,
  buildSelfiePrompt,
  requestCompanionSelfie,
} from "../src/companion/selfie.js";
import {
  upsertArtifact,
  enqueueDelivery,
  listDeliveryOutbox,
  openArtifactDeepLink,
  flushPopDeliveries,
  flushSystemNotificationDeliveries,
  __resetArtifactsForTests,
  __resetDeliveryForTests,
  getArtifact,
} from "../src/artifacts/index.js";
import { routeUserInput } from "../src/agent-orchestrator/index.js";
import { b64ToBlob } from "../src/imagegen/client.js";
import { saveImagegenSettings } from "../src/settings/imagegen-preferences.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cases = [];
function check(id, ok, detail = "") {
  cases.push({ id, pass: Boolean(ok), detail: String(detail || "") });
  if (!ok) console.error(`FAIL ${id}`, detail);
  else console.log(`PASS ${id}`);
}

if (typeof localStorage === "undefined") {
  globalThis.localStorage = {
    _d: Object.create(null),
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}

globalThis.window = globalThis;
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");

__resetArtifactsForTests();
__resetDeliveryForTests();

check("detect_selfie_zh", detectSelfieIntent("发张自拍"));
check("detect_character_image_zh", detectSelfieIntent("发给我一张图片"));
check("detect_selfie_en", detectSelfieIntent("send me a selfie"));
check("detect_selfie_negative", !detectSelfieIntent("今天天气怎么样"));

const prompt = buildSelfiePrompt({ name: "星璃", identity: "温柔少女" });
check("selfie_prompt_has_name", prompt.includes("星璃"));

const route = routeUserInput({ text: "来张自拍" });
check("route_direct_action_selfie", route.route === "direct_action" && route.action === "selfie");

const noProvider = await requestCompanionSelfie({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
});
check("honest_provider_required", !noProvider.ok && noProvider.reason === "PROVIDER_REQUIRED");

saveImagegenSettings({ apiKey: "test-image-key", enabled: true });
const missingIdentityReference = await requestCompanionSelfie({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
});
check(
  "selfie_requires_identity_reference",
  !missingIdentityReference.ok && missingIdentityReference.reason === "IDENTITY_REFERENCE_REQUIRED",
  JSON.stringify(missingIdentityReference),
);
localStorage.setItem("yueqi.visual.memory.v1", JSON.stringify({
  schemaVersion: 1,
  byCompanion: {
    xingli: {
      companionId: "xingli",
      identityVersion: 1,
      assets: [{
        id: "identity-ref-001",
        mediaId: "identity-media-001",
        companionId: "xingli",
        namespace: "identity",
        kind: "front",
        qaStatus: "pending",
        significance: "saved",
      }],
    },
  },
}));
let capturedReferenceOptions = null;
const referenceSelfie = await requestCompanionSelfie({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
  buildReferenceImageFn: async () => "data:image/png;base64,cmVmZXJlbmNl",
  runJob: async (options) => {
    capturedReferenceOptions = options;
    return { mediaId: "generated-from-reference", job: { id: "job-reference" } };
  },
});
check(
  "selfie_passes_album_reference_to_imagegen",
  referenceSelfie.ok
    && capturedReferenceOptions?.requireIdentityReferences === true
    && capturedReferenceOptions?.referenceMediaIds?.includes("identity-media-001")
    && capturedReferenceOptions?.referenceImageDataUrl?.startsWith("data:image/"),
  JSON.stringify(capturedReferenceOptions || {}),
);
__resetArtifactsForTests();
__resetDeliveryForTests();
saveImagegenSettings({ apiKey: "", enabled: true });

const mockMediaId = "media-selfie-test-001";
const mockPhotoId = "photo-selfie-test-001";
const fakeImport = async () => ({
  mediaId: mockMediaId,
  photo: { id: mockPhotoId, mediaId: mockMediaId },
  mediaRecord: { id: mockMediaId, kind: "image" },
});

const success = await requestCompanionSelfie({
  companionId: "xingli",
  characterProfile: { name: "星璃" },
  allowFakeSelfie: true,
  importBlob: fakeImport,
});
check("fake_selfie_ok", success.ok && success.mediaId === mockMediaId, JSON.stringify(success));
check("fake_selfie_artifact", Boolean(success.artifactId), success.artifactId || "");

const artifact = getArtifact(success.artifactId);
check("artifact_type_selfie", artifact?.type === "selfie" && artifact.companionId === "xingli");
check("artifact_meta_media", artifact?.meta?.mediaId === mockMediaId);

const outbox = listDeliveryOutbox({ companionId: "xingli", status: "pending" });
check("outbox_four_channels", outbox.length === 4, String(outbox.length));

const popMsgs = [];
await flushPopDeliveries({
  companionId: "xingli",
  addMessage: async (text, role, opts) => { popMsgs.push({ text, role, opts }); },
});
check("pop_flushed_selfie", popMsgs.length === 1 && popMsgs[0]?.opts?.metadata?.artifactType === "selfie");

globalThis.Notification = class {
  static permission = "granted";
  static requestPermission() { return Promise.resolve("granted"); }
  constructor() { /* no-op */ }
};
const notif = await flushSystemNotificationDeliveries({ companionId: "xingli" });
check("system_notification_flushed", notif?.flushed >= 0);

const opened = [];
const galleryRoute = await openArtifactDeepLink(artifact.deepLink, {
  openGallery: async (mediaId) => { opened.push(mediaId); },
  openPhoneApp: () => {},
});
check("deeplink_opens_gallery_media", galleryRoute.ok && opened[0] === mockMediaId, JSON.stringify(galleryRoute));

const selfieJs = read("src/companion/selfie.js");
check("selfie_honest_failure_codes", selfieJs.includes("PROVIDER_REQUIRED") && selfieJs.includes("MODEL_FAILED"));
check("selfie_allow_fake_test_only", selfieJs.includes("allowFakeSelfie"));
check("selfie_enqueue_delivery", selfieJs.includes("enqueueDelivery") && selfieJs.includes("system_notification"));

const chatJs = read("src/panels/chat.js");
check("chat_selfie_dispatch", chatJs.includes("requestCompanionSelfie") && chatJs.includes("direct_action"));
check("chat_selfie_no_fake_success", chatJs.includes("selfie-failed"));

const appJs = read("src/app.js");
check("app_selfie_event", appJs.includes("yueqi:selfie-created"));
check("app_gallery_media_deeplink", appJs.includes("openToMediaId"));

const orchJs = read("src/agent-orchestrator/index.js");
check("orchestrator_selfie_route", orchJs.includes("detectSelfieIntent"));

const routerJs = read("src/artifacts/router.js");
check("router_selfie_gallery", routerJs.includes('artifact.type === "selfie"'));

const failed = cases.filter((c) => !c.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) process.exitCode = 1;
