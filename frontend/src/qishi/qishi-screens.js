/**
 * 栖市 HTML 片段（F7 H1）
 */

export function buildQishiScreenHtml() {
  return `
    <section class="mini-view mini-qishi" data-phone-screen="qishi" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-phone-i18n="qishi.title">栖市</strong><span data-phone-i18n="qishi.subtitle">待更新</span></div>
        <button type="button" class="mini-text-btn" data-qishi-sideload data-phone-i18n="qishi.sideload" data-phone-i18n-attr="title:qishi.sideloadTitle" title="高级：本机 zip">侧载</button>
      </header>
      <input type="file" accept=".zip,.yueqi-ext.zip,.yueqi-game.zip,application/zip" data-qishi-file hidden />

      <div class="mini-qishi-tabs" data-qishi-tabs hidden>
        <button type="button" class="is-active" data-qishi-tab="discover" data-phone-i18n="qishi.tabDiscover">精选</button>
        <button type="button" data-qishi-tab="charts" data-phone-i18n="qishi.tabCharts">排行</button>
        <button type="button" data-qishi-tab="installed" data-phone-i18n="qishi.tabInstalled">已装</button>
      </div>

      <div class="mini-app-scroll mini-qishi-body" data-phone-pane-view="qishi-list">
        <div class="mini-qishi-list" data-qishi-list></div>
      </div>

      <div class="mini-app-scroll mini-qishi-body" data-phone-pane-view="qishi-detail" hidden>
        <button type="button" class="mini-text-btn mini-qishi-back" data-qishi-back data-phone-i18n="qishi.backToMarket">返回市场</button>
        <div class="mini-qishi-detail" data-qishi-detail></div>
      </div>

      <div class="mini-app-scroll mini-qishi-body" data-phone-pane-view="qishi-report" hidden>
        <button type="button" class="mini-text-btn mini-qishi-back" data-qishi-back-detail data-phone-i18n="qishi.backToDetail">返回详情</button>
        <div class="mini-qishi-report" data-qishi-report></div>
      </div>

      <div class="mini-qishi-overlay" data-qishi-overlay hidden>
        <div class="mini-qishi-overlay__card">
          <p data-qishi-overlay-text data-phone-i18n="qishi.validating">正在校验…</p>
        </div>
      </div>
    </section>
  `;
}

export function buildExtHostScreenHtml() {
  return `
    <section class="mini-view mini-ext-host" data-phone-screen="ext-host" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back data-phone-i18n-aria="screens.back" aria-label="返回"><i data-lucide="chevron-left"></i></button>
        <div><strong data-ext-host-title data-phone-i18n="qishi.extTitle">扩展</strong><span data-phone-i18n="qishi.extSubtitle">栖机扩展</span></div>
        <button type="button" class="mini-icon-button" data-ext-host-more data-phone-i18n-aria="qishi.more" aria-label="更多"><i data-lucide="ellipsis"></i></button>
      </header>
      <div class="mini-ext-host-menu" data-ext-host-menu hidden>
        <button type="button" data-ext-menu-perms data-phone-i18n="qishi.permissions">权限</button>
        <button type="button" data-ext-menu-report data-phone-i18n="qishi.reportTitle">举报</button>
      </div>
      <div class="mini-ext-runtime-mount" data-ext-runtime-mount></div>
    </section>
  `;
}

export function buildGateSettingsSectionsHtml({ localChatEnabled = false } = {}) {
  return `
        <div class="mini-settings-block" data-gate-section>
          <strong data-phone-i18n="qishi.settings.accountGate">栖市</strong>
          <p class="mini-app-lead" data-phone-i18n="qishi.settings.accountGateLead">本机可用，不必登录。侧载与已装扩展在本机生效。</p>
        </div>
        <div class="mini-settings-block" data-age-gate-section>
          <strong data-phone-i18n="qishi.settings.complianceAge">合规与年龄</strong>
          <label class="mini-settings-row mini-switch-row">
            <span data-phone-i18n="qishi.settings.enableAdultGate">启用成年确认门槛</span>
            <input type="checkbox" data-age-gate-enabled />
          </label>
          <div data-age-gate-form hidden>
            <label class="mini-settings-row mini-settings-row--field"><span data-phone-i18n="qishi.settings.birthYear">出生年</span><input type="number" min="1900" max="2100" data-age-birth-year placeholder="2000" /></label>
            <label class="mini-settings-row"><span><input type="checkbox" data-age-confirm /> <span data-phone-i18n="qishi.settings.adultConfirm">我确认已年满 18 周岁</span></span></label>
            <button type="button" class="mini-settings-row" data-age-gate-save><i data-lucide="check"></i><span data-phone-i18n="qishi.settings.saveAdultConfirm">保存成年确认</span><i data-lucide="chevron-right"></i></button>
          </div>
          <p class="mini-app-lead" data-age-gate-status></p>
        </div>
        <div class="mini-settings-block" data-report-queue-section>
          <strong data-phone-i18n="qishi.settings.contentReports">内容与举报</strong>
          <button type="button" class="mini-settings-row" data-open-report-queue><i data-lucide="flag"></i><span data-phone-i18n="qishi.settings.reportQueue">举报队列</span><i data-lucide="chevron-right"></i></button>
          <div class="mini-report-queue" data-report-queue hidden></div>
        </div>
        <div class="mini-settings-block" data-local-chat-section ${localChatEnabled ? "" : "hidden"}>
          <strong data-phone-i18n="qishi.settings.localChat">本地聊天助手</strong>
          <p class="mini-app-lead" data-phone-i18n="qishi.settings.localChatLead">通过剪贴板或粘贴导入文本为 Pop 草稿。不会对接外部聊天服务官方接口。</p>
          <label class="mini-settings-row mini-switch-row">
            <span data-phone-i18n="qishi.settings.enableBridge">启用桥接面板</span>
            <input type="checkbox" data-local-chat-enabled />
          </label>
          <div class="mini-local-chat" data-local-chat-bridge hidden>
            <textarea rows="4" data-local-chat-paste data-phone-i18n-placeholder="qishi.settings.pasteText" placeholder="粘贴要导入的文本"></textarea>
            <p class="mini-local-chat-preview" data-local-chat-preview></p>
            <div class="mini-local-chat-actions">
              <button type="button" class="mini-app-cta" data-local-chat-import data-phone-i18n="qishi.settings.importDraft">导入为 Pop 草稿</button>
              <button type="button" class="mini-ghost-btn" data-local-chat-clear data-phone-i18n="qishi.settings.clear">清空</button>
            </div>
          </div>
        </div>
        <div class="mini-settings-block" data-ext-dev-section>
          <strong data-phone-i18n="qishi.settings.extensionsMarket">扩展与栖市</strong>
          <label class="mini-settings-row mini-switch-row">
            <span data-phone-i18n="qishi.settings.experimentalBridge">实验 · 桥接面板</span>
            <input type="checkbox" data-local-chat-master />
          </label>
          <div data-ext-perm-manage></div>
        </div>
  `;
}
