/**
 * 漫卷数据合同。漫卷是按章点读的视觉小说，不与开放情景会话共用剧情事实源。
 */

const FRAME_KEYS = [
  "id",
  "speaker",
  "text",
  "bg",
  "portrait",
  "mood",
  "choices",
  "next",
  "ending",
];

function trimId(value, fallback = "") {
  const id = String(value ?? "").trim();
  return id || fallback;
}

function normalizeFlags(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, flag]) => [trimId(key), flag])
      .filter(([key]) => key),
  );
}

function normalizeChoice(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id, `choice-${index + 1}`);
  const label = String(raw.label ?? raw.text ?? "").trim();
  const nextFrameId = trimId(raw.nextFrameId ?? raw.next ?? raw.goto);
  if (!label || !nextFrameId) return null;
  return {
    id,
    label,
    nextFrameId,
    setFlags: normalizeFlags(raw.setFlags ?? raw.flags),
  };
}

function normalizeEnding(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id);
  const title = String(raw.title || "结局").trim() || "结局";
  const summary = String(raw.summary || "").trim();
  if (!id) return null;
  return { id, title, summary };
}

function normalizeFrame(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id, `frame-${index + 1}`);
  const speaker = String(raw.speaker ?? raw.name ?? "").trim();
  const text = String(raw.text ?? raw.body ?? "").trim();
  if (!text) return null;

  const choices = Array.isArray(raw.choices)
    ? raw.choices.map(normalizeChoice).filter(Boolean)
    : [];
  const frame = { id, speaker, text };
  const bg = trimId(raw.bg);
  const portrait = trimId(raw.portrait);
  const mood = trimId(raw.mood);
  const next = trimId(raw.next);
  const ending = normalizeEnding(raw.ending);
  if (bg) frame.bg = bg;
  if (portrait) frame.portrait = portrait;
  if (mood) frame.mood = mood;
  if (choices.length) frame.choices = choices;
  else if (next) frame.next = next;
  if (ending) frame.ending = ending;
  return frame;
}

export function normalizeScrollPack(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id);
  const title = String(raw.title ?? raw.name ?? "未命名章节").trim() || "未命名章节";
  const frames = (Array.isArray(raw.frames) ? raw.frames : [])
    .map(normalizeFrame)
    .filter(Boolean);
  if (!id || !frames.length) return null;
  if (new Set(frames.map((frame) => frame.id)).size !== frames.length) return null;
  return { id, title, frames };
}

function normalizeAsset(raw, key, type) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: trimId(data.id, key),
    type,
    label: String(data.label || key).trim() || key,
    src: String(data.src || "").trim(),
    alt: String(data.alt || data.label || key).trim(),
  };
}

function normalizeAssetMap(raw, type) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, normalizeAsset(value, key, type)]),
  );
}

function normalizeChapter(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id, `chapter-${index + 1}`);
  const pack = normalizeScrollPack({ ...raw, id, title: raw.title });
  if (!pack) return null;
  return {
    ...pack,
    order: index,
    subtitle: String(raw.subtitle || "").trim(),
    synopsis: String(raw.synopsis || "").trim(),
    estimatedMinutes: Math.max(1, Number(raw.estimatedMinutes) || 4),
  };
}

export function normalizeScrollWork(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = trimId(raw.id);
  const title = String(raw.title || "未命名作品").trim() || "未命名作品";
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map(normalizeChapter)
    .filter(Boolean);
  if (!id || !chapters.length) return null;
  if (new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length) return null;
  return {
    id,
    version: Math.max(1, Number(raw.version) || 1),
    title,
    subtitle: String(raw.subtitle || "").trim(),
    synopsis: String(raw.synopsis || "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean).slice(0, 6) : [],
    accent: String(raw.accent || "jade").trim() || "jade",
    cover: String(raw.cover || "").trim(),
    character: {
      id: trimId(raw.character?.id, "character"),
      name: String(raw.character?.name || "角色").trim() || "角色",
      portrait: String(raw.character?.portrait || "").trim(),
    },
    assets: {
      backgrounds: normalizeAssetMap(raw.assets?.backgrounds, "background"),
      portraits: normalizeAssetMap(raw.assets?.portraits, "portrait"),
    },
    chapters,
  };
}

export function validateScrollWork(work) {
  const issues = [];
  if (!work?.id) return ["work.id 缺失"];
  for (const chapter of work.chapters || []) {
    const ids = new Set(chapter.frames.map((frame) => frame.id));
    const referenced = new Set();
    for (const frame of chapter.frames) {
      if (frame.next) referenced.add(frame.next);
      for (const choice of frame.choices || []) referenced.add(choice.nextFrameId);
      if (frame.bg && !work.assets.backgrounds[frame.bg]) {
        issues.push(`${chapter.id}/${frame.id}: 未声明背景 ${frame.bg}`);
      }
      if (frame.portrait && !work.assets.portraits[frame.portrait]) {
        issues.push(`${chapter.id}/${frame.id}: 未声明立绘 ${frame.portrait}`);
      }
    }
    for (const target of referenced) {
      if (!ids.has(target)) issues.push(`${chapter.id}: 分支目标不存在 ${target}`);
    }
    const start = getStartFrame(chapter);
    const reachable = new Set();
    const queue = start ? [start.id] : [];
    while (queue.length) {
      const id = queue.shift();
      if (!id || reachable.has(id)) continue;
      reachable.add(id);
      const frame = chapter.frames.find((item) => item.id === id);
      if (!frame) continue;
      if (frame.next) queue.push(frame.next);
      for (const choice of frame.choices || []) queue.push(choice.nextFrameId);
    }
    for (const frame of chapter.frames) {
      if (!reachable.has(frame.id)) issues.push(`${chapter.id}: 不可达帧 ${frame.id}`);
    }
  }
  return issues;
}

export function indexFrames(pack) {
  return new Map((pack?.frames || []).map((frame) => [frame.id, frame]));
}

export function getFrame(pack, frameId) {
  if (!pack) return null;
  const id = trimId(frameId);
  return pack.frames.find((frame) => frame.id === id) || null;
}

export function getStartFrame(pack) {
  if (!pack?.frames?.length) return null;
  return pack.frames.find((frame) => frame.id === "start" || frame.id === "f01") || pack.frames[0];
}

export function resolveNextFrameId(frame, choiceId = "") {
  if (!frame) return null;
  if (Array.isArray(frame.choices) && frame.choices.length) {
    return frame.choices.find((choice) => choice.id === choiceId)?.nextFrameId || null;
  }
  return frame.next || null;
}

export function isTerminalFrame(pack, frameId) {
  const frame = getFrame(pack, frameId);
  if (!frame) return true;
  return Boolean(frame.ending) || (!(frame.choices || []).length && !frame.next);
}

export { FRAME_KEYS };
