# Book Import

## Status and accepted media

Current support is limited to local TXT, Markdown, and EPUB:

- `.txt` — `text/plain`
- `.md` — `text/markdown` (some platforms report `text/plain`)
- `.epub` — `application/epub+zip`

PDF (`.pdf`, `application/pdf`) and DOCX (`.docx`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) are **TARGET/DRAFT**, not current support.

## Resource model

A Book is a resource, not a Character or user-history record. A target-conforming importer MUST preserve the exact immutable original bytes and record metadata using `schemas/nyra-resource-metadata-v1.schema.json`. Extracted text, cover images, chunks, summaries, and embeddings are derivatives linked to the original SHA-256; they never substitute for the original. Reading position, annotations, and co-reading events are separate user data.

The current TXT/Markdown/EPUB importer may retain only the extracted/flattened book body rather than the complete source bytes. That behavior remains current product fact but is **nonconforming to the target resource model** in this specification.

Required metadata: resource ID, `kind: "book"`, import timestamp, and original filename/MIME/size/SHA-256. Title defaults to safe file metadata when absent. Author, language, charset, and source are optional.

Example: [`examples/book-resource-metadata.example.json`](examples/book-resource-metadata.example.json).

## Processing

TXT/Markdown decoding MUST be bounded and declare replacement-character warnings. Markdown is treated as content, never executable HTML/script. EPUB import validates the ZIP container, rejects traversal/links, selects readable spine content, sanitizes markup, and reports omitted DRM, scripts, styles, fonts, and unsupported media.

Future PDF/DOCX processing, if implemented, creates extracted-text derivatives and MUST preserve the original. OCR, layout reconstruction, tables, footnotes, equations, and page order can be lossy and require an import report.

## Limits, security, and errors

Default ceilings: 256 MiB original, 5,000 EPUB entries, 32 MiB extracted UTF-8 text, 240-byte internal paths, and compression ratio 100:1. Implementations may publish lower limits.

Reject active content, external automatic fetches, encrypted/DRM content that cannot be read, archive bombs, malformed paths, and MIME/signature conflicts. Stable errors: `book_unsupported_format`, `book_limit_exceeded`, `book_decode_failed`, `book_archive_invalid`, `book_drm_unsupported`, `book_no_readable_content`, and `book_storage_failed`.

## Compatibility and versioning

Import metadata format version follows Nyra resource metadata v1; parser revisions do not mutate originals. Reprocessing creates versioned derivatives. TXT/Markdown structure and EPUB styling may be lost. Current code imports only TXT/Markdown/EPUB; UI or documentation MUST NOT advertise PDF/DOCX as available until runtime and verification exist.

## Optional enhanced sharing package

`.nybook` is a **future/deferred** enhanced sharing package. It is **not** required for normal book import (TXT/Markdown/EPUB, and any future PDF/DOCX path). No runtime importer, exporter, or schema for `.nybook` is claimed by this document.

If defined later, a `.nybook` package MAY bundle:

- the immutable original book bytes (never rewritten in place)
- resource metadata conforming to Nyra resource metadata rules
- optional user annotations, bookmarks, and reading-state projections

Derivatives remain linked to the original SHA-256; the original stays immutable. Any package that includes annotations, bookmarks, or reading state MUST run explicit rights and privacy checks before share or export (consent, redistributability of the original, and exclusion of unintended personal data). Ordinary local import MUST continue to accept bare book files without a `.nybook` wrapper.
