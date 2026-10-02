# Nyra Data Archive v1

Status: **TARGET/DRAFT — not currently supported**

## Purpose and media type

`.nyra` is a client-created, encrypted backup snapshot. Extension: `.nyra`; MIME: `application/vnd.nyra.archive`. The decrypted payload is a ZIP archive with UTF-8 names and forward-slash paths. Cloud backup MUST store and return the exact same `.nyra` ciphertext produced by the client.

This does not replace the current `yueqi-companion-export` JSON/ZIP mechanism. Legacy v1 and v2 remain explicit migration inputs.

## Encryption envelope

The outer envelope contains magic/version, KDF parameters, salt, nonce, and authenticated ciphertext. v1 uses an implementation-registered memory-hard password KDF and an AEAD cipher; exact algorithms and parameters MUST be frozen before implementation. No secret, recovery phrase, plaintext key, or provider credential may be embedded. Authentication failure is fatal and indistinguishable from a wrong password.

## Decrypted layout

```text
manifest.json
data/user-data.json
data/settings.json
entities/characters/<character-id>.json
resources/<sha256>/original
resources/<sha256>/metadata.json
resources/<sha256>/derivatives/<name>
```

`manifest.json` MUST validate against `schemas/nyra-archive-manifest-v1.schema.json`. Every stored file other than the manifest has one manifest entry with path, category, MIME, byte size, and SHA-256. Resource metadata uses the resource schema. Original bytes are content-addressed and immutable; changed content receives a new digest.

Minimal conforming manifest: [`examples/nyra-archive-manifest.example.json`](examples/nyra-archive-manifest.example.json).

## Inclusion boundary

May include supported local Character entities, conversations, Conversation V2 authorities, memories, relationship state, local settings, books, audio, images, and local progress/history. User history is user data, not Character data.

MUST exclude:

- API keys, access/refresh tokens, passwords, cookies, and secure-store material;
- `BillingCredit`, payment instruments, receipts used as financial authority, or managed-provider credentials;
- server economy/NyraCoin authority, server account records, and server-side anti-fraud state;
- executable files, path links, device caches, and rebuildable indexes unless explicitly marked non-authoritative.

The current visual-memory ZIP remains separate and MUST NOT be represented as a conforming `.nyra` merely by renaming it.

## Restore

Restore MUST be staged and atomic:

1. Copy input to an isolated staging area; decrypt and authenticate.
2. Enforce limits, normalize paths, reject links/absolute paths/traversal, and validate schema.
3. Verify every size and SHA-256; reject undeclared or duplicate paths.
4. Produce a compatibility and lossy-conversion report for user confirmation.
5. Stage database and resource writes without changing active authorities.
6. Commit all supported authorities in one recoverable transaction, then rebuild projections.

Any failure before commit leaves existing data unchanged. A post-commit projection failure does not roll back authorities and MUST be reported as rebuildable.

## Limits and errors

Default ceilings: 4 GiB ciphertext, 20,000 entries, 1 GiB per entry, 512 KiB manifest, path length 240 bytes, and compression ratio 100:1. Implementations may lower disclosed ceilings.

Stable errors: `archive_unsupported_version`, `archive_auth_failed`, `archive_limit_exceeded`, `archive_invalid_path`, `archive_schema_invalid`, `archive_checksum_mismatch`, `archive_incompatible`, `archive_insufficient_space`, and `archive_commit_failed`.

## Versioning and loss

Manifest `version: 1` defines the archive major version. Readers reject higher major versions. Migration from legacy export v1/v2 may omit media bytes, unsupported modules, projections, or fields; the importer MUST list each omission. `.nyra`, PDF, and DOCX support remain draft targets and MUST not appear as current capabilities.
