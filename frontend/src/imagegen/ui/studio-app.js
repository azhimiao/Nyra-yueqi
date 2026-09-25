/**
 * 绘境 App UI (F6 / G1).
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import { isImagegenConfigured, getImagegenSettings } from "../../settings/imagegen-preferences.js";
import { MAX_HISTORY_THUMBS, MAX_PROMPT_CHARS } from "../constants.js";
import { listImagegenJobs } from "../job-store.js";
import { runImagegenJob, saveJobToAlbum } from "../runner.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   onOpenLab?: () => void,
 *   onOpenGallery?: () => void,
 *   onToast?: (msg: string, action?: { label: string, onClick: () => void }) => void,
 *   storeMediaFile?: Function,
 *   getMediaRecord?: Function,
 *   resolveMediaUrl?: Function,
 *   readMediaBlob?: Function,
 * }} [deps]
 */
export function mountStudioApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };

  /** @type {"compose"|"result"} */
  let mode = "compose";
  let busy = false;
  let lastResult = null;
  let objectUrls = [];

  function revokeUrls() {
    objectUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    });
    objectUrls = [];
  }

  function toast(msg, action) {
    deps.onToast?.(msg, action);
  }

  function scrollLabImagegen() {
    deps.onOpenLab?.();
    requestAnimationFrame(() => {
      document.querySelector("[data-phone-imagegen-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function resolveJobUrl(job) {
    if (lastResult?.job?.id === job.id && lastResult.objectUrl) return lastResult.objectUrl;
    if (!job.mediaId || !deps.getMediaRecord || !deps.resolveMediaUrl) return "";
    try {
      const record = await deps.getMediaRecord(job.mediaId);
      if (!record) return "";
      return await deps.resolveMediaUrl(record);
    } catch {
      return "";
    }
  }

  async function render() {
    const configured = isImagegenConfigured();
    const jobs = listImagegenJobs().filter((j) => j.status === "succeeded" || j.status === "failed").slice(0, MAX_HISTORY_THUMBS);

    if (!configured && mode === "compose") {
      root.innerHTML = `
        <div class="mini-studio mini-studio--empty">
          <div class="mini-studio__empty-art" aria-hidden="true"></div>
          <strong>还没有配置生图接口</strong>
          <p>在接口页填写生图 Key 后即可开始绘制</p>
          <button type="button" class="mini-app-cta" data-studio-go-lab>去接口页</button>
        </div>
      `;
      wire();
      refreshIcons();
      return;
    }

    if (mode === "result" && lastResult) {
      const job = lastResult.job;
      const failed = job.status === "failed";
      const imgHtml = failed || !lastResult.objectUrl
        ? `<div class="mini-studio__error-card">
            <strong>生成失败</strong>
            <p>${escapeHtml(job.error || "生成失败，请稍后重试")}</p>
            <button type="button" class="mini-app-cta" data-studio-retry>重试</button>
          </div>`
        : `<img class="mini-studio__preview" src="${escapeHtml(lastResult.objectUrl)}" alt="生成结果" />`;

      root.innerHTML = `
        <div class="mini-studio mini-studio--result">
          <div class="mini-studio__stage">${imgHtml}</div>
          <div class="mini-studio__meta">
            <p class="mini-studio__prompt">${escapeHtml(job.prompt)}</p>
            <time>${escapeHtml(String(job.finishedAt || job.createdAt || "").slice(0, 16).replace("T", " "))}</time>
          </div>
          <div class="mini-studio__actions">
            ${!failed ? `<button type="button" class="mini-app-cta" data-studio-save ${job.photoId ? "disabled" : ""}>${job.photoId ? "已存入相册" : "存入相册"}</button>` : ""}
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-studio-again>再画一张</button>
            <button type="button" class="mini-app-cta mini-app-cta--ghost" data-studio-copy>复制描述</button>
          </div>
          ${await historyHtml(jobs)}
        </div>
      `;
      wire();
      refreshIcons();
      return;
    }

    const settings = getImagegenSettings();
    root.innerHTML = `
      <div class="mini-studio">
        <label class="mini-studio__field">
          <span>描述画面</span>
          <textarea data-studio-prompt maxlength="${MAX_PROMPT_CHARS}" rows="4" placeholder="例如：窗边的人影，傍晚，柔光"></textarea>
        </label>
        <p class="mini-studio__hint">模型 ${escapeHtml(settings.model || "dall-e-3")} · ${escapeHtml(settings.defaultSize || "1024x1024")}</p>
        <button type="button" class="mini-app-cta" data-studio-generate ${busy ? "disabled" : ""}>
          ${busy ? "正在绘制…" : "生成"}
        </button>
        ${busy ? '<p class="mini-studio__progress" aria-live="polite">正在绘制…</p>' : ""}
        ${await historyHtml(jobs)}
      </div>
    `;
    wire();
    refreshIcons();
  }

  async function historyHtml(jobs) {
    if (!jobs.length) return "";
    const thumbs = await Promise.all(jobs.map(async (job) => {
      const url = await resolveJobUrl(job);
      return `
        <button type="button" class="mini-studio__thumb ${job.status === "failed" ? "is-failed" : ""}" data-studio-job="${escapeHtml(job.id)}" title="${escapeHtml(job.prompt || "")}">
          ${url ? `<img src="${escapeHtml(url)}" alt="" />` : `<span>${job.status === "failed" ? "失败" : "图"}</span>`}
        </button>
      `;
    }));
    return `
      <div class="mini-studio__history">
        <strong>最近生成</strong>
        <div class="mini-studio__thumbs">${thumbs.join("")}</div>
      </div>
    `;
  }

  function wire() {
    root.querySelector("[data-studio-go-lab]")?.addEventListener("click", scrollLabImagegen);

    root.querySelector("[data-studio-generate]")?.addEventListener("click", async () => {
      if (busy) return;
      if (!isImagegenConfigured()) {
        toast("还没有配置生图接口");
        scrollLabImagegen();
        return;
      }
      const prompt = root.querySelector("[data-studio-prompt]")?.value?.trim() || "";
      if (!prompt) {
        toast("请先描述想画的画面");
        return;
      }
      busy = true;
      const btn = root.querySelector("[data-studio-generate]");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "正在绘制…";
        btn.classList.add("is-loading");
      }
      let progress = root.querySelector("[data-studio-progress]");
      if (!progress) {
        progress = document.createElement("p");
        progress.className = "mini-studio__progress";
        progress.setAttribute("aria-live", "polite");
        progress.textContent = "正在绘制…";
        btn?.after(progress);
      }
      try {
        const result = await runImagegenJob({
          prompt,
          storeMediaFile: deps.storeMediaFile,
        });
        if (result.objectUrl) objectUrls.push(result.objectUrl);
        lastResult = result;
        mode = "result";
      } catch (error) {
        lastResult = {
          job: error.job || {
            id: "failed",
            status: "failed",
            prompt,
            error: String(error.message || "生成失败，请稍后重试").slice(0, 200),
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          },
          objectUrl: "",
        };
        mode = "result";
      } finally {
        busy = false;
        await render();
      }
    });

    root.querySelector("[data-studio-again]")?.addEventListener("click", () => {
      mode = "compose";
      lastResult = null;
      render();
    });

    root.querySelector("[data-studio-retry]")?.addEventListener("click", () => {
      const prompt = lastResult?.job?.prompt || "";
      mode = "compose";
      lastResult = null;
      render().then(() => {
        const ta = root.querySelector("[data-studio-prompt]");
        if (ta) ta.value = prompt;
      });
    });

    root.querySelector("[data-studio-copy]")?.addEventListener("click", async () => {
      const text = lastResult?.job?.prompt || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("已复制描述");
      } catch {
        toast("复制失败");
      }
    });

    root.querySelector("[data-studio-save]")?.addEventListener("click", async () => {
      if (!lastResult?.job || lastResult.job.status === "failed") return;
      const btn = root.querySelector("[data-studio-save]");
      if (btn) btn.disabled = true;
      try {
        const saved = await saveJobToAlbum(
          { ...lastResult.job, blob: lastResult.blob },
          {
            getMediaRecord: deps.getMediaRecord,
            storeMediaFile: deps.storeMediaFile,
            readMediaBlob: deps.readMediaBlob,
            characterId: deps.getActiveCharacterId?.() || deps.characterId || "",
            companionId: deps.getCompanionId?.() || deps.getActiveCharacterId?.() || "",
          },
        );
        lastResult.job = saved.job || { ...lastResult.job, photoId: saved.photoId };
        toast("已存入相册", {
          label: "去相册查看",
          onClick: () => deps.onOpenGallery?.(),
        });
        await render();
      } catch (error) {
        toast(String(error.message || "保存失败").slice(0, 80));
        if (btn) btn.disabled = false;
      }
    });

    root.querySelectorAll("[data-studio-job]").forEach((node) => {
      node.addEventListener("click", async () => {
        const id = node.getAttribute("data-studio-job");
        const job = listImagegenJobs().find((j) => j.id === id);
        if (!job) return;
        const url = await resolveJobUrl(job);
        lastResult = { job, objectUrl: url, blob: null };
        mode = "result";
        await render();
      });
    });
  }

  // shell mounts immediately — out-of-shell <300ms
  root.innerHTML = `
    <div class="mini-studio mini-studio--shell">
      <div class="mini-studio__skeleton" aria-hidden="true"></div>
      <p class="mini-studio__hint">描述你想画的画面</p>
    </div>
  `;
  queueMicrotask(() => { render(); });

  return {
    open() { mode = "compose"; render(); },
    refresh() { render(); },
    destroy() {
      revokeUrls();
      root.innerHTML = "";
    },
  };
}
