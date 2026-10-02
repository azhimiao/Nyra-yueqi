# ADR-002: Data Entities, Resources, and Portability

- Status: Accepted architecture; formats remain Draft/Target
- Date: 2026-08-15
- Scope: Documentation only

## Context

月栖 currently has a legacy `yueqi-companion-export` backup payload (v1/v2), best-effort open character-card import, library imports, and a separate visual export path. These mechanisms do not establish durable boundaries between portable entities, user data, resources, and device snapshots.

## Decision

Four concepts are normative:

1. **Character** is a structured entity: identity, persona, greetings, lore references, and presentation references.
2. **Book, Music, and Image** are resources: immutable original bytes plus metadata and optional derived artifacts.
3. **User history** is user data: conversations, memories, relationship state, reading/listening progress, annotations, and activity.
4. **Backup** is a snapshot: a restorable capture of supported local user data and resource references/bytes at a point in time.

The target portable formats are:

- `.nychar`: one shareable Character entity and its permitted assets. It MUST NOT contain private user relationship state, memories, conversations, or history.
- `.nyra`: an encrypted backup/archive snapshot. It MUST exclude credentials, provider secrets, `BillingCredit`, and server-economy authority.
- Nyra resource metadata: content-addressed metadata for immutable Book, Music, and Image originals.

Original resource bytes are immutable. Edits, transcoding, extracted text, thumbnails, embeddings, and summaries create derivatives linked to the original; they never replace it.

Cloud backup stores the exact same client-produced `.nyra` ciphertext as local export. The server does not receive a second plaintext archive representation.

Restore is staged and atomic: authenticate/decrypt, validate structure and checksums, check compatibility and capacity, stage data, then commit all supported authorities together. Failure before commit leaves current data unchanged.

## Compatibility

- `yueqi-companion-export` v1 and v2 remain legacy inputs and are not renamed to `.nyra`.
- Current book support remains TXT, Markdown, and EPUB only.
- Current audio support remains common local audio files.
- Current open character JSON/PNG/WebP import remains best effort and potentially lossy.
- Current visual ZIP export remains separate from `.nyra`.
- `.nyra`, `.nychar`, PDF, and DOCX support are **TARGET/DRAFT**, not current runtime support.

## Consequences

- Entity packages can be shared without exporting a user's relationship.
- Backup policy cannot accidentally redefine BillingCredit or server economy as client-owned data.
- Importers must report lossy mappings and unsupported fields rather than silently claiming fidelity.
- Format evolution is versioned independently from application and database versions.

## Rejected

- Treating every file as a Character: conflates identity with resources.
- Putting private history in `.nychar`: makes safe sharing impossible.
- Reusing visual ZIP as full backup: it lacks user-data and restore semantics.
- Server-side plaintext repacking: creates an unnecessary confidentiality boundary and divergent archive forms.
