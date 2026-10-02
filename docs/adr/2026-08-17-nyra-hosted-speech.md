# ADR: Speech has three routes, and Hosted speech fails closed on price

Date: 2026-08-17

## Decision

Speech resolves to exactly one of three routes, in priority order:

1. `byok` — a speech key stored on the device. Never billed.
2. `hosted` — Volcengine 豆包语音 (openspeech) behind the gateway, available
   only to subscribed sessions, billed in Credits.
3. `device` — the OS speech engine: Web Speech in browsers,
   `NativeCapabilityPlugin.speak` in the Android WebView. No key, no Credits.

Hosted speech turns on only when the operator sets **both** credentials
(`YUEQI_SPEECH_APP_ID` / `YUEQI_SPEECH_ACCESS_TOKEN` / `YUEQI_SPEECH_VOICE_TYPE`)
**and** supplier unit prices (`YUEQI_SPEECH_TTS_CNY_PER_10K_CHARS`,
`YUEQI_SPEECH_STT_CNY_PER_MINUTE`). A missing price disables the route.

## Why

A subscription that reads "Hosted" implied speech was included, but the gateway
had no speech supplier at all: `HOSTED_CAPABILITIES` covered text and image
only, `estimateHostedUsageCredits` threw for `audio_tts` / `audio_stt`, and the
`YUEQI_TTS_API_KEY` env var was never read by any route. Subscribers saw a live
speaker button that could not produce audio.

Ark chat credentials cannot buy speech: Volcengine speech is a separate service
with its own appid/access token, so wiring it is an explicit operator decision
with an explicit cost.

Fail-closed pricing is the conservative half of that decision. Billing speech at
a guessed rate either overcharges users' Credits or silently runs the gateway at
a loss, and both are worse than leaving the route off and falling back to the
device voice.

The device route exists so "subscribed but nothing configured" still speaks. It
costs nothing, works offline, and removes the class of complaint where a control
looks enabled and does nothing.

## Consequences

- Speech billing is per character (TTS) and per audio second (STT), reserved
  against a payload ceiling and settled on measured duration.
- Hosted speech is rate limited per user (`hostedVoice`, 60/min) like chat.
- Long replies are split under the supplier's 1024-byte text cap server-side and
  the audio is concatenated, so clients need no knowledge of supplier limits.
- The supplier name stays in env names, endpoints, and code comments. It never
  appears in a message a user can read; `verify:voice` enforces this.
- The device route has no audio element, so lip sync only runs on cloud routes.
- Android native dictation is not bridged; `speechCapabilities().stt` is false,
  so dictation on Android needs Hosted speech or a device key.
- `/billing/pricing` publishes `voice.hostedTts` / `voice.hostedStt` plus sample
  Credits, and `reason` stays a machine code so operator configuration prose
  never leaks through a public endpoint.
