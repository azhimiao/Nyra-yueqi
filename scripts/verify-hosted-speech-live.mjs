/**
 * Live Volcengine openspeech smoke test.
 *
 * Requires in .env (or process env):
 *   YUEQI_SPEECH_APP_ID
 *   YUEQI_SPEECH_ACCESS_TOKEN
 *   YUEQI_SPEECH_VOICE_TYPE
 *   YUEQI_SPEECH_TTS_CNY_PER_10K_CHARS
 *   YUEQI_SPEECH_STT_CNY_PER_MINUTE
 *
 * Optional:
 *   YUEQI_SPEECH_TEST_WAV — defaults to docs/qa/voice/fixtures/test.wav
 *   YUEQI_SPEECH_LIVE_BASE_URL — defaults to http://127.0.0.1:8787
 *
 * Run: npm run verify:hosted-speech-live
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadDotEnv } from "./lib/load-dotenv.mjs";
import {
  loadHostedSpeechConfig,
  synthesizeHostedSpeech,
  transcribeHostedSpeech,
} from "../server/voice/hosted-speech.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "docs/qa/voice/fixtures");
const fixtureWav = join(fixtureDir, "test.wav");
const reportPath = join(root, "docs/qa/voice/LIVE_VERIFY.json");

loadDotEnv();

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, pass: true, detail };
}

function fail(name, detail = "") {
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, pass: false, detail };
}

function ensureSpeechConfig() {
  const config = loadHostedSpeechConfig(process.env);
  const missing = [];
  const hasApiKey = Boolean(config.apiKey);
  const hasLegacy = Boolean(config.appId && config.accessToken);
  if (!hasApiKey && !hasLegacy) {
    missing.push("YUEQI_SPEECH_API_KEY or (YUEQI_SPEECH_APP_ID + YUEQI_SPEECH_ACCESS_TOKEN)");
  }
  if (!config.voiceType) missing.push("YUEQI_SPEECH_VOICE_TYPE");
  if (!config.price.ttsCnyPer10kChars) missing.push("YUEQI_SPEECH_TTS_CNY_PER_10K_CHARS");
  if (!config.price.sttCnyPerMinute) missing.push("YUEQI_SPEECH_STT_CNY_PER_MINUTE");
  if (missing.length) {
    throw new Error(`missing speech env: ${missing.join(", ")}`);
  }
  if (!config.tts.available || !config.stt.available) {
    throw new Error(`hosted speech unavailable: tts=${config.tts.reason || "ok"} stt=${config.stt.reason || "ok"}`);
  }
  return config;
}

async function convertMp3ToWav(mp3Path, wavPath) {
  await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-i", mp3Path, "-ar", "16000", "-ac", "1", wavPath], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

async function waitForHealth(baseUrl, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function probeHttp(baseUrl, config) {
  const healthOk = await waitForHealth(baseUrl);
  if (!healthOk) return fail("HTTP /health", "server not reachable");

  const session = await (await fetch(`${baseUrl}/local/session`)).json();
  const token = String(session?.token || "").trim();
  if (!token) return fail("HTTP local session", "missing x-yueqi-local-token");

  const ttsResponse = await fetch(`${baseUrl}/voice/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-yueqi-local-token": token,
    },
    body: JSON.stringify({
      provider: "Volcengine",
      volcApiKey: config.apiKey || undefined,
      volcAppId: config.appId || undefined,
      volcAccessToken: config.accessToken || undefined,
      volcVoiceType: config.voiceType,
      text: "你好",
    }),
  });
  const ttsBytes = Buffer.from(await ttsResponse.arrayBuffer());
  if (!ttsResponse.ok || ttsBytes.length < 128) {
    let message = `http=${ttsResponse.status} bytes=${ttsBytes.length}`;
    try {
      message = JSON.parse(ttsBytes.toString("utf8")).message || message;
    } catch {
      /* ignore */
    }
    return fail("HTTP TTS 你好", message);
  }

  const wavPath = process.env.YUEQI_SPEECH_TEST_WAV || fixtureWav;
  let audioBase64;
  try {
    audioBase64 = readFileSync(wavPath).toString("base64");
  } catch {
    return fail("HTTP STT test.wav", `missing ${wavPath}`);
  }
  const sttResponse = await fetch(`${baseUrl}/voice/stt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-yueqi-local-token": token,
    },
    body: JSON.stringify({
      provider: "Volcengine",
      volcApiKey: config.apiKey || undefined,
      volcAppId: config.appId || undefined,
      volcAccessToken: config.accessToken || undefined,
      audioBase64,
      filename: "test.wav",
      mimeType: "audio/wav",
    }),
  });
  const sttPayload = await sttResponse.json().catch(() => ({}));
  const text = String(sttPayload.text || "").trim();
  if (!sttResponse.ok || !text) {
    return fail("HTTP STT test.wav", String(sttPayload.message || sttPayload.error || `http=${sttResponse.status}`));
  }
  return [
    pass("HTTP /health"),
    pass("HTTP TTS 你好", `${ttsBytes.length} bytes`),
    pass("HTTP STT test.wav", text.slice(0, 80)),
  ];
}

const results = [];

try {
  const config = ensureSpeechConfig();
  results.push(pass("config", `voice=${config.voiceType} auth=${config.authMode}`));

  let wavPath = process.env.YUEQI_SPEECH_TEST_WAV || fixtureWav;
  try {
    const tts = await synthesizeHostedSpeech({ config, text: "你好", uid: "live-verify" });
    if (!tts.audio?.length || tts.audio.length < 128) {
      results.push(fail("adapter TTS 你好", `bytes=${tts.audio?.length || 0}`));
    } else {
      results.push(pass("adapter TTS 你好", `${tts.audio.length} bytes`));
      mkdirSync(fixtureDir, { recursive: true });
      const mp3Path = join(fixtureDir, "test.mp3");
      writeFileSync(mp3Path, tts.audio);
      wavPath = process.env.YUEQI_SPEECH_TEST_WAV || fixtureWav;
      await convertMp3ToWav(mp3Path, wavPath);
      results.push(pass("fixture test.wav", wavPath));
    }
  } catch (error) {
    results.push(fail("adapter TTS 你好", error.upstreamDetail || error.message));
  }

  if (results.some((item) => item.name === "adapter TTS 你好" && item.pass)) {
    try {
      const audioBase64 = readFileSync(wavPath).toString("base64");
      const stt = await transcribeHostedSpeech({ config, audioBase64, uid: "live-verify" });
      const text = String(stt.text || "").trim();
      if (!text) results.push(fail("adapter STT test.wav", "empty text"));
      else results.push(pass("adapter STT test.wav", text.slice(0, 80)));
    } catch (error) {
      results.push(fail("adapter STT test.wav", error.message));
    }
  }

  const baseUrl = String(process.env.YUEQI_SPEECH_LIVE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
  const httpResults = await probeHttp(baseUrl, config);
  if (Array.isArray(httpResults)) results.push(...httpResults);
  else results.push(httpResults);
} catch (error) {
  results.push(fail("hosted-speech-live", error.message));
}

const report = {
  generatedAt: new Date().toISOString(),
  pass: results.every((item) => item.pass),
  results,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const failed = results.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Hosted speech live verification failed: ${failed.length}/${results.length}`);
  process.exit(1);
}
console.log(`Hosted speech live verification passed: ${results.length}/${results.length}`);
