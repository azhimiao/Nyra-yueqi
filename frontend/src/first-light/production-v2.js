/** Production First Light V2 boot and questionnaire surface. */

import { hasOnboardingDone } from "../onboarding/prefs.js";
import { loadAutonomyPrefs } from "../companion/autonomy-prefs.js";
import {
  createCharacter,
  getActiveCharacterId,
  getCharacter,
  listCharacters,
  upsertCharacter,
} from "../characters/store.js";
import {
  installCharacterImport,
  messageForPortabilityError,
  prepareCharacterImport,
} from "../portability/index.js";
import { commitFirstLightV2 } from "./commit-v2.js";
import {
  FIRST_LIGHT_IMPORT_ACCEPT,
  characterRecordFromParsedCard,
  messageForImportIntake,
  parseImportedCharacterText,
} from "./import-intake.js";
import {
  createFirstLightControllerV2,
  hasFirstLightDoneV2,
} from "./controller-v2.js";
import {
  canAdvance,
  getField,
  stagesForPath,
} from "./state-v2.js";
import { fieldsForStage } from "./ui-v2.js";
import { migrateFirstLightV1Preference } from "./migration-v2.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fieldValue(state, name) {
  const field = getField(state, name);
  return field && typeof field === "object" && Object.hasOwn(field, "value") ? field.value : field;
}

const STAGE_COPY = Object.freeze({
  BOOT: {
    eyebrow: "FIRST LIGHT",
    title: "先让月栖认识你",
    body: "用几步轻量设置，决定ta如何称呼你、怎样陪伴你。之后随时可以修改。",
  },
  WELCOME: {
    eyebrow: "欢迎",
    title: "从一段舒服的相处开始",
    body: "接下来会问ta的名字、ta怎么叫你、关系和边界。没想好的可以先跳过，之后也能改。",
  },
  PATH_SELECT: {
    eyebrow: "设置方式",
    title: "你想怎样开始？",
    body: "新开始一段关系，或导入已有角色。",
  },
  IDENTITY: {
    eyebrow: "角色",
    title: "先确定ta是谁",
    body: "先问名字，再问ta怎样理解自己。代词由性别得出，不再单独问一层称呼。",
  },
  USER_ADDRESS: {
    eyebrow: "称呼",
    title: "ta应该怎样叫你？",
    body: "这是ta对你的叫法，不是角色的第二个名字。",
  },
  RELATIONSHIP: {
    eyebrow: "关系",
    title: "你们现在是什么关系？",
    body: "这是当前相处的起点，之后会随着真实相处变化。",
  },
  PURPOSES: {
    eyebrow: "陪伴",
    title: "你希望ta陪你做什么？",
    body: "可以选择多个方向，也可以先保持开放。",
  },
  SUPPORT_INITIATIVE: {
    eyebrow: "相处方式",
    title: "你喜欢怎样被陪伴？",
    body: "告诉ta你难过时先怎么陪，以及ta主动找你时更热情还是更克制。",
  },
  CAREFUL_STYLES: {
    eyebrow: "细节",
    title: "把重要的偏好说清楚",
    body: "这一页可以跳过。没有答案时，月栖会保持克制，等你们真实相处后再调整。",
  },
  BOUNDARIES: {
    eyebrow: "边界",
    title: "哪些事需要先得到允许？",
    body: "自动记录和免打扰时间由你决定。ta可以在白天主动来找你。",
  },
  IMPORT_REVIEW: {
    eyebrow: "导入",
    title: "导入你的角色",
    body: "可以粘贴人设或角色卡，也可以上传文件。导入后只建立这段关系，不会改掉角色原本的人格。ta会在月栖里发出第一句。",
  },
  PREVIEW: {
    eyebrow: "预览",
    title: "设置已经准备好了",
    body: "请看一眼，再决定是否保存。保存后仍可在角色设置中修改。",
  },
  COMMIT: {
    eyebrow: "确认",
    title: "把这段关系保存下来",
    body: "确认后，设置才会写入当前角色和你们的关系。",
  },
  FIRST_MESSAGE: {
    eyebrow: "完成",
    title: "可以开始聊天了",
    body: "从一句真实的话开始，不需要预先编造共同经历。",
  },
  PAUSED: {
    eyebrow: "已暂停",
    title: "设置还没有完成",
    body: "你的进度已经保存。准备好时可以从刚才的位置继续。",
  },
  ERROR: {
    eyebrow: "需要重试",
    title: "这次设置没有保存成功",
    body: "可以返回继续，或重新打开这一段设置。",
  },
});

const OPTION_COPY = Object.freeze({
  "character.genderIdentity": {
    female: ["女性", "以女性身份理解自己，代词用她"],
    male: ["男性", "以男性身份理解自己，代词用他"],
    nonbinary: ["非二元", "不限定为男性或女性，代词用 ta"],
    unset: ["暂不设定", "先不假定男女，代词用 ta"],
  },
  "preference.relationshipType": {
    lover: ["恋人", "从亲密关系开始，具体共同经历从现在形成"],
    friend: ["朋友", "轻松相处、互相陪伴"],
    family: ["家人式陪伴", "安定、照顾和归属感"],
    partner: ["长期搭档", "一起生活、一起推进事情"],
    roleplay: ["角色扮演关系", "按双方明确的设定相处"],
    undefined: ["暂时不定义", "先认识彼此，之后再决定"],
  },
  "preference.purposes": {
    daily: ["日常陪伴"], romance: ["恋爱与亲密"], listen: ["倾听和理解"], grow: ["一起成长"],
    create: ["共同创作"], roleplay: ["角色扮演"], assist: ["生活协助"], unsure: ["我还不确定"],
  },
  "preference.supportStyle": {
    hold: ["先安慰我", "先接住情绪，再慢慢聊"],
    quiet: ["安静陪着", "少说一点，但不要离开"],
    clarify: ["帮我理清", "一起拆开问题，找出下一步"],
    distract: ["带我换换心情", "主动提议做点别的"],
    judge: ["看情况判断", "根据我当时的状态选择方式"],
  },
  "preference.initiativeStyle": {
    reach: ["主动来找我", "语气更热情，会先开口"],
    occasional: ["偶尔问一句", "保持关心，但不过分黏人"],
    wait: ["等我回来", "语气更克制，先顺着你的节奏"],
    situational: ["看当时情况", "根据关系和近期状态判断"],
  },
  "preference.intimacyStyle": {
    warm: ["温柔稳定"], intense: ["热烈黏人"], easy: ["轻松自然"], mature: ["成熟克制"], occasional: ["平时克制，偶尔热烈"],
  },
  "preference.flirtLevel": {
    off: ["不主动调情"], light: ["轻微暧昧"], open: ["可以直接表达"],
  },
  "preference.conflictStyle": {
    direct: ["直接告诉我"], gentle: ["温和地说"], understand: ["先理解，再讨论"], agree: ["多数时候先顺着我"],
  },
  "preference.autonomyPreference": {
    attune: ["更贴合我的需要", "优先回应你的节奏和情绪"],
    balanced: ["理解我，也保留想法", "会陪你，也会诚实表达"],
    stance: ["有更强的个人立场", "有主见，但不会故意对抗"],
  },
  "preference.nudgePolicy": {
    off: ["不主动提醒"], gentle: ["温和提醒"], direct: ["直接提醒"],
  },
});

const SUMMARY_LABELS = Object.freeze({
  lover: "恋人", friend: "朋友", family: "家人式陪伴", partner: "长期搭档", roleplay: "角色扮演关系", undefined: "暂时不定义",
  daily: "日常陪伴", romance: "恋爱与亲密", listen: "倾听和理解", grow: "一起成长", create: "共同创作", assist: "生活协助", unsure: "还不确定",
});

function stageCopy(stage) {
  return STAGE_COPY[stage] || { eyebrow: "设置", title: "继续完善你们的相处", body: "这些设置之后都可以调整。" };
}

function userFacingCommitError(reason) {
  const copy = {
    backend_failed: "本机存储暂时没有响应。你的填写已保留，可以稍后再试。",
    quota_exceeded: "本机存储空间不足。请清理一些空间后再试。",
    conflict: "这份设置刚刚被另一处更新，请返回检查后再保存。",
    journal_corrupt: "本机存储需要恢复。请重新打开设置后再试。",
    missing_character_id: "还没有找到要保存的角色，请返回重新选择。",
  };
  return copy[String(reason || "").trim()] || "设置没有保存成功，你的填写已保留，请稍后再试。";
}

function fieldLabel(field) {
  return field.label || field.name;
}

function optionCopy(fieldName, option) {
  const copy = OPTION_COPY[fieldName]?.[option];
  return {
    label: copy?.[0] || SUMMARY_LABELS[option] || option,
    hint: copy?.[1] || "",
  };
}

function renderChoice(field, value, { multiple = false } = {}) {
  const selected = new Set(Array.isArray(value) ? value.map(String) : [String(value ?? "")]);
  const options = (field.options || []).map((option) => {
    const id = String(option);
    const copy = optionCopy(field.name, id);
    const isSelected = selected.has(id);
    const attr = multiple ? "data-fl-multi-field" : "data-fl-choice-field";
    return `<button type="button" class="first-light-v2__choice${isSelected ? " is-selected" : ""}" ${attr}="${esc(field.name)}" data-fl-option="${esc(id)}" role="${multiple ? "checkbox" : "radio"}" aria-checked="${isSelected ? "true" : "false"}"><span><strong>${esc(copy.label)}</strong>${copy.hint ? `<small>${esc(copy.hint)}</small>` : ""}</span><i aria-hidden="true"></i></button>`;
  }).join("");
  return `<div class="first-light-v2__choices${(field.options || []).length > 4 ? " is-compact" : ""}" role="${multiple ? "group" : "radiogroup"}">${options}</div>`;
}

function booleanChoiceCopy(fieldName) {
  if (fieldName === "preference.autoDiary") {
    return {
      yes: ["允许", "ta可以在真实发生过的事后，帮你整理成日记"],
      no: ["暂不允许", "日记只在你主动写下或要求时出现"],
    };
  }
  if (fieldName === "preference.autoMoments") {
    return {
      yes: ["允许", "满足发布规则时，ta可以自己发一条动态"],
      no: ["暂不允许", "动态只由你发起，ta不会自己发"],
    };
  }
  return {
    yes: ["允许", "按这一项的说明执行"],
    no: ["暂不允许", "先关掉，之后仍可以改"],
  };
}

function renderBooleanChoice(field, value) {
  const selected = value === true ? "yes" : value === false ? "no" : "";
  const copy = booleanChoiceCopy(field.name);
  const choices = [
    { id: "yes", value: "true", label: copy.yes[0], hint: copy.yes[1] },
    { id: "no", value: "false", label: copy.no[0], hint: copy.no[1] },
  ];
  return `<div class="first-light-v2__choices" role="radiogroup">${choices.map((item) => `<button type="button" class="first-light-v2__choice${selected === item.id ? " is-selected" : ""}" data-fl-boolean-field="${esc(field.name)}" data-fl-value="${item.value}" role="radio" aria-checked="${selected === item.id ? "true" : "false"}"><span><strong>${item.label}</strong><small>${item.hint}</small></span><i aria-hidden="true"></i></button>`).join("")}</div>`;
}

function renderSwitch(field, value) {
  const on = value === true;
  return `<button type="button" class="first-light-v2__switch-row${on ? " is-on" : ""}" data-fl-toggle-field="${esc(field.name)}" role="switch" aria-checked="${on ? "true" : "false"}"><span>${on ? "已允许" : "未允许"}</span><i aria-hidden="true"></i></button>`;
}

function renderQuietHours(field, value) {
  const start = String(value?.start || "22:00");
  const end = String(value?.end || "08:00");
  return `<div class="first-light-v2__time-range" data-fl-time-field="${esc(field.name)}"><label><span>开始</span><input type="time" value="${esc(start)}" data-fl-time="start"></label><span aria-hidden="true">至</span><label><span>结束</span><input type="time" value="${esc(end)}" data-fl-time="end"></label></div>`;
}

function renderCharacterChoices(field, value, characters = []) {
  if (!characters.length) {
    return `<p class="first-light-v2__inline-note">还没有可以导入的角色。请返回选择“开始设置”。</p>`;
  }
  return `<div class="first-light-v2__choices" role="radiogroup">${characters.map((character) => {
    const id = String(character?.id || "");
    const selected = id && id === String(value || "");
    return `<button type="button" class="first-light-v2__choice${selected ? " is-selected" : ""}" data-fl-character-id="${esc(id)}" role="radio" aria-checked="${selected ? "true" : "false"}"><span><strong>${esc(character?.name || "未命名角色")}</strong><small>${character?.source === "builtin" ? "月栖内置角色" : "已有独立角色"}</small></span><i aria-hidden="true"></i></button>`;
  }).join("")}</div>`;
}

function renderControl(field, value, context = {}) {
  const safe = Array.isArray(value) ? value.join("，") : value ?? "";
  if (field.kind === "choice") return renderChoice(field, value);
  if (field.kind === "multi-choice") return renderChoice(field, value, { multiple: true });
  if (field.kind === "boolean-choice") return renderBooleanChoice(field, value);
  if (field.kind === "boolean") return renderSwitch(field, value);
  if (field.kind === "quiet-hours") return renderQuietHours(field, value);
  if (field.kind === "character-choice") return renderCharacterChoices(field, value, context.characters);
  if (field.kind === "textarea") {
    return `<textarea data-fl-field="${esc(field.name)}" rows="3" placeholder="${esc(field.placeholder || "")}">${esc(safe)}</textarea>`;
  }
  return `<input type="text" size="1" data-fl-field="${esc(field.name)}" value="${esc(safe)}" placeholder="${esc(field.placeholder || "")}"${field.required ? " required" : ""}>`;
}

function renderField(field, state, context, { solo = false } = {}) {
  const value = fieldValue(state, field.name);
  const optional = !field.required;
  const control = renderControl(field, value, context);
  if (solo) {
    return `<section class="first-light-v2__field is-solo" data-fl-field-wrap="${esc(field.name)}">${field.description ? `<p>${esc(field.description)}</p>` : ""}${control}</section>`;
  }
  return `<section class="first-light-v2__field" data-fl-field-wrap="${esc(field.name)}"><div class="first-light-v2__field-heading"><h2>${esc(fieldLabel(field))}</h2><span>${optional ? "可选" : "必填"}</span></div>${field.description ? `<p>${esc(field.description)}</p>` : ""}${control}</section>`;
}

function renderSummary(state) {
  const rows = [
    ["角色名字", fieldValue(state, "character.name")],
    ["ta怎么叫你", fieldValue(state, "preference.callUserAs")],
    ["关系", fieldValue(state, "preference.relationshipType")],
    ["陪伴", fieldValue(state, "preference.purposes")],
  ].filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length));
  if (!rows.length) return `<p class="first-light-v2__empty">你还没有填写需要预览的内容。</p>`;
  return `<dl class="first-light-v2__summary">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(Array.isArray(value) ? value.map((item) => SUMMARY_LABELS[item] || item).join("、") : SUMMARY_LABELS[value] || value)}</dd></div>`).join("")}</dl>`;
}

function renderProgress(stage, path) {
  const stages = path ? stagesForPath(path) : [];
  const index = stages.indexOf(stage);
  if (index < 0) return "";
  return `<div class="first-light-v2__progress" aria-label="设置进度"><span>${index + 1} / ${stages.length - 1}</span><i style="--progress:${Math.round((index / Math.max(1, stages.length - 1)) * 100)}%"></i></div>`;
}

function renderPathNote(path) {
  const copy = {
    quick: "开始设置 · 必要项先填，亲密感和主见可以跳过",
    careful: "开始设置 · 必要项先填，亲密感和主见可以跳过",
    import: "导入角色 · 粘贴人设或上传文件，只建立这段关系",
  }[path];
  return copy ? `<p class="first-light-v2__path-note">${esc(copy)}</p>` : "";
}

function canAdvanceView(state) {
  return state?.stage === "BOUNDARIES" || canAdvance(state);
}

function renderBackButton(label = "上一步") {
  return `<button class="is-back" type="button" data-fl-action="BACK" aria-label="${esc(label)}" title="${esc(label)}">←</button>`;
}

function usableImportCharacters(characters = []) {
  return (characters || []).filter((character) => (
    character
    && !character.deletedAt
    && character.source !== "builtin"
  ));
}

function renderImportReview(state, context = {}) {
  const copy = stageCopy("IMPORT_REVIEW");
  const progress = renderProgress("IMPORT_REVIEW", state.path || "import");
  const selectedId = String(state.draft?.importedCharacterId || state.importedCharacterId || "");
  const library = usableImportCharacters(context.characters);
  const selected = library.find((character) => character.id === selectedId);
  const previewName = String(context.importPreview?.name || selected?.name || "").trim();
  const importText = String(context.importText || "");
  const error = String(context.importError || "");
  const busy = Boolean(context.importBusy);
  const libraryHtml = library.length
    ? `<p class="first-light-v2__import-or">或选择已有角色</p>${renderCharacterChoices({ name: "importedCharacterId" }, selectedId, library)}`
    : "";
  return `<section class="first-light-v2" data-fl-v2-stage="IMPORT_REVIEW" data-fl-v2-path="import"><header>${progress}<p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header><div class="first-light-v2__content"><section class="first-light-v2__import"><button type="button" class="first-light-v2__file-btn" data-fl-action="IMPORT_FILE"${busy ? " disabled" : ""}><strong>上传角色文件</strong><small>.nychar、JSON 或带角色卡的图片</small></button><input type="file" hidden data-fl-import-file accept="${esc(FIRST_LIGHT_IMPORT_ACCEPT)}"><p class="first-light-v2__import-or">或者填写</p><section class="first-light-v2__field"><div class="first-light-v2__field-heading"><h2>人设或角色卡</h2><span>必填</span></div><textarea data-fl-import-text rows="8" placeholder="粘贴角色卡 JSON，或直接写人设。第一行可以是名字。">${esc(importText)}</textarea></section>${previewName ? `<p class="first-light-v2__import-preview">已选用：${esc(previewName)}</p>` : ""}${error ? `<p class="first-light-v2__error">${esc(error)}</p>` : ""}${libraryHtml}</section></div><div class="first-light-v2__actions">${renderBackButton()}<button class="is-primary" type="button" data-fl-action="NEXT"${busy ? " disabled" : ""}>继续</button><button class="is-tertiary" type="button" data-fl-action="PAUSE">稍后</button></div></section>`;
}

function renderStageStatus(stage) {
  if (stage !== "PURPOSES") return "";
  return `<p class="first-light-v2__status" data-fl-status role="status" hidden>最多选择三项；如果还没想好，可以只选“我还不确定”。</p>`;
}

export function renderFirstLightV2Production(state, context = {}) {
  const stage = state?.stage || "BOOT";
  const path = state?.path || "";
  const copy = stageCopy(stage);
  const progress = renderProgress(stage, path);
  const pathNote = stage === "IDENTITY" ? renderPathNote(path) : "";
  if (stage === "PATH_SELECT") {
    return `<section class="first-light-v2" data-fl-v2-stage="PATH_SELECT"><header><p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header><div class="first-light-v2__paths"><button type="button" data-fl-path="careful"><strong>开始设置</strong><small>ta的名字、ta怎么叫你、关系和边界；细节可以跳过</small></button><button type="button" data-fl-path="import"><strong>导入角色</strong><small>粘贴人设或上传角色文件，只建立这段关系</small></button></div><div class="first-light-v2__actions">${renderBackButton()}<button class="is-tertiary" type="button" data-fl-action="PAUSE">稍后</button></div></section>`;
  }
  if (stage === "IMPORT_REVIEW") {
    return renderImportReview(state, context);
  }
  if (stage === "COMMIT") {
    return `<section class="first-light-v2" data-fl-v2-stage="COMMIT"><header>${progress}${pathNote}<p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header>${renderSummary(state)}<div class="first-light-v2__actions">${renderBackButton("返回修改")}<button class="is-primary" type="button" data-fl-action="COMMIT">保存设置</button></div></section>`;
  }
  if (stage === "PREVIEW" || stage === "FIRST_MESSAGE") {
    return `<section class="first-light-v2" data-fl-v2-stage="${esc(stage)}"><header>${progress}${pathNote}<p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header>${stage === "PREVIEW" ? renderSummary(state) : ""}<div class="first-light-v2__actions">${renderBackButton()}<button class="is-primary" type="button" data-fl-action="NEXT">继续</button></div></section>`;
  }
  if (stage === "PAUSED" || stage === "ERROR") {
    const message = stage === "ERROR" ? userFacingCommitError(state.errorMessage) : "";
    return `<section class="first-light-v2" data-fl-v2-stage="${esc(stage)}"><header><p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header>${message ? `<p class="first-light-v2__error">${esc(message)}</p>` : ""}<div class="first-light-v2__actions"><button type="button" data-fl-action="RESUME">继续设置</button><button type="button" data-fl-action="RESTART">重新开始</button></div></section>`;
  }
  const fields = fieldsForStage(stage);
  const solo = fields.length === 1;
  const body = fields.map((field) => renderField(field, state, context, { solo })).join("");
  const mark = stage === "BOOT" || stage === "WELCOME"
    ? `<p class="first-light-v2__welcome-mark" aria-hidden="true">月栖</p>`
    : "";
  const content = stage === "BOOT" || stage === "WELCOME"
    ? ""
    : `${body || `<p class="first-light-v2__empty">这一页没有额外问题，可以继续。</p>`}${renderStageStatus(stage)}`;
  return `<section class="first-light-v2" data-fl-v2-stage="${esc(stage)}" data-fl-v2-path="${esc(path)}"><header>${mark}${progress}${pathNote}<p class="first-light-v2__eyebrow">${esc(copy.eyebrow)}</p><h1>${esc(copy.title)}</h1><p class="first-light-v2__body">${esc(copy.body)}</p></header><div class="first-light-v2__content">${content}</div><div class="first-light-v2__actions">${stage === "BOOT" ? "" : renderBackButton()}<button class="is-primary" type="button" data-fl-action="NEXT"${canAdvanceView(state) ? "" : " disabled"}>继续</button><button class="is-tertiary" type="button" data-fl-action="PAUSE">稍后</button></div></section>`;
}

function readNodeValue(node, field) {
  if (field?.kind === "list-text") {
    return String(node.value || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return node.value;
}

function createHost() {
  let host = document.querySelector("[data-first-light]");
  if (!host) {
    host = document.createElement("div");
    host.className = "first-light first-light-v2-host";
    host.setAttribute("data-first-light", "");
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    document.body.append(host);
  }
  return host;
}

export function mountFirstLightV2Production(options = {}) {
  const controller = options.controller || createFirstLightControllerV2();
  const host = options.host || createHost();
  let onComplete = options.onComplete;
  let state = controller.load();
  let characters = [];
  let committing = false;
  let importText = "";
  let importError = "";
  let importBusy = false;
  let importPreview = null;
  const api = {
    el: host,
    open() {
      state = controller.load();
      host.hidden = false;
      host.classList.add("is-open");
      document.documentElement.classList.add("first-light-active");
      renderView();
      void refreshCharacterChoices();
      return true;
    },
    close() {
      host.hidden = true;
      host.classList.remove("is-open");
      document.documentElement.classList.remove("first-light-active");
    },
    destroy() {
      api.close();
      host.remove();
    },
    setOnComplete(handler) { onComplete = handler; },
  };

  async function commit() {
    if (committing) return;
    committing = true;
    host.setAttribute("aria-busy", "true");
    const commitButton = host.querySelector('[data-fl-action="COMMIT"]');
    if (commitButton) {
      commitButton.disabled = true;
      commitButton.textContent = "正在保存…";
    }
    try {
      if (state.path === "import") {
        const importedCharacterId = String(state.draft?.importedCharacterId || state.importedCharacterId || "").trim();
        if (!importedCharacterId) {
          state = controller.dispatch({ type: "FAIL", reason: "missing_character_id" });
          renderView();
          return;
        }
        const existingCharacter = await getCharacter(importedCharacterId);
        if (!existingCharacter) {
          state = controller.dispatch({ type: "FAIL", reason: "missing_character_id" });
          renderView();
          return;
        }
        const result = await commitFirstLightV2(state, {
          characterId: importedCharacterId,
          existingCharacter,
        });
        if (!result.ok) {
          state = controller.dispatch({ type: "FAIL", reason: result.reason });
          renderView();
          return;
        }
        state = controller.dispatch({ type: "COMMIT_OK", characterId: importedCharacterId });
        state = controller.dispatch({ type: "NEXT" });
        renderView();
        api.close();
        onComplete?.({ ...result, characterId: importedCharacterId });
        return;
      }
      let characterId = String(getActiveCharacterId() || "").trim();
      let existingCharacter = characterId ? await getCharacter(characterId) : null;
      if (!existingCharacter) {
        existingCharacter = await createCharacter({ name: fieldValue(state, "character.name") || "" });
        characterId = existingCharacter.id;
      }
      const result = await commitFirstLightV2(state, { characterId, existingCharacter });
      if (!result.ok) {
        state = controller.dispatch({ type: "FAIL", reason: result.reason });
        renderView();
        return;
      }
      state = controller.dispatch({ type: "COMMIT_OK", characterId });
      state = controller.dispatch({ type: "NEXT" });
      renderView();
      api.close();
      onComplete?.({ ...result, characterId });
    } catch (error) {
      const reason = error?.code || error?.message || "backend_failed";
      console.warn("First Light V2 commit failed", error);
      state = controller.dispatch({ type: "FAIL", reason });
      renderView();
    } finally {
      committing = false;
      host.removeAttribute("aria-busy");
    }
  }

  function dispatch(event) {
    state = controller.dispatch(event);
    renderView();
  }

  function setField(name, value, { rerender = true, source = "explicit" } = {}) {
    state = controller.dispatch({ type: "SET_FIELD", path: name, value, source });
    if (rerender) renderView();
    else {
      const nextButton = host.querySelector('[data-fl-action="NEXT"]');
      if (nextButton) nextButton.disabled = !canAdvanceView(state);
    }
  }

  function captureImportForm() {
    const text = host.querySelector("[data-fl-import-text]")?.value;
    if (text != null) importText = text;
  }

  function applyImportedCharacter(character) {
    importError = "";
    importPreview = {
      id: String(character?.id || ""),
      name: String(character?.name || "未命名角色"),
    };
    setField("importedCharacterId", character.id, { rerender: false });
    if (character?.name) {
      setField("character.name", character.name, { rerender: true, source: "import_review" });
      return;
    }
    renderView();
  }

  async function ingestPastedText(text) {
    const parsed = parseImportedCharacterText(text);
    if (!parsed.ok) {
      importError = messageForImportIntake(parsed.reason);
      renderView();
      return false;
    }
    const character = await upsertCharacter(characterRecordFromParsedCard(parsed.parsed));
    applyImportedCharacter(character);
    return true;
  }

  async function ingestImportFile(file) {
    if (!file || importBusy) return false;
    importBusy = true;
    importError = "";
    renderView();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const staged = await prepareCharacterImport(bytes, {
        fileName: file.name,
        mimeType: file.type,
      });
      const installed = await installCharacterImport(staged, { upsertCharacter });
      const character = await upsertCharacter({
        ...installed,
        skipOpeningIntro: false,
      });
      applyImportedCharacter(character);
      return true;
    } catch (error) {
      importError = messageForPortabilityError(error, "zh")
        || String(error?.message || messageForImportIntake("invalid_card"));
      return false;
    } finally {
      importBusy = false;
      const input = host.querySelector("[data-fl-import-file]");
      if (input) input.value = "";
      renderView();
    }
  }

  async function ensureImportedCharacter() {
    const importedId = String(state.draft?.importedCharacterId || state.importedCharacterId || "").trim();
    if (importedId) return true;
    captureImportForm();
    if (!String(importText || "").trim()) {
      importError = messageForImportIntake("empty");
      renderView();
      return false;
    }
    return ingestPastedText(importText);
  }

  function prepareBoundariesForNext() {
    state = controller.dispatch({ type: "SET_FIELD", path: "preference.allowProactive", value: true, source: "explicit" });
    ["preference.quietHours", "preference.hardBoundaries"].forEach((name) => {
      const slot = getField(state, name);
      if (slot?.source === "explicit" || slot?.source === "import_review") return;
      state = controller.dispatch({ type: "SET_FIELD", path: name, value: slot?.value, source: "explicit" });
    });
  }

  async function next() {
    if (state.stage === "IMPORT_REVIEW") {
      const ok = await ensureImportedCharacter();
      if (!ok) return;
    }
    if (state.stage === "BOUNDARIES") prepareBoundariesForNext();
    state = controller.dispatch({ type: "NEXT" });
    renderView();
  }

  async function refreshCharacterChoices() {
    try {
      characters = (await listCharacters()).filter((character) => character && !character.deletedAt);
      if (state.stage === "IMPORT_REVIEW") renderView();
    } catch {
      characters = [];
    }
  }

  function selectPath(path) {
    state = controller.dispatch({ type: "SELECT_PATH", path });
    if (state.stage === "PATH_SELECT" && state.path === path && canAdvance(state)) {
      state = controller.dispatch({ type: "NEXT" });
    }
    renderView();
  }

  function renderView() {
    captureImportForm();
    host.innerHTML = renderFirstLightV2Production(state, {
      characters,
      importText,
      importError,
      importBusy,
      importPreview,
    });
    host.dataset.flStage = state.stage;
    host.querySelectorAll("[data-fl-field]").forEach((node) => {
      const name = node.getAttribute("data-fl-field");
      const field = fieldsForStage(state.stage).find((item) => item.name === name);
      const syncField = () => {
        setField(name, readNodeValue(node, field), { rerender: false });
      };
      node.addEventListener("input", syncField);
      node.addEventListener("change", syncField);
      node.addEventListener("focus", () => {
        window.requestAnimationFrame(() => {
          node.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        });
      });
    });
    host.querySelectorAll("[data-fl-choice-field]").forEach((button) => button.addEventListener("click", () => {
      setField(button.dataset.flChoiceField, button.dataset.flOption);
    }));
    host.querySelectorAll("[data-fl-multi-field]").forEach((button) => button.addEventListener("click", () => {
      const name = button.dataset.flMultiField;
      const option = button.dataset.flOption;
      const field = fieldsForStage(state.stage).find((item) => item.name === name);
      const current = Array.isArray(fieldValue(state, name)) ? [...fieldValue(state, name)] : [];
      let nextValues;
      if (option === "unsure") {
        nextValues = current.includes("unsure") ? [] : ["unsure"];
      } else if (current.includes(option)) {
        nextValues = current.filter((item) => item !== option);
      } else {
        nextValues = [...current.filter((item) => item !== "unsure"), option];
        if (field?.max && nextValues.length > field.max) {
          host.querySelector("[data-fl-status]")?.removeAttribute("hidden");
          return;
        }
      }
      setField(name, nextValues);
    }));
    host.querySelectorAll("[data-fl-boolean-field]").forEach((button) => button.addEventListener("click", () => {
      setField(button.dataset.flBooleanField, button.dataset.flValue === "true");
    }));
    host.querySelectorAll("[data-fl-toggle-field]").forEach((button) => button.addEventListener("click", () => {
      const name = button.dataset.flToggleField;
      setField(name, fieldValue(state, name) !== true);
    }));
    host.querySelectorAll("[data-fl-time-field]").forEach((group) => {
      group.querySelectorAll("[data-fl-time]").forEach((input) => input.addEventListener("change", () => {
        setField(group.dataset.flTimeField, {
          start: group.querySelector('[data-fl-time="start"]')?.value || "22:00",
          end: group.querySelector('[data-fl-time="end"]')?.value || "08:00",
        }, { rerender: false });
      }));
    });
    host.querySelectorAll("[data-fl-character-id]").forEach((button) => button.addEventListener("click", () => {
      const selected = characters.find((character) => character.id === button.dataset.flCharacterId);
      importPreview = selected
        ? { id: selected.id, name: selected.name || "未命名角色" }
        : { id: button.dataset.flCharacterId, name: "" };
      importError = "";
      setField("importedCharacterId", button.dataset.flCharacterId);
    }));
    host.querySelector("[data-fl-import-text]")?.addEventListener("input", (event) => {
      importText = event.target.value;
    });
    host.querySelector("[data-fl-import-file]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) void ingestImportFile(file);
    });
    host.querySelectorAll("[data-fl-path]").forEach((button) => button.addEventListener("click", () => selectPath(button.dataset.flPath)));
    host.querySelectorAll("[data-fl-skip]").forEach((button) => button.addEventListener("click", () => dispatch({ type: "SKIP_FIELD", path: button.dataset.flSkip })));
    host.querySelectorAll("[data-fl-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.flAction;
      if (action === "COMMIT") void commit();
      else if (action === "NEXT") void next();
      else if (action === "IMPORT_FILE") host.querySelector("[data-fl-import-file]")?.click();
      else dispatch({ type: action });
    }));
  }

  renderView();
  return api;
}

export async function startFirstLightV2IfNeeded(options = {}) {
  if (!hasOnboardingDone()) return { started: false, reason: "await_product_onboarding" };
  if (!options.force && hasFirstLightDoneV2()) return { started: false, reason: "done" };

  const controller = createFirstLightControllerV2();
  const state = controller.load();
  if (!options.force && !state.done) {
    let priorUse = false;
    try {
      const auto = loadAutonomyPrefs();
      priorUse = Boolean(auto.onboardingComplete)
        || Boolean(JSON.parse(localStorage.getItem("yueqi.experience.relationship.v1") || "{}").byCharacter)
        || Boolean(localStorage.getItem("yueqi.activity.center.v1"));
      const { hasFirstLightDone } = await import("./state.js");
      if (hasFirstLightDone() && priorUse) {
        const characterId = String(getActiveCharacterId() || "").trim();
        const existingCharacter = characterId ? await getCharacter(characterId) : null;
        const migration = await migrateFirstLightV1Preference(characterId, existingCharacter);
        if (migration.ok) {
          controller.save({ ...state, done: true, stage: "COMPLETED", committedCharacterId: characterId });
          return { started: false, reason: "migrated_legacy", migration };
        }
      }
    } catch {
      /* browser-only legacy migration is best effort */
    }
  }
  const api = mountFirstLightV2Production({ ...options, controller });
  const started = api.open();
  return { started, api };
}
