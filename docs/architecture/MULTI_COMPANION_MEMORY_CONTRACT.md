# Multi-Companion Memory Isolation Contract (M6)

Status: Accepted  
Date: 2026-08-01  
Depends on: `MEMORY_PIPELINE_CONTRACT.md` (M0–M5)

## Principle

One infrastructure, many companion accounts:

```text
Same system
├── Companion A life-line
├── Companion B life-line
└── Companion C life-line
```

Shared: Conversation V2 engine, Broker, Timeline repo, candidate-ledger, Graph/Palace algorithms, OpenClaw runtime.  
Not shared by default: private chat, relationship events, understandings, stable memory, follow-ups, OpenClaw results.

## Required scope fields

Every Companion data operation must carry (frozen at start):

| Field | Meaning |
|-------|---------|
| `userId` | Account / local principal |
| `companionId` | Character id (same as product `characterId`) |
| `relationshipId` | Deterministic `rel:{userId}:{companionId}` unless shared-space |
| `conversationId` | Conversation V2 session id (when transcript involved) |

Optional: `taskId`, `agentId`, `skillId`, `experienceId`, `sharedSpaceId`.

## Hard rules

1. **No UI-role fallback inside repositories / extractors / background jobs.** Do not read `getActiveCharacterId()` / `currentCompanion` / focused UI role to decide ownership mid-operation.
2. **Missing `companionId` → fail** for Companion writes and Companion ContextRequests. Never fall back to “whoever is active now.”
3. **Freeze scope** for the duration of a turn, proactive wake, or OpenClaw task (`initiatingCompanionId` + `relationshipId`).
4. **Candidate scopes** default to `companion_private_understanding` or `relationship_memory`. Only explicit user confirmation may mark `global_user_fact`. Fiction stays in its reality namespace.
5. **Legacy rows** without companion scope → `legacy_unscoped`; never broadcast to all companions.

## API

- `src/memory/companion-scope.js` — `freezeCompanionScope`, `requireCompanionScope`, `relationshipIdFor`
- Writes: `writeCompanionTurn` stamps and requires scope
- Context: Companion ContextRequest requires `characterId`/`activeCompanionId` + `relationshipId`

## Verify

`npm run verify:multi-companion`
