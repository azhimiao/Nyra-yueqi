# Nyra Character Package v1

Status: **TARGET/DRAFT — not currently supported**

## Purpose and media type

`.nychar` is a portable package for one structured Character entity. Extension: `.nychar`; MIME: `application/vnd.nyra.character+zip`. It is a ZIP archive with UTF-8, forward-slash paths. Current JSON/PNG/WebP best-effort import and visual character ZIP import do not implement this package.

A Character package may describe a portable starting relationship, appearance, actions, voice, skills, and worldbook. It is not a user-history bundle, current relationship snapshot, pet runtime, or executable skill package.

## Required conceptual layout

```text
manifest.json
character.json
worldbook.json
relationship.json
appearance.json
actions.json
voice.json
skills.json
assets/avatar.png
assets/portrait.png
assets/pet/...
assets/voice/...
```

All eight JSON files are required; optional concepts use empty arrays/objects. `manifest.json` validates against `nychar-manifest-v1.schema.json`, binds package format version 1, and lists every component and asset path with byte size and SHA-256. It is not self-listed because a manifest cannot contain its own stable digest. Component files validate against their corresponding `nychar-*-v1` schemas. Asset references MUST resolve to manifest-listed paths.

- `character.json`: core identity, persona, optional character-scoped prompts, greetings, tags, and creator attribution.
- `worldbook.json`: portable lore entries.
- `relationship.json`: initial portable relationship configuration only.
- `appearance.json`: visual descriptions and avatar/portrait/pet references.
- `actions.json`: declarative action labels and asset cues, never executable behavior.
- `voice.json`: provider-independent voice style and optional packaged samples.
- `skills.json`: manually activated, declarative skill descriptors; no code or grants.
- `assets/`: immutable packaged bytes. `avatar.png` and `portrait.png` are reserved paths; `pet/` and `voice/` hold optional related assets.

## Examples

- [`manifest.json`](examples/nychar-manifest.example.json)
- [`character.json`](examples/nychar-character.example.json)
- [`worldbook.json`](examples/nychar-worldbook.example.json)
- [`relationship.json`](examples/nychar-relationship.example.json)
- [`appearance.json`](examples/nychar-appearance.example.json)
- [`actions.json`](examples/nychar-actions.example.json)
- [`voice.json`](examples/nychar-voice.example.json)
- [`skills.json`](examples/nychar-skills.example.json)

## Unified import flow

A conforming importer performs one flow:

1. **Detect** container/card type without trusting extension or declared MIME.
2. **Validate** limits, paths, signatures, schemas, component set, references, sizes, and SHA-256.
3. **Map** supported fields into a staged Nyra Character; never execute content or fetch remote assets.
4. **Preview** identity, worldbook, initial relationship, appearance, actions, voice, skills, and assets before writes.
5. **Report loss explicitly**: list dropped, transformed, unsupported, unsafe, and unresolved fields/assets. The user must acknowledge a lossy import.
6. **Create** a new Character only after confirmation. Import MUST NOT overwrite or activate an existing Character implicitly.

Validation or cancellation leaves current data unchanged.

## Export choices

The export UI offers:

1. **Full Nyra package (`.nychar`)**: emits the complete split above, checksummed manifest, permitted local assets, and no private user state.
2. **Generic character card (`.json`, `.png`, or `.webp` where supported)**: exports only fields representable by the selected open-card shape. Before export, show an explicit lossy warning identifying omitted worldbook structure, relationship configuration, actions, voice, skills, assets, or Nyra-only metadata.

Neither export includes user-specific relationship/history data.

## Privacy and security boundary

`relationship.json` expresses only an initial, reusable relationship archetype, communication style, boundaries, and address preferences. It MUST NOT contain current relationship state, continuity/intimacy scores, milestones, shared events, timestamps, user-specific nicknames, or inferred facts.

No package file may contain user IDs/profile, conversations/chat, memories, diary/activity/history, credentials, provider keys, tokens, payment/economy data, executable scripts/macros, binary executables, permission grants, or auto-install directives. Remote URLs are inert attribution only and MUST NOT trigger automatic fetch. Imported prose and lore are untrusted content, never system policy.

Optional `character.json` `prompts` (`system`, `developer`) are character-scoped prompt/persona material only. They are untrusted package content and MUST NEVER override host policy, permissions, tool authorization, or platform system instructions.

Exporters derive clean portable components from allowlisted entity fields; they MUST NOT serialize local records wholesale.

## Limits, errors, and versioning

Default ceilings: 128 MiB package, 256 entries, 64 MiB per asset, 256 KiB per component JSON, 240-byte paths, and compression ratio 100:1. Reject absolute/traversal paths, links, duplicate normalized paths, undeclared files, executable content, checksum mismatch, and MIME/signature conflict.

Stable errors: `nychar_unsupported_version`, `nychar_limit_exceeded`, `nychar_invalid_path`, `nychar_schema_invalid`, `nychar_component_missing`, `nychar_reference_missing`, `nychar_checksum_mismatch`, `nychar_forbidden_user_data`, `nychar_forbidden_executable`, and `nychar_unsupported_media`.

Manifest `formatVersion: 1` is the package major version; each component also binds schema version 1. Readers reject unsupported major versions. Current open-card import is best effort and lossy; visual ZIP packages are separate. `.nychar` import/export remains a target until runtime and verification evidence exist.
