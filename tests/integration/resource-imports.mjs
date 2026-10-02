/**
 * Resource registry + book/audio import hardening.
 * Covers: supported import, duplicate hash, unsupported format, original immutable.
 */

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const storage = makeMemoryStorage();
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage };

const mediaStore = [];

async function getAllRecords(storeName) {
  if (storeName === "media") return [...mediaStore];
  return [];
}

async function storeRecord(storeName, record) {
  if (storeName !== "media") return record;
  const idx = mediaStore.findIndex((row) => row.id === record.id);
  if (idx >= 0) {
    // Refuse in-place mutation of immutable originals
    if (mediaStore[idx].immutable === true) {
      throw new Error("immutable_original_overwrite_blocked");
    }
    mediaStore[idx] = record;
  } else {
    mediaStore.push(record);
  }
  return record;
}

async function persistMediaFile() {
  return null;
}

const deps = { getAllRecords, storeRecord, persistMediaFile };

const {
  __setResourcesStorageForTests,
  RESOURCES_STORAGE_KEY,
  registerResource,
  findResourceById,
  assertOriginalImmutable,
  mediaIdForSha256,
} = await import("../../src/portability/resources/registry.js");
const { importBookResource } = await import("../../src/portability/resources/books.js");
const { importAudioResource } = await import("../../src/portability/resources/audio.js");
const { PortabilityError } = await import("../../src/portability/errors.js");
const { sha256Hex } = await import("../../src/portability/hash.js");

__setResourcesStorageForTests(storage);

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function makeFile(name, contents, type = "text/plain") {
  const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
  return new File([bytes], name, { type });
}

// --- supported book import ---
const bookText = "Chapter One\n\nMoonlight over the bay.\n";
const bookFile = makeFile("moon-bay.txt", bookText, "text/plain");
const bookOnce = await importBookResource(bookFile, { deps });
assert(bookOnce.book?.body?.includes("Moonlight"), "supported book parses body");
assert(bookOnce.metadata?.schema === "nyra.resource.metadata", "book metadata schema");
assert(bookOnce.metadata?.kind === "book", "book kind");
assert(bookOnce.metadata?.original?.immutable === true, "book original immutable flag");
assert(bookOnce.metadata?.id?.startsWith("sha256:"), "book resource id content-addressed");
assert(bookOnce.duplicate === false, "first book import not duplicate");
assert(Boolean(findResourceById(bookOnce.id)), "book listed in registry index");
assert(storage.getItem(RESOURCES_STORAGE_KEY), "index persisted to yueqi.resources.v1");

const mediaRow = mediaStore.find((row) => row.id === bookOnce.mediaId);
assert(Boolean(mediaRow), "original bytes stored in media");
assert(mediaRow?.immutable === true, "media row marked immutable");
assertOriginalImmutable(mediaRow, bookOnce.sha256);

// --- duplicate hash ---
const bookTwice = await importBookResource(makeFile("moon-bay-copy.txt", bookText, "text/plain"), {
  deps,
});
assert(bookTwice.duplicate === true, "duplicate hash detected");
assert(bookTwice.id === bookOnce.id, "duplicate returns same resource id");
assert(mediaStore.filter((row) => row.sha256 === bookOnce.sha256).length === 1, "duplicate does not re-store original");

// --- unsupported / TARGET formats ---
let pdfErr = null;
try {
  await importBookResource(makeFile("guide.pdf", "%PDF-1.4 fake", "application/pdf"), { deps });
} catch (error) {
  pdfErr = error;
}
assert(pdfErr instanceof PortabilityError, "pdf throws PortabilityError");
assert(pdfErr?.code === "book_unsupported_format", "pdf code book_unsupported_format");
assert(pdfErr?.extra?.status === "TARGET", "pdf status TARGET not fake PASS");
assert(/TARGET/i.test(String(pdfErr?.message || "")), "pdf message mentions TARGET");

let docxErr = null;
try {
  await importBookResource(
    makeFile("essay.docx", "PK\u0003\u0004fake", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    { deps }
  );
} catch (error) {
  docxErr = error;
}
assert(docxErr?.code === "book_unsupported_format", "docx unsupported");
assert(docxErr?.extra?.status === "TARGET", "docx TARGET");

let badBookErr = null;
try {
  await importBookResource(makeFile("notes.rtf", "{\\rtf1}", "application/rtf"), { deps });
} catch (error) {
  badBookErr = error;
}
assert(badBookErr?.code === "book_unsupported_format", "rtf unsupported");

// --- audio supported + immutable ---
const wavHeader = new Uint8Array(64);
wavHeader.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
const audioFile = makeFile("clip.wav", wavHeader, "audio/wav");
const audioOnce = await importAudioResource(audioFile, {
  deps,
  enrich: async () => ({ title: "Clip", artist: "Local" }),
});
assert(audioOnce.metadata?.kind === "music", "audio kind music");
assert(audioOnce.track.originalImmutable === true, "audio track originalImmutable");
assert(audioOnce.duplicate === false, "first audio not duplicate");
const audioMedia = mediaStore.find((row) => row.id === audioOnce.mediaId);
assert(audioMedia?.immutable === true, "audio media immutable");
assertOriginalImmutable(audioMedia, audioOnce.sha256);

const audioDup = await importAudioResource(makeFile("clip-again.wav", wavHeader, "audio/wav"), {
  deps,
  enrich: async () => ({ title: "Clip", artist: "Local" }),
});
assert(audioDup.duplicate === true, "audio duplicate hash");

let badAudioErr = null;
try {
  await importAudioResource(makeFile("song.mid", new Uint8Array([0x4d, 0x54, 0x68, 0x64]), "audio/midi"), {
    deps,
  });
} catch (error) {
  badAudioErr = error;
}
assert(badAudioErr?.code === "audio_unsupported_format", "midi unsupported");

// --- original immutable claim (refuse overwrite) ---
let overwriteErr = null;
try {
  await storeRecord("media", {
    ...audioMedia,
    blob: new Blob(["mutated"]),
    size: 7,
  });
} catch (error) {
  overwriteErr = error;
}
assert(overwriteErr?.message === "immutable_original_overwrite_blocked", "immutable overwrite blocked in test store");
const after = mediaStore.find((row) => row.id === audioOnce.mediaId);
assert(after?.size === audioMedia.size, "original size unchanged after blocked overwrite");
const rehash = await sha256Hex(new Uint8Array(await after.blob.arrayBuffer()));
assert(rehash === audioOnce.sha256, "original bytes unchanged");

// --- registerResource direct ---
const direct = await registerResource({
  kind: "image",
  bytesOrBlob: makeFile("dot.png", new Uint8Array([1, 2, 3, 4]), "image/png"),
  filename: "dot.png",
  mediaType: "image/png",
  title: "Dot",
  deps,
});
assert(direct.metadata.id === `sha256:${direct.sha256}`, "direct register id matches hash");
assert(mediaIdForSha256(direct.sha256) === direct.mediaId, "media id derived from sha256");

if (failures.length) {
  console.error("FAIL resource-imports");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS resource-imports");
