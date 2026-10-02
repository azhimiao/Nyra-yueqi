# Nyra Portable Formats

Status: **TARGET/DRAFT**. This directory specifies architecture; it does not claim runtime support.

## Format registry

| Format | Extension | MIME type | Purpose | Runtime status |
|---|---|---|---|---|
| Nyra Data Archive v1 | `.nyra` | `application/vnd.nyra.archive` | Encrypted user-data snapshot | TARGET/DRAFT |
| Nyra Character Package v1 | `.nychar` | `application/vnd.nyra.character+zip` | Shareable structured Character | TARGET/DRAFT |
| Nyra resource metadata v1 | `.json` | `application/vnd.nyra.resource-metadata+json` | Immutable Book/Music/Image metadata | TARGET/DRAFT |
| Open character card | `.json`, `.png`, `.webp` | Existing media MIME | Best-effort Character import | Current, lossy |
| Book import | `.txt`, `.md`, `.epub` | Existing media MIME | Local reading resources | Current |
| Book import | `.pdf`, `.docx` | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Future extraction pipeline | TARGET/DRAFT |
| Book enhanced package | `.nybook` | *(deferred)* | Optional book + metadata + annotations/reading state | DEFERRED TARGET |
| Audio import | common local audio extensions | `audio/*` | Local Music/audio resources | Current |
| Audio playlist package | `.nyplaylist` | *(deferred)* | Optional playlist metadata and/or bundled local media | DEFERRED TARGET |

The visual-memory ZIP export is a separate current pathway and is not a `.nyra` archive.

## Normative documents

- [Data Archive](NYRA_DATA_ARCHIVE_SPEC.md)
- [Character Package](NYRA_CHARACTER_PACKAGE_SPEC.md)
- [Open Card Compatibility](GENERIC_CHARACTER_CARD_COMPATIBILITY.md)
- [Book Import](BOOK_IMPORT_SPEC.md)
- [Audio Import](AUDIO_IMPORT_SPEC.md)
- [Architecture decision](../architecture/adr/002-data-entities-resources-portability.md)

## Schema registry

All schemas use JSON Schema Draft 2020-12. Schema validity does not imply importer implementation.

- `nyra-archive-manifest-v1.schema.json`
- `nyra-resource-metadata-v1.schema.json`
- `nychar-manifest-v1.schema.json`
- `nychar-character-v1.schema.json`
- `nychar-worldbook-v1.schema.json`
- `nychar-relationship-v1.schema.json`
- `nychar-appearance-v1.schema.json`
- `nychar-actions-v1.schema.json`
- `nychar-voice-v1.schema.json`
- `nychar-skills-v1.schema.json`

## Example registry

Each schema-backed example validates independently against the linked Draft 2020-12 schema. Hashes and UUIDs are deterministic placeholders.

- Data archive: [`nyra-archive-manifest.example.json`](examples/nyra-archive-manifest.example.json)
- Character package: [`nychar-manifest.example.json`](examples/nychar-manifest.example.json), [`nychar-character.example.json`](examples/nychar-character.example.json), [`nychar-worldbook.example.json`](examples/nychar-worldbook.example.json), [`nychar-relationship.example.json`](examples/nychar-relationship.example.json), [`nychar-appearance.example.json`](examples/nychar-appearance.example.json), [`nychar-actions.example.json`](examples/nychar-actions.example.json), [`nychar-voice.example.json`](examples/nychar-voice.example.json), and [`nychar-skills.example.json`](examples/nychar-skills.example.json)
- Resource metadata: [`book-resource-metadata.example.json`](examples/book-resource-metadata.example.json) and [`music-resource-metadata.example.json`](examples/music-resource-metadata.example.json)
- Generic compatibility input (valid JSON, not schema-backed): [`generic-character-card.example.json`](examples/generic-character-card.example.json)

## Versioning and conformance

Format major versions are breaking; minor versions may add optional fields. Readers MUST reject unsupported major versions and MUST ignore unknown optional fields only where the governing schema permits them. A conforming importer validates structure, paths, declared sizes, MIME allowlists, and SHA-256 digests before committing data.

Limits in these drafts are safety ceilings, not product promises. Implementations may advertise lower limits before selection and return stable errors instead of partially importing.
