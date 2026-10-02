import {
  __clearWritingProjectsForTests,
  __setWritingStorageForTests,
  addWritingChapter,
  createRevision,
  createWritingProject,
  exportWritingProjectMarkdown,
  getWritingProject,
  listWritingProjects,
  moveWritingChapter,
  resolveRevision,
  restoreWritingSnapshot,
  updateBibleCollection,
  updateWritingChapter,
  updateWritingProject,
} from "../src/cocreate/project-store.js";
import { buildWritingContext, buildWritingMessages, runWritingJob } from "../src/cocreate/writing-runtime.js";

const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
__setWritingStorageForTests(storage);
__clearWritingProjectsForTests();

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

check("library starts empty without copyrighted sample work", listWritingProjects().length === 0);

const first = createWritingProject({ title: "雾中电台", premise: "两名主持人只能在不同年份通话。", genre: "科幻悬疑" }).value;
const second = createWritingProject({ title: "冬日花房", premise: "废弃花房每晚长出一段旧记忆。", genre: "都市奇幻" }).value;
check("projects are independent records", first.id !== second.id && listWritingProjects().some((item) => item.id === first.id));

updateWritingProject(first.id, { bible: { synopsis: "顾时通过深夜频率联系到五年前的沈遥。", style: "冷静、具体、短句" } });
updateBibleCollection(first.id, "cast", [{ id: "cast-gu", name: "顾时", role: "主角", description: "调查停播事故的记者。" }]);
updateBibleCollection(first.id, "world", [{ id: "world-radio", title: "错时频率", content: "每天零点只开放七分钟。", triggers: ["频率", "零点"] }]);
const chapterOne = getWritingProject(first.id).chapters[0];
updateWritingChapter(first.id, chapterOne.id, { title: "第一章 · 零点", content: "零点，停播五年的电台忽然亮了。顾时按下通话键。" }, { snapshot: true, snapshotTitle: "初稿" });
const chapterTwo = addWritingChapter(first.id, { title: "第二章 · 回声", summary: "顾时确认对方身处五年前。", content: "雨声从旧线路里传来。" }).chapter;
check("chapter CRUD persists manuscript", getWritingProject(first.id).chapters.some((item) => item.id === chapterTwo.id && /雨声/.test(item.content)));
moveWritingChapter(first.id, chapterTwo.id, -1);
check("chapter order is editable", getWritingProject(first.id).chapters[0].id === chapterTwo.id);
check("editing one project does not contaminate another", getWritingProject(second.id).bible.premise.includes("花房") && !getWritingProject(second.id).bible.premise.includes("电台"));

const project = getWritingProject(first.id);
const chapter = project.chapters.find((item) => item.id === chapterOne.id);
const selectionStart = chapter.content.indexOf("顾时");
const selectionEnd = chapter.content.length;
const context = buildWritingContext({ project, chapter, kind: "rewrite", start: selectionStart, end: selectionEnd, instruction: "增强紧迫感" });
const messages = buildWritingMessages(context);
check("writing context carries Story Bible", context.storyBible.cast[0]?.name === "顾时" && context.storyBible.world[0]?.title === "错时频率");
check("writing prompt carries outline and adjacent chapters", messages.some((item) => /当前大纲/.test(item.content)) && context.adjacent.length >= 1);

const beforeJob = getWritingProject(first.id).chapters.find((item) => item.id === chapterOne.id).content;
const noModel = await runWritingJob({ project, chapter, kind: "rewrite", start: selectionStart, end: selectionEnd, instruction: "增强紧迫感" });
check("no model returns an honest failure", noModel.reason === "model_callable_required");
const proposal = await runWritingJob({
  project,
  chapter,
  kind: "rewrite",
  start: selectionStart,
  end: selectionEnd,
  instruction: "增强紧迫感",
  callModel: async () => ({ content: "顾时猛地按下通话键，指示灯在下一秒熄灭。" }),
});
check("model job returns a candidate", proposal.ok && proposal.source === "model");
check("model job never mutates manuscript", getWritingProject(first.id).chapters.find((item) => item.id === chapterOne.id).content === beforeJob);

createRevision(first.id, {
  chapterId: chapterOne.id,
  kind: "rewrite",
  start: selectionStart,
  end: selectionEnd,
  before: chapter.content.slice(selectionStart, selectionEnd),
  after: proposal.text,
  source: "model",
  contextSnapshot: context,
});
let revision = getWritingProject(first.id).revisions[0];
resolveRevision(first.id, revision.id, "reject");
check("reject keeps manuscript unchanged", getWritingProject(first.id).chapters.find((item) => item.id === chapterOne.id).content === beforeJob);

createRevision(first.id, {
  chapterId: chapterOne.id,
  kind: "rewrite",
  start: selectionStart,
  end: selectionEnd,
  before: chapter.content.slice(selectionStart, selectionEnd),
  after: proposal.text,
  source: "model",
});
revision = getWritingProject(first.id).revisions[0];
resolveRevision(first.id, revision.id, "accept");
const accepted = getWritingProject(first.id);
check("accept replaces only the selected range", accepted.chapters.find((item) => item.id === chapterOne.id).content === chapter.content.slice(0, selectionStart) + proposal.text);
check("accept creates a restorable snapshot", accepted.snapshots.some((item) => item.chapterId === chapterOne.id && item.content === beforeJob));
const acceptedSnapshot = accepted.snapshots.find((item) => item.chapterId === chapterOne.id && item.content === beforeJob);
restoreWritingSnapshot(first.id, acceptedSnapshot.id);
check("snapshot restore is reversible", getWritingProject(first.id).chapters.find((item) => item.id === chapterOne.id).content === beforeJob);

const exported = exportWritingProjectMarkdown(first.id);
check("export contains Story Bible and full manuscript", exported.ok && /## 人物/.test(exported.content) && /错时频率/.test(exported.content) && /零点，停播五年的电台/.test(exported.content));
const exportedFirst = exported.content.indexOf("第二章 · 回声");
const exportedSecond = exported.content.indexOf("第一章 · 零点");
check("export follows current chapter order", exportedFirst >= 0 && exportedSecond > exportedFirst);

const failed = checks.filter((item) => !item.pass);
console.log(`\nverify:cocreate ${checks.length - failed.length}/${checks.length}${failed.length ? " RED" : " GREEN"}`);
if (failed.length) process.exitCode = 1;
