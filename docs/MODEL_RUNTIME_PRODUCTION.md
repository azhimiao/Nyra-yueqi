# Model Runtime Production Cutover

## Release contract

All provider-backed work now crosses an authenticated Yueqi service boundary. The client selects either:

- `subscription`: server-owned provider credentials, server-selected models, usage settled in subscription credits;
- `developer`: user-owned provider credentials sent only to the authenticated gateway for the current request, with zero Yueqi model-credit charge.

Both modes require a Yueqi account. `NyraCoin` remains a separate in-product economy and is never used as model billing credit.

## Authoritative execution path

```text
feature
  -> domain prompt/context adapter
  -> ModelRuntime / model client
  -> POST /model/chat | /image/generate | /voice/stt | /voice/tts
  -> provider
  -> normalized result + usage + billing + execution metadata
  -> feature persistence only after success
```

`src/model/runtime.js` is the capability facade. `src/model/client.js`, image, STT, and TTS clients own authentication, provider-mode routing, and execution tracing. Feature modules must not call provider URLs directly.

The only retained direct-provider chat adapter is `createByokStreamFn` in `src/studio-assist/agent/byok-stream.js`; it exists for isolated adapter tests. Production Studio Assist runners use `createGatewayStreamFn`.

## Call map

| Domain | businessPurpose | Capability | Persistence rule |
|---|---|---|---|
| Companion chat | `chat.companion_reply` | chat/tools | message after successful stream |
| Branch summary | `context.branch_summary` | chat | summary after valid response |
| Memory extraction | `memory.extract_operations` | chat | validated operations only |
| Companion Life | `companion.life_planner` | chat | decision first; product event only after projection succeeds |
| Diary | `diary.generate` | chat | diary after valid generation |
| Moments | `moments.character_post` | chat | no model means no post |
| Proactive | `proactive.*` | chat | send record after actual delivery |
| World post | `world.character_post_draft` | chat | no model means explicit refusal |
| Assistant/OpenClaw | `assistant.conversation` | chat/tools | ACL and confirmation remain authoritative |
| Adventure/scenario/story/VN | `creative.*` | chat | each mode validates its domain contract |
| Co-create/sidewrite | `creative.cocreate_*`, `creative.sidewrite_*` | chat | source content changes only after valid output |
| Media perception/video call | `vision.*`, `call.video_reply` | vision | analysis result only |
| Selfie/image | `image.*` | image | local identity reference is sent in-memory to the image-edit adapter; media record is created only after image bytes return |
| Speech | `voice.transcribe`, `voice.synthesize` | stt/tts | no silent text/audio fallback |
| Connection tests | `diagnostics.*` | chat | no product-state mutation |

Every execution trace contains `modelExecutionId`, `turnExecutionId`, user/companion identity, business purpose, capability, provider mode/provider/model, timestamps, latency, token usage, estimated provider cost, billing units, success, and sanitized error. Prompt contents and credentials are not stored in this trace.

## Prompt, tools, and memory boundaries

This cutover does not replace the existing Prompt Compiler, Context Broker, enterprise context, MemPalace, or unified memory projection. They still determine what enters `messages[]`. The runtime begins only after the final request has been assembled.

Tool definitions and tool choice pass through the same gateway for both streaming and non-streaming calls. OpenClaw keeps its existing action registry, ACL, user-confirmation requirements, round limits, and durable result rules. A provider response is never itself treated as proof that a tool side effect happened.

## Companion Life consistency

Life planning is a discrete event policy, not unrestricted role-play:

1. The planner may return `NO_OP` and must cite stored evidence for every non-empty event.
2. It may only claim digital actions such as reflecting, organizing, writing, creating, or maintaining a stored project.
3. Diary, moment, proactive message, and artifact decisions are persisted as `pending_projection`.
4. The product adapter performs the real action.
5. Only a successful producer moves the event into `recentLifeEvents` and writes activity/cohabit records.
6. Failure leaves the action pending and never claims that the companion completed it.

## Verification

```powershell
npm run verify:model-production
```

This runs implementation and regression checks, then real-provider smoke checks. With no smoke credentials, external cases are recorded as `IMPLEMENTED_PENDING_EXTERNAL_MODEL_VALIDATION`; they are never marked pass.

To run real chat/tool smoke against a started Yueqi server:

```powershell
$env:YUEQI_SMOKE_MODEL_BASE_URL="https://provider.example/v1"
$env:YUEQI_SMOKE_MODEL_API_KEY="..."
$env:YUEQI_SMOKE_MODEL="..."
npm run smoke:model-production
```

Optional real capability variables are `YUEQI_SMOKE_IMAGE_API_KEY`, `YUEQI_SMOKE_TTS_API_KEY`, `YUEQI_SMOKE_STT_API_KEY`, and `YUEQI_SMOKE_STT_AUDIO_FILE`. Results are written to `docs/qa/model-production/`.

## External validation status

- Chat and tool calling: implemented; requires configured real-provider smoke before release sign-off.
- Image generation: ordinary generation uses `images/generations`; identity-reference selfie generation sends a short-lived local reference image to the provider's standard `images/edits` endpoint. Providers that do not implement image edits return a visible, honest failure and never fall back to an unrelated new face.
- TTS/STT: implemented; real provider accounts and a real STT audio fixture are required for release sign-off.
- Managed subscription: implementation exists; production deployment still requires provider keys, durable storage, HTTPS, an auth secret, an admin activation path, and real billing-rate values.

The debug console contains a `Model Runtime` tab linking model executions to the selected chat turn. It is the supported inspection surface for prompt-to-provider execution metadata.
