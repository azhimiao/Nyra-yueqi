/**
 * Voice steps 51–58 static checks.
 * Run: node scripts/verify-voice.mjs
 */

import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCallRecordMessage } from "../src/call/call-session.js";
import { resolveVoiceDisplayName } from "../src/voice/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const serverJs = readFileSync(join(root, "server/index.mjs"), "utf8");
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");

check("Step 51: voice API panel", indexHtml.includes("data-voice-tts-provider") && indexHtml.includes("data-test-voice"));
check("Step 51: voice preferences module", readFileSync(join(root, "src/settings/voice-preferences.js"), "utf8").includes("getVoiceSettings"));
check("Step 52: /voice/tts route", serverJs.includes('app.post("/voice/tts"'));
check("Step 52: tts module", readFileSync(join(root, "src/voice/tts.js"), "utf8").includes("synthesizeSpeech"));
check("Step 53: speak button in chat", appJs.includes("data-speak-message") && appJs.includes("speakMessageText"));
check("Step 54: microphone permission", readFileSync(join(root, "src/platform/permissions.js"), "utf8").includes('id: "microphone"'));
check("Step 54: record module", readFileSync(join(root, "src/voice/record.js"), "utf8").includes("startRecording"));
check("Step 54: composer mic", indexHtml.includes("data-composer-mic"));
check("Step 55: /voice/stt route", serverJs.includes('app.post("/voice/stt"'));
check("Step 55: stt module", readFileSync(join(root, "src/voice/stt.js"), "utf8").includes("transcribeAudio"));
check("Step 55: hold-to-transcribe", appJs.includes("transcribePendingRecording"));
check("Step 56: auto speak setting", indexHtml.includes("data-voice-auto-speak") && readFileSync(join(root, "src/voice/tts.js"), "utf8").includes("speakSegmentedText"));
check("Step 57: voice in backup", backupJs.includes("voice: exportVoiceSettingsForBackup") && backupJs.includes("settings?.voice"));
check("Step 57: voice feature flag", indexHtml.includes("data-feature-voice"));
check("Step 58: verify script", readFileSync(join(root, "package.json"), "utf8").includes("verify:voice"));

const voiceAccessJs = readFileSync(join(root, "server/voice/voice-access.mjs"), "utf8");
const voicePrefsJs = readFileSync(join(root, "src/settings/voice-preferences.js"), "utf8");
const ttsModuleJs = readFileSync(join(root, "src/voice/tts.js"), "utf8");
const sttModuleJs = readFileSync(join(root, "src/voice/stt.js"), "utf8");

// Speech has three routes: a device key, Hosted cloud speech, and the device's
// own system voice. Each must stay in its lane.
const hostedSpeechJs = readFileSync(join(root, "server/voice/hosted-speech.mjs"), "utf8");
const speechRoutingJs = readFileSync(join(root, "src/voice/speech-routing.js"), "utf8");
const deviceSpeechJs = readFileSync(join(root, "src/voice/device-speech.js"), "utf8");

check(
  "Voice access: both routes resolve through one rule",
  (serverJs.match(/resolveVoiceRoute\(\{/g) || []).length === 3
  && serverJs.includes('capability: "tts",')
  && serverJs.includes('capability: "stt",')
  && serverJs.includes('app.post("/voice/voices"'),
);
check(
  "Voice access: hosted session with a device key is not rejected",
  !/if \(commercial\.managed\) \{\s*return res\.status\(503\)/.test(serverJs),
);
check(
  "Voice access: a device key is never gated on a Credits balance",
  (serverJs.match(/commercialRequestAccess\(req, res, \{ requireCredits: false \}\)/g) || []).length === 3
  && voiceAccessJs.includes("byokAvailable")
  && voiceAccessJs.includes('return { route: "byok", rejection: null }'),
);
check(
  "Voice access: hosted speech is reserved for subscribed sessions",
  voiceAccessJs.includes("if (managed && hostedAvailable) return { route: \"hosted\""),
);
check(
  "Hosted speech: fails closed without credentials and prices",
  hostedSpeechJs.includes('? "credentials_missing"')
  && hostedSpeechJs.includes('? "price_missing"')
  && /if \(!config\?\.tts\?\.available\)/.test(hostedSpeechJs),
);
check(
  "Hosted speech: cloud speech settles Credits",
  serverJs.includes("estimateTtsCredits(")
  && serverJs.includes("estimateSttCredits(")
  && serverJs.includes("billHostedSpeech(")
  && /releaseReservation\(\{ userId, reservationId \}\)/.test(serverJs),
);
check(
  "Hosted speech: cloud speech is rate limited per user",
  (serverJs.match(/rateLimiter\.hostedVoice\(commercial\.userId\)/g) || []).length === 2
  && readFileSync(join(root, "server/rate-limit.mjs"), "utf8").includes("hostedVoice:"),
);
check(
  "Hosted speech: Volcengine BYOK reuses supplier adapter",
  hostedSpeechJs.includes("buildByokVolcSpeechConfig")
  && serverJs.includes('provider === "Volcengine"')
  && readFileSync(join(root, "src/voice/tts.js"), "utf8").includes('provider: "Volcengine"'),
);
check(
  "Device voice: a keyless system voice can speak and is preferred over nagging",
  deviceSpeechJs.includes("speakWithDeviceVoice")
  && speechRoutingJs.includes("SPEECH_ROUTE.DEVICE")
  && ttsModuleJs.includes("SPEECH_ROUTE.DEVICE")
  && !/isVoiceConfigured\(settings\);\s*}\s*export function canSpeak/.test(ttsModuleJs),
);
check(
  "Pop shell discovers hosted cloud speech on boot",
  readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8").includes("refreshHostedSpeechStatus")
  && readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8").includes("refreshPhoneSpeechRoutes"),
);
check(
  "Device voice: WebView falls back to the native bridge",
  deviceSpeechJs.includes("getNativeCapabilityPlugin")
  && readFileSync(
    join(root, "android/app/src/main/java/app/yueqi/companion/capability/NativeCapabilityPlugin.java"),
    "utf8",
  ).includes("public void speak(PluginCall call)"),
);
check(
  "Voice readiness: device key stays a pure key check",
  !voicePrefsJs.includes("isManagedProductMode")
  && !/isManagedProductMode\(\) && !config\.apiKey/.test(sttModuleJs),
);
check(
  "Hosted voices: catalog is curated and excludes TTS 2.0",
  readFileSync(join(root, "src/voice/hosted-voices.js"), "utf8").includes("zh_female_cancan_mars_bigtts")
  && !readFileSync(join(root, "src/voice/hosted-voices.js"), "utf8").includes("uranus"),
);
check(
  "Hosted voices: client TTS sends voiceType on the hosted route",
  ttsModuleJs.includes("voiceType: hostedVoiceType") || ttsModuleJs.includes("voiceType: hostedVoiceType"),
);
check(
  "Hosted voices: settings keep per-character overrides off the character pack",
  voicePrefsJs.includes("hostedVoiceByCharacterId")
  && indexHtml.includes("data-hosted-voice-select")
  && indexHtml.includes("data-hosted-voice-scope=\"character\""),
);
check(
  "Hosted voices: gateway allowlists voiceType",
  hostedSpeechJs.includes("applyHostedVoiceType")
  && serverJs.includes("applyHostedVoiceType"),
);

// Supplier names may stay in endpoint configuration, but never in a sentence a
// user can read.
const supplierNames = ["火山方舟", "方舟", "Ark"];
const supplierLeaks = [
  ["server/index.mjs", serverJs],
  ["server/voice/voice-access.mjs", voiceAccessJs],
  ["server/voice/hosted-speech.mjs", hostedSpeechJs],
  ["server/billing/pricing.mjs", readFileSync(join(root, "server/billing/pricing.mjs"), "utf8")],
  ["server/billing/hosted-catalog.mjs", readFileSync(join(root, "server/billing/hosted-catalog.mjs"), "utf8")],
].flatMap(([file, source]) => (source.match(/"[^"\n]*"/g) || [])
  .filter((literal) => /[\u4e00-\u9fff]/.test(literal))
  .flatMap((literal) => supplierNames
    .filter((name) => literal.includes(name))
    .map((name) => `${file}: ${name} in ${literal}`)));
check(
  "Voice access: gateway messages name no upstream supplier",
  supplierLeaks.length === 0,
  supplierLeaks.join(", "),
);

const callRecord = buildCallRecordMessage({
  id: "call-verify",
  characterName: "星璃",
  companionId: "char-verify",
  characterId: "char-verify",
  kind: "voice",
  startedAt: "2026-08-15T06:00:00.000Z",
  endedAt: "2026-08-15T06:03:12.000Z",
  turns: [{ role: "assistant", content: "我在。", at: "2026-08-15T06:00:03.000Z" }],
});
check("Call record: canonical message", callRecord?.metadata?.kind === "call_record");
check("Call record: duration", callRecord?.metadata?.call?.durationMs === 192000);
check("Call record: scoped companion", callRecord?.companionId === "char-verify");
check("Call record: both shells render", appJs.includes("message-call-card") && readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8").includes("message-call-card"));

const catalogJs = readFileSync(join(root, "src/voice/catalog.js"), "utf8");
const pickerJs = readFileSync(join(root, "src/voice/voice-picker-ui.js"), "utf8");
check("Voice picker: catalog module", catalogJs.includes("fetchElevenLabsVoices") && catalogJs.includes("OPENAI_TTS_VOICES"));
check("Voice picker: UI fetches then previews", pickerJs.includes("data-voice-preview") && pickerJs.includes("fetchElevenLabsVoices"));
check("Voice picker: panel has picker not a raw Voice ID field", indexHtml.includes("data-voice-picker") && !/<span>Voice ID<\/span>/.test(indexHtml));
check("Voice picker: names not hashes in the selected card", pickerJs.includes("resolveVoiceDisplayName") && catalogJs.includes("resolveVoiceDisplayName"));
check("Voice catalog: gateway list route does not bill", serverJs.includes('app.post("/voice/voices"') && serverJs.includes("requireCredits: false"));
check("Voice catalog: https preview only", catalogJs.includes("/^https:\\/\\//i.test(previewUrl)"));
check("Voice catalog: OpenAI named voices", catalogJs.includes('id: "alloy"') && catalogJs.includes('name: "Alloy"'));
check(
  "Voice picker: default ElevenLabs id shows Rachel",
  resolveVoiceDisplayName({ ttsProvider: "ElevenLabs", voiceId: "21m00Tcm4TlvDq8ikWAM" }) === "Rachel",
);
check(
  "Voice picker: OpenAI alloy shows Alloy",
  resolveVoiceDisplayName({ ttsProvider: "OpenAI", openaiVoice: "alloy" }) === "Alloy",
);

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Voice verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Voice verification passed: ${checks.length}/${checks.length}`);
