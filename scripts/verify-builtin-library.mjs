/**
 * Built-in music catalog contract.
 *
 * Guards two regressions the first-party playlist shipped with:
 * every track showed as 未命名歌曲 / 未分类 because a DOM snapshot was written
 * back over the store, and cache progress jumped because unrelated persists
 * rewound it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILTIN_TRACKS,
  catalogTrackTitle,
  createProgressReporter,
  repairBuiltinTrack,
} from "../src/library/builtin-catalog.js";

function pass(name) {
  console.log(`PASS ${name}`);
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1. Catalog rows carry real names.
for (const track of BUILTIN_TRACKS) {
  assert.ok(track.title.trim(), `catalog track ${track.id} needs a title`);
  assert.ok(track.artist.trim(), `catalog track ${track.id} needs an artist`);
  assert.ok(track.playlist.trim(), `catalog track ${track.id} needs a playlist`);
  assert.ok(/^https:\/\//.test(track.sourceUrl), `catalog track ${track.id} needs an https source`);
  assert.ok(
    /\.mp3(\?|#|$)/i.test(track.sourceUrl),
    `catalog track ${track.id} must use MP3 (Android WebView often cannot play OGG)`,
  );
}
pass("built-in catalog defines title, artist, playlist and source for every track");

// 2. Rows already corrupted on disk get their catalog metadata back.
const entry = BUILTIN_TRACKS[0];
for (const placeholder of ["", "未命名歌曲", "未命名曲目", "Untitled"]) {
  const patch = repairBuiltinTrack({ id: entry.id, title: placeholder, playlist: "未分类" }, entry);
  assert.equal(patch?.title, catalogTrackTitle(entry), `placeholder "${placeholder}" must be repaired`);
  assert.equal(patch.playlist, entry.playlist);
  assert.equal(patch.artist, entry.artist);
  assert.equal(patch.builtin, true);
}
pass("placeholder titles and playlists are restored from the catalog");

// 3. A name the user chose is left alone, and an intact row needs no write.
const renamed = repairBuiltinTrack(
  {
    id: entry.id,
    title: "睡前那首",
    playlist: "夜里听",
    artist: entry.artist,
    sourceUrl: entry.sourceUrl,
    license: entry.license,
    licenseUrl: entry.licenseUrl,
    builtin: true,
  },
  entry,
);
assert.equal(renamed, null, "a fully populated user-renamed row must not be rewritten");
pass("user-chosen names survive the repair pass");

// 3b. OGG → MP3 catalog migration clears unplayable local cache.
const oggMigrated = repairBuiltinTrack(
  {
    id: entry.id,
    title: "睡前那首",
    playlist: "夜里听",
    artist: entry.artist,
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b7/Gymnopedie_No._1..ogg",
    mediaId: "media-ogg-1",
    cacheState: "cached",
    cacheProgress: 100,
    license: entry.license,
    licenseUrl: entry.licenseUrl,
    builtin: true,
  },
  entry,
);
assert.equal(oggMigrated?.sourceUrl, entry.sourceUrl);
assert.equal(oggMigrated?.mediaId, "");
assert.equal(oggMigrated?.cacheState, "remote");
pass("OGG cache is invalidated when catalog switches to MP3");

// 4. Progress only ever moves forward, and writes are throttled.
const writes = [];
let clock = 0;
const report = createProgressReporter("trk", null, {
  now: () => clock,
  write: (id, patch) => writes.push(patch.cacheProgress),
});

report(5);
clock += 1000;
report(40);
clock += 10;
report(41); // throttled — too soon after the last write
clock += 1000;
report(12); // a second caller restarting must not rewind the bar
clock += 1000;
report(70);
report(100, { force: true });

assert.deepEqual(writes, [5, 40, 70, 100]);
pass("cache progress is monotonic and throttled");

// 5. The app-mode list must not fabricate metadata from its own DOM.
const appSource = read("src/app.js");
const collect = appSource.match(/function collectLibraryState\(\)[\s\S]*?\n}\n/)?.[0] || "";
assert.ok(collect, "collectLibraryState must exist");
assert.doesNotMatch(collect, /未命名歌曲/, "track titles must never be invented from the DOM");
assert.doesNotMatch(
  collect,
  /const title = inputs\[0\]/,
  "track rows have no inputs; reading them silently blanks every title",
);
assert.match(collect, /stored\?\.cacheProgress/, "live cache progress must win over the DOM snapshot");
pass("collectLibraryState reads the store instead of inventing placeholder tracks");

// 6. Rows keep the stored title so a persist round-trip cannot save UI copy.
const panelSource = read("src/panels/library.js");
assert.doesNotMatch(
  panelSource,
  /row\.dataset\.title = displayTrackTitle/,
  "localizing into dataset lets translated copy leak into storage",
);
pass("app-mode track rows carry the stored title, localized only for display");

// 7. Download progress must still advance when Content-Length is hidden (CORS).
const byteWrites = [];
clock = 0;
const byteReport = createProgressReporter("trk-bytes", null, {
  now: () => {
    clock += 1000;
    return clock;
  },
  write: (id, patch) => byteWrites.push(patch.cacheBytes),
});
byteReport(0, { bytes: 1200 });
byteReport(0, { bytes: 4800 });
assert.ok(byteWrites.includes(1200), "first byte tick must persist");
assert.ok(byteWrites.includes(4800), "later byte ticks must persist even at 0%");
pass("cache progress records byte ticks when percentage is unknown");

const catalogSrc = read("src/library/builtin-catalog.js");
assert.match(catalogSrc, /audio_payload_empty/, "empty payloads must fail the download");
assert.match(catalogSrc, /bytes: received/, "download must report received bytes");
pass("download rejects empty payloads and reports byte progress");

const listenSrc = read("src/phone-shell/phone-listen.js");
assert.match(listenSrc, /waitUntilAudible/, "playback must wait for real audio, not play() resolving");
assert.match(listenSrc, /download first/, "builtin tracks must download before pretending to play");
assert.match(listenSrc, /resolveNativeFileUrl/, "native playback must use the file URI, not a full-file base64 read");
pass("listen UI waits for audible audio and downloads before play");

const mediaFilesSrc = read("src/platform/media-files.js");
assert.doesNotMatch(mediaFilesSrc, /readAsDataURL/, "native persist must not base64 a whole song in one bridge call");
assert.match(mediaFilesSrc, /downloadFile/, "catalog audio should download on the native filesystem");
assert.match(mediaFilesSrc, /appendFile/, "local imports must write in chunks");
pass("native media persist avoids the Capacitor base64 size trap");

const dbSrc = read("src/storage/db.js");
assert.match(dbSrc, /serializeMediaRecord/, "SQLite must not JSON.stringify File/Blob audio");
pass("sqlite media records drop blobs before JSON");

assert.match(panelSource, /downloadBuiltinTrack/, "app library play must cache remote tracks");
pass("app-mode library downloads before play");

console.log("\nBuilt-in library checks passed.");
