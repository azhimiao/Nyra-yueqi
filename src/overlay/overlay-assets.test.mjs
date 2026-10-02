import assert from "node:assert/strict";
import { resolveOverlayAssetUrl } from "./overlay-assets.js";

const overlayBase = "https://appassets.androidplatform.net/public/overlay.html";
assert.equal(
  resolveOverlayAssetUrl("/assets/characters/yueqi-female/manifest.json", overlayBase),
  "https://appassets.androidplatform.net/public/assets/characters/yueqi-female/manifest.json",
);
assert.equal(
  resolveOverlayAssetUrl("/assets/characters/xingli/manifest.json", overlayBase),
  "https://appassets.androidplatform.net/public/assets/characters/xingli/manifest.json",
);
assert.equal(
  resolveOverlayAssetUrl("/assets/characters/yueqi-female/manifest.json", "https://localhost/"),
  "/assets/characters/yueqi-female/manifest.json",
);
assert.equal(
  resolveOverlayAssetUrl("/assets/characters/yueqi-female/manifest.json", "http://127.0.0.1:5173/overlay.html"),
  "/assets/characters/yueqi-female/manifest.json",
);
assert.equal(
  resolveOverlayAssetUrl("https://example.com/x.png", overlayBase),
  "https://example.com/x.png",
);
assert.equal(resolveOverlayAssetUrl("", overlayBase), "");

console.log("overlay-assets.test: ok");
