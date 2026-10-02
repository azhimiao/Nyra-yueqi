import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCharacterAffect, createCharacterAffectMetadata, buildCharacterAffectContext } from "../src/characters/affective-state.js";
import { selectVisibleHistory } from "../src/conversation/selectors.js";
import { parseRuntimeTurn, buildRuntimeInstruction, stripRuntimeMetadataPreview } from "../src/runtime/protocol.js";
import { parseInnerStateEnvelope, stripInnerStatePreview } from "../src/chat/inner-state.js";
import { getPromptSettings, savePromptSettings } from "../src/settings/preferences.js";
import { renderTurnActivityHtml, renderLiveTurnActivityHtml, revealTurnActivityText } from "../src/chat/turn-activity.js";

const storage = new Map();
globalThis.window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) } };
globalThis.localStorage = window.localStorage;
const now = Date.parse("2026-09-27T08:00:00Z");
const source = { id: "u1", role: "user", content: "今天很累，先别给建议。" };
const meta = feeling => createCharacterAffectMetadata({ feeling, stance: "先听着，等对方主动求助。" }, { characterId: "a", sourceUserMessageId: source.id, sourceUserText: source.content, createdAt: new Date(now).toISOString() });
const assistant = (feeling, id = "a1") => ({ id, role: "assistant", content: "行，你说，我听着。", meta: { characterAffect: meta(feeling) } });
const context = rows => buildCharacterAffectContext(rows, { characterId: "a", now });

test("subjective state is bounded and never accepts protocol or reasoning fields", () => {
  assert.deepEqual(normalizeCharacterAffect({ feeling: "差点又多嘴了。", privateReasoning: "hidden", userFact: "invented" }), { feeling: "差点又多嘴了。" });
  assert.equal(normalizeCharacterAffect({ feeling: "x".repeat(101), focus: "<think>secret</think>", stance: "正在检索记忆" }), null);
  assert.equal(createCharacterAffectMetadata({ feeling: "担心" }, { characterId: "a" }), null);
  assert.deepEqual(normalizeCharacterAffect({ feeling: "I wish I'd apologized promptly." }), { feeling: "I wish I'd apologized promptly." });
});
test("runtime separates spoken text from the same-turn affect delta", () => {
  const parsed = parseRuntimeTurn('我听着。<yueqi-runtime>{"version":1,"characterState":{"feeling":"差点多嘴。"}}</yueqi-runtime>');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.text, "我听着。");
  assert.deepEqual(parsed.value.characterState, { feeling: "差点多嘴。" });
  assert.equal(parseRuntimeTurn('我听着。<yueqi-runtime>{"characterState":').ok, false);
});
test("every streamed envelope prefix stays hidden including single-character chunks", () => {
  for (const marker of ['<yueqi-inner-state>', '< YUEQI-INNER-STATE >', '＜yueqi-inner-state＞']) {
    for (let length = 1; length <= marker.length; length++) {
      assert.equal(stripInnerStatePreview('在听你说。' + marker.slice(0, length)), '在听你说。');
    }
  }
  for (const marker of ['<yueqi-runtime>', '< YUEQI-RUNTIME >', '＜yueqi-runtime＞']) {
    for (let length = 1; length <= marker.length; length++) assert.equal(stripRuntimeMetadataPreview('我听着。' + marker.slice(0, length)), '我听着。');
  }
  assert.equal(parseInnerStateEnvelope('我听着。<yueqi-inner-st').found, true);
  assert.equal(parseRuntimeTurn('我听着。<yueqi-run').ok, false);
  assert.equal(parseRuntimeTurn('我听着。< YUEQI-RUNTIME >{"version":1}</ YUEQI-RUNTIME >').value.text, '我听着。');
  assert.equal(stripRuntimeMetadataPreview('数字 2 < 3'), '数字 2 < 3');
});
test("state is scoped and drops after source deletion, editing or expiry", () => {
  const rows = [source, assistant("差点多嘴了。")];
  assert.match(context(rows).text, /差点多嘴/);
  assert.equal(buildCharacterAffectContext(rows, { characterId: "b", now }).text, "");
  assert.equal(context(rows.slice(1)).text, "");
  assert.equal(context([{ ...source, content: "请直接给我建议。" }, rows[1]]).text, "");
  assert.equal(buildCharacterAffectContext(rows, { characterId: "a", now: now + 86400001 }).text, "");
  const invalidNewer = assistant("新感受", "a2");
  invalidNewer.meta.characterAffect.sourceUserMessageId = "forgotten";
  assert.equal(context([...rows, invalidNewer]).text, "", "must not resurrect an older state");
});
test("V2 candidate switching and tombstones select the corresponding state", () => {
  const session = { activeBranchId: "b", branches: { b: { headMessageId: "a1" } }, messageNodes: {
    u1: { id: "u1", branchId: "b", role: "user", candidates: [{ id: "u-c", status: "active", content: source.content }], activeCandidateId: "u-c" },
    a1: { id: "a1", branchId: "b", role: "assistant", parentMessageId: "u1", candidates: [
      { id: "first", status: "active", content: "我听着。", meta: { characterAffect: meta("想听你说完。") } },
      { id: "second", status: "active", content: "我刚才多嘴了。", meta: { characterAffect: meta("有点不好意思。") } },
    ], activeCandidateId: "first" },
  } };
  assert.match(context(selectVisibleHistory(session)).text, /想听你说完/);
  session.messageNodes.a1.activeCandidateId = "second";
  assert.match(context(selectVisibleHistory(session)).text, /不好意思/);
  assert.doesNotMatch(context(selectVisibleHistory(session)).text, /想听你说完/);
  session.messageNodes.a1.meta = { deletedAt: new Date(now).toISOString() };
  assert.equal(context(selectVisibleHistory(session)).text, "");
});
test("display controls never clear continuity and no fake psychology appears while waiting", () => {
  const state = { state: "complete", innerState: "差点又多嘴了。" };
  savePromptSettings({ innerStateDisplay: "natural" });
  assert.equal(getPromptSettings().innerStateDisplay, "natural");
  assert.match(renderTurnActivityHtml(state), /心里话/);
  assert.equal(renderLiveTurnActivityHtml({ phase: "thinking" }), "");
  const node = { textContent: "" };
  revealTurnActivityText(node, state.innerState);
  assert.equal(node.textContent, state.innerState, "no extra typewriter delay");
  savePromptSettings({ innerStateDisplay: "off" });
  assert.equal(renderTurnActivityHtml(state), "");
  assert.equal(renderLiveTurnActivityHtml(state), "");
  assert.match(buildRuntimeInstruction(), /不展示内心独白/);
  assert.match(context([source, assistant("想听你说完。")]).text, /想听你说完/);
  assert.match(buildRuntimeInstruction({}, { innerStateDisplay: "expanded" }), /充分表达/);
  savePromptSettings({ innerStateDisplay: "invalid" });
  assert.equal(getPromptSettings().innerStateDisplay, "natural");
});
