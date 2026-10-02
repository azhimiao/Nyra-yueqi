# Memory Pipeline Contract

Status: Accepted  
Date: 2026-08-01  
Scope: Companion continuous-memory spine (billing out of scope)

## Layers (not interchangeable)

| Layer | Sole authority | Sole writer | Others may |
|-------|----------------|-------------|---------|
| Character / identity | Character store + Character Block | Character / First Light / relationship APIs | Read for prompt |
| Conversation transcript | Conversation V2 (`yueqi.conversation.v2`) | `writeCompanionTurn` / Conversation Runtime | IDB `messages` as projection only |
| Shared life events | Relationship Timeline (`yueqi.timeline.events.v1`) | Timeline repository (+ from-conversation emitter) | Projectors read |
| Inferred understanding | Candidate ledger (`yueqi.understanding.candidates.v1`) | `submitCandidate` / transitions | Never write Stable directly from chat extract |
| Stable facts | Stable Memory (`yueqi.stable.memory.v1`) | `promoteCandidateToStable` / forget | Graph may mirror after promote |
| Long-term recall indexes | Context Graph + MemPalace | Pipeline after ledger promote; Palace drawers | Broker retrieves |
| Prompt assembly | Context Broker | `buildContextEnvelope` | Surfaces call Broker; no parallel assemblers for companion chat |
| Multi-step tools | OpenClaw (task runs) | Assist / unified task runners | Must write results back to V2 / Timeline; must not own persona memory |

## Hard rules

1. **V2 first-write:** Companion chat / system notes / First Light openings must succeed on Conversation V2 before any IDB projection. IDB-only success is forbidden.
2. **No new parallel truth sources** for transcript, events, or stable user understanding.
3. **Inferences → candidate-ledger first.** User-stated confirmations may promote; `shared_fiction` never auto-promotes to reality Stable.
4. **Ordinary love chat is not OpenClaw.** OpenClaw results may append to shared history after the task.

## Shared write API

- `src/conversation/companion-write.js` — `writeCompanionTurn`, `writeCompanionSystemNote`
- Call sites: Pop, First Light, phone-shell system inject, proactive, OpenClaw writeback
