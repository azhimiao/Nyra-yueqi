import assert from "node:assert/strict";
import { localizeNotice, pickNoticeToShow } from "./notice-policy.mjs";
import { isNoticeShellBlocked } from "./notice-shell.mjs";

function fakeDoc({ classes = [], nodes = {} } = {}) {
  return {
    documentElement: {
      classList: { contains: (name) => classes.includes(name) },
    },
    querySelector(selector) {
      return Object.prototype.hasOwnProperty.call(nodes, selector) ? nodes[selector] : null;
    },
  };
}

const forced = {
  id: "force-1",
  type: "announcement",
  kind: "forced",
  enabled: true,
  priority: 1,
  audience: "all",
  title: { "zh-CN": "必须看", en: "Must read" },
  body: { "zh-CN": "正文", en: "Body" },
};
const optional = {
  id: "opt-1",
  type: "announcement",
  kind: "optional",
  enabled: true,
  priority: 99,
  audience: "all",
  title: { "zh-CN": "可稍后", en: "Later ok" },
};

assert.equal(pickNoticeToShow([optional, forced]).id, "force-1");
assert.equal(pickNoticeToShow([optional, forced], { acked: { "force-1": "1" } }).id, "opt-1");
assert.equal(pickNoticeToShow([optional], { snoozed: { "opt-1": "1" } }), null);
assert.equal(pickNoticeToShow([ { ...optional, audience: "hosted" } ], { audience: "byok" }), null);
assert.equal(localizeNotice(forced, "en").titleText, "Must read");
assert.equal(localizeNotice(forced, "zh-CN").titleText, "必须看");

assert.equal(isNoticeShellBlocked(null), true);
assert.equal(isNoticeShellBlocked(fakeDoc({ classes: ["app-boot-ready"] })), true);
assert.equal(isNoticeShellBlocked(fakeDoc({
  classes: ["splash-done", "first-light-active"],
})), true);
assert.equal(isNoticeShellBlocked(fakeDoc({
  classes: ["splash-done"],
  nodes: { "[data-first-light]": { hidden: true, getAttribute: () => "hidden" } },
})), false);
assert.equal(isNoticeShellBlocked(fakeDoc({
  classes: ["splash-done"],
  nodes: { "[data-first-light]": { hidden: false, getAttribute: () => null } },
})), true);
assert.equal(isNoticeShellBlocked(fakeDoc({
  classes: ["splash-done"],
  nodes: { "[data-update-dialog]": { hidden: false, getAttribute: () => null } },
})), true);
assert.equal(isNoticeShellBlocked(fakeDoc({ classes: ["splash-done"] })), false);

console.log("notice-policy.test: ok");
