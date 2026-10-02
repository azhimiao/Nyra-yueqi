/**
 * Experience Studio UI — creator-facing package editor (§12 / W6).
 * Not a consumer admin dump. Entry: 作品工坊 / experience-studio.
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import {
  getActiveCharacterId,
  getCharacterSync,
  listCharactersSync,
} from "../../characters/store.js";
import {
  registerPackage,
  getRegisteredPackage,
  listRegisteredPackages,
} from "../store.js";
import {
  exportExperiencePackage,
  validateExperiencePackage,
  loadExperiencePackage,
} from "../package-io.js";
import { createExperiencePackage, createExperienceOpening } from "../schema.js";
import {
  MIST_HARBOR_LIGHTHOUSE_PACKAGE,
  createMistHarborLighthousePackage,
} from "../presets/mist-harbor-lighthouse.js";
import { NIGHT_RAIN_STATION_PACKAGE } from "../presets/night-rain-station.js";
import { inspectStudioPrompt, startStudioSandbox, endStudioSandbox } from "./sandbox.js";

/** @typedef {"basics"|"openings"|"lore"|"director"|"stage"|"memory"|"preview"|"io"} StudioTab */

const TABS = Object.freeze([
  { id: "basics", label: "基本信息" },
  { id: "openings", label: "开场" },
  { id: "lore", label: "世界与规则" },
  { id: "director", label: "导演意图" },
  { id: "stage", label: "舞台" },
  { id: "memory", label: "记忆策略" },
  { id: "preview", label: "沙盒预览" },
  { id: "io", label: "导入导出" },
]);

function clonePkg(pkg) {
  return JSON.parse(JSON.stringify(pkg));
}

function ensureSeedPackages() {
  if (!getRegisteredPackage(NIGHT_RAIN_STATION_PACKAGE.id)) {
    registerPackage(NIGHT_RAIN_STATION_PACKAGE);
  }
  if (!getRegisteredPackage(MIST_HARBOR_LIGHTHOUSE_PACKAGE.id)) {
    registerPackage(MIST_HARBOR_LIGHTHOUSE_PACKAGE);
  }
}

function emptyDraft() {
  return createExperiencePackage({
    id: `exp-draft-${Date.now().toString(36)}`,
    version: "1.0.0",
    title: "未命名作品",
    subtitle: "",
    synopsis: "",
    tags: [],
    contentRating: "teen",
    author: "",
    playerRole: "同行的人",
    openings: [
      createExperienceOpening({
        id: "opening-a",
        title: "开场一",
        teaser: "",
        relationshipPremise: "",
        initialSceneState: { location: "", timeOfDay: "night", weather: "" },
        openingTurns: [],
        suggestedActions: [],
      }),
    ],
    embeddedLorebook: [],
    directorPolicy: {
      rules: [],
      defaultAgenda: {
        softGoals: [],
        avoidances: [],
        tensionGuidance: "",
        unresolvedClues: [],
        endingHint: "",
        notes: "",
      },
    },
    initialAssets: { backgroundId: "", sceneId: "", soundId: "" },
    memoryPolicy: { requireUserAccept: true, allowTypes: ["shared_event"] },
    permissions: { allowCustomCss: false, allowArbitraryJs: false, allowExternalResources: true },
    resources: [],
  });
}

/**
 * @param {HTMLElement|null} root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   onClose?: () => void,
 * }} [deps]
 */
export function mountExperienceStudio(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };

  ensureSeedPackages();

  /** @type {ReturnType<typeof createExperiencePackage>} */
  let draft = clonePkg(MIST_HARBOR_LIGHTHOUSE_PACKAGE);
  /** @type {StudioTab} */
  let tab = "basics";
  let openingIndex = 0;
  let statusMsg = "";
  let inspectorText = "";
  let previewSessionId = "";
  let ioJson = "";

  function toast(msg) {
    statusMsg = String(msg || "");
    deps.onToast?.(statusMsg);
  }

  function currentOpening() {
    if (!draft.openings?.length) {
      draft.openings = [createExperienceOpening({ id: "opening-a", title: "开场一" })];
    }
    openingIndex = Math.max(0, Math.min(openingIndex, draft.openings.length - 1));
    return draft.openings[openingIndex];
  }

  function readBasics(form) {
    if (!form) return;
    draft.title = form.title?.value?.trim() || draft.title;
    draft.subtitle = form.subtitle?.value?.trim() || "";
    draft.synopsis = form.synopsis?.value?.trim() || "";
    draft.cover = form.cover?.value?.trim() || "";
    draft.tags = String(form.tags?.value || "")
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    draft.contentRating = form.contentRating?.value || "teen";
    draft.author = form.author?.value?.trim() || "";
    draft.playerRole = form.playerRole?.value?.trim() || draft.playerRole;
    draft.version = form.version?.value?.trim() || draft.version;
  }

  function readOpening(form) {
    if (!form) return;
    const o = currentOpening();
    o.title = form.opTitle?.value?.trim() || o.title;
    o.teaser = form.opTeaser?.value?.trim() || "";
    o.relationshipPremise = form.opPremise?.value?.trim() || "";
    o.initialSceneState = {
      ...o.initialSceneState,
      location: form.opLocation?.value?.trim() || "",
      weather: form.opWeather?.value?.trim() || "",
      timeOfDay: form.opTime?.value?.trim() || "night",
      emotionalTone: form.opTone?.value?.trim() || "neutral",
    };
    const dialogue = form.opDialogue?.value?.trim() || "";
    const narration = form.opNarration?.value?.trim() || "";
    o.openingTurns = dialogue || narration
      ? [{ role: "assistant", narration, dialogue, performance: {} }]
      : o.openingTurns || [];
  }

  function readLore(form) {
    if (!form) return;
    const raw = form.loreJson?.value || "[]";
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) draft.embeddedLorebook = parsed;
    } catch {
      toast("Lore JSON 无效");
    }
  }

  function readDirector(form) {
    if (!form) return;
    const rules = String(form.dirRules?.value || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    draft.directorPolicy = {
      ...(draft.directorPolicy || {}),
      rules,
      defaultAgenda: {
        softGoals: String(form.softGoals?.value || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        avoidances: String(form.avoidances?.value || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        tensionGuidance: form.tensionGuidance?.value?.trim() || "",
        endingHint: form.endingHint?.value?.trim() || "",
        unresolvedClues: [],
        notes: form.dirNotes?.value?.trim() || "",
      },
    };
  }

  function readStage(form) {
    if (!form) return;
    draft.initialAssets = {
      backgroundId: form.bgId?.value?.trim() || "",
      sceneId: form.sceneId?.value?.trim() || "",
      soundId: form.soundId?.value?.trim() || "",
    };
    draft.rendererProfile = form.renderer?.value?.trim() || "immersive-stage-v1";
    const resRaw = form.resourcesJson?.value || "[]";
    try {
      const parsed = JSON.parse(resRaw);
      if (Array.isArray(parsed)) draft.resources = parsed;
    } catch {
      toast("资源许可 JSON 无效");
    }
  }

  function readMemory(form) {
    if (!form) return;
    draft.memoryPolicy = {
      requireUserAccept: form.requireAccept?.checked !== false,
      allowTypes: String(form.allowTypes?.value || "shared_event")
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    draft.permissions = {
      ...(draft.permissions || {}),
      allowCustomCss: false,
      allowArbitraryJs: false,
      allowExternalResources: form.allowExternal?.checked !== false,
    };
  }

  function flushTab() {
    const form = root.querySelector("[data-studio-form]");
    if (tab === "basics") readBasics(form);
    if (tab === "openings") readOpening(form);
    if (tab === "lore") readLore(form);
    if (tab === "director") readDirector(form);
    if (tab === "stage") readStage(form);
    if (tab === "memory") readMemory(form);
  }

  function renderBasics() {
    return `
      <label>标题<input name="title" value="${escapeHtml(draft.title || "")}" /></label>
      <label>副标题<input name="subtitle" value="${escapeHtml(draft.subtitle || "")}" /></label>
      <label>简介<textarea name="synopsis" rows="3">${escapeHtml(draft.synopsis || "")}</textarea></label>
      <label>封面引用<input name="cover" value="${escapeHtml(draft.cover || "")}" placeholder="/assets/..." /></label>
      <label>标签<input name="tags" value="${escapeHtml((draft.tags || []).join(", "))}" /></label>
      <label>分级<select name="contentRating">
        ${["everyone", "teen", "mature"].map((r) =>
          `<option value="${r}"${draft.contentRating === r ? " selected" : ""}>${r}</option>`).join("")}
      </select></label>
      <label>作者<input name="author" value="${escapeHtml(draft.author || "")}" /></label>
      <label>玩家是谁<input name="playerRole" value="${escapeHtml(draft.playerRole || "")}" /></label>
      <label>版本<input name="version" value="${escapeHtml(draft.version || "1.0.0")}" /></label>
    `;
  }

  function renderOpenings() {
    const o = currentOpening();
    const turn = o.openingTurns?.[0] || {};
    return `
      <div class="exp-studio__opening-tabs">
        ${(draft.openings || []).map((op, i) => `
          <button type="button" class="exp-studio__chip${i === openingIndex ? " is-active" : ""}"
            data-studio-opening="${i}">${escapeHtml(op.title || op.id)}</button>
        `).join("")}
        <button type="button" class="exp-studio__chip" data-studio-add-opening>+ 开场</button>
      </div>
      <label>开场标题<input name="opTitle" value="${escapeHtml(o.title || "")}" /></label>
      <label>提要<input name="opTeaser" value="${escapeHtml(o.teaser || "")}" /></label>
      <label>关系前提<textarea name="opPremise" rows="2">${escapeHtml(o.relationshipPremise || "")}</textarea></label>
      <label>地点<input name="opLocation" value="${escapeHtml(o.initialSceneState?.location || "")}" /></label>
      <label>天气<input name="opWeather" value="${escapeHtml(o.initialSceneState?.weather || "")}" /></label>
      <label>时段<input name="opTime" value="${escapeHtml(o.initialSceneState?.timeOfDay || "")}" /></label>
      <label>情绪基调<input name="opTone" value="${escapeHtml(o.initialSceneState?.emotionalTone || "")}" /></label>
      <label>开场旁白<textarea name="opNarration" rows="2">${escapeHtml(turn.narration || "")}</textarea></label>
      <label>开场对白<textarea name="opDialogue" rows="2">${escapeHtml(turn.dialogue || "")}</textarea></label>
    `;
  }

  function renderLore() {
    return `
      <p class="exp-studio__hint">世界书条目（JSON 数组）。不可含脚本字段。</p>
      <textarea name="loreJson" rows="12" class="exp-studio__code">${escapeHtml(
        JSON.stringify(draft.embeddedLorebook || [], null, 2),
      )}</textarea>
    `;
  }

  function renderDirector() {
    const agenda = draft.directorPolicy?.defaultAgenda || {};
    const rules = (draft.directorPolicy?.rules || []).join("\n");
    return `
      <label>导演规则（每行一条）<textarea name="dirRules" rows="4">${escapeHtml(rules)}</textarea></label>
      <label>软目标<textarea name="softGoals" rows="3">${escapeHtml((agenda.softGoals || []).join("\n"))}</textarea></label>
      <label>避免<textarea name="avoidances" rows="3">${escapeHtml((agenda.avoidances || []).join("\n"))}</textarea></label>
      <label>张力指引<input name="tensionGuidance" value="${escapeHtml(agenda.tensionGuidance || "")}" /></label>
      <label>结束提示<input name="endingHint" value="${escapeHtml(agenda.endingHint || "")}" /></label>
      <label>备注<textarea name="dirNotes" rows="2">${escapeHtml(agenda.notes || "")}</textarea></label>
    `;
  }

  function renderStage() {
    const assets = draft.initialAssets || {};
    return `
      <label>背景 ID<input name="bgId" value="${escapeHtml(assets.backgroundId || "")}" /></label>
      <label>场景 ID<input name="sceneId" value="${escapeHtml(assets.sceneId || "")}" /></label>
      <label>声音 ID<input name="soundId" value="${escapeHtml(assets.soundId || "")}" /></label>
      <label>渲染档案<input name="renderer" value="${escapeHtml(draft.rendererProfile || "")}" /></label>
      <p class="exp-studio__hint">资源许可（须含 id / license / source；外部 URL 仅 http(s)）</p>
      <textarea name="resourcesJson" rows="8" class="exp-studio__code">${escapeHtml(
        JSON.stringify(draft.resources || [], null, 2),
      )}</textarea>
    `;
  }

  function renderMemory() {
    const mp = draft.memoryPolicy || {};
    return `
      <label class="exp-studio__check">
        <input type="checkbox" name="requireAccept" ${mp.requireUserAccept !== false ? "checked" : ""} />
        谢幕经历需用户接受后才投影
      </label>
      <label>允许类型<input name="allowTypes" value="${escapeHtml((mp.allowTypes || ["shared_event"]).join(", "))}" /></label>
      <label class="exp-studio__check">
        <input type="checkbox" name="allowExternal" ${(draft.permissions?.allowExternalResources !== false) ? "checked" : ""} />
        允许声明外部资源（须带许可）
      </label>
      <p class="exp-studio__hint">任意 JS 与自定义 CSS 默认禁止（V1）。</p>
    `;
  }

  function renderPreview() {
    const chars = listCharactersSync() || [];
    const activeId = getActiveCharacterId() || chars[0]?.id || "";
    return `
      <p class="exp-studio__hint">沙盒预览不写长期记忆。Prompt Inspector 显示本轮装配区块。</p>
      <label>预览角色
        <select name="previewCharacter">
          ${chars.map((c) =>
            `<option value="${escapeHtml(c.id)}"${c.id === activeId ? " selected" : ""}>${escapeHtml(c.name || c.id)}</option>`).join("")
            || '<option value="">无角色</option>'}
        </select>
      </label>
      <label>试输入<textarea name="previewInput" rows="2" placeholder="自由输入一条…">先听潮声</textarea></label>
      <div class="exp-studio__actions">
        <button type="button" data-studio-inspect>Prompt Inspector</button>
        <button type="button" data-studio-sandbox>启动沙盒</button>
        <button type="button" data-studio-sandbox-end>结束沙盒</button>
      </div>
      <pre class="exp-studio__inspector" data-studio-inspector>${escapeHtml(inspectorText || "（尚未检查）")}</pre>
      ${previewSessionId ? `<p class="exp-studio__status">沙盒会话：${escapeHtml(previewSessionId)}</p>` : ""}
    `;
  }

  function renderIo() {
    const list = listRegisteredPackages();
    return `
      <div class="exp-studio__actions">
        <button type="button" data-studio-export>导出作品包</button>
        <button type="button" data-studio-validate>校验当前稿</button>
        <button type="button" data-studio-import>从下方 JSON 导入</button>
        <button type="button" data-studio-new>新建空白稿</button>
        <button type="button" data-studio-load-sample>载入雾港样板</button>
      </div>
      <label>已登记作品
        <select data-studio-pick-pkg>
          ${list.map((p) =>
            `<option value="${escapeHtml(p.id)}"${p.id === draft.id ? " selected" : ""}>${escapeHtml(p.title || p.id)}</option>`).join("")}
        </select>
      </label>
      <button type="button" data-studio-load-pkg>载入所选</button>
      <textarea class="exp-studio__code" data-studio-io rows="10" placeholder="导出结果 / 粘贴导入…">${escapeHtml(ioJson)}</textarea>
      <p class="exp-studio__hint">导出会剥离 Key、聊天与私密记忆；禁止 marketplace / payment 字段。</p>
    `;
  }

  function renderBody() {
    switch (tab) {
      case "openings": return renderOpenings();
      case "lore": return renderLore();
      case "director": return renderDirector();
      case "stage": return renderStage();
      case "memory": return renderMemory();
      case "preview": return renderPreview();
      case "io": return renderIo();
      default: return renderBasics();
    }
  }

  function render() {
    root.innerHTML = `
      <div class="exp-studio" data-experience-studio>
        <header class="exp-studio__head">
          <div>
            <strong>作品工坊</strong>
            <span>编辑开放情境包 · 非后台堆砌</span>
          </div>
          <span class="exp-studio__pkg-id">${escapeHtml(draft.id || "")}</span>
        </header>
        <nav class="exp-studio__tabs" role="tablist" aria-label="工坊分区">
          ${TABS.map((t) => `
            <button type="button" role="tab" class="exp-studio__tab${tab === t.id ? " is-active" : ""}"
              data-studio-tab="${t.id}" aria-selected="${tab === t.id ? "true" : "false"}"
              id="exp-studio-tab-${t.id}">${t.label}</button>
          `).join("")}
        </nav>
        <form class="exp-studio__form" data-studio-form onsubmit="return false">
          ${renderBody()}
        </form>
        ${statusMsg ? `<p class="exp-studio__status" role="status">${escapeHtml(statusMsg)}</p>` : ""}
      </div>
    `;
    refreshIcons();
  }

  function saveDraftToRegistry() {
    flushTab();
    const validated = validateExperiencePackage(draft);
    if (!validated.ok || !validated.value) {
      toast(`校验失败：${(validated.errors || []).slice(0, 3).join("; ")}`);
      return false;
    }
    draft = validated.value;
    registerPackage(draft);
    toast("已保存到本地作品登记");
    return true;
  }

  function onClick(event) {
    const tabBtn = event.target.closest("[data-studio-tab]");
    if (tabBtn) {
      flushTab();
      tab = /** @type {StudioTab} */ (tabBtn.getAttribute("data-studio-tab") || "basics");
      render();
      return;
    }

    const opBtn = event.target.closest("[data-studio-opening]");
    if (opBtn) {
      flushTab();
      openingIndex = Number(opBtn.getAttribute("data-studio-opening") || 0);
      render();
      return;
    }

    if (event.target.closest("[data-studio-add-opening]")) {
      flushTab();
      const n = (draft.openings?.length || 0) + 1;
      draft.openings = [
        ...(draft.openings || []),
        createExperienceOpening({
          id: `opening-${n}`,
          title: `开场${n}`,
          teaser: "",
          relationshipPremise: "",
          initialSceneState: { location: "", timeOfDay: "night" },
        }),
      ];
      openingIndex = draft.openings.length - 1;
      render();
      return;
    }

    if (event.target.closest("[data-studio-inspect]")) {
      flushTab();
      const form = root.querySelector("[data-studio-form]");
      const userInput = form?.previewInput?.value || "……";
      const characterId = form?.previewCharacter?.value || getActiveCharacterId();
      const ch = getCharacterSync(characterId);
      const result = inspectStudioPrompt({
        pkg: draft,
        openingId: currentOpening().id,
        userInput,
        characterName: ch?.name || "主演",
      });
      inspectorText = result.ok
        ? result.text
        : `Inspector 失败：${result.reason}`;
      toast(result.ok ? "Inspector 已更新" : result.reason);
      render();
      return;
    }

    if (event.target.closest("[data-studio-sandbox]")) {
      flushTab();
      if (previewSessionId) {
        endStudioSandbox(previewSessionId);
        previewSessionId = "";
      }
      const form = root.querySelector("[data-studio-form]");
      const characterId = form?.previewCharacter?.value || getActiveCharacterId();
      const started = startStudioSandbox({
        pkg: draft,
        openingId: currentOpening().id,
        characterId,
      });
      if (!started.ok) {
        toast(`沙盒失败：${started.reason}`);
        render();
        return;
      }
      previewSessionId = started.value?.id || "";
      toast("沙盒已启动（不写长期记忆）");
      render();
      return;
    }

    if (event.target.closest("[data-studio-sandbox-end]")) {
      if (previewSessionId) {
        endStudioSandbox(previewSessionId);
        previewSessionId = "";
        toast("沙盒已结束");
      }
      render();
      return;
    }

    if (event.target.closest("[data-studio-export]")) {
      flushTab();
      const exported = exportExperiencePackage(draft);
      if (!exported.ok) {
        toast(`导出失败：${(exported.errors || []).join("; ")}`);
        render();
        return;
      }
      ioJson = exported.json;
      tab = "io";
      toast("已导出（已剥离隐私字段）");
      render();
      return;
    }

    if (event.target.closest("[data-studio-validate]")) {
      flushTab();
      const v = validateExperiencePackage(draft);
      toast(v.ok ? "校验通过" : `失败：${(v.errors || []).slice(0, 4).join("; ")}`);
      if (v.ok && v.value) draft = v.value;
      render();
      return;
    }

    if (event.target.closest("[data-studio-import]")) {
      const ta = root.querySelector("[data-studio-io]");
      const raw = ta?.value || ioJson;
      const loaded = loadExperiencePackage(raw);
      if (!loaded.ok || !loaded.value) {
        toast(`导入失败：${(loaded.errors || []).slice(0, 4).join("; ")}`);
        render();
        return;
      }
      draft = loaded.value;
      registerPackage(draft);
      ioJson = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      toast(`已导入：${draft.title}`);
      render();
      return;
    }

    if (event.target.closest("[data-studio-new]")) {
      flushTab();
      draft = emptyDraft();
      openingIndex = 0;
      toast("已新建空白稿");
      render();
      return;
    }

    if (event.target.closest("[data-studio-load-sample]")) {
      draft = createMistHarborLighthousePackage();
      registerPackage(draft);
      openingIndex = 0;
      toast("已载入雾港灯塔样板");
      render();
      return;
    }

    if (event.target.closest("[data-studio-load-pkg]")) {
      const sel = root.querySelector("[data-studio-pick-pkg]");
      const id = sel?.value;
      const pkg = id ? getRegisteredPackage(id) : null;
      if (!pkg) {
        toast("未找到作品");
        return;
      }
      draft = clonePkg(pkg);
      openingIndex = 0;
      toast(`已载入 ${pkg.title}`);
      render();
    }
  }

  root.addEventListener("click", onClick);
  render();

  return {
    open() {
      ensureSeedPackages();
      render();
    },
    refresh: render,
    /** @internal test helper */
    getDraft: () => draft,
    setDraft(pkg) {
      draft = clonePkg(pkg);
      render();
    },
    save: saveDraftToRegistry,
    destroy() {
      if (previewSessionId) {
        try {
          endStudioSandbox(previewSessionId);
        } catch {
          /* ignore */
        }
      }
      root.removeEventListener("click", onClick);
      root.innerHTML = "";
    },
  };
}

export { ensureSeedPackages, emptyDraft };
