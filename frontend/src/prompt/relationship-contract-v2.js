/**
 * Private user×character relationship contract for Prompt.
 * default/skipped fields are not phrased as user consent.
 */

import { isExplicit } from "../contracts/companion-v2-shared.js";

function isEnglish(lang) {
  return String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
}

function slot(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

function shown(field) {
  if (!field || typeof field !== "object") return false;
  return isExplicit(field) || field.source === "import_review";
}

function valueOf(field) {
  if (field && typeof field === "object" && Object.hasOwn(field, "value")) return field.value;
  return field;
}

/**
 * @param {object} preference UserCompanionPreferenceV2-like
 * @param {object} [lang]
 */
export function buildRelationshipContractV2(preference = {}, lang) {
  if (!preference || typeof preference !== "object") return "";
  const en = isEnglish(lang);
  const lines = en
    ? ["[User × Character relationship — private, not part of a shareable character card]"]
    : ["【用户×角色关系契约 — 仅当前用户可见，不随角色卡导出】"];

  const callUserAs = slot(preference, "userIdentity.callUserAs");
  if (shown(callUserAs) && String(valueOf(callUserAs) || "").trim()) {
    lines.push(en
      ? `Address the user as “${String(valueOf(callUserAs)).trim()}”.`
      : `称呼用户为「${String(valueOf(callUserAs)).trim()}」。`);
  }
  const userPronouns = slot(preference, "userIdentity.pronouns");
  if (shown(userPronouns)) {
    const list = Array.isArray(valueOf(userPronouns)) ? valueOf(userPronouns) : [];
    if (list.length) {
      lines.push(en ? `User pronouns: ${list.join(", ")}.` : `用户代词：${list.join("、")}。`);
    }
  }
  const relType = slot(preference, "relationship.type");
  if (shown(relType) && String(valueOf(relType) || "").trim()) {
    lines.push(en
      ? `Agreed relationship type: ${String(valueOf(relType)).trim()}. This is a chosen setup, not a lived off-platform history.`
      : `约定关系类型：${String(valueOf(relType)).trim()}。这是双方设定，不是产品外真实经历。`);
  }
  const purposes = slot(preference, "relationship.purposes");
  if (shown(purposes)) {
    const list = Array.isArray(valueOf(purposes)) ? valueOf(purposes) : [];
    if (list.length) {
      lines.push(en ? `Companion purposes: ${list.join(", ")}.` : `陪伴目的：${list.join("、")}。`);
    }
  }
  const support = slot(preference, "interaction.supportStyle");
  if (shown(support) && String(valueOf(support) || "").trim()) {
    lines.push(en ? `Support style: ${String(valueOf(support)).trim()}.` : `支持方式：${String(valueOf(support)).trim()}。`);
  }
  const initiative = slot(preference, "interaction.initiativeStyle");
  if (shown(initiative) && String(valueOf(initiative) || "").trim()) {
    lines.push(en ? `Initiative: ${String(valueOf(initiative)).trim()}.` : `主动频率：${String(valueOf(initiative)).trim()}。`);
  }
  const conflict = slot(preference, "interaction.conflictRepairStyle")
    || slot(preference, "interaction.conflictStyle");
  if (shown(conflict) && String(valueOf(conflict) || "").trim()) {
    lines.push(en ? `Conflict repair: ${String(valueOf(conflict)).trim()}.` : `冲突修复：${String(valueOf(conflict)).trim()}。`);
  }
  const intimacy = slot(preference, "interaction.intimacyStyle");
  if (shown(intimacy) && String(valueOf(intimacy) || "").trim()) {
    lines.push(en ? `Intimacy style: ${String(valueOf(intimacy)).trim()}.` : `亲密风格：${String(valueOf(intimacy)).trim()}。`);
  }
  const flirt = slot(preference, "interaction.flirtLevel");
  if (shown(flirt)) {
    lines.push(en ? `Flirt level: ${String(valueOf(flirt) || "off")}.` : `调情强度：${String(valueOf(flirt) || "off")}。`);
  } else {
    lines.push(en
      ? "Flirt is not explicitly enabled; keep it off."
      : "调情未明确开启，保持关闭。");
  }
  const nudge = slot(preference, "interaction.nudgePolicy");
  if (!shown(nudge) || String(valueOf(nudge) || "off") === "off") {
    lines.push(en ? "Do not nag or pressure; nudge is off unless explicitly enabled." : "未明确允许督促时不要催促或施压。");
  } else {
    lines.push(en ? `Nudge policy: ${String(valueOf(nudge))}.` : `督促策略：${String(valueOf(nudge))}。`);
  }
  const jealous = slot(preference, "boundaries.allowJealousExpression");
  if (!shown(jealous) || valueOf(jealous) !== true) {
    lines.push(en
      ? "Do not use jealousy, guilt, or isolation of real-world relationships."
      : "禁止用嫉妒、愧疚或隔离现实关系来挽留用户。");
  }
  const hard = slot(preference, "boundaries.userHardBoundaries");
  if (shown(hard)) {
    const list = Array.isArray(valueOf(hard)) ? valueOf(hard) : [];
    if (list.length) {
      lines.push(en ? `User hard boundaries: ${list.join("; ")}.` : `用户硬边界：${list.join("；")}。`);
    }
  }
  const quiet = slot(preference, "boundaries.quietHours");
  if (shown(quiet) && valueOf(quiet) && typeof valueOf(quiet) === "object") {
    const hours = valueOf(quiet);
    lines.push(en
      ? `Quiet hours: ${hours.start || "?"}–${hours.end || "?"}.`
      : `免打扰：${hours.start || "?"}–${hours.end || "?"}。`);
  }
  const shared = slot(preference, "relationship.sharedHistory");
  if (shown(shared) && String(valueOf(shared) || "").trim()) {
    lines.push(en
      ? `Agreed fictional shared setup (not a real memory): ${String(valueOf(shared)).trim()}`
      : `双方约定的共同设定（不是真实发生过的事）：${String(valueOf(shared)).trim()}`);
  }
  lines.push(en
    ? "Please the user by remembering stated preferences and boundaries, while keeping your own judgment. Do not agree with everything."
    : "取悦用户是指记住其明确偏好与边界，同时保留自己的判断；不要凡事附和。");
  return lines.join("\n");
}

export function relationshipCoverageKeys() {
  return Object.freeze([
    "callUserAs",
    "relationshipType",
    "purposes",
    "supportStyle",
    "initiativeStyle",
    "conflictStyle",
    "intimacyStyle",
    "flirtLevel",
    "nudgePolicy",
    "allowJealousy",
    "hardBoundaries",
    "quietHours",
    "sharedHistory",
  ]);
}
