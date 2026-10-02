import { fileDrawer } from "../memory/palace/drawer.js";
import { splitDrawerText } from "../memory/palace/chunk.js";
import { isFeatureEnabled } from "../features/flags.js";
import {
  ingestBookChunksWithSourceRef,
  tombstoneBookChunks,
} from "../memory/adapters/reading.js";
import { importBookResource } from "../portability/resources/books.js";

/**
 * Legacy entry — delegates to hardened resource import (TXT/MD/EPUB).
 * PDF/DOCX throw book_unsupported_format with TARGET status.
 * @param {File} file
 * @param {object} [opts]
 */
export async function importBookFile(file, opts = {}) {
  const result = await importBookResource(file, {
    register: opts.register !== false,
    storeBytes: opts.storeBytes,
    deps: opts.deps,
  });
  return result.book;
}

/**
 * @param {object} book
 * @param {{ renderMemoryState?: Function, force?: boolean, companionId?: string, palaceStore?: object, fileDrawer?: Function }} [deps]
 */
export async function ingestBookChunks(book, deps = {}) {
  const { renderMemoryState } = deps;
  const useAdapter =
    deps.force === true ||
    (() => {
      try {
        return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
      } catch {
        return false;
      }
    })();

  if (useAdapter) {
    const result = await ingestBookChunksWithSourceRef(book, {
      ...deps,
      force: true,
      renderMemoryState,
    });
    return result.saved || [];
  }

  const sourceText = String(book.body || book.excerpt || "").trim();
  if (!sourceText) return [];

  const parentId = `book-${book.fileId || book.title || Date.now()}`.replace(/\s+/g, "-").slice(0, 80);
  const chunks = splitDrawerText(sourceText).slice(0, 8);
  const saved = [];

  for (let index = 0; index < chunks.length; index += 1) {
    saved.push(
      await fileDrawer({
        id: `${parentId}-c${index}`,
        drawerId: parentId,
        parentDrawerId: parentId,
        chunkIndex: index,
        chunkTotal: chunks.length,
        title: book.title,
        rawText: chunks[index],
        source: "book.chunk",
        weight: 0.88,
        role: "library",
        wing: "World",
        room: "Reading",
        tags: ["书籍", book.author, book.format].filter(Boolean),
        pinned: false,
        searchable: true,
      })
    );
  }

  await renderMemoryState?.();
  return saved;
}

/**
 * When adapters flag is on, cascade tombstone book.chunk projections by book sourceId prefix.
 * @param {string|object} bookOrId
 * @param {object} [opts]
 */
export function deleteBookMemoryIndex(bookOrId, opts = {}) {
  try {
    if (opts.force !== true && isFeatureEnabled("unifiedMemoryAdaptersV1") !== true) {
      return { ok: true, skipped: true, reason: "flag_off" };
    }
  } catch {
    if (opts.force !== true) return { ok: true, skipped: true, reason: "flag_off" };
  }
  return tombstoneBookChunks(bookOrId, opts);
}
