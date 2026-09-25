/**
 * C5 — Publish artifact to character / scenario library / worldbook (whitelist).
 * TODO(DEL-05/Codex delivery-final): publishSession has no production UI caller yet — wire when cocreate adds publish button.
 */

import {
  CHARACTER_FIELD_WHITELIST,
  isCompleteWork,
  countInteractiveTurns,
  MIN_TURNS_FOR_COMPLETE,
  getTaskTemplate,
  nowIso,
} from "./session-schema.js";
import { getSession, setSessionStatus } from "./session-store.js";
import { getArtifact, getCurrentContent, getVersion, updateArtifactMeta } from "./artifact-store.js";
import { upsertUserScript } from "../scenario/store.js";
import { listLibraryItems } from "../scenario/library/index.js";
import { recordCocreatePublish } from "../life/confluence.js";

/** In-memory backup of last publish target (also mirrored to localStorage when available). */
export const PUBLISH_BACKUP_KEY = "yueqi.cocreate.publish-backup.v1";

/**
 * Pure: build character whitelist patch from backstory content.
 * Never touches avatarUrl / petId / voice / actions.
 * @param {object} character
 * @param {object} content
 */
export function buildCharacterWhitelistPatch(character, content) {
  const fields = Array.isArray(character?.profile?.fields)
    ? [...character.profile.fields]
    : Array(5).fill("");
  while (fields.length < 5) fields.push("");

  const fieldIndex = Number.isInteger(content?.fieldIndex) ? content.fieldIndex : 4;
  if (!CHARACTER_FIELD_WHITELIST.includes(fieldIndex)) {
    return { ok: false, error: "field_not_whitelisted", patch: null, diff: [] };
  }

  const before = String(fields[fieldIndex] || "");
  const after = String(content?.text || before);
  fields[fieldIndex] = after;

  const tokensBefore = Array.isArray(character?.profile?.tokens)
    ? [...character.profile.tokens]
    : [];
  const tokensAfter = Array.isArray(content?.tokens) && content.tokens.length
    ? content.tokens.map(String).slice(0, 12)
    : tokensBefore;

  const diff = [
    {
      target: "character.profile.fields",
      fieldIndex,
      label: fieldIndex === 2 ? "身份" : "人设摘要/往事",
      before,
      after,
    },
  ];
  if (JSON.stringify(tokensBefore) !== JSON.stringify(tokensAfter)) {
    diff.push({
      target: "character.profile.tokens",
      label: "关键词",
      before: tokensBefore.join("、"),
      after: tokensAfter.join("、"),
    });
  }

  return {
    ok: true,
    error: null,
    patch: {
      id: character.id,
      // Explicitly omit avatarUrl, petId, voice, actions
      profile: {
        fields,
        tokens: tokensAfter,
      },
    },
    preserved: {
      avatarUrl: character.avatarUrl,
      petId: character.petId,
      // voice / actions never in patch
    },
    diff,
  };
}

/**
 * Pure: build script upsert payload from date_scene content.
 * @param {object} content
 * @param {{ characterId?: string, artifactId?: string }} [meta]
 */
export function buildScriptPublishPayload(content, meta = {}) {
  const title = String(content?.title || "共创约会").trim() || "共创约会";
  const premise = String(content?.premise || "").trim() || "一次共创的约会。";
  const openingBeat = String(content?.openingBeat || premise).trim();
  const mood = String(content?.mood || "warm").trim() || "warm";
  const id = meta.artifactId
    ? `script-cc-${String(meta.artifactId).replace(/^art-/, "").slice(0, 24)}`
    : undefined;
  return {
    id,
    title,
    premise,
    openingBeat,
    mood,
    source: "cocreate",
    tags: ["共创", "约会"],
    castHint: meta.characterId || "",
  };
}

/**
 * Pure: worldbook entries from world_setting content.
 * @param {object} content
 * @param {string} characterId
 */
export function buildWorldbookEntries(content, characterId) {
  const entries = Array.isArray(content?.worldEntries) ? content.worldEntries : [];
  const summary = String(content?.relationshipSummary || "").trim();
  const list = entries.map((e) => ({
    id: String(e.id || `wb-cc-${Date.now().toString(36)}`),
    title: String(e.title || "共同世界").trim(),
    content: String(e.content || summary).trim(),
    triggers: Array.isArray(e.triggers) ? e.triggers.map(String) : ["我们"],
    category: String(e.category || "关系"),
    enabled: true,
    linkedCharacterIds: characterId ? [characterId] : [],
    scopeApps: [],
    priority: 60,
  }));
  if (!list.length && summary) {
    list.push({
      id: `wb-cc-rel-${Date.now().toString(36)}`,
      title: "关系与共同世界",
      content: summary,
      triggers: ["我们", "关系"],
      category: "关系",
      enabled: true,
      linkedCharacterIds: characterId ? [characterId] : [],
      scopeApps: [],
      priority: 60,
    });
  }
  return list;
}

/**
 * Build publish preview (diff) without writing.
 * @param {string} sessionId
 * @param {{ character?: object }} [ctx]
 */
export function buildPublishPreview(sessionId, ctx = {}) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: "session_not_found" };
  const artifact = getArtifact(session.artifactId);
  const content = getCurrentContent(session.artifactId);
  if (!artifact || !content) return { ok: false, error: "no_artifact" };

  const tmpl = getTaskTemplate(session.type);
  const interactive = countInteractiveTurns(session);
  const complete = isCompleteWork(session) || artifact.complete;
  const needsQuickConfirm = !complete;

  if (session.type === "backstory") {
    if (!ctx.character) return { ok: false, error: "character_required" };
    const built = buildCharacterWhitelistPatch(ctx.character, content);
    return {
      ok: built.ok,
      error: built.error,
      target: "character",
      targetLabel: "角色卡（白名单字段）",
      diff: built.diff || [],
      patch: built.patch,
      preserved: built.preserved,
      complete,
      needsQuickConfirm,
      interactiveTurns: interactive,
      minTurns: MIN_TURNS_FOR_COMPLETE,
      publishTarget: tmpl?.publishTarget,
    };
  }

  if (session.type === "date_scene") {
    const payload = buildScriptPublishPayload(content, {
      characterId: session.characterId,
      artifactId: artifact.id,
    });
    return {
      ok: true,
      error: null,
      target: "script",
      targetLabel: "情景剧书架",
      diff: [
        { label: "标题", before: "（新增）", after: payload.title },
        { label: "premise", before: "（新增）", after: payload.premise },
        { label: "openingBeat", before: "（新增）", after: payload.openingBeat },
        { label: "mood", before: "（新增）", after: payload.mood },
      ],
      patch: payload,
      complete,
      needsQuickConfirm,
      interactiveTurns: interactive,
      minTurns: MIN_TURNS_FOR_COMPLETE,
      publishTarget: tmpl?.publishTarget,
    };
  }

  const entries = buildWorldbookEntries(content, session.characterId);
  return {
    ok: true,
    error: null,
    target: "worldbook",
    targetLabel: "世界书（关联本角色）",
    diff: [
      {
        label: "关系摘要",
        before: "（见角色侧）",
        after: String(content.relationshipSummary || ""),
      },
      ...entries.map((e) => ({
        label: `世界书 · ${e.title}`,
        before: "（新增/更新）",
        after: e.content,
      })),
    ],
    patch: { entries, relationshipSummary: content.relationshipSummary },
    complete,
    needsQuickConfirm,
    interactiveTurns: interactive,
    minTurns: MIN_TURNS_FOR_COMPLETE,
    publishTarget: tmpl?.publishTarget,
  };
}

function saveBackup(record) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(PUBLISH_BACKUP_KEY, JSON.stringify(record));
    }
  } catch {
    /* ignore */
  }
  return record;
}

export function readPublishBackup() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(PUBLISH_BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} sessionId
 * @param {{
 *   character?: object,
 *   upsertCharacter?: (partial: object) => Promise<object>|object,
 *   upsertWorldbookEntry?: (entry: object) => Promise<object>|object,
 *   confirmIncomplete?: boolean,
 * }} deps
 */
export async function publishSession(sessionId, deps = {}) {
  const preview = buildPublishPreview(sessionId, { character: deps.character });
  if (!preview.ok) return { ok: false, error: preview.error };

  if (preview.needsQuickConfirm && !deps.confirmIncomplete) {
    return {
      ok: false,
      error: "incomplete_needs_confirm",
      message: `尚未满 ${MIN_TURNS_FOR_COMPLETE} 轮互动，快速发布需明确确认。`,
      preview,
    };
  }

  const session = getSession(sessionId);
  const artifact = getArtifact(session.artifactId);
  const version = getVersion(artifact.currentVersionId);

  // Backup before write
  const backup = saveBackup({
    at: nowIso(),
    sessionId,
    artifactId: artifact.id,
    target: preview.target,
    characterSnapshot: deps.character
      ? {
          id: deps.character.id,
          avatarUrl: deps.character.avatarUrl,
          petId: deps.character.petId,
          profile: deps.character.profile,
        }
      : null,
    contentSnapshot: version?.content || null,
  });

  let result = { targetId: null, script: null, entries: [] };

  if (preview.target === "character") {
    if (typeof deps.upsertCharacter !== "function") {
      return { ok: false, error: "upsertCharacter_required", backup };
    }
    // Re-verify whitelist: patch must not include avatar
    const patch = preview.patch;
    if ("avatarUrl" in (patch || {}) || "petId" in (patch || {})) {
      return { ok: false, error: "whitelist_violation", backup };
    }
    const saved = await deps.upsertCharacter(patch);
    // Ensure avatar unchanged if caller merged wrong
    if (deps.character?.avatarUrl && saved?.avatarUrl && saved.avatarUrl !== deps.character.avatarUrl) {
      await deps.upsertCharacter({
        id: deps.character.id,
        avatarUrl: deps.character.avatarUrl,
        petId: deps.character.petId,
      });
    }
    result.targetId = deps.character.id;
  } else if (preview.target === "script") {
    const script = upsertUserScript(preview.patch);
    result.targetId = script.id;
    result.script = script;
    const shelf = listLibraryItems();
    const found = shelf.some((item) => item.id === script.id);
    if (!found) {
      return { ok: false, error: "library_not_updated", backup, script };
    }
  } else if (preview.target === "worldbook") {
    if (typeof deps.upsertWorldbookEntry !== "function") {
      return { ok: false, error: "upsertWorldbookEntry_required", backup };
    }
    const entries = preview.patch?.entries || [];
    for (const entry of entries) {
      result.entries.push(await deps.upsertWorldbookEntry(entry));
    }
    result.targetId = result.entries[0]?.id || null;

    // Optional: also write relationship summary into field 4 if character provided
    if (deps.character && typeof deps.upsertCharacter === "function" && preview.patch?.relationshipSummary) {
      const relPatch = buildCharacterWhitelistPatch(deps.character, {
        kind: "backstory",
        text: String(preview.patch.relationshipSummary),
        fieldIndex: 4,
        tokens: deps.character.profile?.tokens,
      });
      if (relPatch.ok) await deps.upsertCharacter(relPatch.patch);
    }
  }

  updateArtifactMeta(artifact.id, {
    publishedAt: nowIso(),
    publishTargetId: result.targetId,
    complete: true,
  });
  setSessionStatus(sessionId, "published");

  // C6: publish → shared life event (idempotent)
  try {
    const title =
      preview.target === "script"
        ? String(result.script?.title || version?.content?.title || "共创剧本")
        : preview.target === "worldbook"
          ? "关系与世界设定"
          : "人设往事";
    recordCocreatePublish({
      characterId: deps.character?.id || session.characterId || "",
      sessionId,
      artifactId: artifact.id,
      target: preview.target,
      targetId: result.targetId || "",
      title,
    });
  } catch {
    /* never block publish */
  }

  return {
    ok: true,
    error: null,
    preview,
    backup,
    ...result,
    actions: {
      openProfile: preview.target === "character" || preview.target === "worldbook",
      openScenario: preview.target === "script",
      continueCocreate: true,
    },
  };
}
