import { escapeHtml, estimateTextTokens } from "../lib/utils.js";
import {
  clearTurnTraces,
  exportTurnTraces,
  finishTurnTrace,
  getTurnTrace,
  listTurnTraces,
  startTurnTrace,
} from "../observability/turn-trace.js";
import {
  CUTOVER_PROFILES,
  describeEffectiveFlagSources,
  getCutoverProfile,
  setCutoverProfile,
} from "../features/cutover-profile.js";
import { capabilityRegistrySummary, listCapabilities } from "../capabilities/registry.js";
import { refreshIcons } from "../lib/icons.js";
import { listModelExecutionTraces } from "../observability/model-execution-trace.js";

const TABS = [
  ["overview", "总览"],
  ["model", "Model Runtime"],
  ["prompt", "Prompt Inspector"],
  ["retrieval", "检索"],
  ["actions", "能力"],
  ["raw", "原始数据"],
];

const PROFILE_LABELS = Object.freeze({
  legacy: "回滚 legacy",
  internal_v1: "内部 v1",
  production_v1: "产品 v1",
});

export function mountCompanionDebugConsole(root, { buildPreview } = {}) {
  if (!root) return { refresh() {}, destroy() {} };
  let activeTab = "overview";
  let selectedId = listTurnTraces()[0]?.id || "";
  let previewBusy = false;

  root.innerHTML = `
    <section class="cdc-control" aria-label="运行配置">
      <div class="cdc-control__copy">
        <strong>当前运行路径</strong>
        <span data-cdc-profile-summary></span>
      </div>
      <label class="cdc-profile">
        <span>配置</span>
        <select data-cdc-profile>
          ${CUTOVER_PROFILES.map((item) => `<option value="${item}">${PROFILE_LABELS[item] || item}</option>`).join("")}
        </select>
      </label>
    </section>

    <form class="cdc-preview" data-cdc-preview-form>
      <label for="cdcPreviewInput">无副作用预演</label>
      <div class="cdc-preview__composer">
        <textarea id="cdcPreviewInput" rows="2" maxlength="8000" data-cdc-preview-input placeholder="输入一条消息，查看会检索什么、怎样组装 Prompt、会提出哪些能力调用"></textarea>
        <button type="submit" data-cdc-preview-submit><i data-lucide="play"></i><span>组装</span></button>
      </div>
      <p data-cdc-preview-status>不会调用模型，不会写日历、记忆或外部服务。</p>
    </form>

    <div class="cdc-layout">
      <aside class="cdc-runs" aria-label="Turn 列表">
        <header><strong>最近 Turn</strong><span data-cdc-run-count></span></header>
        <div class="cdc-run-list" data-cdc-run-list></div>
        <footer>
          <button type="button" data-cdc-export><i data-lucide="download"></i><span>导出</span></button>
          <button type="button" data-cdc-clear><i data-lucide="trash-2"></i><span>清空</span></button>
        </footer>
      </aside>

      <section class="cdc-detail" aria-live="polite">
        <header class="cdc-detail__head">
          <div><small data-cdc-detail-origin>尚无 Turn</small><strong data-cdc-detail-title>先发送消息或运行预演</strong></div>
          <button type="button" data-cdc-copy aria-label="复制本次 Turn"><i data-lucide="copy"></i></button>
        </header>
        <nav class="cdc-tabs" aria-label="链路详情">
          ${TABS.map(([id, label]) => `<button type="button" data-cdc-tab="${id}"${id === activeTab ? " class=\"is-active\"" : ""}>${label}</button>`).join("")}
        </nav>
        <div class="cdc-detail__body" data-cdc-detail-body></div>
      </section>
    </div>
  `;

  const profileSelect = root.querySelector("[data-cdc-profile]");
  const previewForm = root.querySelector("[data-cdc-preview-form]");
  const previewInput = root.querySelector("[data-cdc-preview-input]");
  const previewStatus = root.querySelector("[data-cdc-preview-status]");

  function renderProfile() {
    const profile = getCutoverProfile();
    if (profileSelect) profileSelect.value = profile;
    const rows = describeEffectiveFlagSources(profile);
    const enabled = rows.filter((row) => row.value).length;
    const summary = root.querySelector("[data-cdc-profile-summary]");
    if (summary) summary.textContent = `${enabled}/${rows.length} 条新链路启用`;
  }

  function renderRuns() {
    const rows = listTurnTraces();
    if (selectedId && !rows.some((row) => row.id === selectedId)) selectedId = rows[0]?.id || "";
    const count = root.querySelector("[data-cdc-run-count]");
    if (count) count.textContent = String(rows.length);
    const list = root.querySelector("[data-cdc-run-list]");
    if (!list) return;
    list.innerHTML = rows.length ? rows.map((row) => {
      const selected = row.id === selectedId;
      const input = String(row.input?.text || row.route?.action || "无文本输入").trim();
      const time = formatShortTime(row.createdAt);
      return `<button type="button" class="cdc-run${selected ? " is-active" : ""}" data-cdc-run="${escapeHtml(row.id)}">
        <span class="cdc-run__state is-${escapeHtml(row.status || "running")}" aria-hidden="true"></span>
        <span><strong>${escapeHtml(input.slice(0, 46) || "继续回复")}</strong><small>${escapeHtml(row.origin || "companion_chat")} · ${escapeHtml(time)}</small></span>
      </button>`;
    }).join("") : `<p class="cdc-empty">发送一条聊天消息后，这里会出现真实链路。</p>`;
  }

  function renderDetail() {
    const trace = selectedId ? getTurnTrace(selectedId) : null;
    const origin = root.querySelector("[data-cdc-detail-origin]");
    const title = root.querySelector("[data-cdc-detail-title]");
    const body = root.querySelector("[data-cdc-detail-body]");
    if (!body) return;
    if (!trace) {
      if (origin) origin.textContent = "尚无 Turn";
      if (title) title.textContent = "先发送消息或运行预演";
      body.innerHTML = renderCapabilityLanding();
      return;
    }
    if (origin) origin.textContent = `${trace.origin || "companion_chat"} · ${trace.status || "running"}`;
    if (title) title.textContent = String(trace.input?.text || "继续回复").slice(0, 80);
    body.innerHTML = renderTab(trace, activeTab);
  }

  function refresh() {
    renderProfile();
    renderRuns();
    renderDetail();
    refreshIcons();
  }

  root.addEventListener("click", async (event) => {
    const run = event.target.closest("[data-cdc-run]");
    if (run) {
      selectedId = run.dataset.cdcRun || "";
      refresh();
      return;
    }
    const tab = event.target.closest("[data-cdc-tab]");
    if (tab) {
      activeTab = tab.dataset.cdcTab || "overview";
      root.querySelectorAll("[data-cdc-tab]").forEach((item) => item.classList.toggle("is-active", item === tab));
      renderDetail();
      refreshIcons();
      return;
    }
    if (event.target.closest("[data-cdc-clear]")) {
      clearTurnTraces();
      selectedId = "";
      refresh();
      return;
    }
    if (event.target.closest("[data-cdc-export]")) {
      downloadText("yueqi-turn-traces.json", exportTurnTraces());
      return;
    }
    if (event.target.closest("[data-cdc-copy]")) {
      const trace = selectedId ? getTurnTrace(selectedId) : null;
      if (trace) await copyText(JSON.stringify(trace, null, 2));
    }
  });

  profileSelect?.addEventListener("change", () => {
    setCutoverProfile(profileSelect.value);
    refresh();
  });

  previewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (previewBusy || typeof buildPreview !== "function") return;
    const text = String(previewInput?.value || "").trim();
    if (!text) {
      previewInput?.focus();
      return;
    }
    previewBusy = true;
    const button = root.querySelector("[data-cdc-preview-submit]");
    button?.setAttribute("disabled", "");
    if (previewStatus) previewStatus.textContent = "正在读取上下文并组装，不会执行能力……";
    const trace = startTurnTrace({ origin: "debug_preview", input: { text }, meta: { dryRun: true } });
    try {
      const result = await buildPreview(text);
      finishTurnTrace(trace.id, { ...result, status: "preview" });
      selectedId = trace.id;
      activeTab = "overview";
      root.querySelectorAll("[data-cdc-tab]").forEach((item) => item.classList.toggle("is-active", item.dataset.cdcTab === activeTab));
      if (previewStatus) previewStatus.textContent = "预演完成：没有调用模型，也没有执行任何能力。";
    } catch (error) {
      finishTurnTrace(trace.id, { status: "failed", error: { message: String(error?.message || error) } });
      selectedId = trace.id;
      if (previewStatus) previewStatus.textContent = `预演失败：${error?.message || error}`;
    } finally {
      previewBusy = false;
      button?.removeAttribute("disabled");
      refresh();
    }
  });

  const onTrace = (event) => {
    if (!selectedId && event.detail?.trace?.id) selectedId = event.detail.trace.id;
    refresh();
  };
  const onModelTrace = () => {
    if (activeTab === "model") renderDetail();
  };
  globalThis.addEventListener?.("yueqi:turn-trace", onTrace);
  globalThis.addEventListener?.("yueqi:model-execution-trace", onModelTrace);
  refresh();

  return {
    refresh,
    destroy() {
      globalThis.removeEventListener?.("yueqi:turn-trace", onTrace);
      globalThis.removeEventListener?.("yueqi:model-execution-trace", onModelTrace);
    },
  };
}

function renderTab(trace, tab) {
  if (tab === "model") return renderModelRuntime(trace);
  if (tab === "prompt") return renderPrompt(trace);
  if (tab === "retrieval") return renderRetrieval(trace);
  if (tab === "actions") return renderActions(trace);
  if (tab === "raw") return `<pre class="cdc-json">${escapeHtml(JSON.stringify(trace, null, 2))}</pre>`;
  return renderOverview(trace);
}

function renderModelRuntime(trace) {
  const turnExecutionId = String(trace?.turnExecutionId || trace?.scope?.turnExecutionId || "");
  const rows = listModelExecutionTraces(turnExecutionId ? { turnExecutionId } : {}).slice(-40).reverse();
  return `
    <section class="cdc-section">
      <header><h3>Model Runtime</h3><span>${rows.length} executions</span></header>
      <p class="cdc-empty" style="margin:0 0 .5rem">Only execution metadata is retained. Prompt text and API keys are not stored here.</p>
      ${rows.length ? `<div class="cdc-message-list">${rows.map((row) => `
        <details class="cdc-message">
          <summary><strong>${escapeHtml(row.businessPurpose || "model.unspecified")}</strong><span>${row.success === true ? "success" : row.success === false ? "failed" : "running"} · ${row.latencyMs ?? "-"} ms</span></summary>
          <pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>
        </details>`).join("")}</div>` : `<p class="cdc-empty">No model execution is linked to this turn.</p>`}
    </section>
  `;
}

function renderOverview(trace) {
  const steps = [
    ["输入", true],
    ["上下文", Boolean(trace.retrieval || trace.prompt)],
    ["检索", Boolean(trace.retrieval)],
    ["Prompt", Boolean(trace.prompt?.messages?.length)],
    ["预算", Boolean(trace.prompt?.budget)],
    ["模型", Boolean(trace.response || (trace.model && trace.model.called !== false))],
    ["理解", Boolean(trace.understanding)],
    ["能力", Boolean(trace.capabilities || trace.directAction)],
  ];
  const budget = trace.prompt?.budget;
  const summary = capabilityRegistrySummary();
  return `
    <ol class="cdc-pipeline">
      ${steps.map(([label, done], index) => `<li class="${done ? "is-done" : ""}"><span>${index + 1}</span><strong>${label}</strong></li>`).join("")}
    </ol>
    <dl class="cdc-metrics">
      <div><dt>状态</dt><dd>${escapeHtml(trace.status || "running")}</dd></div>
      <div><dt>Prompt 输入</dt><dd>${budget ? `${budget.finalInputTokens} / ${budget.inputLimit}` : "—"}</dd></div>
      <div><dt>输出上限</dt><dd>${budget?.outputReserveTokens || trace.model?.maxOutputTokens || "—"}</dd></div>
      <div><dt>能力</dt><dd>${summary.enabledByDefault}/${summary.total} 可用</dd></div>
    </dl>
    ${trace.error ? `<p class="cdc-callout is-error"><strong>失败</strong>${escapeHtml(trace.error.message || "未知错误")}</p>` : ""}
    <section class="cdc-narrative">
      <h3>本次发生了什么</h3>
      <p>${escapeHtml(describeTurn(trace))}</p>
    </section>
  `;
}

function renderPrompt(trace) {
  const messages = trace.prompt?.messages || [];
  const blocks = trace.prompt?.blocks || [];
  const brokerBlocks = trace.retrieval?.blocks || trace.retrieval?.implicitBlocks || [];
  const authority = Array.isArray(trace.prompt?.authorityOrder) ? trace.prompt.authorityOrder : [];
  const capabilitiesText = String(trace.prompt?.runtimeCapabilities || "").trim();
  return `
    <section class="cdc-section">
      <header><h3>Prompt Inspector</h3><span>v${escapeHtml(String(trace.prompt?.contractVersion || "—"))}</span></header>
      <dl class="cdc-metrics">
        <div><dt>Route</dt><dd>${escapeHtml(trace.route?.route || trace.origin || "—")}${trace.route?.action ? ` / ${escapeHtml(trace.route.action)}` : ""}</dd></div>
        <div><dt>TurnExecutionScope</dt><dd>${escapeHtml(String(trace.turnExecutionId || trace.prompt?.turnExecutionId || trace.scope?.turnExecutionId || "—"))} · ${escapeHtml(String(trace.scope?.characterId || trace.prompt?.characterId || "—"))}</dd></div>
        <div><dt>Character</dt><dd>${escapeHtml(trace.prompt?.characterName || trace.prompt?.characterId || "—")}</dd></div>
        <div><dt>Recall</dt><dd>${escapeHtml(String(trace.prompt?.whyRecall || trace.prompt?.recall?.whyRecall || trace.prompt?.recallDepth || "—"))}${trace.prompt?.recallReason ? ` (${escapeHtml(String(trace.prompt.recallReason))})` : ""}</dd></div>
        <div><dt>Turn intent</dt><dd>${escapeHtml(String(trace.prompt?.turnIntent || "—"))}</dd></div>
      </dl>
      ${authority.length ? `<p class="cdc-callout"><strong>Authority</strong> ${escapeHtml(authority.join(" → "))}</p>` : ""}
    </section>
    <section class="cdc-section">
      <header><h3>Final Model Request（messages[]）</h3><span>${messages.length} 条</span></header>
      <p class="cdc-empty" style="margin:0 0 .5rem">验收以本轮最终送模消息为准，不以模板文件「看起来合理」为准。</p>
      <div class="cdc-message-list">${messages.length ? messages.map((message, index) => `
        <details class="cdc-message"${index === 0 || message.role === "user" ? " open" : ""}>
          <summary><strong>#${index + 1} ${escapeHtml(message.role)}</strong><span>约 ${estimateTextTokens(message.content)} tokens</span></summary>
          <pre>${escapeHtml(message.content)}</pre>
        </details>`).join("") : `<p class="cdc-empty">这次 Turn 尚未形成模型请求。</p>`}</div>
    </section>
    <section class="cdc-section">
      <header><h3>Runtime Capabilities</h3></header>
      ${capabilitiesText ? `<pre class="cdc-json">${escapeHtml(capabilitiesText)}</pre>` : `<p class="cdc-empty">本轮未注入 Runtime Capabilities（或尚未组装）。</p>`}
    </section>
    <section class="cdc-section">
      <header><h3>Broker / Canonical Blocks</h3><span>${(brokerBlocks.length || blocks.length) || 0}</span></header>
      ${brokerBlocks.length
        ? `<div class="cdc-blocks">${brokerBlocks.map((block) => `<div><strong>${escapeHtml(block.id || block.blockId || "block")}</strong><span>${block.tokens ?? "—"} tk</span><small>${escapeHtml(block.source || "")}</small></div>`).join("")}</div>`
        : blocks.length
          ? `<div class="cdc-blocks">${blocks.map((block) => `<div><strong>${escapeHtml(block.id || block.blockId || "block")}</strong><span>${block.tokens ?? block.tokenEstimate ?? "—"} tk</span><small>${escapeHtml(block.source || block.trimReason || "")}</small></div>`).join("")}</div>`
          : `<p class="cdc-empty">无 Block 明细。</p>`}
    </section>
    ${trace.turnResult || trace.directAction || trace.response ? `
    <section class="cdc-section">
      <header><h3>Action / Response</h3></header>
      <pre class="cdc-json">${escapeHtml(JSON.stringify({
        turnResult: trace.turnResult || null,
        directAction: trace.directAction || null,
        response: trace.response?.text ? String(trace.response.text).slice(0, 800) : (trace.response || null),
      }, null, 2))}</pre>
    </section>` : ""}
  `;
}

function renderRetrieval(trace) {
  const retrieval = trace.retrieval;
  if (!retrieval) return `<p class="cdc-empty">这次 Turn 尚无 Context Broker 检索轨迹。</p>`;
  const coordinator = retrieval.retrievalCoordinator || {};
  return `
    <dl class="cdc-metrics">
      <div><dt>历史 tokens</dt><dd>${retrieval.historyTokens ?? "—"}</dd></div>
      <div><dt>托管容量</dt><dd>${retrieval.managedCapacity ?? "—"}</dd></div>
      <div><dt>Palace</dt><dd>${escapeHtml(coordinator.palaceBackend || (coordinator.palaceSkipped ? "skipped" : "—"))}</dd></div>
      <div><dt>外部检索</dt><dd>${retrieval.externalTokens ?? "—"}</dd></div>
    </dl>
    <details class="cdc-json-fold"><summary>查看完整 Broker Trace</summary><pre class="cdc-json">${escapeHtml(JSON.stringify(retrieval, null, 2))}</pre></details>
  `;
}

function renderActions(trace) {
  const capabilities = listCapabilities({ includeUnavailable: true });
  const understanding = trace.understanding || null;
  const dispatch = trace.capabilities || trace.directAction || null;
  return `
    <section class="cdc-section">
      <header><h3>本轮理解与执行</h3></header>
      ${understanding || dispatch
        ? `<pre class="cdc-json">${escapeHtml(JSON.stringify({ understanding, dispatch }, null, 2))}</pre>`
        : `<p class="cdc-empty">没有识别到能力调用，或这次 Turn 尚未进入理解阶段。</p>`}
    </section>
    <section class="cdc-section">
      <header><h3>统一能力注册表</h3><span>默认全开仅指已实现能力</span></header>
      <div class="cdc-capabilities">${capabilities.map((item) => `
        <div class="${item.implemented && item.enabledByDefault ? "is-enabled" : "is-unavailable"}">
          <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.operations.join(" / "))}</small></span>
          <em>${item.implemented ? item.risk : "未实现"}</em>
        </div>`).join("")}</div>
    </section>
  `;
}

function renderCapabilityLanding() {
  const summary = capabilityRegistrySummary();
  return `<section class="cdc-narrative"><h3>这里展示真实运行链路</h3><p>聊天发出后，依次显示 Context Broker、记忆检索、Prompt 分块、最终 token 预算、模型请求、Turn Understanding、ActionProposal 与执行结果。当前 ${summary.enabledByDefault} 项已实现能力默认启用；未实现能力会明确标记，不会伪装成功。</p></section>`;
}

function describeTurn(trace) {
  if (trace.origin === "debug_preview") return "这是一次无副作用预演：读取了真实上下文并完成 Prompt 和能力提案组装，但没有调用模型或执行工具。";
  if (trace.directAction) return `该消息命中了直接产品能力 ${trace.directAction.capabilityId || "unknown"}，结果已记录并反馈到聊天。`;
  if (trace.response) return "消息经过上下文检索、Prompt Authority 组装、最终预算和模型调用；回复及角色运行标记已回写。";
  if (trace.status === "failed") return "链路在完成前失败。打开其它页签可查看失败阶段与输入。";
  return "链路仍在运行，页面会随实际阶段自动更新。";
}

function formatShortTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable */ }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
