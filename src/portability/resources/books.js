/**
 * Hardened book import wrapper — TXT / MD / EPUB current; PDF / DOCX TARGET only.
 * Preserves original bytes via resource registry when possible.
 */

import { PortabilityError } from "../errors.js";
import { importTextBook } from "../../library/books.js";
import { importEpubBook } from "../../library/epub.js";
import { sha256Hex } from "../hash.js";
import { registerResource, linkDerivative } from "./registry.js";

const BOOK_MAX_BYTES = 256 * 1024 * 1024;

/** CURRENT formats per BOOK_IMPORT_SPEC.md */
export const BOOK_CURRENT_EXTENSIONS = Object.freeze(["txt", "md", "epub"]);

/** TARGET/DRAFT — must not fake PASS */
export const BOOK_TARGET_EXTENSIONS = Object.freeze(["pdf", "docx"]);

const EXT_MIME = Object.freeze({
  txt: "text/plain",
  md: "text/markdown",
  epub: "application/epub+zip",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

function fileExtension(name = "") {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function mimeHint(file) {
  return String(file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * Resolve book format classification.
 * @param {File|Blob & { name?: string }} file
 * @returns {{ ext: string, status: "current"|"target"|"unsupported", mediaType: string }}
 */
export function classifyBookFormat(file) {
  const ext = fileExtension(file?.name);
  const mime = mimeHint(file);

  if (ext === "pdf" || mime === "application/pdf") {
    return { ext: "pdf", status: "target", mediaType: EXT_MIME.pdf };
  }
  if (
    ext === "docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { ext: "docx", status: "target", mediaType: EXT_MIME.docx };
  }
  if (ext === "epub" || mime === "application/epub+zip") {
    return { ext: "epub", status: "current", mediaType: EXT_MIME.epub };
  }
  if (ext === "md" || mime === "text/markdown") {
    return { ext: "md", status: "current", mediaType: EXT_MIME.md };
  }
  if (ext === "txt" || mime === "text/plain" || (!ext && mime.startsWith("text/"))) {
    return { ext: ext || "txt", status: "current", mediaType: EXT_MIME.txt };
  }
  if (BOOK_CURRENT_EXTENSIONS.includes(ext)) {
    return { ext, status: "current", mediaType: EXT_MIME[ext] || "application/octet-stream" };
  }
  if (BOOK_TARGET_EXTENSIONS.includes(ext)) {
    return { ext, status: "target", mediaType: EXT_MIME[ext] || "application/octet-stream" };
  }
  return { ext: ext || "unknown", status: "unsupported", mediaType: mime || "application/octet-stream" };
}

/**
 * @param {File|Blob & { name?: string }} file
 */
export function assertBookFormatSupported(file) {
  if (!file) throw new PortabilityError("book_decode_failed", "book_file_required");
  const classified = classifyBookFormat(file);
  if (classified.status === "current") return classified;
  if (classified.status === "target") {
    throw new PortabilityError(
      "book_unsupported_format",
      `${classified.ext.toUpperCase()} import is TARGET/DRAFT — not implemented. Supported now: txt, md, epub.`,
      { format: classified.ext, status: "TARGET", mediaType: classified.mediaType }
    );
  }
  throw new PortabilityError(
    "book_unsupported_format",
    `Unsupported book format "${classified.ext}". Supported now: txt, md, epub. PDF/DOCX remain TARGET.`,
    { format: classified.ext, status: "unsupported", mediaType: classified.mediaType }
  );
}

async function parseBook(file, classified) {
  if (classified.ext === "epub") return importEpubBook(file);
  if (classified.ext === "txt" || classified.ext === "md") return importTextBook(file);
  throw new PortabilityError("book_unsupported_format", "book_parser_missing", {
    format: classified.ext,
    status: "unsupported",
  });
}

/**
 * Import a book file: validate → hash → parse → register resource (original immutable).
 * @param {File} file
 * @param {{ deps?: object, register?: boolean, storeBytes?: boolean }} [opts]
 */
export async function importBookResource(file, opts = {}) {
  const classified = assertBookFormatSupported(file);
  if (file.size > BOOK_MAX_BYTES) {
    throw new PortabilityError("book_limit_exceeded", `Book exceeds ${BOOK_MAX_BYTES} byte limit`, {
      size: file.size,
      limit: BOOK_MAX_BYTES,
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);

  let book;
  try {
    const parseFile =
      typeof File !== "undefined"
        ? new File([bytes], file.name || `book.${classified.ext}`, {
            type: classified.mediaType || file.type || "",
          })
        : file;
    book = await parseBook(parseFile, classified);
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    const message = error?.message || String(error);
    if (message === "epub_text_empty") {
      throw new PortabilityError("book_no_readable_content", message);
    }
    throw new PortabilityError("book_decode_failed", message);
  }

  let registration = null;
  if (opts.register !== false) {
    registration = await registerResource({
      kind: "book",
      bytesOrBlob: file,
      filename: file.name,
      mediaType: classified.mediaType || file.type,
      title: book.title,
      creator: book.author,
      source: { type: "local-file", label: file.name },
      extensions: {
        format: classified.ext,
        fileId: book.fileId || file.name,
      },
      deps: opts.deps,
      storeBytes: opts.storeBytes !== false,
    });

    const body = String(book.body || "");
    if (body && !registration.duplicate) {
      try {
        const bodySha = await sha256Hex(body);
        linkDerivative(registration.id, {
          id: "extracted-text",
          role: "extracted-text",
          mediaType: "text/plain",
          size: new TextEncoder().encode(body).byteLength,
          sha256: bodySha,
          tool: `books-import/${classified.ext}`,
        });
      } catch {
        /* derivative link is best-effort */
      }
    }
  }

  return {
    book: {
      ...book,
      resourceId: registration?.id || "",
      sha256,
      format: classified.ext,
      originalImmutable: true,
    },
    resource: registration?.resource || null,
    metadata: registration?.metadata || null,
    duplicate: Boolean(registration?.duplicate),
    mediaId: registration?.mediaId || "",
    sha256,
    id: registration?.id || "",
    classified,
  };
}
