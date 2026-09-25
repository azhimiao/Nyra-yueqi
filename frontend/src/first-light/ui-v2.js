/**
 * First Light V2 questionnaire renderer. Pure HTML + field list; optional DOM mount.
 */

import { FL_V2_STAGES, canAdvance, stagesForPath } from "./state-v2.js";

const FIELD_BY_STAGE = Object.freeze({
  IDENTITY: [
    {
      name: "character.name",
      label: "ta叫什么名字？",
      description: "这是角色的正式名字。以后新建角色会单独设置。",
      kind: "text",
      placeholder: "例如：Nyra",
      required: true,
    },
    {
      name: "character.genderIdentity",
      label: "ta怎样理解自己的性别？",
      description: "只决定自称和代词。没选定前用 ta，不会先假定男女。",
      kind: "choice",
      required: true,
      options: ["female", "male", "nonbinary", "unset"],
    },
  ],
  USER_ADDRESS: [
    {
      name: "preference.callUserAs",
      label: "你希望ta怎么叫你？",
      description: "这是ta对你的叫法，不是角色的第二个名字。可以是名字、昵称，或只写“你”。",
      kind: "text",
      placeholder: "例如：阿栖、宝贝、你",
      required: true,
    },
  ],
  RELATIONSHIP: [
    {
      name: "preference.relationshipType",
      label: "你希望你们从什么关系开始？",
      description: "这里只决定相处起点，不会伪造你们已经共同经历过的事情。",
      kind: "choice",
      required: true,
      options: ["lover", "friend", "family", "partner", "roleplay", "undefined"],
    },
  ],
  PURPOSES: [
    {
      name: "preference.purposes",
      label: "你更希望ta在哪些时候陪着你？",
      description: "最多选三项。之后可以随时调整。",
      kind: "multi-choice",
      required: true,
      max: 3,
      options: ["daily", "romance", "listen", "grow", "create", "roleplay", "assist", "unsure"],
    },
  ],
  SUPPORT_INITIATIVE: [
    {
      name: "preference.supportStyle",
      label: "你难受时，希望ta先怎么陪你？",
      description: "这是ta靠近你的第一反应，不会限制之后继续聊天和解决问题。",
      kind: "choice",
      required: true,
      options: ["hold", "quiet", "clarify", "distract", "judge"],
    },
    {
      name: "preference.initiativeStyle",
      label: "ta主动找你时，你希望是什么感觉？",
      description: "白天大约每两小时会来一句，夜里安静时段不会打扰。这里只选语气，不决定ta能不能来找你。",
      kind: "choice",
      required: true,
      options: ["reach", "occasional", "wait", "situational"],
    },
  ],
  CAREFUL_STYLES: [
    {
      name: "preference.intimacyStyle",
      label: "你喜欢怎样的亲密感？",
      description: "决定日常相处的距离感，不代表关系已经发展到某个阶段。",
      kind: "choice",
      options: ["warm", "intense", "easy", "mature", "occasional"],
    },
    {
      name: "preference.flirtLevel",
      label: "ta可以多主动地表达暧昧？",
      description: "关闭时，ta不会主动用调情方式推进关系。",
      kind: "choice",
      options: ["off", "light", "open"],
    },
    {
      name: "preference.conflictStyle",
      label: "意见不同时，ta应该怎样说？",
      description: "选择ta表达不同意见和修复冲突的方式。",
      kind: "choice",
      options: ["direct", "gentle", "understand", "agree"],
    },
    {
      name: "preference.autonomyPreference",
      label: "你希望ta有多强的主见？",
      description: "自主性是ta能否保留自己的判断，不等于未经允许替你做事。",
      kind: "choice",
      options: ["attune", "balanced", "stance"],
    },
    {
      name: "preference.sharedHistory",
      label: "你们有约定好的共同背景吗？",
      description: "可选。只写你明确设定的背景；留空就从现在开始认识。",
      kind: "textarea",
      placeholder: "例如：我们曾在同一个研究项目中共事。",
    },
    {
      name: "preference.values",
      label: "你希望这个新角色特别看重什么？",
      description: "可选。只用于你正在塑造的新角色，不会覆盖导入角色的完整人格。",
      kind: "list-text",
      placeholder: "例如：诚实、尊重边界、保持好奇",
    },
  ],
  BOUNDARIES: [
    {
      name: "preference.nudgePolicy",
      label: "需要提醒你时，ta可以多直接？",
      description: "例如提醒休息、计划或约定。关闭后不会主动督促。",
      kind: "choice",
      options: ["off", "gentle", "direct"],
    },
    {
      name: "preference.quietHours",
      label: "每天什么时候不主动打扰你？",
      description: "这段时间ta不会主动发通知，但你仍然可以随时找ta。",
      kind: "quiet-hours",
    },
    {
      name: "preference.hardBoundaries",
      label: "还有哪些事是ta绝对不能做的？",
      description: "可选。用逗号或换行分开；没有其他要求可以留空。",
      kind: "list-text",
      placeholder: "例如：不要用冷暴力；不要替我做重大决定",
    },
    {
      name: "preference.autoDiary",
      label: "允许ta自动整理日记",
      description: "只记录真实发生的聊天和生活事件，不会凭空编造经历。",
      kind: "boolean",
    },
    {
      name: "preference.autoMoments",
      label: "允许ta自动发布动态",
      description: "仅在满足发布规则时执行；关闭后只能由你主动发起。",
      kind: "boolean",
    },
  ],
  IMPORT_REVIEW: [
    {
      name: "importedCharacterId",
      label: "选择一个已有角色，或粘贴 / 上传角色卡",
      description: "可以填写人设，也可以上传 .nychar / JSON / 角色卡图片。导入只建立这段关系，不覆盖原人格。ta会在月栖里发出第一句。",
      kind: "character-choice",
      required: true,
    },
  ],
});

export function fieldsForStage(stage) {
  return FIELD_BY_STAGE[stage] || [];
}

export function renderFirstLightV2(state) {
  const stage = state?.stage || "BOOT";
  const path = state?.path || "";
  const fields = fieldsForStage(stage);
  const actions = ["BACK", "NEXT", "PAUSE"];
  if (stage === "PATH_SELECT") actions.unshift("SELECT_PATH");
  if (stage === "IMPORT_REVIEW") actions.push("OPEN_IMPORTER");
  const html = [
    `<section class="first-light-v2" data-fl-v2-stage="${stage}" data-fl-v2-path="${path}">`,
    `<p class="first-light-v2__stage">${stage}</p>`,
    ...fields.map((field) => `<label><span>${field.label}</span><input name="${field.name}" data-fl-field="${field.name}" /></label>`),
    `<div class="first-light-v2__actions">`,
    `<button type="button" data-fl-action="BACK">上一步</button>`,
    `<button type="button" data-fl-action="NEXT"${canAdvance(state) ? "" : " disabled"}>继续</button>`,
    `</div></section>`,
  ].join("");
  return {
    stage,
    path,
    fields,
    actions,
    canAdvance: canAdvance(state),
    stages: path ? stagesForPath(path) : [...FL_V2_STAGES],
    html,
    openImporter: stage === "IMPORT_REVIEW",
  };
}

export function collectFieldValues(root) {
  const values = {};
  if (!root?.querySelectorAll) return values;
  root.querySelectorAll("[data-fl-field]").forEach((node) => {
    values[node.getAttribute("data-fl-field")] = node.value;
  });
  return values;
}

export function estimatedMinutesForPath(path) {
  return path === "careful" ? 7 : 2;
}

export function mountFirstLightV2(host, state, onAction) {
  if (!host || typeof host !== "object") return renderFirstLightV2(state);
  const view = renderFirstLightV2(state);
  if (typeof host.innerHTML === "string" || "innerHTML" in host) {
    host.innerHTML = view.html;
    host.querySelectorAll?.("[data-fl-action]")?.forEach((button) => {
      button.addEventListener("click", () => onAction?.(button.getAttribute("data-fl-action"), collectFieldValues(host)));
    });
  }
  return view;
}
