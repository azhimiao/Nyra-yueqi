/**
 * Phone UI: autonomy settings, activity center, agent permissions, developer diagnostics.
 */

import { switchHtml } from "../phone-shell/phone-controls.js";
import { pt } from "../phone-shell/i18n.js";
import {
  autonomyStatusSummary,
  loadAutonomyPrefs,
  AUTONOMY_PRESETS,
} from "./autonomy-prefs.js";
import { listActivity } from "./activity-log.js";
import { getAgentPrefs, AGENT_RESOURCE_KEYS } from "../agent/capabilities/prefs.js";
import { getLocale } from "../i18n/index.js";
import { labelLifeMood } from "../status/labels.js";

const RESOURCE_LABEL_KEYS = {
  character: "agentPerms.resCharacter",
  worldbook: "agentPerms.resWorldbook",
  scenario: "agentPerms.resScenario",
  diary: "agentPerms.resDiary",
  chat: "agentPerms.resChat",
  gallery: "agentPerms.resGallery",
  settings: "agentPerms.resSettings",
};

export function buildAutonomySettingsScreenHtml() {
  const p = loadAutonomyPrefs();
  return `
    <section class="mini-view mini-autonomy" data-phone-screen="autonomy" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="autonomy.title">陪伴与主动行为</strong><span data-phone-i18n="autonomy.subtitle">自主生活</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-settings-list">
        <div class="mini-settings-block">
          <strong data-phone-i18n="autonomy.presetTitle">预设模式</strong>
          <p class="mini-app-lead" data-phone-i18n="autonomy.presetLead">安静不主动；陪伴适度；沉浸更多生活事件。可随时改成自定义。</p>
          <div class="mini-segmented" data-autonomy-preset role="group" data-phone-i18n-aria="autonomy.presetGroup" aria-label="预设">
            <button type="button" class="mini-segment ${p.preset === "quiet" ? "is-active" : ""}" data-autonomy-preset-id="quiet" data-phone-i18n="autonomy.presetQuiet">安静</button>
            <button type="button" class="mini-segment ${p.preset === "companion" ? "is-active" : ""}" data-autonomy-preset-id="companion" data-phone-i18n="autonomy.presetCompanion">陪伴</button>
            <button type="button" class="mini-segment ${p.preset === "immersive" ? "is-active" : ""}" data-autonomy-preset-id="immersive" data-phone-i18n="autonomy.presetImmersive">沉浸</button>
            <button type="button" class="mini-segment ${p.preset === "custom" ? "is-active" : ""}" data-autonomy-preset-id="custom" data-phone-i18n="autonomy.presetCustom">自定义</button>
          </div>
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="autonomy.masterTitle">总开关</strong>
          ${switchHtml({ label: pt("autonomy.aiAutonomousLife"), labelKey: "autonomy.aiAutonomousLife", checked: p.aiAutonomousLife, attrs: 'data-autonomy-flag="aiAutonomousLife"' })}
          <p class="mini-form-hint" data-phone-i18n="autonomy.aiAutonomousLifeHint">关闭后停止主动消息、自动日记/动态、离散生活事件与相关通知；不影响你主动打开 Pop 聊天。</p>
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="autonomy.togglesTitle">分项</strong>
          ${switchHtml({ label: pt("autonomy.proactiveMessage"), labelKey: "autonomy.proactiveMessage", checked: p.proactiveMessage, attrs: 'data-autonomy-flag="proactiveMessage"' })}
          ${switchHtml({ label: pt("autonomy.autoDiary"), labelKey: "autonomy.autoDiary", checked: p.autoDiary, attrs: 'data-autonomy-flag="autoDiary"' })}
          ${switchHtml({ label: pt("autonomy.autoMoments"), labelKey: "autonomy.autoMoments", checked: p.autoMoments, attrs: 'data-autonomy-flag="autoMoments"' })}
          ${switchHtml({ label: pt("autonomy.anniversaryProactive"), labelKey: "autonomy.anniversaryProactive", checked: p.anniversaryProactive, attrs: 'data-autonomy-flag="anniversaryProactive"' })}
          ${switchHtml({ label: pt("autonomy.scenarioMemory"), labelKey: "autonomy.scenarioMemory", checked: p.scenarioMemory, attrs: 'data-autonomy-flag="scenarioMemory"' })}
          ${switchHtml({ label: pt("autonomy.gameMemory"), labelKey: "autonomy.gameMemory", checked: p.gameMemory, attrs: 'data-autonomy-flag="gameMemory"' })}
          ${switchHtml({ label: pt("autonomy.systemNotifications"), labelKey: "autonomy.systemNotifications", checked: p.systemNotifications, attrs: 'data-autonomy-flag="systemNotifications"' })}
          ${switchHtml({ label: pt("autonomy.deskPetVisible"), labelKey: "autonomy.deskPetVisible", checked: p.deskPetVisible, attrs: 'data-autonomy-flag="deskPetVisible"' })}
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="autonomy.limitsTitle">频率与限额</strong>
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.frequency">主动频率</span>
            <select data-autonomy-field="frequency">
              <option value="low" ${p.frequency === "low" ? "selected" : ""} data-phone-i18n="autonomy.freqLow">低</option>
              <option value="medium" ${p.frequency === "medium" ? "selected" : ""} data-phone-i18n="autonomy.freqMedium">中</option>
              <option value="high" ${p.frequency === "high" ? "selected" : ""} data-phone-i18n="autonomy.freqHigh">高</option>
            </select>
          </label>
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.dailyCap">每日上限</span>
            <input type="number" min="0" max="20" data-autonomy-field="dailyCap" value="${p.dailyCap}" />
          </label>
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.quietStart">安静开始</span>
            <input type="time" data-autonomy-field="quietStart" value="${p.quietStart}" />
          </label>
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.quietEnd">安静结束</span>
            <input type="time" data-autonomy-field="quietEnd" value="${p.quietEnd}" />
          </label>
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="autonomy.resourcesTitle">资源与电量</strong>
          ${switchHtml({ label: pt("autonomy.wifiOnlyMedia"), labelKey: "autonomy.wifiOnlyMedia", checked: p.wifiOnlyMedia, attrs: 'data-autonomy-flag="wifiOnlyMedia"' })}
          ${switchHtml({ label: pt("autonomy.lowBatteryPause"), labelKey: "autonomy.lowBatteryPause", checked: p.lowBatteryPauseCompanion, attrs: 'data-autonomy-flag="lowBatteryPauseCompanion"' })}
          ${switchHtml({ label: pt("autonomy.powerSaveNoMedia"), labelKey: "autonomy.powerSaveNoMedia", checked: p.powerSaveNoMedia, attrs: 'data-autonomy-flag="powerSaveNoMedia"' })}
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.dailyModelBudget">每日模型调用预算</span>
            <input type="number" min="0" max="500" data-autonomy-field="dailyModelBudget" value="${p.dailyModelBudget}" />
          </label>
          <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="autonomy.dailyProactiveBudget">每日主动行为预算</span>
            <input type="number" min="0" max="50" data-autonomy-field="dailyProactiveBudget" value="${p.dailyProactiveBudget}" />
          </label>
        </div>
      </div>
    </section>
  `;
}

export function buildActivityCenterScreenHtml() {
  return `
    <section class="mini-view mini-activity" data-phone-screen="activity" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="activity.title">活动中心</strong><span data-phone-i18n="activity.subtitle">角色与任务</span></div>
        <button type="button" class="mini-icon-button" data-phone-open="tasks" data-phone-i18n-aria="activity.tasks" aria-label="任务"><i data-lucide="list-checks"></i></button>
      </header>
      <div class="mini-app-scroll" data-activity-center-root>
        <div class="mini-settings-block" data-activity-role-status></div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="activity.runningTasks">正在运行的任务</strong>
          <div data-activity-running-tasks><p class="mini-app-lead" data-phone-i18n="activity.noRunningTasks">暂无运行中的任务</p></div>
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="activity.recent">最近活动</strong>
          <div data-activity-recent-list></div>
        </div>
        <div class="mini-settings-block" data-activity-detail hidden>
          <strong data-phone-i18n="activity.detail">详情</strong>
          <div data-activity-detail-body></div>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-activity-detail-close data-phone-i18n="activity.closeDetail">关闭详情</button>
        </div>
      </div>
    </section>
  `;
}

export function buildAgentPermissionsScreenHtml() {
  const p = getAgentPrefs();
  const resourceRows = AGENT_RESOURCE_KEYS.map((key) => `
    <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="${RESOURCE_LABEL_KEYS[key] || key}">${escapeText(pt(RESOURCE_LABEL_KEYS[key] || key))}</span>
      <select data-agent-resource="${key}">
        <option value="deny" ${p.resources[key] === "deny" ? "selected" : ""} data-phone-i18n="agentPerms.permDeny">禁止</option>
        <option value="read_once" ${p.resources[key] === "read_once" ? "selected" : ""} data-phone-i18n="agentPerms.permReadOnce">本次只读</option>
        <option value="allow_read" ${p.resources[key] === "allow_read" ? "selected" : ""} data-phone-i18n="agentPerms.permAllowRead">允许读取</option>
        <option value="ask_write" ${p.resources[key] === "ask_write" ? "selected" : ""} data-phone-i18n="agentPerms.permAskWrite">写入需审批</option>
      </select>
    </label>
  `).join("");
  return `
    <section class="mini-view mini-agent-perms" data-phone-screen="agent-perms" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="agentPerms.title">Agent 权限</strong><span data-phone-i18n="agentPerms.subtitle">助手与探索</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-settings-list">
        <div class="mini-settings-block">
          <strong data-phone-i18n="agentPerms.capabilitiesTitle">能力开关</strong>
          ${switchHtml({ label: pt("agentPerms.localAgentEnabled"), labelKey: "agentPerms.localAgentEnabled", checked: p.localAgentEnabled, attrs: 'data-agent-flag="localAgentEnabled"' })}
          ${switchHtml({ label: pt("agentPerms.exploreFilesEnabled"), labelKey: "agentPerms.exploreFilesEnabled", checked: p.exploreFilesEnabled, attrs: 'data-agent-flag="exploreFilesEnabled"' })}
          ${switchHtml({ label: pt("agentPerms.showPlanBeforeRun"), labelKey: "agentPerms.showPlanBeforeRun", checked: p.showPlanBeforeRun, attrs: 'data-agent-flag="showPlanBeforeRun"' })}
          ${switchHtml({ label: pt("agentPerms.askBeforeWrite"), labelKey: "agentPerms.askBeforeWrite", checked: p.askBeforeWrite, attrs: 'data-agent-flag="askBeforeWrite"' })}
          ${switchHtml({ label: pt("agentPerms.allowInstallSkills"), labelKey: "agentPerms.allowInstallSkills", checked: p.allowInstallSkills, attrs: 'data-agent-flag="allowInstallSkills"' })}
          ${switchHtml({ label: pt("agentPerms.dailyBriefingEnabled"), labelKey: "agentPerms.dailyBriefingEnabled", checked: p.dailyBriefingEnabled, attrs: 'data-agent-flag="dailyBriefingEnabled"' })}
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="agentPerms.resourcesTitle">按资源权限</strong>
          <p class="mini-app-lead" data-phone-i18n="agentPerms.resourcesLead">默认：聊天/日记/相册禁止；生产写入每次审批；不允许全盘扫描。</p>
          ${resourceRows}
        </div>
      </div>
    </section>
  `;
}

export function buildDeveloperDiagnosticsScreenHtml() {
  return `
    <section class="mini-view mini-devtools" data-phone-screen="devtools" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="devtools.title">开发者诊断</strong><span data-phone-i18n="devtools.subtitle">Runtime</span></div>
        <span></span>
      </header>
      <div class="mini-app-scroll mini-settings-list" data-devtools-root>
        <pre class="mini-devtools-pre" data-devtools-status data-phone-i18n="devtools.loading">加载中…</pre>
        <div class="mini-settings-block" data-cutover-profile-panel>
          <strong>产品切流 (C1)</strong>
          <p class="mini-form-hint">开发者：legacy / internal_v1 / production_v1。默认 legacy；production_v1 在 C8 前不得作为安装默认。</p>
          <label class="mini-settings-row mini-settings-row--field"><span>Cutover profile</span>
            <select data-cutover-profile-select aria-label="Cutover profile">
              <option value="legacy">legacy</option>
              <option value="internal_v1">internal_v1</option>
              <option value="production_v1">production_v1</option>
            </select>
          </label>
          <p class="mini-form-hint">当前：<span data-cutover-profile-name>legacy</span></p>
          <pre class="mini-devtools-pre mini-devtools-pre--compact" data-cutover-effective-flags>—</pre>
        </div>
        <div class="mini-settings-block">
          <strong>Palace 普查</strong>
          <pre class="mini-devtools-pre mini-devtools-pre--compact" data-palace-census-panel>加载中…</pre>
          <button type="button" class="mini-settings-row" data-devtools-action="export-palace-census"><span>导出 Palace census JSON</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-devtools-action="rebuild-palace" data-palace-rebuild><span>从权威源重建 Palace/Graph</span><i data-lucide="chevron-right"></i></button>
          <p class="mini-form-hint" data-palace-rebuild-status hidden></p>
        </div>
        <div class="mini-settings-block">
          <strong>体验 App 归档</strong>
          <pre class="mini-devtools-pre mini-devtools-pre--compact" data-experience-archive-panel>加载中…</pre>
          <button type="button" class="mini-settings-row" data-devtools-action="export-experience-archive"><span>导出只读归档包（不删除）</span><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="mini-settings-block">
          <strong data-phone-i18n="devtools.actions">操作</strong>
          <button type="button" class="mini-settings-row" data-devtools-action="simulate-time"><span data-phone-i18n="devtools.simulateTime">模拟时间经过</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-devtools-action="trigger-proactive"><span data-phone-i18n="devtools.triggerProactive">触发一次主动事件</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-devtools-action="create-test-task"><span data-phone-i18n="devtools.createTestTask">创建测试任务</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-devtools-action="clear-workspaces"><span data-phone-i18n="devtools.clearWorkspaces">清空测试 Workspace</span><i data-lucide="chevron-right"></i></button>
          <button type="button" class="mini-settings-row" data-devtools-action="export-report"><span data-phone-i18n="devtools.exportReport">导出脱敏诊断报告</span><i data-lucide="chevron-right"></i></button>
        </div>
        <p class="mini-form-hint" data-phone-i18n="devtools.hint">此页仅在开发者模式显示，不进默认导航。</p>
      </div>
    </section>
  `;
}

export function buildAutonomyOnboardingHtml() {
  return `
    <div class="mini-autonomy-onboard" data-autonomy-onboard hidden>
      <div class="mini-autonomy-onboard__card">
        <strong data-phone-i18n="autonomy.onboardTitle">选择陪伴方式</strong>
        <p data-phone-i18n="autonomy.onboardLead">角色可以适度主动联系你、写日记或发动态。首次请选择一种模式——不会静默开启高频主动。</p>
        <ul class="mini-autonomy-onboard__list">
          <li data-phone-i18n="autonomy.onboardQuiet">安静：不主动联系，不自动日记/动态；你聊天仍可用。</li>
          <li data-phone-i18n="autonomy.onboardCompanion">陪伴：适度主动，允许日记与动态，有安静时段与每日上限。</li>
          <li data-phone-i18n="autonomy.onboardImmersive">沉浸：更多生活事件；情景剧/游戏经历可进入关系记忆。</li>
        </ul>
        <div class="mini-autonomy-onboard__actions">
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-autonomy-onboard-pick="quiet" data-phone-i18n="autonomy.onboardQuietBtn">安静模式</button>
          <button type="button" class="mini-app-cta" data-autonomy-onboard-pick="companion" data-phone-i18n="autonomy.onboardCompanionBtn">陪伴模式</button>
          <button type="button" class="mini-app-cta mini-app-cta--ghost" data-autonomy-onboard-pick="immersive" data-phone-i18n="autonomy.onboardImmersiveBtn">沉浸模式</button>
        </div>
      </div>
    </div>
  `;
}

export function renderActivityRoleStatusHtml(characterName = "", life = {}, nextWakeAt = 0) {
  const s = autonomyStatusSummary();
  const locale = getLocale() === "en" ? "en-US" : "zh-CN";
  const name = characterName || pt("pop.defaultCharacter");
  const next = nextWakeAt > 0
    ? new Date(nextWakeAt).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" })
    : pt("activity.notScheduled");
  const moodLabel = life.currentMood ? labelLifeMood(life.currentMood) : "—";
  const onOff = (flag) => (flag ? pt("activity.on") : pt("activity.off"));
  const autoState = s.aiAutonomousLife ? pt("activity.autonomousOn") : pt("activity.autonomousOff");
  return `
    <strong>${escapeText(pt("activity.statusTitle"))}</strong>
    <p class="mini-app-lead">${escapeText(name)} · ${escapeText(pt("activity.mood"))} ${escapeText(moodLabel)}</p>
    <ul class="mini-activity-facts">
      <li>${escapeText(pt("activity.autonomousLife"))}：${escapeText(autoState)}（${escapeText(presetLabel(s.preset))}）</li>
      <li>${escapeText(pt("activity.proactiveToday"))}：${s.usedToday} / ${s.dailyCap}</li>
      <li>${escapeText(pt("activity.quietHours"))}：${s.quietStart}–${s.quietEnd}${s.inQuietHours ? escapeText(pt("activity.inQuietNow")) : ""}</li>
      <li>${escapeText(pt("activity.nextScheduled"))}：${escapeText(next)}</li>
      <li>${escapeText(pt("activity.proactiveReach"))}：${onOff(s.proactiveMessage)} · ${escapeText(pt("activity.diaryShort"))} ${onOff(s.autoDiary)} · ${escapeText(pt("activity.momentsShort"))} ${onOff(s.autoMoments)}</li>
    </ul>
  `;
}

export function renderActivityListHtml(items = listActivity(30)) {
  if (!items.length) return `<p class="mini-app-lead">${escapeText(pt("activity.noActivity"))}</p>`;
  return items.map((item) => `
    <button type="button" class="mini-settings-row mini-activity-row" data-activity-id="${escapeAttr(item.id)}">
      <span>
        <strong>${escapeText(item.title)}</strong>
        <em>${formatWhen(item.at)}</em>
      </span>
      <i data-lucide="chevron-right"></i>
    </button>
  `).join("");
}

export function renderActivityDetailHtml(item) {
  if (!item) return "";
  const yesNo = (flag) => (flag ? pt("activity.yes") : pt("activity.no"));
  const joinOrNone = (items, sep = "、") => {
    const list = (items || []).filter(Boolean);
    return list.length ? list.join(sep) : pt("activity.none");
  };
  return `
    <p><b>${escapeText(item.title)}</b></p>
    <ul class="mini-activity-facts">
      <li>${escapeText(pt("activity.triggerReason"))}：${escapeText(item.reason || "—")}</li>
      <li>${escapeText(pt("activity.capabilityUsed"))}：${escapeText(item.capability || "—")}</li>
      <li>${escapeText(pt("activity.resourcesRead"))}：${escapeText(joinOrNone(item.resourcesRead))}</li>
      <li>${escapeText(pt("activity.changesMade"))}：${escapeText(joinOrNone(item.changes))}</li>
      <li>${escapeText(pt("activity.usedModel"))}：${escapeText(yesNo(item.usedModel))}</li>
      <li>${escapeText(pt("activity.costHint"))}：${escapeText(item.costHint || pt("activity.costDefault"))}</li>
      <li>${escapeText(pt("activity.undoable"))}：${item.undoable ? escapeText(item.undoHint || pt("activity.undoHint")) : escapeText(pt("activity.notUndoable"))}</li>
    </ul>
  `;
}

function presetLabel(id) {
  return ({
    quiet: pt("autonomy.presetQuietLabel"),
    companion: pt("autonomy.presetCompanionLabel"),
    immersive: pt("autonomy.presetImmersiveLabel"),
    custom: pt("autonomy.presetCustomLabel"),
  })[id] || id;
}

function formatWhen(iso) {
  try {
    const locale = getLocale() === "en" ? "en-US" : "zh-CN";
    return new Date(iso).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function escapeText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, "&quot;");
}

export { AUTONOMY_PRESETS };
