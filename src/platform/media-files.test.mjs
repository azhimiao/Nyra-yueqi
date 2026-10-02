import assert from "node:assert/strict";
import { bytesToBase64 } from "./media-files.js";
import { asNamedFile } from "../library/builtin-catalog.js";
import { serializeMediaRecord } from "../storage/media-blobs.js";

const encoded = bytesToBase64(new Uint8Array([72, 105]));
assert.equal(encoded, btoa("Hi"));

const blob = new Blob(["abc"], { type: "audio/mpeg" });
const file = asNamedFile(blob, "track.mp3", "audio/mpeg");
assert.equal(file.name, "track.mp3");
assert.equal(file.type, "audio/mpeg");

const stripped = serializeMediaRecord({
  id: "audio-1",
  kind: "audio",
  blob,
  filePath: "",
});
assert.equal(stripped.hasBlob, true);
assert.equal("blob" in stripped && stripped.blob instanceof Blob, false);

console.log("media-files.test: ok");
