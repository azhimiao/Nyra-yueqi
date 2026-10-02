/** Character package schema v1 — open formats only (PNG/WebP/JSON). */

export const PACK_SCHEMA_VERSION = 1;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const LIMITS = Object.freeze({
  looks: 64,
  actions: 128,
  expressions: 128,
  scenes: 128,
  layeredParts: 128,
  triggersPerAction: 32,
  keyframesPerAction: 256,
  assets: 512,
  name: 80,
  description: 500,
  fileName: 255,
  assetPath: 240,
});

const HTML_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/** Safe for both HTML text and quoted attribute values in character editors. */
export function escapeCharacterPackHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function createEmptyPackManifest({
  id = "custom-character-001",
  name = "定制角色",
  version = "1.0.0",
} = {}) {
  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    id,
    name,
    version,
    defaultLook: "home_casual",
    defaultActions: {
      idle: "idle_default",
      talking: "talking_default",
    },
  };
}

/**
 * Validate pack object graph before install.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCharacterPack(pack) {
  const errors = [];
  const add = (error) => {
    if (!errors.includes(error)) errors.push(error);
  };
  if (!pack || typeof pack !== "object") {
    return { ok: false, errors: ["pack_not_object"] };
  }

  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const checkText = (value, max, error) => {
    const text = String(value ?? "");
    if (text.length > max) add(error);
    return text.trim();
  };
  const checkId = (value, error, optional = false) => {
    const id = String(value ?? "").trim();
    if (!id && optional) return "";
    if (!ID_PATTERN.test(id)) add(error);
    return id;
  };
  const assets = isRecord(pack.assets) ? pack.assets : {};
  const allowMissingAssets = pack._allowMissingAssets === true;
  const hasAsset = (path) => Object.prototype.hasOwnProperty.call(assets, path);
  const checkAssetPath = (value, field, hasStoredMedia = false) => {
    const path = String(value ?? "").trim();
    if (!path) return;
    const segments = path.split("/");
    const unsafe = path.length > LIMITS.assetPath
      || !path.startsWith("assets/")
      || /[\\\0\r\n]/.test(path)
      || segments.some((segment) => !segment || segment === "." || segment === "..");
    if (unsafe) add(`unsafe_path:${field}`);
    if (!unsafe && !hasAsset(path) && !allowMissingAssets && !hasStoredMedia) {
      add(`missing_asset:${path}`);
    }
  };

  const manifest = pack.manifest;
  if (!isRecord(manifest)) add("missing_manifest");
  else {
    if (Number(manifest.schemaVersion) !== PACK_SCHEMA_VERSION) {
      add("unsupported_schema");
    }
    const manifestId = String(manifest.id || "").trim();
    if (!manifestId) add("missing_id");
    else checkId(manifestId, "invalid_manifest_id");
    if (!checkText(manifest.name, LIMITS.name, "manifest_name_too_long")) add("missing_name");
    if (!VERSION_PATTERN.test(String(manifest.version || "").trim())) add("invalid_version");
  }

  const looks = Array.isArray(pack.looks) ? pack.looks : [];
  const actions = Array.isArray(pack.actions) ? pack.actions : [];
  const expressions = Array.isArray(pack.expressions) ? pack.expressions : [];
  const sceneTriggers = Array.isArray(pack.sceneTriggers) ? pack.sceneTriggers : [];

  if (!Array.isArray(pack.looks)) add("looks_not_array");
  if (!Array.isArray(pack.actions)) add("actions_not_array");
  if (pack.expressions != null && !Array.isArray(pack.expressions)) add("expressions_not_array");
  if (pack.sceneTriggers != null && !Array.isArray(pack.sceneTriggers)) add("scenes_not_array");
  if (looks.length > LIMITS.looks) add("too_many_looks");
  if (actions.length > LIMITS.actions) add("too_many_actions");
  if (expressions.length > LIMITS.expressions) add("too_many_expressions");
  if (sceneTriggers.length > LIMITS.scenes) add("too_many_scenes");
  if (Object.keys(assets).length > LIMITS.assets) add("too_many_assets");

  if (!looks.length) add("no_looks");
  if (!actions.length) add("no_actions");
  const lookIds = new Set();
  for (const [index, look] of looks.entries()) {
    if (!isRecord(look)) {
      add(`look_not_object:${index}`);
      continue;
    }
    const id = String(look?.id || "").trim();
    if (!id) {
      add("look_missing_id");
      continue;
    }
    checkId(id, `invalid_look_id:${id}`);
    if (lookIds.has(id)) add(`duplicate_look:${id}`);
    lookIds.add(id);
    checkText(look.name || id, LIMITS.name, `look_name_too_long:${id}`);
    checkText(look.description, LIMITS.description, `look_description_too_long:${id}`);
    checkText(look.fileName, LIMITS.fileName, `look_filename_too_long:${id}`);
    checkAssetPath(look.asset || look.path, `look:${id}`, Boolean(look.mediaId));
  }

  const actionIds = new Set();
  for (const [index, action] of actions.entries()) {
    if (!isRecord(action)) {
      add(`action_not_object:${index}`);
      continue;
    }
    const id = String(action?.id || "").trim();
    if (!id) {
      add("action_missing_id");
      continue;
    }
    checkId(id, `invalid_action_id:${id}`);
    if (actionIds.has(id)) add(`duplicate_action:${id}`);
    actionIds.add(id);
    checkText(action.name || id, LIMITS.name, `action_name_too_long:${id}`);
    checkText(action.fileName, LIMITS.fileName, `action_filename_too_long:${id}`);
    if (action.type != null && !["image", "webp", "frames", "video"].includes(action.type)) {
      add(`invalid_action_type:${id}`);
    }
    if (action.triggers != null && !Array.isArray(action.triggers)) {
      add(`action_triggers_not_array:${id}`);
    }
    const triggers = Array.isArray(action.triggers) ? action.triggers : [];
    if (triggers.length > LIMITS.triggersPerAction) add(`too_many_action_triggers:${id}`);
    triggers.forEach((trigger) => checkId(trigger, `invalid_action_trigger:${id}`));
    checkAssetPath(action.asset || action.path, `action:${id}`, Boolean(action.mediaId));

    if (action.timeline != null && !isRecord(action.timeline)) {
      add(`timeline_not_object:${id}`);
    } else if (action.timeline) {
      for (const stage of ["enter", "loop", "exit"]) {
        const segment = action.timeline[stage];
        if (segment == null) continue;
        if (!isRecord(segment)) {
          add(`timeline_segment_not_object:${id}:${stage}`);
          continue;
        }
        checkText(segment.fileName, LIMITS.fileName, `timeline_filename_too_long:${id}:${stage}`);
        checkAssetPath(segment.asset, `timeline:${id}:${stage}`, Boolean(segment.mediaId));
      }
      if (action.timeline.keyframes != null && !Array.isArray(action.timeline.keyframes)) {
        add(`timeline_keyframes_not_array:${id}`);
      }
      if (
        Array.isArray(action.timeline.keyframes)
        && action.timeline.keyframes.length > LIMITS.keyframesPerAction
      ) {
        add(`too_many_keyframes:${id}`);
      }
    }
  }

  if (manifest?.defaultLook && !lookIds.has(manifest.defaultLook) && looks.length) {
    add("default_look_missing");
  }
  if (manifest?.defaultLook) checkId(manifest.defaultLook, "invalid_default_look");
  if (manifest?.defaultActions != null && !isRecord(manifest.defaultActions)) {
    add("default_actions_not_object");
  } else {
    for (const [slot, rawId] of Object.entries(manifest?.defaultActions || {})) {
      const actionId = checkId(rawId, `invalid_default_action:${slot}`);
      if (actionId && !actionIds.has(actionId)) add(`default_action_missing:${slot}`);
    }
  }

  const expressionIds = new Set();
  for (const [index, expression] of expressions.entries()) {
    if (!isRecord(expression)) {
      add(`expression_not_object:${index}`);
      continue;
    }
    const id = checkId(expression.id, `invalid_expression_id:${index}`);
    if (!id) continue;
    if (expressionIds.has(id)) add(`duplicate_expression:${id}`);
    expressionIds.add(id);
    checkText(expression.name || id, LIMITS.name, `expression_name_too_long:${id}`);
    checkId(expression.emotion || "neutral", `invalid_expression_emotion:${id}`);
    const actionId = checkId(expression.actionId, `invalid_expression_action:${id}`, true);
    if (actionId && !actionIds.has(actionId)) add(`expression_action_missing:${id}`);
  }

  for (const action of actions) {
    const id = String(action?.id || "").trim();
    if (!id || !isRecord(action)) continue;
    const fallback = checkId(action.fallback, `invalid_action_fallback:${id}`, true);
    if (fallback && !actionIds.has(fallback)) add(`action_fallback_missing:${id}`);
    if (!isRecord(action.timeline)) continue;
    for (const stage of ["enter", "loop", "exit"]) {
      const expressionId = checkId(
        action.timeline?.[stage]?.expressionId,
        `invalid_timeline_expression:${id}:${stage}`,
        true
      );
      if (expressionId && !expressionIds.has(expressionId)) {
        add(`timeline_expression_missing:${id}:${stage}`);
      }
    }
    const keyframes = Array.isArray(action.timeline.keyframes) ? action.timeline.keyframes : [];
    for (const [index, keyframe] of keyframes.entries()) {
      const expressionId = checkId(
        keyframe?.expressionId,
        `invalid_keyframe_expression:${id}:${index}`,
        true
      );
      if (expressionId && !expressionIds.has(expressionId)) {
        add(`keyframe_expression_missing:${id}:${index}`);
      }
    }
  }

  const sceneIds = new Set();
  for (const [index, scene] of sceneTriggers.entries()) {
    if (!isRecord(scene)) {
      add(`scene_not_object:${index}`);
      continue;
    }
    const id = checkId(scene.id, `invalid_scene_id:${index}`);
    const key = checkId(scene.scene, `invalid_scene_key:${id || index}`);
    if (id) {
      if (sceneIds.has(id)) add(`duplicate_scene:${id}`);
      sceneIds.add(id);
    }
    if (!key) add(`scene_missing_key:${id || index}`);
    const actionId = checkId(scene.actionId, `invalid_scene_action:${id || index}`, true);
    const lookId = checkId(scene.lookId, `invalid_scene_look:${id || index}`, true);
    if (actionId && !actionIds.has(actionId)) add(`scene_action_missing:${id || index}`);
    if (lookId && !lookIds.has(lookId)) add(`scene_look_missing:${id || index}`);
  }

  const layered = pack.layered;
  if (layered != null && !isRecord(layered)) {
    add("layered_not_object");
  } else if (layered) {
    const parts = Array.isArray(layered.parts) ? layered.parts : [];
    if (layered.parts != null && !Array.isArray(layered.parts)) add("layered_parts_not_array");
    if (parts.length > LIMITS.layeredParts) add("too_many_layered_parts");
    const partIds = new Set();
    const parentById = new Map();
    for (const [index, part] of parts.entries()) {
      if (!isRecord(part)) {
        add(`layered_part_not_object:${index}`);
        continue;
      }
      const id = checkId(part.id, `invalid_layered_part_id:${index}`);
      if (!id) continue;
      if (partIds.has(id)) add(`duplicate_layered_part:${id}`);
      partIds.add(id);
      const parentId = checkId(part.parentId, `invalid_layered_parent:${id}`, true);
      parentById.set(id, parentId);
      checkText(part.name || id, LIMITS.name, `layered_part_name_too_long:${id}`);
      checkText(part.fileName, LIMITS.fileName, `layered_filename_too_long:${id}`);
      checkAssetPath(part.asset, `layered:${id}`, Boolean(part.mediaId));
    }
    for (const [id, parentId] of parentById) {
      if (parentId && !partIds.has(parentId)) add(`layered_parent_missing:${id}`);
      if (parentId === id) add(`layered_parent_self:${id}`);
      const seen = new Set([id]);
      let cursor = parentId;
      while (cursor && parentById.has(cursor)) {
        if (seen.has(cursor)) {
          add(`layered_parent_cycle:${id}`);
          break;
        }
        seen.add(cursor);
        cursor = parentById.get(cursor);
      }
    }
    const mouthPartId = checkId(layered.lipSync?.mouthPartId, "invalid_lipsync_part", true);
    if (parts.length && mouthPartId && !partIds.has(mouthPartId)) add("lipsync_part_missing");

    const layeredExpressions = isRecord(layered.expressions) ? layered.expressions : {};
    if (layered.expressions != null && !isRecord(layered.expressions)) {
      add("layered_expressions_not_object");
    }
    const layeredExpressionIds = new Set(Object.keys(layeredExpressions));
    if (layeredExpressionIds.size > LIMITS.expressions) add("too_many_layered_expressions");
    layeredExpressionIds.forEach((id) => checkId(id, `invalid_layered_expression:${id}`));

    if (layered.actionBindings != null && !isRecord(layered.actionBindings)) {
      add("layered_bindings_not_object");
    } else {
      for (const [rawActionId, binding] of Object.entries(layered.actionBindings || {})) {
        const actionId = checkId(rawActionId, `invalid_layered_binding_action:${rawActionId}`);
        if (actionId && !actionIds.has(actionId)) add(`layered_binding_action_missing:${actionId}`);
        if (!isRecord(binding)) {
          add(`layered_binding_not_object:${actionId || rawActionId}`);
          continue;
        }
        const expressionId = checkId(
          binding.expression,
          `invalid_layered_binding_expression:${actionId || rawActionId}`,
          true
        );
        if (parts.length && expressionId && !layeredExpressionIds.has(expressionId)) {
          add(`layered_binding_expression_missing:${actionId || rawActionId}`);
        }
      }
    }
  }

  if (pack.persona != null && !isRecord(pack.persona)) {
    add("persona_not_object");
  } else if (pack.persona?.avatarId) {
    checkId(pack.persona.avatarId, "invalid_avatar_id");
  }

  return { ok: errors.length === 0, errors };
}

export function avatarStateToPackDraft(avatarState, { name = "月栖角色", id = "" } = {}) {
  const looks = (avatarState?.looks || []).map((look) => ({
    id: look.id,
    name: look.name,
    description: look.description || "",
    mediaId: look.mediaId || "",
    fileName: look.fileName || "",
    asset: look.mediaId ? `assets/looks/${look.id}${extFromName(look.fileName)}` : "",
  }));
  const actions = (avatarState?.actions || []).map((action) => ({
    id: action.id,
    name: action.name,
    type: action.type || "image",
    mediaId: action.mediaId || "",
    fileName: action.fileName || "",
    loop: Boolean(action.loop),
    durationMs: action.durationMs || 0,
    priority: action.priority || 0,
    interruptible: action.interruptible !== false,
    fallback: action.fallback || "",
    triggers: action.triggers || [],
    timeline: action.timeline || null,
    asset: action.mediaId ? `assets/actions/${action.id}${extFromName(action.fileName)}` : "",
  }));

  return {
    manifest: {
      ...createEmptyPackManifest({
        id: id || `pack-${avatarState?.avatarId || "character"}`,
        name,
        version: avatarState?.packMeta?.version || "1.0.0",
      }),
      defaultLook: avatarState?.currentLookId || "home_casual",
    },
    persona: { avatarId: avatarState?.avatarId || "" },
    looks,
    actions,
    expressions: avatarState?.expressions || [],
    sceneTriggers: avatarState?.sceneTriggers || [],
    display: avatarState?.display || {},
    renderMode: avatarState?.renderMode || "auto",
    layered: avatarState?.layered
      ? {
          ...avatarState.layered,
          parts: (avatarState.layered.parts || []).map((part) => ({
            ...part,
            asset: part.mediaId
              ? `assets/layers/${part.id}${extFromName(part.fileName)}`
              : "",
          })),
        }
      : null,
    voice: {},
    packMeta: avatarState?.packMeta || {},
    assets: {},
    _allowMissingAssets: true,
  };
}

function extFromName(name = "") {
  const match = String(name).match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : ".png";
}
