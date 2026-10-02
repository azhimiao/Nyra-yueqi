# Generic Character Card Compatibility

Status: **Task 5.1 path-level TARGET matrix**. This is not complete third-party coverage, and it is not a description of the current parser in `src/characters/import.js` (Task 5.2). Round trips are not lossless.

Machine-readable copy: [`src/portability/character-card-schema.js`](../../src/portability/character-card-schema.js).

- `CHARACTER_CARD_SUPPORT_MATRIX` — path-level array `{ path, formats, disposition, targetPath, notes, status }`
- `lookupCardPath(path)` — collapsed row; `lookupCardPath(format, path)` — format-specific row
- `SUPPORT_MATRIX[format][path]`, `dispositionFor`, `listSupportedPaths` — compact format-column view

`status: planned` is the documented CharacterProfileV2 mapping. `status: implemented` means the live importer already keeps a surviving value on the legacy character record. A planned `preserved` row is **not** already persisted.

Fixtures: [`tests/fixtures/character-cards/v2-minimal.json`](../../tests/fixtures/character-cards/v2-minimal.json), [`v3-minimal.json`](../../tests/fixtures/character-cards/v3-minimal.json). Illustrative JSON: [`examples/generic-character-card.example.json`](examples/generic-character-card.example.json).

Parser work (bounded PNG extract) is Task 5.2. Greeting / example / prompt persistence is Task 5.3. `character_book` → scoped lore is Task 5.4. Until those land, runtime import may still be lossy; this matrix is the contract those tasks must implement.

## Hard rules

1. `data.system_prompt` and `data.post_history_instructions` are **demoted_untrusted** on JSON/PNG (and nychar `prompts.system`). They map only to `prompts.characterSystemSupplement` and `prompts.postHistoryInstructions`. They are never copied to platform kernel, tools, or permissions.
2. Unknown `data.extensions` keys are **preserved** raw on `CharacterProfileV2.extensions` and are **never** injected into Prompt.
3. Macro engines and regex scripts are **unsafe_ignored** on JSON/PNG, or **unsupported** where the format has no such source path. Literal text in mapped fields is not rewritten by a macro engine.
4. Coverage claims stop at this matrix. Unknown source paths are **unsupported**, never `preserved`.

## Formats

| Format | Container | Notes |
|---|---|---|
| `tavern_v2_json` | JSON (`spec: chara_card_v2`) | Fields under `data.*` |
| `tavern_v3_json` | JSON (`spec: chara_card_v3`) | Same listed `data.*` fields unless noted |
| `png_chara` | PNG | `tEXt` / `iTXt` / `zTXt` chunk named `chara` (V3 may also use `ccv3`). PNG pixels are the avatar candidate. Compressed-bomb and oversized limits are Task 5.2. |
| `webp` | WebP | **Entire column `unsupported`** — no bounded, signature-checked WebP metadata extractor. Scanning the file for JSON is unsafe. |
| `nychar` | `.nychar` ZIP | Native Nyra character package |

`dispositionFor` / `listSupportedPaths` also accept aliases `json_v2` → `tavern_v2_json` and `json_v3` → `tavern_v3_json`.

## Path-level support matrix

Each row is a source path. Each cell is a disposition from CharacterImportReportV1: `preserved | transformed | demoted_untrusted | dropped | unsupported | unsafe_ignored`.

Unknown source paths (not listed) are **`unsupported`**, never `preserved`.

<!-- character-card-path-matrix -->
| path | tavern_v2_json | tavern_v3_json | png_chara | webp | nychar |
|---|---|---|---|---|---|
| name | preserved | preserved | preserved | unsupported | preserved |
| description | preserved | preserved | preserved | unsupported | preserved |
| personality | preserved | preserved | preserved | unsupported | preserved |
| scenario | preserved | preserved | preserved | unsupported | preserved |
| first_mes | preserved | preserved | preserved | unsupported | transformed |
| alternate_greetings | preserved | preserved | preserved | unsupported | transformed |
| mes_example | transformed | transformed | transformed | unsupported | unsupported |
| system_prompt | demoted_untrusted | demoted_untrusted | demoted_untrusted | unsupported | demoted_untrusted |
| post_history_instructions | demoted_untrusted | demoted_untrusted | demoted_untrusted | unsupported | unsupported |
| creator_notes | preserved | preserved | preserved | unsupported | unsupported |
| creator | preserved | preserved | preserved | unsupported | transformed |
| character_version | preserved | preserved | preserved | unsupported | unsupported |
| tags | transformed | transformed | transformed | unsupported | transformed |
| extensions | preserved | preserved | preserved | unsupported | unsupported |
| character_book | transformed | transformed | transformed | unsupported | transformed |
| avatar | transformed | transformed | transformed | unsupported | transformed |
| macros | unsafe_ignored | unsafe_ignored | unsafe_ignored | unsupported | unsupported |
| regex_scripts | unsafe_ignored | unsafe_ignored | unsafe_ignored | unsupported | unsupported |

### Target mapping (JSON / PNG `chara` after decode)

Formats `v2_json` / `v3_json` / `png_text` share `data.*` after extract. WebP is not in this table (`container.webp` is `unsupported`).

| Source path | Formats | Disposition | Target CharacterProfileV2 path | Status | Notes |
|---|---|---|---|---|---|
| `data.name` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `name` | implemented | Live record stores `name`. |
| `data.description` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `persona.description` | implemented | Live `profile.fields[4]`. |
| `data.personality` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `persona.personality` | planned | Today merged into description; Task 5.3 persists separately. |
| `data.scenario` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `scenario` | planned | Parsed then dropped. Task 5.3 will persist. |
| `data.first_mes` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `greetings.primary` | planned | Parsed then dropped — **not persisted today**. Task 5.3 will persist. Not chat history. |
| `data.alternate_greetings[]` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `greetings.alternate` | planned | Not parsed today. Task 5.3 will persist. |
| `data.mes_example` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | transformed | `exampleDialogue` | planned | Budgeted snippets; not a standing Prompt block. |
| `data.system_prompt` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | demoted_untrusted | `prompts.characterSystemSupplement` | planned | Character supplement, not platform kernel. |
| `data.post_history_instructions` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | demoted_untrusted | `prompts.postHistoryInstructions` | planned | Character supplement, not platform kernel. |
| `data.creator_notes` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `extensions.cardMeta.creatorNotes` | planned | Raw notes; never Prompt. |
| `data.creator` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `extensions.cardMeta.creator` | planned | Attribution; never Prompt. |
| `data.character_version` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `extensions.cardMeta.characterVersion` | planned | Distinct from profile `revision`. |
| `data.tags` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | transformed | `tags` | implemented | Capped on live `profile.tokens`. |
| `data.extensions` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | preserved | `extensions` | planned | Raw object; never injected into Prompt. Not persisted today. |
| `data.character_book` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | transformed | `loreEntryIds` | planned | Task 5.4 character-scoped worldbook. |
| `data.avatar` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | transformed | `presentation.avatarMediaId` | implemented | Only `https://` or `data:` survive today. No fetch. |
| `text.macros` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | transformed | (host field) | planned | `{{` `}}` never executed; literal text or stripped. |
| `data.extensions.regex_scripts` | V2 JSON / V3 JSON / PNG tEXt\|iTXt\|zTXt | unsafe_ignored | — | implemented | Scripts are not executed. |
| `container.webp` | WebP | unsupported | — | implemented | No bounded WebP metadata extractor. |

`.nychar` uses native paths (`character.name`, `character.persona.*`, `character.greetings`, `character.prompts.system`, `worldbook.json`, `assets/avatar.png`) with the dispositions in the matrix above. `mes_example`, `post_history_instructions`, `creator_notes`, `character_version`, `extensions`, `macros`, and `regex_scripts` are not nychar source paths (`unsupported`).

### V3-only extras (not in the required matrix)

| path | tavern_v3_json | notes |
|---|---|---|
| `data.assets` | transformed (avatar candidates only) | Remote URIs are not fetched |
| `data.nickname` | preserved as `extensions.cardMeta.nickname` | No first-class alias on CharacterProfileV2 |
| `data.group_only_greetings` | unsupported | No landing path |

These extras are documented so Task 5.2 does not invent a silent mapping. They are not additional claims of coverage.

## PNG `chara` / `ccv3` containers

PNG import is **schema-defined** here. Bounded tEXt / iTXt / zTXt decode is Task 5.2. Keyword `chara` carries V2 JSON (commonly base64). Keyword `ccv3` carries V3 JSON. After decode, field rows in the matrix above apply.

| Container path | Disposition | Notes |
|---|---|---|
| `png.tEXt.chara` | transformed | Latin-1 tEXt; typically base64 JSON |
| `png.iTXt.chara` | transformed | UTF-8 iTXt; compressed flag inflates inside byte limits |
| `png.zTXt.chara` | transformed | zlib; inflate must be bounded (Task 5.2) |
| `png.tEXt.ccv3` | transformed | V3 JSON |
| `png.iTXt.ccv3` | transformed | V3 JSON |
| `png.zTXt.ccv3` | transformed | V3 JSON |
| `png.image` | transformed | PNG body as avatar candidate after MIME/signature/size checks |

A ZIP of visual assets is a separate Nyra pack path and is not generic-card conformance.

## Explicit non-support

- **Matrix-only coverage.** Fields outside the table are `unsupported`.
- **WebP:** entire format `unsupported`. Reason: no bounded WebP metadata extractor (EXIF/XMP/RIFF) with signature checks and decode limits; scanning the whole file for JSON is unsafe (oversized payloads and coincidental matches). PNG `chara` is the image-card target instead. A current byte-scan that happens to find JSON inside a WebP file is not a supported card path.
- **Macros:** `unsafe_ignored` on JSON/PNG. `{{...}}` macros are not executed. Literal `{{...}}` text inside mapped fields stays as character content.
- **Regex scripts:** `unsafe_ignored` on JSON/PNG (`data.extensions.regex_scripts`). Prompt-mutating regex scripts are not executed. Optional lore *key* regex is a `character_book` concern, not this path.
- **Unknown extensions:** `preserved` raw on JSON/PNG. Never injected directly into Prompt, tools, or permissions.
- **`data.system_prompt` / `data.post_history_instructions`:** `demoted_untrusted` on JSON/PNG (and nychar `prompts.system`). Cannot be promoted to platform kernel.
- **PNG limits:** `tEXt` / `iTXt` / `zTXt` `chara` is in-scope. Compressed-bomb and oversized rejection is Task 5.2, not this schema task.

## character_book semantics

`data.character_book` on JSON/PNG is **`transformed`** into character-scoped lore entries (Task 5.4). CharacterProfileV2 stores resulting ids on `loreEntryIds`. Lore is untrusted character data, not platform kernel.

When representable, entry semantics map deterministically:

| source | platform |
|---|---|
| `keys` | worldbook `keys` / `triggers` |
| `secondary_keys` | `secondaryKeys` |
| `position` | `insertPosition` (enum map) |
| `depth` | `scanDepth` |
| `priority` / `insertion_order` | `priority` |
| `enabled` | `enabled` |
| `selective` / selective logic | `matchMode` (`any` / `all`) plus non-constant matching |
| `constant` | `constant` |

Anything else on a book entry (including recursive scan / token-budget headers with no lore equivalent) is kept as **raw metadata** on that entry and listed in `CharacterImportReportV1`. Entries are linked only to the imported character.

`.nychar` worldbook.json only natively carries keywords / enabled / priority; those transform. Secondary keys, position, depth, selective, and constant are not nychar source fields.

## Honest current losses (live importer)

`parseJsonCharacterCard` / `mapParsedCardToCharacter` today — this is **not** the Task 5.1 contract:

| Path | Current behavior |
|---|---|
| `data.name`, `data.description`, `data.tags`, `data.avatar` (https/data) | Survive on the legacy character record |
| `data.personality` | Merged into description; no separate field |
| `data.scenario`, `data.first_mes` | Read, then dropped at map |
| `data.alternate_greetings`, `data.mes_example`, `data.system_prompt`, `data.post_history_instructions`, `data.creator_notes`, `data.creator`, `data.character_version`, `data.character_book` | Not parsed |
| `data.extensions` | Parsed onto the intermediate object; not persisted |
| PNG `zTXt`, WebP | Not supported |

Task 5.3 must persist greetings, examples, scenario, and demoted prompts. Task 5.2 must finish PNG extract. Task 5.4 must map `character_book`. This document does not implement those.

## Safety and privacy

Parsing never grants tool, script, network, or file permissions. Embedded instructions are Character content, not trusted policy. Remote assets are not fetched merely because a card references them. Importers enforce file limits, decode bounds, MIME/signature checks, and sanitized text rendering.

Private user relationship/history MUST NOT be inferred from a generic card or included in a generated `.nychar`. A generic card is Character input, not a backup.

## Errors

Stable compatibility outcomes are `recognized`, `recognized_lossy`, and `unsupported`. Errors include `card_json_invalid`, `card_embedded_json_missing`, `card_persona_missing`, `card_limit_exceeded`, and `card_unsafe_content_ignored`.

No compatibility claim extends beyond successfully mapped fields in this matrix.
