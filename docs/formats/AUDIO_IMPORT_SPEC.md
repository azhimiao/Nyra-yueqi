# Audio Import

## Status and accepted media

Current support accepts common local audio files through `audio/*`, including `.mp3`, `.m4a`, `.aac`, `.wav`, `.flac`, and `.ogg`. Actual decoding depends on the host browser/device codec stack; file-picker acceptance is not a playback guarantee.

Representative MIME types are `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/wav`, `audio/flac`, and `audio/ogg`. MIME and file signatures take precedence over extensions.

## Resource model

Imported audio is a Music/resource object, not Character data. The immutable original is identified by SHA-256 and described by `schemas/nyra-resource-metadata-v1.schema.json` with `kind: "music"`. Title, artist/creator, album, duration, track number, artwork references, and source are optional metadata.

Play position, playlists, favorites, listening history, and companion-shared listening events are user data and MUST NOT be written into the original or a `.nychar`. Waveforms, normalized tags, thumbnails, transcodes, speech transcripts, summaries, and embeddings are derivatives.

Example: [`examples/music-resource-metadata.example.json`](examples/music-resource-metadata.example.json).

## Processing and loss

Import validates size, signature, declared MIME, and decodability before adding the resource. Tag readers treat embedded text and artwork as untrusted. Metadata normalization may lose unknown/private tags, ordering, chapters, gapless markers, or container-specific fields. Transcoding is never a replacement for the original and MUST record codec, tool/version, and source digest.

No automatic cloud upload, transcription, fingerprinting, or external metadata lookup occurs without separate consent and policy.

## Limits, security, and errors

Default ceilings: 1 GiB original, 24-hour declared duration, 16 MiB embedded artwork, and 256 KiB normalized metadata. Implementations may publish lower limits. Decode duration and memory use MUST be bounded.

Stable errors: `audio_unsupported_format`, `audio_codec_unsupported`, `audio_limit_exceeded`, `audio_signature_mismatch`, `audio_decode_failed`, `audio_metadata_invalid`, and `audio_storage_failed`. Partial metadata failure may produce a warning while retaining a playable original; original or checksum failure is fatal.

## Compatibility and versioning

Resource metadata uses version 1. Decoder support is platform-specific and MUST be reported per file. Re-reading tags or generating a new derivative does not change the resource identity. This document does not expand current audio support beyond common local files.

## Optional enhanced sharing package

`.nyplaylist` is a **future/deferred** playlist/package format. It is **not** required for normal audio import. Ordinary local audio files MUST remain importable without conversion, wrapping, or re-encoding into `.nyplaylist`. No runtime importer, exporter, or schema for `.nyplaylist` is claimed by this document.

If defined later, `.nyplaylist` MAY support:

- **metadata-only** mode — playlist entries that reference local or already-imported resources by identity/path without bundling media
- **bundled-local-media** mode — optional inclusion of local audio originals plus playlist metadata

Copyright and license checks are mandatory before share or export. Listening history, play position, favorites, and other user history MUST be excluded unless the user explicitly selects those fields for inclusion. Transcoding or format conversion of ordinary audio MUST NOT be required to create or consume a playlist package.
