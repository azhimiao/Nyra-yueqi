/** Adventure V2 product UI: library, setup, deterministic HUD and branch restore. */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { AdventureDmError, requestDmCandidate, resolveCallModel } from "./dm.js";
import { ADVENTURE_ACTION_MODES, getAvailableExits, getLocation } from "./schema.js";
import { getPackage, listPackages } from "./presets.js";
import { createUserWorld, deleteUserWorld } from "./user-worlds.js";
import {
  CHARACTER_ARCHETYPES,
  acceptPendingAdventureTurn,
  createAdventureRun,
  forkAdventureRun,
  formatAdventureClock,
  getActiveAdventureRun,
  getAdventureRun,
  listAdventureRuns,
  rejectPendingAdventureTurn,
  setActiveAdventureRun,
  stageAdventureTurn,
} from "./store.js";
import { pushExperienceProjectionWithDelivery } from "../experience/projections-feed.js";
import { getActiveCharacterId } from "../characters/store.js";

const MODE_META = Object.freeze({
  do: { label: "行动", icon: "footprints", placeholder: "你要做什么？描述动作、方法和目标…" },
  say: { label: "说话", icon: "message-circle", placeholder: "你要对谁说什么？" },
  story: { label: "叙事", icon: "pen-line", placeholder: "接管一小段环境或剧情走向…" },
});

const EFFECT_LABELS = Object.freeze({
  set_flag: "世界事实",
  add_item: "获得物品",
  remove_item: "消耗物品",
  adjust_stat: "属性变化",
  set_condition: "状态变化",
  advance_quest: "任务推进",
  move: "地点变化",
  advance_time: "时间推进",
  set_npc: "人物关系",
});

function effectSummary(effects = []) {
  return [...new Set(effects.map((effect) => EFFECT_LABELS[effect.type] || effect.type))];
}

function questProgress(quest) {
  const objectives = quest?.objectives || [];
  const done = objectives.filter((item) => item.status === "complete").length;
  return `${done}/${objectives.length}`;
}

function currentObjective(run) {
  for (const quest of run?.state?.quests || []) {
    if (quest.status === "complete" || quest.status === "failed") continue;
    const objective = (quest.objectives || []).find((item) => item.status !== "complete");
    if (objective) return { quest, objective };
  }
  return null;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   collectProviderConfig?: () => Promise<object>|object,
 *   onToast?: (message: string) => void,
 *   onOpenSettings?: () => void,
 * }} [deps]
 */
export function mountAdventureApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };
  let view = "library";
  let selectedPackageId = listPackages()[0]?.id || "";
  let selectedOpeningId = "";
  let selectedArchetypeId = "observer";
  let actionMode = "do";
  let drawerTab = "map";
  let currentRunId = getActiveAdventureRun()?.id || "";
  let busy = false;
  let destroyed = false;
  let errorState = null;
  let restoreDraft = "";
  let showCreate = false;

  root.classList.add("adventure-v2");
  root.innerHTML = `
    <div class="adv-shell">
      <section class="adv-view is-active" data-adv-view="library">
        <header class="adv-library-head">
          <div>
            <p>你的世界</p>
            <h1>冒险档案</h1>
            <span>自己定义世界观与开场，再进入探索</span>
          </div>
          <button type="button" class="adv-icon" data-adv-home aria-label="返回桌面"><i data-lucide="chevron-left"></i></button>
        </header>
        <div class="adv-library-scroll">
          <section class="adv-resume-band" data-adv-resume-band hidden></section>
          <div class="adv-section-title">
            <strong>我的世界</strong>
            <button type="button" class="adv-text-link" data-adv-toggle-create>新建世界</button>
          </div>
          <form class="adv-create-world" data-adv-create-form hidden>
            <label><span>世界名</span><input type="text" maxlength="40" required placeholder="例如：雾港" data-adv-world-title /></label>
            <label><span>一句话简介</span><input type="text" maxlength="80" placeholder="可选" data-adv-world-subtitle /></label>
            <label><span>起点地名</span><input type="text" maxlength="40" placeholder="例如：码头" data-adv-world-location /></label>
            <label><span>开场（必填）</span><textarea rows="4" maxlength="800" required placeholder="用你自己的话写下故事从哪里开始…" data-adv-world-opening></textarea></label>
            <button type="submit" class="adv-primary">保存并选用</button>
          </form>
          <div class="adv-package-list" data-adv-package-list></div>
        </div>
      </section>

      <section class="adv-view" data-adv-view="setup" hidden>
        <header class="adv-topbar">
          <button type="button" class="adv-icon" data-adv-library aria-label="返回冒险档案"><i data-lucide="chevron-left"></i></button>
          <div><strong>建立世界线</strong><span data-adv-setup-kicker></span></div>
          <span></span>
        </header>
        <div class="adv-setup-scroll">
          <section class="adv-setup-intro" data-adv-setup-intro></section>
          <fieldset class="adv-fieldset">
            <legend>从哪里开始</legend>
            <div class="adv-opening-list" data-adv-opening-list></div>
          </fieldset>
          <fieldset class="adv-fieldset">
            <legend>你的角色</legend>
            <label class="adv-name-field"><span>名字</span><input type="text" maxlength="40" value="" placeholder="自己起名" data-adv-character-name autocomplete="off" /></label>
            <div class="adv-archetype-list" data-adv-archetype-list></div>
          </fieldset>
        </div>
        <footer class="adv-setup-footer">
          <button type="button" class="adv-primary" data-adv-start-run>进入这条世界线 <i data-lucide="arrow-right"></i></button>
        </footer>
      </section>

      <section class="adv-view" data-adv-view="game" hidden>
        <header class="adv-game-head">
          <button type="button" class="adv-icon" data-adv-library aria-label="返回冒险档案"><i data-lucide="library"></i></button>
          <div class="adv-game-title"><strong data-adv-run-title></strong><span data-adv-location-line></span></div>
          <button type="button" class="adv-icon" data-adv-open-drawer="quests" aria-label="打开档案"><i data-lucide="scroll-text"></i></button>
        </header>
        <section class="adv-objective-band" data-adv-objective-band></section>
        <section class="adv-map-stage" data-adv-map-stage aria-label="探索地图"></section>
        <section class="adv-exits" data-adv-exits hidden></section>
        <section class="adv-status-strip" data-adv-status-strip></section>
        <main class="adv-story" data-adv-story aria-live="polite"></main>
        <section class="adv-suggestions" data-adv-suggestions hidden></section>
        <section class="adv-error" data-adv-error hidden></section>
        <section class="adv-candidate" data-adv-candidate hidden></section>
        <form class="adv-composer" data-adv-form>
          <div class="adv-mode-control" role="radiogroup" aria-label="行动类型">
            ${ADVENTURE_ACTION_MODES.map((mode) => `
              <button type="button" data-adv-mode="${mode}" role="radio" aria-checked="${mode === "do"}">
                <i data-lucide="${MODE_META[mode].icon}"></i><span>${MODE_META[mode].label}</span>
              </button>`).join("")}
          </div>
          <div class="adv-input-row">
            <textarea rows="2" maxlength="1600" data-adv-input placeholder="${MODE_META.do.placeholder}"></textarea>
            <button type="submit" class="adv-send" aria-label="提交行动"><i data-lucide="arrow-up"></i></button>
          </div>
          <div class="adv-composer-meta"><span data-adv-runtime-label></span><button type="button" data-adv-branch>从上一回合创建分支</button></div>
        </form>
        <aside class="adv-drawer" data-adv-drawer hidden>
          <button type="button" class="adv-drawer-scrim" data-adv-close-drawer aria-label="关闭档案"></button>
          <div class="adv-drawer-panel">
            <header><strong>行旅档案</strong><button type="button" class="adv-icon" data-adv-close-drawer aria-label="关闭"><i data-lucide="x"></i></button></header>
            <nav class="adv-drawer-tabs" aria-label="档案页面">
              <button type="button" data-adv-drawer-tab="map">地图</button>
              <button type="button" data-adv-drawer-tab="quests">任务</button>
              <button type="button" data-adv-drawer-tab="character">状态</button>
              <button type="button" data-adv-drawer-tab="bag">背包</button>
            </nav>
            <div class="adv-drawer-body" data-adv-drawer-body></div>
          </div>
        </aside>
      </section>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);

  function setView(next) {
    view = next;
    root.querySelectorAll("[data-adv-view]").forEach((node) => {
      const active = node.dataset.advView === next;
      node.hidden = !active;
      node.classList.toggle("is-active", active);
    });
    refreshIcons(root);
  }

  function renderLibrary() {
    const packages = listPackages();
    const runs = listAdventureRuns();
    const active = currentRunId ? getAdventureRun(currentRunId) : getActiveAdventureRun();
    const resume = $("[data-adv-resume-band]");
    if (resume) {
      resume.hidden = !active;
      resume.innerHTML = active ? `
        <button type="button" data-adv-open-run="${escapeHtml(active.id)}">
          <span>继续上次</span>
          <strong>${escapeHtml(active.title)}</strong>
          <em>${escapeHtml(getLocation(getPackage(active.packageId), active.state.locationId)?.name || "旅途中")} · ${escapeHtml(formatAdventureClock(active.state.clock))}</em>
          <i data-lucide="arrow-up-right"></i>
        </button>
        ${runs.length > 1 ? `<div class="adv-run-switcher">${runs.slice(1, 6).map((run) => `<button type="button" data-adv-open-run="${escapeHtml(run.id)}"><strong>${escapeHtml(run.title)}</strong><span>${escapeHtml(String(run.branchId).slice(-6))}</span></button>`).join("")}</div>` : ""}
      ` : "";
    }
    const form = $("[data-adv-create-form]");
    if (form) form.hidden = !showCreate;
    const host = $("[data-adv-package-list]");
    if (host) {
      if (!packages.length) {
        host.innerHTML = `<div class="adv-empty-worlds"><p>还没有世界。</p><p>点右上角「新建世界」，用你自己的开场开始。</p></div>`;
      } else {
        host.innerHTML = packages.map((item, index) => `
          <article class="adv-package-row-wrap">
            <button type="button" class="adv-package-row" data-adv-package="${escapeHtml(item.id)}" data-tone="${escapeHtml(item.tone || "harbor")}">
              <span class="adv-package-index">${String(index + 1).padStart(2, "0")}</span>
              <span class="adv-package-copy"><strong>${escapeHtml(item.title)}</strong><em>${escapeHtml(item.subtitle || "自定义世界")}</em><small>${item.openingCount || 1} 个开场 · ${item.locationCount || 1} 地点</small></span>
              <i data-lucide="chevron-right"></i>
            </button>
            <button type="button" class="adv-world-delete" data-adv-delete-world="${escapeHtml(item.id)}" aria-label="删除世界">删除</button>
          </article>`).join("");
      }
    }
    refreshIcons(root);
  }

  function renderSetup() {
    const pkg = getPackage(selectedPackageId);
    if (!pkg) {
      setView("library");
      showCreate = true;
      renderLibrary();
      return;
    }
    if (!selectedOpeningId) selectedOpeningId = pkg.openings[0]?.id || "";
    $("[data-adv-setup-kicker]").textContent = "你定义的世界";
    $("[data-adv-setup-intro]").innerHTML = `
      <p>CUSTOM WORLD</p>
      <h2>${escapeHtml(pkg.title)}</h2>
      <span>${escapeHtml(pkg.subtitle || pkg.summary || "")}</span>
    `;
    $("[data-adv-opening-list]").innerHTML = pkg.openings.map((opening) => `
      <button type="button" class="${opening.id === selectedOpeningId ? "is-on" : ""}" data-adv-opening="${escapeHtml(opening.id)}">
        <strong>${escapeHtml(opening.title)}</strong>
        <span>${escapeHtml(opening.description || opening.openingText || "")}</span>
      </button>
    `).join("");
    $("[data-adv-archetype-list]").innerHTML = Object.values(CHARACTER_ARCHETYPES).map((item) => `
      <button type="button" class="${item.id === selectedArchetypeId ? "is-on" : ""}" data-adv-archetype="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.description)}</span>
        <small>${Object.entries(item.stats).map(([key, value]) => `${key} ${value}`).join(" · ")}</small>
      </button>
    `).join("");
    refreshIcons(root);
  }

  function renderTurn(turn, run) {
    const mode = turn.input?.mode ? MODE_META[turn.input.mode] : null;
    const checks = (turn.resolution?.checks || []).map((check) => `
      <div class="adv-check-result ${check.success ? "is-success" : "is-failure"}">
        <span>${escapeHtml(check.label)} · d20 ${check.roll} + ${check.statValue}</span>
        <strong>${check.total} / DC ${check.dc}</strong>
        <p>${escapeHtml(check.text)}</p>
      </div>`).join("");
    return `
      <article class="adv-turn" data-turn-id="${escapeHtml(turn.id)}">
        ${turn.input ? `<div class="adv-player-action"><span><i data-lucide="${mode.icon}"></i>${mode.label}</span><p>${escapeHtml(turn.input.text)}</p></div>` : ""}
        <div class="adv-dm-prose"><p>${escapeHtml(turn.candidate?.narration || "")}</p>${checks}</div>
        <footer><span>回合 ${turn.sequence}</span><time>${escapeHtml(String(turn.acceptedAt || turn.createdAt || "").slice(11, 16))}</time>${turn.sequence > 0 ? `<button type="button" data-adv-fork-turn="${escapeHtml(turn.id)}">从这里分支</button>` : ""}</footer>
      </article>`;
  }

  function renderCandidate(run) {
    const host = $("[data-adv-candidate]");
    const pending = run.pendingTurn;
    host.hidden = !pending;
    if (!pending) {
      host.innerHTML = "";
      return;
    }
    const candidate = pending.candidate;
    const effects = effectSummary([...(candidate.effects || []), ...(candidate.checks || []).flatMap((check) => [...(check.successEffects || []), ...(check.failureEffects || [])])]);
    host.innerHTML = `
      <header><span>${candidate.source === "tutorial" ? "教学回合" : "这一幕"}</span><strong>确认后世界才会改变</strong></header>
      <div class="adv-candidate-scroll">
        <p>${escapeHtml(candidate.narration)}</p>
        ${(candidate.checks || []).map((check) => `<div class="adv-check-preview"><i data-lucide="dice-6"></i><span><strong>${escapeHtml(check.label)}</strong><em>${escapeHtml(check.stat)} · 难度 ${check.dc}</em></span></div>`).join("")}
        ${effects.length ? `<div class="adv-effect-preview"><span>可能更新</span>${effects.map((item) => `<em>${escapeHtml(item)}</em>`).join("")}</div>` : ""}
      </div>
      <footer><button type="button" data-adv-reject-candidate>再想想</button><button type="button" class="adv-primary" data-adv-accept-candidate>就这样</button></footer>`;
    refreshIcons(root);
  }

  function renderError() {
    const host = $("[data-adv-error]");
    host.hidden = !errorState;
    host.innerHTML = errorState ? `
      <i data-lucide="triangle-alert"></i>
      <span><strong>${escapeHtml(errorState.title || "本回合未写入")}</strong><p>${escapeHtml(errorState.message)}</p></span>
      ${errorState.configure ? '<button type="button" data-adv-configure>配置模型</button>' : '<button type="button" data-adv-dismiss-error>知道了</button>'}
    ` : "";
    refreshIcons(root);
  }

  function renderSuggestions(run) {
    const host = $("[data-adv-suggestions]");
    const suggestions = run.pendingTurn ? [] : (run.state.suggestions || []);
    host.hidden = !suggestions.length;
    host.innerHTML = suggestions.map((choice) => `<button type="button" class="adv-choice" data-adv-suggestion="${escapeHtml(choice.id)}" data-mode="${escapeHtml(choice.mode)}" data-text="${escapeHtml(choice.actionText)}"><strong>${escapeHtml(choice.label)}</strong></button>`).join("");
  }

  function renderMapStage(run) {
    const pkg = getPackage(run.packageId);
    const host = $("[data-adv-map-stage]");
    const exitsHost = $("[data-adv-exits]");
    if (!host) return;
    const near = new Set(getAvailableExits(pkg, run.state).map((exit) => exit.to));
    host.innerHTML = `
      <div class="adv-map-plane is-stage" data-tone="${escapeHtml(pkg.tone)}">
        ${(pkg.locations || []).map((location) => {
          const isCurrent = location.id === run.state.locationId;
          const isNear = near.has(location.id);
          const exit = getAvailableExits(pkg, run.state).find((item) => item.to === location.id);
          return `<button type="button"
            class="adv-map-node ${isCurrent ? "is-current" : isNear ? "is-near" : ""}"
            style="--x:${location.position?.x || 50}%;--y:${location.position?.y || 50}%"
            ${isNear && exit ? `data-adv-exit-to="${escapeHtml(exit.to)}" data-adv-exit-label="${escapeHtml(exit.label || location.name)}"` : "disabled"}
          ><i></i><span>${escapeHtml(location.name)}</span></button>`;
        }).join("")}
      </div>`;
    const exits = getAvailableExits(pkg, run.state);
    if (exitsHost) {
      exitsHost.hidden = !exits.length || Boolean(run.pendingTurn);
      exitsHost.innerHTML = exits.map((exit) => {
        const dest = getLocation(pkg, exit.to);
        return `<button type="button" data-adv-exit-to="${escapeHtml(exit.to)}" data-adv-exit-label="${escapeHtml(exit.label || dest?.name || "前往")}">${escapeHtml(exit.label || dest?.name || "前往")}</button>`;
      }).join("");
    }
  }

  function renderDrawer(run) {
    const pkg = getPackage(run.packageId);
    root.querySelectorAll("[data-adv-drawer-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.advDrawerTab === drawerTab));
    const body = $("[data-adv-drawer-body]");
    if (drawerTab === "map") {
      const exits = new Set(getAvailableExits(pkg, run.state).map((exit) => exit.to));
      body.innerHTML = `
        <div class="adv-map-plane" data-tone="${escapeHtml(pkg.tone)}">
          ${(pkg.locations || []).map((location) => `<button type="button" class="adv-map-node ${location.id === run.state.locationId ? "is-current" : exits.has(location.id) ? "is-near" : ""}" style="--x:${location.position?.x || 50}%;--y:${location.position?.y || 50}%" disabled><i></i><span>${escapeHtml(location.name)}</span></button>`).join("")}
        </div>
        <p class="adv-drawer-note">地图只显示已知结构；移动由你在正文中的行动和本地验收后的 effect 决定。</p>`;
    } else if (drawerTab === "quests") {
      body.innerHTML = `<div class="adv-quest-list">${(run.state.quests || []).map((quest) => `
        <section class="adv-quest-row" data-status="${escapeHtml(quest.status)}"><header><strong>${escapeHtml(quest.title)}</strong><span>${questProgress(quest)}</span></header><p>${escapeHtml(quest.description)}</p><ol>${(quest.objectives || []).map((objective) => `<li class="${objective.status === "complete" ? "is-done" : ""}"><i></i>${escapeHtml(objective.text)}</li>`).join("")}</ol></section>`).join("")}</div>`;
    } else if (drawerTab === "character") {
      const npcRows = Object.entries(run.state.npcs || {}).map(([npcId, state]) => {
        const npc = pkg.npcs.find((item) => item.id === npcId);
        return `<li><strong>${escapeHtml(npc?.name || npcId)}</strong><span>态度 ${Number(state.attitude || 0) >= 0 ? "+" : ""}${Number(state.attitude || 0)}</span></li>`;
      }).join("");
      body.innerHTML = `
        <section class="adv-sheet"><p>PLAYER SHEET</p><h2>${escapeHtml(run.character.name)}</h2><span>${escapeHtml(run.character.archetypeLabel)}</span><dl>${Object.entries(run.state.stats).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${value}</dd></div>`).join("")}</dl></section>
        <section class="adv-condition-list"><strong>当前状态</strong><p>${run.state.conditions.length ? run.state.conditions.map(escapeHtml).join(" · ") : "状态稳定"}</p></section>
        ${npcRows ? `<section class="adv-npc-list"><strong>人物关系</strong><ul>${npcRows}</ul></section>` : ""}`;
    } else {
      body.innerHTML = run.state.inventory.length
        ? `<div class="adv-bag-list">${run.state.inventory.map((item) => `<article><span>${escapeHtml(item.name.slice(0, 1))}</span><div><strong>${escapeHtml(item.name)}${item.qty > 1 ? ` ×${item.qty}` : ""}</strong><p>${escapeHtml(item.description || "随身物品")}</p></div></article>`).join("")}</div>`
        : '<p class="adv-empty">背包是空的。</p>';
    }
    refreshIcons(root);
  }

  function renderGame({ keepScroll = false } = {}) {
    const run = getAdventureRun(currentRunId) || getActiveAdventureRun();
    if (!run) {
      setView("library");
      renderLibrary();
      return;
    }
    currentRunId = run.id;
    const pkg = getPackage(run.packageId);
    const location = getLocation(pkg, run.state.locationId);
    const objective = currentObjective(run);
    $("[data-adv-run-title]").textContent = run.title;
    $("[data-adv-location-line]").textContent = `${location?.name || "未知地点"} · ${formatAdventureClock(run.state.clock)}`;
    const objectiveHost = $("[data-adv-objective-band]");
    objectiveHost.innerHTML = objective
      ? `<span>当前目标</span><strong>${escapeHtml(objective.objective.text)}</strong><button type="button" data-adv-open-drawer="quests">${escapeHtml(objective.quest.title)} · ${questProgress(objective.quest)}</button>`
      : '<span>当前目标</span><strong>这条世界线已没有未完成目标</strong><button type="button" data-adv-open-drawer="quests">查看记录</button>';
    $("[data-adv-status-strip]").innerHTML = `${Object.entries(run.state.stats).map(([key, value]) => `<button type="button" data-adv-open-drawer="character"><span>${escapeHtml(key)}</span><strong>${value}</strong></button>`).join("")}<button type="button" data-adv-open-drawer="bag"><span>背包</span><strong>${run.state.inventory.length}</strong></button>`;
    renderMapStage(run);
    const story = $("[data-adv-story]");
    const previousBottom = story.scrollHeight - story.scrollTop;
    story.innerHTML = run.turns.map((turn) => renderTurn(turn, run)).join("");
    if (keepScroll) story.scrollTop = Math.max(0, story.scrollHeight - previousBottom);
    else story.scrollTop = story.scrollHeight;
    $("[data-adv-runtime-label]").textContent = run.mode === "tutorial" ? "本地教学" : "点选项或输入行动";
    renderSuggestions(run);
    renderCandidate(run);
    renderError();
    renderDrawer(run);
    const input = $("[data-adv-input]");
    const locked = busy || Boolean(run.pendingTurn);
    input.disabled = locked;
    $(".adv-send").disabled = locked;
    root.classList.toggle("is-busy", busy);
    refreshIcons(root);
  }

  function setActionMode(mode) {
    if (!MODE_META[mode]) return;
    actionMode = mode;
    root.querySelectorAll("[data-adv-mode]").forEach((button) => {
      const active = button.dataset.advMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    });
    const input = $("[data-adv-input]");
    if (input) input.placeholder = MODE_META[mode].placeholder;
  }

  async function submitAction() {
    const run = getAdventureRun(currentRunId);
    const input = $("[data-adv-input]");
    const text = String(input?.value || "").trim();
    if (!run || run.pendingTurn || busy || !text) return;
    busy = true;
    errorState = null;
    restoreDraft = text;
    renderGame({ keepScroll: true });
    try {
      let provider = {};
      try { provider = await deps.collectProviderConfig?.() || {}; } catch { provider = {}; }
      const callModel = run.mode === "tutorial" ? null : await resolveCallModel(provider);
      const pkg = getPackage(run.packageId);
      const candidate = await requestDmCandidate({ pkg, run, input: { mode: actionMode, text }, callModel, providerConfig: provider });
      stageAdventureTurn(run.id, { mode: actionMode, text }, candidate);
      if (input) input.value = "";
      restoreDraft = "";
    } catch (error) {
      const known = error instanceof AdventureDmError;
      errorState = {
        title: "本回合未写入",
        message: known ? error.message : "DM 请求失败。本回合没有改变任何状态，可以稍后重试。",
        configure: error?.code === "model_not_configured",
      };
      if (input) input.value = restoreDraft;
    } finally {
      busy = false;
      renderGame({ keepScroll: true });
    }
  }

  function openRun(runId) {
    const run = setActiveAdventureRun(runId);
    if (!run) return;
    currentRunId = run.id;
    errorState = null;
    setView("game");
    renderGame();
  }

  function openDrawer(tab = "map") {
    drawerTab = tab;
    const drawer = $("[data-adv-drawer]");
    drawer.hidden = false;
    drawer.classList.add("is-open");
    const run = getAdventureRun(currentRunId);
    if (run) renderDrawer(run);
  }

  function closeDrawer() {
    const drawer = $("[data-adv-drawer]");
    drawer.classList.remove("is-open");
    drawer.hidden = true;
  }

  function createBranch(turnId) {
    const run = getAdventureRun(currentRunId);
    if (!run || run.pendingTurn) return;
    try {
      const branch = forkAdventureRun(run.id, turnId);
      currentRunId = branch.id;
      deps.onToast?.("已创建独立世界线，原进度仍保留");
      renderGame();
    } catch {
      deps.onToast?.("当前回合还不能创建分支");
    }
  }

  const onClick = async (event) => {
    if (destroyed) return;
    const target = event.target;
    if (target.closest("[data-adv-home]")) {
      deps.onHome?.();
      return;
    }
    if (target.closest("[data-adv-toggle-create]")) {
      showCreate = !showCreate;
      renderLibrary();
      return;
    }
    const deleteId = target.closest("[data-adv-delete-world]")?.dataset.advDeleteWorld;
    if (deleteId) {
      if (window.confirm("删除这个世界？进行中的存档可能无法再打开。")) {
        deleteUserWorld(deleteId);
        if (selectedPackageId === deleteId) selectedPackageId = listPackages()[0]?.id || "";
        renderLibrary();
      }
      return;
    }
    if (target.closest("[data-adv-library]")) {
      closeDrawer();
      setView("library");
      renderLibrary();
      return;
    }
    const packageId = target.closest("[data-adv-package]")?.dataset.advPackage;
    if (packageId) {
      selectedPackageId = packageId;
      selectedOpeningId = "";
      setView("setup");
      renderSetup();
      return;
    }
    const openingId = target.closest("[data-adv-opening]")?.dataset.advOpening;
    if (openingId) {
      selectedOpeningId = openingId;
      renderSetup();
      return;
    }
    const archetypeId = target.closest("[data-adv-archetype]")?.dataset.advArchetype;
    if (archetypeId) {
      selectedArchetypeId = archetypeId;
      renderSetup();
      return;
    }
    if (target.closest("[data-adv-start-run]")) {
      const name = String($("[data-adv-character-name]")?.value || "").trim();
      if (!name) {
        deps.onToast?.("先给自己起个名字");
        return;
      }
      try {
        const run = createAdventureRun({ packageId: selectedPackageId, openingId: selectedOpeningId, character: { name, archetypeId: selectedArchetypeId } });
        currentRunId = run.id;
        setView("game");
        renderGame();
      } catch (error) {
        deps.onToast?.(error?.message || "无法开局");
      }
      return;
    }
    const runId = target.closest("[data-adv-open-run]")?.dataset.advOpenRun;
    if (runId) {
      openRun(runId);
      return;
    }
    const mode = target.closest("[data-adv-mode]")?.dataset.advMode;
    if (mode) {
      setActionMode(mode);
      return;
    }
    const suggestion = target.closest("[data-adv-suggestion]");
    if (suggestion) {
      setActionMode(suggestion.dataset.mode || "do");
      const input = $("[data-adv-input]");
      if (input) { input.value = suggestion.dataset.text || ""; input.focus(); }
      return;
    }
    const exitBtn = target.closest("[data-adv-exit-to]");
    if (exitBtn && !busy) {
      const label = exitBtn.getAttribute("data-adv-exit-label") || "前往";
      setActionMode("do");
      const input = $("[data-adv-input]");
      if (input) input.value = label;
      submitAction();
      return;
    }
    if (target.closest("[data-adv-accept-candidate]")) {
      try {
        const accepted = acceptPendingAdventureTurn(currentRunId);
        const narration = accepted?.turns?.at(-1)?.candidate?.narration
          || accepted?.state?.storySummary
          || "冒险推进了一段";
        void pushExperienceProjectionWithDelivery({
          kind: "adventure",
          characterId: getActiveCharacterId() || "",
          entityId: currentRunId,
          summary: String(narration).slice(0, 200),
          meta: { runId: currentRunId, packageId: accepted?.packageId },
        });
        deps.onToast?.("回合已结算并建立检查点");
      } catch (error) {
        errorState = { title: "结算被拦截", message: String(error?.message || "状态变化不符合规则。") };
      }
      renderGame();
      return;
    }
    if (target.closest("[data-adv-reject-candidate]")) {
      const run = getAdventureRun(currentRunId);
      const draft = run?.pendingTurn?.input?.text || "";
      const modeToRestore = run?.pendingTurn?.input?.mode || "do";
      rejectPendingAdventureTurn(currentRunId);
      setActionMode(modeToRestore);
      const input = $("[data-adv-input]");
      if (input) input.value = draft;
      renderGame({ keepScroll: true });
      return;
    }
    const drawerButton = target.closest("[data-adv-open-drawer]");
    if (drawerButton) { openDrawer(drawerButton.dataset.advOpenDrawer || "map"); return; }
    if (target.closest("[data-adv-close-drawer]")) { closeDrawer(); return; }
    const tab = target.closest("[data-adv-drawer-tab]")?.dataset.advDrawerTab;
    if (tab) { drawerTab = tab; const run = getAdventureRun(currentRunId); if (run) renderDrawer(run); return; }
    const forkTurnId = target.closest("[data-adv-fork-turn]")?.dataset.advForkTurn;
    if (forkTurnId) { createBranch(forkTurnId); return; }
    if (target.closest("[data-adv-branch]")) {
      const run = getAdventureRun(currentRunId);
      const accepted = (run?.turns || []).filter((turn) => turn.status === "accepted");
      const targetTurn = accepted.length > 1 ? accepted[accepted.length - 2] : accepted[0];
      if (targetTurn) createBranch(targetTurn.id);
      return;
    }
    if (target.closest("[data-adv-configure]")) { deps.onOpenSettings?.(); return; }
    if (target.closest("[data-adv-dismiss-error]")) { errorState = null; renderError(); }
  };

  const onSubmit = (event) => {
    const createForm = event.target?.closest?.("[data-adv-create-form]");
    if (createForm) {
      event.preventDefault();
      const title = createForm.querySelector("[data-adv-world-title]")?.value || "";
      const subtitle = createForm.querySelector("[data-adv-world-subtitle]")?.value || "";
      const locationName = createForm.querySelector("[data-adv-world-location]")?.value || "";
      const openingText = createForm.querySelector("[data-adv-world-opening]")?.value || "";
      const result = createUserWorld({ title, subtitle, locationName, openingText });
      if (!result.ok) {
        deps.onToast?.(result.reason === "title_and_opening_required" ? "请填写世界名和开场" : "保存失败");
        return;
      }
      selectedPackageId = result.world.id;
      selectedOpeningId = result.world.openings[0]?.id || "";
      showCreate = false;
      createForm.reset();
      deps.onToast?.("世界已保存");
      setView("setup");
      renderSetup();
      return;
    }
    if (!event.target?.matches?.("[data-adv-form]")) return;
    event.preventDefault();
    submitAction();
  };

  const onKeydown = (event) => {
    if (event.target?.matches?.("[data-adv-input]") && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submitAction();
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("keydown", onKeydown);
  renderLibrary();
  setActionMode("do");

  return {
    open() {
      currentRunId = getActiveAdventureRun()?.id || currentRunId;
      if (view === "game" && currentRunId) renderGame({ keepScroll: true });
      else { setView("library"); renderLibrary(); }
    },
    refresh() {
      if (view === "game") renderGame({ keepScroll: true });
      else if (view === "setup") renderSetup();
      else renderLibrary();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("keydown", onKeydown);
      root.replaceChildren();
    },
  };
}
