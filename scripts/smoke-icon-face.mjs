import {
  normalizeIconOverrides,
  applyIconFace,
  appFaceInnerHtml,
  ICON_TONE_IDS,
} from "../src/phone-shell/icon-face.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const o = normalizeIconOverrides({
  pop: { tone: "sea", emoji: "💬" },
  bad: { tone: "neon" },
  x: { imageDataUrl: "data:image/png;base64,xx" },
});
if (!o.pop?.tone || o.bad) throw new Error("normalize failed");
if (!ICON_TONE_IDS.has("lilac")) throw new Error("missing lilac");

const entry = applyIconFace({ id: "pop", type: "app", tone: "mint", icon: "message-circle", label: "Pop" }, o);
if (entry.tone !== "sea" || entry.faceEmoji !== "💬") throw new Error("apply failed");

const html = appFaceInnerHtml(entry, esc);
if (!html.includes("is-emoji") || !html.includes("💬")) throw new Error("html failed");

console.log("ICON_FACE_SMOKE_OK");
