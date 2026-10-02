/**
 * Writing Studio V3 persistence.
 * Projects own their story bible, outline, chapters, revision candidates and snapshots.
 */

export const WRITING_PROJECT_STORE_KEY = "yueqi.cocreate.projects.v3";
export const WRITING_PROJECT_SCHEMA_VERSION = 3;

let storageOverride = null;

function storage() {
  if (storageOverride) return storageOverride;
  return typeof globalThis !== "undefined" ? globalThis.localStorage || null : null;
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function countManuscriptWords(text) {
  const clean = String(text || "").trim();
  if (!clean) return 0;
  const han = clean.match(/[\u3400-\u9fff]/g)?.length || 0;
  const words = clean.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length || 0;
  return han + words;
}

function makeChapter(partial = {}, order = 0) {
  const createdAt = partial.createdAt || nowIso();
  const content = String(partial.content || "");
  return {
    id: String(partial.id || uid("chapter")),
    title: String(partial.title || `第 ${order + 1} 章`).trim() || `第 ${order + 1} 章`,
    summary: String(partial.summary || "").trim(),
    content,
    order: Number.isFinite(Number(partial.order)) ? Number(partial.order) : order,
    status: ["draft", "revising", "done"].includes(partial.status) ? partial.status : "draft",
    outlineNodeId: String(partial.outlineNodeId || ""),
    wordCount: countManuscriptWords(content),
    createdAt,
    updatedAt: partial.updatedAt || createdAt,
  };
}

function makeOutlineNode(partial = {}, order = 0) {
  return {
    id: String(partial.id || uid("outline")),
    title: String(partial.title || `章节 ${order + 1}`).trim() || `章节 ${order + 1}`,
    summary: String(partial.summary || "").trim(),
    order: Number.isFinite(Number(partial.order)) ? Number(partial.order) : order,
    chapterId: String(partial.chapterId || ""),
  };
}

function makeBible(raw = {}) {
  return {
    premise: String(raw.premise || ""),
    synopsis: String(raw.synopsis || ""),
    genre: String(raw.genre || "都市奇幻"),
    style: String(raw.style || "克制、细腻、重视动作与留白"),
    pov: String(raw.pov || "第三人称限知"),
    tense: String(raw.tense || "过去时"),
    cast: Array.isArray(raw.cast)
      ? raw.cast.map((item) => ({
          id: String(item?.id || uid("cast")),
          name: String(item?.name || "未命名角色"),
          role: String(item?.role || "主要角色"),
          description: String(item?.description || ""),
        }))
      : [],
    world: Array.isArray(raw.world)
      ? raw.world.map((item) => ({
          id: String(item?.id || uid("world")),
          title: String(item?.title || "未命名设定"),
          content: String(item?.content || ""),
          triggers: Array.isArray(item?.triggers) ? item.triggers.map(String).filter(Boolean) : [],
        }))
      : [],
  };
}

export function normalizeWritingProject(raw = {}) {
  const createdAt = raw.createdAt || nowIso();
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((item, index) => makeChapter(item, index))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
  if (!chapters.length) chapters.push(makeChapter({ title: "第一章" }, 0));
  const outline = (Array.isArray(raw.outline) ? raw.outline : [])
    .map((item, index) => makeOutlineNode(item, index))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
  const activeChapterId = chapters.some((item) => item.id === raw.activeChapterId)
    ? raw.activeChapterId
    : chapters[0].id;
  return {
    schemaVersion: WRITING_PROJECT_SCHEMA_VERSION,
    id: String(raw.id || uid("project")),
    title: String(raw.title || "未命名作品").trim() || "未命名作品",
    subtitle: String(raw.subtitle || ""),
    status: ["draft", "revising", "complete", "archived"].includes(raw.status) ? raw.status : "draft",
    bible: makeBible(raw.bible || {}),
    outline,
    chapters,
    activeChapterId,
    revisions: Array.isArray(raw.revisions) ? raw.revisions.map((item) => ({ ...item })) : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots.map((item) => ({ ...item })) : [],
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
}

function emptyProject() {
  return normalizeWritingProject({
    title: "未命名作品",
    subtitle: "",
    bible: {
      premise: "",
      synopsis: "",
      genre: "自定",
      style: "",
      pov: "第三人称限知",
      tense: "过去时",
      cast: [],
      world: [],
    },
    chapters: [{ title: "第一章", content: "" }],
    outline: [{ title: "第一章", summary: "" }],
  });
}

function readLibrary() {
  const target = storage();
  if (!target) return { projects: [], activeProjectId: "" };
  try {
    const parsed = JSON.parse(target.getItem(WRITING_PROJECT_STORE_KEY) || "{}");
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map(normalizeWritingProject)
      : [];
    const activeProjectId = projects.some((item) => item.id === parsed.activeProjectId)
      ? parsed.activeProjectId
      : (projects[0]?.id || "");
    return { projects, activeProjectId };
  } catch {
    return { projects: [], activeProjectId: "" };
  }
}

function writeLibrary(library) {
  const target = storage();
  if (!target) return { ok: false, reason: "storage_unavailable" };
  try {
    target.setItem(WRITING_PROJECT_STORE_KEY, JSON.stringify(library));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.name === "QuotaExceededError" ? "storage_quota" : "storage_write_failed" };
  }
}

function persistProject(project) {
  const library = readLibrary();
  const normalized = normalizeWritingProject({ ...project, updatedAt: nowIso() });
  const index = library.projects.findIndex((item) => item.id === normalized.id);
  if (index >= 0) library.projects[index] = normalized;
  else library.projects.unshift(normalized);
  library.activeProjectId = normalized.id;
  const written = writeLibrary(library);
  return { ...written, value: normalized };
}

export function listWritingProjects() {
  return readLibrary().projects
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getWritingProject(id) {
  return readLibrary().projects.find((item) => item.id === String(id || "")) || null;
}

export function getActiveWritingProject() {
  const library = readLibrary();
  return library.projects.find((item) => item.id === library.activeProjectId) || library.projects[0] || null;
}

export function setActiveWritingProject(projectId) {
  const library = readLibrary();
  if (!library.projects.some((item) => item.id === projectId)) return { ok: false, reason: "project_not_found" };
  library.activeProjectId = projectId;
  return writeLibrary(library);
}

export function createWritingProject(input = {}) {
  const chapter = makeChapter({ title: "第一章" }, 0);
  return persistProject(normalizeWritingProject({
    title: input.title,
    subtitle: input.subtitle,
    bible: {
      premise: input.premise,
      genre: input.genre || "长篇小说",
      style: input.style || "清晰、具体、重视人物动机",
      pov: input.pov || "第三人称限知",
      tense: input.tense || "过去时",
    },
    chapters: [chapter],
    outline: [{ title: "第一章", summary: input.premise || "", chapterId: chapter.id }],
  }));
}

export function updateWritingProject(projectId, patch = {}) {
  const current = getWritingProject(projectId);
  if (!current) return { ok: false, reason: "project_not_found" };
  const next = {
    ...current,
    ...patch,
    bible: patch.bible ? { ...current.bible, ...patch.bible } : current.bible,
  };
  return persistProject(next);
}

export function deleteWritingProject(projectId) {
  const library = readLibrary();
  const next = library.projects.filter((item) => item.id !== projectId);
  if (next.length === library.projects.length) return { ok: false, reason: "project_not_found" };
  library.projects = next;
  library.activeProjectId = next[0]?.id || "";
  return writeLibrary(library);
}

export function setActiveChapter(projectId, chapterId) {
  const project = getWritingProject(projectId);
  if (!project?.chapters.some((item) => item.id === chapterId)) return { ok: false, reason: "chapter_not_found" };
  return persistProject({ ...project, activeChapterId: chapterId });
}

export function addWritingChapter(projectId, input = {}) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const chapter = makeChapter(input, project.chapters.length);
  const outlineNode = makeOutlineNode({
    title: chapter.title,
    summary: input.summary || "",
    chapterId: chapter.id,
  }, project.outline.length);
  chapter.outlineNodeId = outlineNode.id;
  const result = persistProject({
    ...project,
    chapters: [...project.chapters, chapter],
    outline: [...project.outline, outlineNode],
    activeChapterId: chapter.id,
  });
  return { ...result, chapter };
}

export function updateWritingChapter(projectId, chapterId, patch = {}, options = {}) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const chapter = project.chapters.find((item) => item.id === chapterId);
  if (!chapter) return { ok: false, reason: "chapter_not_found" };
  const snapshots = options.snapshot
    ? [{
        id: uid("snapshot"),
        chapterId,
        title: String(options.snapshotTitle || "编辑前版本"),
        content: chapter.content,
        createdAt: nowIso(),
      }, ...project.snapshots].slice(0, 100)
    : project.snapshots;
  const nextChapters = project.chapters.map((item) => item.id === chapterId
    ? makeChapter({ ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: nowIso() }, item.order)
    : item);
  return persistProject({ ...project, chapters: nextChapters, snapshots });
}

export function removeWritingChapter(projectId, chapterId) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  if (project.chapters.length <= 1) return { ok: false, reason: "last_chapter" };
  const chapters = project.chapters
    .filter((item) => item.id !== chapterId)
    .map((item, index) => ({ ...item, order: index }));
  const outline = project.outline
    .filter((item) => item.chapterId !== chapterId)
    .map((item, index) => ({ ...item, order: index }));
  return persistProject({
    ...project,
    chapters,
    outline,
    activeChapterId: project.activeChapterId === chapterId ? chapters[0].id : project.activeChapterId,
  });
}

export function moveWritingChapter(projectId, chapterId, delta) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const from = project.chapters.findIndex((item) => item.id === chapterId);
  const to = Math.max(0, Math.min(project.chapters.length - 1, from + Number(delta || 0)));
  if (from < 0 || from === to) return { ok: false, reason: from < 0 ? "chapter_not_found" : "edge" };
  const chapters = project.chapters.slice();
  const [moved] = chapters.splice(from, 1);
  chapters.splice(to, 0, moved);
  chapters.forEach((item, index) => { item.order = index; });
  return persistProject({ ...project, chapters });
}

export function updateOutlineNode(projectId, nodeId, patch = {}) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const outline = project.outline.map((item) => item.id === nodeId ? { ...item, ...patch, id: item.id } : item);
  return persistProject({ ...project, outline });
}

export function addOutlineNode(projectId, input = {}) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const node = makeOutlineNode(input, project.outline.length);
  const result = persistProject({ ...project, outline: [...project.outline, node] });
  return { ...result, node };
}

export function updateBibleCollection(projectId, collection, rows) {
  if (!['cast', 'world'].includes(collection)) return { ok: false, reason: "bad_collection" };
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  return persistProject({ ...project, bible: makeBible({ ...project.bible, [collection]: rows }) });
}

export function createRevision(projectId, input = {}) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const chapter = project.chapters.find((item) => item.id === input.chapterId);
  if (!chapter) return { ok: false, reason: "chapter_not_found" };
  const start = Math.max(0, Math.min(chapter.content.length, Number(input.start) || 0));
  const end = Math.max(start, Math.min(chapter.content.length, Number(input.end) || start));
  const revision = {
    id: uid("revision"),
    chapterId: chapter.id,
    kind: String(input.kind || "rewrite"),
    instruction: String(input.instruction || ""),
    start,
    end,
    before: String(input.before ?? chapter.content.slice(start, end)),
    after: String(input.after || ""),
    source: String(input.source || "model"),
    status: "pending",
    contextSnapshot: input.contextSnapshot && typeof input.contextSnapshot === "object" ? clone(input.contextSnapshot) : null,
    createdAt: nowIso(),
  };
  if (!revision.after) return { ok: false, reason: "empty_candidate" };
  return persistProject({ ...project, revisions: [revision, ...project.revisions].slice(0, 100) });
}

export function resolveRevision(projectId, revisionId, action) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const revision = project.revisions.find((item) => item.id === revisionId);
  if (!revision) return { ok: false, reason: "revision_not_found" };
  if (revision.status !== "pending") return { ok: false, reason: "revision_resolved" };
  const revisions = project.revisions.map((item) => item.id === revisionId
    ? { ...item, status: action === "accept" ? "accepted" : "rejected", resolvedAt: nowIso() }
    : item);
  if (action !== "accept") return persistProject({ ...project, revisions });
  const chapter = project.chapters.find((item) => item.id === revision.chapterId);
  if (!chapter) return { ok: false, reason: "chapter_not_found" };
  const currentSlice = chapter.content.slice(revision.start, revision.end);
  if (currentSlice !== revision.before) return { ok: false, reason: "document_changed" };
  const content = chapter.content.slice(0, revision.start) + revision.after + chapter.content.slice(revision.end);
  const snapshots = [{
    id: uid("snapshot"),
    chapterId: chapter.id,
    title: `${revision.kind} 前`,
    content: chapter.content,
    createdAt: nowIso(),
  }, ...project.snapshots].slice(0, 100);
  const chapters = project.chapters.map((item) => item.id === chapter.id
    ? makeChapter({ ...item, content, updatedAt: nowIso() }, item.order)
    : item);
  return persistProject({ ...project, chapters, revisions, snapshots });
}

export function restoreWritingSnapshot(projectId, snapshotId) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const snapshot = project.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return { ok: false, reason: "snapshot_not_found" };
  return updateWritingChapter(projectId, snapshot.chapterId, { content: snapshot.content }, {
    snapshot: true,
    snapshotTitle: "恢复前版本",
  });
}

export function exportWritingProjectMarkdown(projectId) {
  const project = getWritingProject(projectId);
  if (!project) return { ok: false, reason: "project_not_found" };
  const lines = [
    `# ${project.title}`,
    project.subtitle ? `\n> ${project.subtitle}` : "",
    "\n## 作品信息",
    `- 类型：${project.bible.genre}`,
    `- 视角：${project.bible.pov}`,
    `- 时态：${project.bible.tense}`,
    `- 风格：${project.bible.style}`,
    "\n## 简介",
    project.bible.synopsis || project.bible.premise || "",
    "\n## 人物",
    ...project.bible.cast.map((item) => `- **${item.name}**（${item.role}）：${item.description}`),
    "\n## 世界设定",
    ...project.bible.world.map((item) => `- **${item.title}**：${item.content}`),
    "\n---",
  ];
  project.chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((chapter) => {
      lines.push(`\n# ${chapter.title}\n`);
      if (chapter.summary) lines.push(`> ${chapter.summary}\n`);
      lines.push(chapter.content || "");
    });
  return { ok: true, content: lines.filter((line) => line !== "").join("\n"), project };
}

export function __setWritingStorageForTests(next) {
  storageOverride = next;
}

export function __clearWritingProjectsForTests() {
  storage()?.removeItem?.(WRITING_PROJECT_STORE_KEY);
}

export { uid as createWritingId };
