/**
 * Static gate: ReaderEngine document migration + pagination helpers exist.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateReaderDocument, READER_DOC_VERSION } from "../src/library/reader-document.js";
import { createReaderEngine } from "../src/library/reader-engine.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const plain = migrateReaderDocument("第一段。\n\n第二段很长很长。\n\n第三段。");
check("doc version", plain.version === READER_DOC_VERSION);
check("doc paragraphs", plain.paragraphs.length >= 2, `n=${plain.paragraphs.length}`);
check("doc migratedFrom", plain.migratedFrom === "plain-string");

const legacy = migrateReaderDocument({ body: "甲\n\n乙", format: "epub" });
check("legacy body migrate", legacy.paragraphs.length === 2 && legacy.sourceFormat === "epub");

const v1 = migrateReaderDocument({
  version: 1,
  paragraphs: [{ id: "p0", text: "目录", kind: "heading" }, { text: "扉页", kind: "heading" }, { text: "女人一直待在黑暗里。" }],
});
check("v1 toc annotate", v1.paragraphs[0].kind === "toc" && v1.paragraphs[1].kind === "toc-item" && v1.paragraphs[2].kind === "body");
check("stub engine safe", typeof createReaderEngine({}).goPage === "function");

const memoryStorage = {
  _data: {},
  getItem(key) {
    return this._data[key] ?? null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
};
globalThis.localStorage = memoryStorage;
globalThis.window = { localStorage: memoryStorage };

const {
  addHighlight,
  toggleHighlightCommentFold,
  listHighlights,
} = await import("../src/library/book-highlights.js");
const folded = addHighlight({
  bookId: "book-fold",
  quote: "女人一直待在黑暗里。",
  companionComment: { characterId: "char-xingli", text: "没接到模型。", createdAt: Date.now() },
});
const once = toggleHighlightCommentFold("book-fold", folded.id);
const twice = toggleHighlightCommentFold("book-fold", folded.id);
check("fold hides comment", once?.commentCollapsed === true);
check("fold again shows comment", twice?.commentCollapsed === false);
check("pure highlight does not fold", toggleHighlightCommentFold("book-fold", "missing") === null);
check("stored fold list", listHighlights("book-fold")[0]?.commentCollapsed === false);

const engineJs = readFileSync(join(root, "src/library/reader-engine.js"), "utf8");
const phoneReader = readFileSync(join(root, "src/phone-shell/phone-reader.js"), "utf8");
const bookReader = readFileSync(join(root, "src/library/book-reader.js"), "utf8");
const screens = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

check("engine exports createReaderEngine", engineJs.includes("export function createReaderEngine"));
check("phone uses engine", phoneReader.includes("createReaderEngine"));
check("app uses engine", bookReader.includes("createReaderEngine"));
check("phone has reader-pages host", screens.includes("data-reader-pages"));
check("app has viewport not vertical body scroll", indexHtml.includes("data-book-reader-viewport") && !indexHtml.includes('class="book-reader-body"'));
check("theme toggle is explicit", screens.includes("data-ebook-theme-toggle") && !screens.includes('data-ebook-theme aria-label'));
check("shared reader css linked", indexHtml.includes("reader-engine.css"));
check("engine tap highlight", engineJs.includes("onTapHighlight"));
check("phone wires comment fold", phoneReader.includes("toggleHighlightCommentFold"));
check("app wires comment fold", bookReader.includes("toggleHighlightCommentFold"));
check("fold css", readFileSync(join(root, "src/ui/reader-engine.css"), "utf8").includes("ebook-inline-note.is-collapsed"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`ReaderEngine verify failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`ReaderEngine verify passed: ${checks.length}/${checks.length}`);
