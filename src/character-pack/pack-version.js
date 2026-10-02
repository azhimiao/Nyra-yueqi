import { migrateAvatarState } from "../avatar/looks-model.js";

const MAX_HISTORY = 5;

function snapshotMeta(state) {
  return {
    version: state?.packMeta?.version || "0.0.0",
    name: state?.packMeta?.name || "未命名",
    savedAt: new Date().toISOString(),
    lookCount: (state?.looks || []).length,
    actionCount: (state?.actions || []).length,
  };
}

/** Deep-ish clone of avatar config (no Blob). */
export function cloneAvatarConfig(state) {
  return JSON.parse(JSON.stringify(migrateAvatarState(state)));
}

export function bumpPackVersion(version = "1.0.0", kind = "patch") {
  const parts = String(version || "1.0.0").split(".").map((n) => Number(n) || 0);
  while (parts.length < 3) parts.push(0);
  if (kind === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (kind === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  return parts.join(".");
}

/**
 * Push current state into history before applying a new pack.
 */
export function pushPackHistory(state, reason = "upgrade") {
  const history = Array.isArray(state.packHistory) ? [...state.packHistory] : [];
  history.unshift({
    reason,
    meta: snapshotMeta(state),
    snapshot: cloneAvatarConfig(state),
  });
  return {
    ...state,
    packHistory: history.slice(0, MAX_HISTORY),
  };
}

export function listPackHistory(state) {
  return (state?.packHistory || []).map((item, index) => ({
    index,
    reason: item.reason,
    ...item.meta,
  }));
}

export function rollbackPack(state, historyIndex = 0) {
  const entry = state?.packHistory?.[historyIndex];
  if (!entry?.snapshot) {
    throw new Error("没有可回滚的版本");
  }
  const restored = migrateAvatarState(entry.snapshot);
  // Keep history but mark rollback
  const history = [...(state.packHistory || [])];
  return {
    ...restored,
    packHistory: history,
    packMeta: {
      ...(restored.packMeta || {}),
      ...(state.packMeta || {}),
      version: entry.meta?.version || restored.packMeta?.version || "1.0.0",
      rolledBackAt: new Date().toISOString(),
    },
  };
}

export function applyPackUpgrade(currentState, nextState, { reason = "upgrade", version } = {}) {
  const withHistory = pushPackHistory(currentState, reason);
  const migrated = migrateAvatarState(nextState);
  const nextVersion = version
    || bumpPackVersion(currentState?.packMeta?.version || "1.0.0", "minor");
  return {
    ...migrated,
    packHistory: withHistory.packHistory,
    packMeta: {
      id: migrated.packMeta?.id || currentState?.packMeta?.id || `pack-${migrated.avatarId}`,
      name: migrated.packMeta?.name || currentState?.packMeta?.name || "角色包",
      version: nextVersion,
      installedAt: new Date().toISOString(),
    },
  };
}

export function deliveryChecklist(state) {
  const looks = state?.looks || [];
  const actions = state?.actions || [];
  const expressions = state?.expressions || [];
  const requiredActions = ["idle_default", "talking_default", "comfort"];
  const checks = [
    {
      id: "has_look",
      label: "至少一个带素材的外表",
      ok: looks.some((look) => look.mediaId),
    },
    {
      id: "idle",
      label: "含 idle_default 动作",
      ok: actions.some((action) => action.id === "idle_default"),
    },
    {
      id: "talking",
      label: "含 talking_default 动作",
      ok: actions.some((action) => action.id === "talking_default"),
    },
    {
      id: "comfort",
      label: "含 comfort（主动/安慰）动作",
      ok: actions.some((action) => action.id === "comfort"),
    },
    {
      id: "action_media",
      label: "必需动作（idle/talking/comfort）均已绑定素材",
      ok: requiredActions.every((id) => {
        const action = actions.find((item) => item.id === id);
        if (!action) return false;
        const hasMedia = Boolean(action.mediaId);
        const hasTimelineMedia = ["enter", "loop", "exit"].some(
          (stage) => Boolean(action.timeline?.[stage]?.mediaId)
        );
        return hasMedia || hasTimelineMedia;
      }),
    },
    {
      id: "pet_actions",
      label: "多动作桌宠就绪（sleep_pose / greet / selfie）",
      ok: ["sleep_pose", "greet", "selfie"].every((id) => actions.some((action) => action.id === id)),
    },
    {
      id: "expressions",
      label: "表情映射不少于 2 条",
      ok: expressions.length >= 2,
    },
    {
      id: "scenes",
      label: "含 proactive 场景触发",
      ok: (state?.sceneTriggers || []).some((item) => item.scene === "proactive"),
    },
    {
      id: "version",
      label: "packMeta.version 已填写",
      ok: Boolean(state?.packMeta?.version),
    },
  ];
  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}
