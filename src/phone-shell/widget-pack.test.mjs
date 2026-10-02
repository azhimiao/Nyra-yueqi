import assert from "node:assert/strict";
import { normalizeWidgetOrder } from "./os-prefs.js";
import {
  normalizeCustomWidgets,
  parseWidgetPack,
  WidgetPackError,
} from "./widget-pack.js";

const note = parseWidgetPack(JSON.stringify({
  format: "nyra-widget",
  title: "<script>x</script>便签",
  span: "half",
  html: `<img src="javascript:alert(1)"><p onclick="alert(1)">你好<script>alert(1)</script></p>`,
  css: `@import url("https://evil.test/x.css"); strong { color: red; }`,
}));
assert.equal(note.length, 1);
assert.equal(note[0].title, "便签");
assert.equal(note[0].span, "half");
assert.equal(note[0].html.includes("script"), false);
assert.equal(note[0].html.includes("onclick"), false);
assert.equal(note[0].html.includes("javascript"), false);
assert.match(note[0].html, /<p>你好<\/p>/);
assert.equal(note[0].css.includes("@import"), false);
assert.match(note[0].css, /color:\s*red/);

const htmlPack = parseWidgetPack(`
  <template data-nyra-widget data-title="天气" data-span="wide">
    <style>.kicker { font-size: 12px; }</style>
    <p class="kicker">晴</p>
  </template>
`);
assert.equal(htmlPack[0].title, "天气");
assert.equal(htmlPack[0].span, "wide");
assert.match(htmlPack[0].html, /<p class="kicker">晴<\/p>/);
assert.match(htmlPack[0].css, /font-size:\s*12px/);

assert.throws(() => parseWidgetPack("not a widget"), WidgetPackError);
assert.equal(parseWidgetPack("<p>只有一段</p>")[0].html, "<p>只有一段</p>");

const stored = normalizeCustomWidgets([
  { id: "custom:note1", title: "便签", html: "<strong>在</strong>", css: "", span: "wide" },
  { id: "bad", html: "<p>丢弃</p>" },
  { id: "custom:note1", html: "<p>重复</p>" },
  { id: "custom:empty", html: "<script>nope</script>" },
]);
assert.deepEqual(stored.map((item) => item.id), ["custom:note1"]);

const order = normalizeWidgetOrder(
  ["calendar", "custom:note1", "nope", "clock"],
  { today: true, listen: false },
  stored,
);
assert.deepEqual(order, ["calendar", "custom:note1", "clock", "today"]);

console.log("widget-pack ok");
