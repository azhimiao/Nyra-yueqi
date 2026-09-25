/**
 * 栖笺起草 UI — seed / draft / diff / adopt (F5).
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { syncProfileStateToCharacter } from "../characters/profile.js";
import { listWorldbookEntries } from "../worldbook/store.js";
import { generateQijianDraft } from "./generate.js";
import { draftToProfilePatch } from "./schema.js";

/**
 * @param {{
 *   characterId?: string,
 *   onToast?: (msg: string) => void,
 *   onAdopted?: () => void,
 *   collectProfileState?: () => object,
 *   applyProfileState?: (profile: object) => void,
 *   hasApiKey?: () => Promise<boolean>,
 *   callModel?: (prompt: string) => Promise<string>,
 * }} deps
 */
export async function openQijianDraftUi(deps = {}) {
  document.querySelectorAll("[data-qijian-modal]").forEach((n) => n.remove());
  const characterId = deps.characterId || getActiveCharacterId();
  const character = getCharacterSync(characterId);
  const worldbook = await listWorldbookEntries().catch(() => []);
  const modal = document.createElement("section");
  modal.className = "modal confirm-modal is-open qijian-modal";
  modal.dataset.qijianModal = "1";
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <article class="modal-panel qijian-panel" role="dialog" aria-modal="true" aria-labelledby="qijianTitle">
      <header class="qijian-head">
        <h2 id="qijianTitle">栖笺起草</h2>
        <button type="button" class="ghost-action" data-close aria-label="关闭">关闭</button>
      </header>
      <section class="qijian-section" data-qijian-seed>
        <h3>种子</h3>
        <label><span>关系</span>
          <select data-qj-relation>
            <option value="朋友">朋友</option>
            <option value="恋人">恋人</option>
            <option value="家人">家人</option>
            <option value="自定义">自定义</option>
          </select>
        </label>
        <label><span>自定义关系</span><input type="text" data-qj-relation-custom placeholder="可选" hidden /></label>
        <label><span>关键词（逗号分隔，3–8 个）</span><input type="text" data-qj-keywords placeholder="雨声, 旧书, 克制" /></label>
        <label><span>语气</span><input type="text" data-qj-tone placeholder="温柔 / 灵动 / 克制" value="温柔" /></label>
        <label><span>参考世界书</span>
          <select data-qj-lore multiple size="3">
            ${worldbook
              .slice(0, 12)
              .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)}</option>`)
              .join("")}
          </select>
        </label>
        <button type="button" class="send-button" data-qj-generate>生成草稿</button>
      </section>
      <section class="qijian-section" data-qijian-result hidden>
        <h3>结果 <small data-qj-source></small></h3>
        <label><span>姓名建议</span><input type="text" data-qj-name /></label>
        <label><span>关系称呼</span><input type="text" data-qj-alias /></label>
        <label><span>身份</span><input type="text" data-qj-identity /></label>
        <label><span>人设摘要</span><textarea rows="5" data-qj-summary></textarea></label>
        <label><span>偏好词</span><input type="text" data-qj-tokens placeholder="逗号分隔" /></label>
        <p class="qijian-suggestions" data-qj-suggestions></p>
        <details class="qijian-diff">
          <summary>与当前对比</summary>
          <div class="qijian-diff__grid" data-qj-diff></div>
        </details>
      </section>
      <footer class="qijian-footer" data-qijian-footer hidden>
        <button type="button" class="ghost-action" data-qj-discard>丢弃</button>
        <button type="button" class="ghost-action" data-qj-regen>再生成</button>
        <button type="button" class="send-button" data-qj-adopt>采用</button>
      </footer>
    </article>
  `;

  /** @type {object|null} */
  let draft = null;
  const result = modal.querySelector("[data-qijian-result]");
  const footer = modal.querySelector("[data-qijian-footer]");

  const close = () => modal.remove();
  modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));

  modal.querySelector("[data-qj-relation]")?.addEventListener("change", (event) => {
    const custom = modal.querySelector("[data-qj-relation-custom]");
    if (custom) custom.hidden = event.target.value !== "自定义";
  });

  async function runGenerate() {
    const relationSelect = modal.querySelector("[data-qj-relation]");
    let relation = relationSelect?.value || "朋友";
    if (relation === "自定义") {
      relation = modal.querySelector("[data-qj-relation-custom]")?.value?.trim() || "朋友";
    }
    const keywords = String(modal.querySelector("[data-qj-keywords]")?.value || "")
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    const tone = modal.querySelector("[data-qj-tone]")?.value || "温柔";
    const loreSelect = modal.querySelector("[data-qj-lore]");
    const loreEntryIds = loreSelect
      ? Array.from(loreSelect.selectedOptions).map((o) => o.value)
      : [];
    const genBtn = modal.querySelector("[data-qj-generate]");
    if (genBtn) {
      genBtn.disabled = true;
      genBtn.textContent = "生成中…";
    }
    result.hidden = false;
    result.classList.add("is-loading");
    try {
      const hasKey = (await deps.hasApiKey?.()) === true;
      const loreSnippets = worldbook
        .filter((e) => loreEntryIds.includes(e.id))
        .map((e) => e.content)
        .slice(0, 4);
      const out = await generateQijianDraft(
        { characterId, relation, keywords, tone, loreEntryIds },
        {
          hasApiKey: hasKey,
          callModel: deps.callModel,
          characterName: character?.name,
          loreSnippets,
        },
      );
      if (!out.ok || !out.draft) {
        const message = out.reason === "PROVIDER_REQUIRED"
          ? "请先在接口里配置可用模型，栖笺不会用模板冒充生成结果"
          : "模型没有返回可用的人设草稿，请重试";
        deps.onToast?.(message);
        result.hidden = true;
        footer.hidden = true;
        return;
      }
      draft = out.draft;
      fillResult(out.draft, out.source);
      footer.hidden = false;
    } finally {
      result.classList.remove("is-loading");
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.textContent = "生成草稿";
      }
    }
  }

  function fillResult(data, source) {
    modal.querySelector("[data-qj-source]").textContent =
      source === "model" ? "" : "· 离线草稿";
    modal.querySelector("[data-qj-name]").value = data.name || character?.name || "";
    modal.querySelector("[data-qj-alias]").value = data.alias || character?.alias || "";
    modal.querySelector("[data-qj-identity]").value =
      data.identity || character?.profile?.fields?.[2] || "";
    modal.querySelector("[data-qj-summary]").value = data.summary || "";
    modal.querySelector("[data-qj-tokens]").value = (data.tokens || []).join(", ");
    modal.querySelector("[data-qj-suggestions]").textContent = (data.suggestions || []).join(" ");
    const currentFields = character?.profile?.fields || [];
    const currentSummary = currentFields[4] || "";
    modal.querySelector("[data-qj-diff]").innerHTML = `
      <div class="qijian-diff__old"><span>当前</span><p>${escapeHtml(currentSummary.slice(0, 280))}</p></div>
      <div class="qijian-diff__new"><span>草稿</span><p>${escapeHtml(String(data.summary || "").slice(0, 280))}</p></div>
    `;
  }

  function readEditedDraft() {
    return {
      name: modal.querySelector("[data-qj-name]")?.value?.trim(),
      alias: modal.querySelector("[data-qj-alias]")?.value?.trim(),
      identity: modal.querySelector("[data-qj-identity]")?.value?.trim(),
      summary: modal.querySelector("[data-qj-summary]")?.value?.trim(),
      tokens: String(modal.querySelector("[data-qj-tokens]")?.value || "")
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  modal.querySelector("[data-qj-generate]")?.addEventListener("click", () => runGenerate());
  modal.querySelector("[data-qj-regen]")?.addEventListener("click", () => runGenerate());
  modal.querySelector("[data-qj-discard]")?.addEventListener("click", () => {
    draft = null;
    close();
    deps.onToast?.("已丢弃草稿");
  });
  modal.querySelector("[data-qj-adopt]")?.addEventListener("click", async () => {
    const edited = readEditedDraft();
    if (!edited.summary) {
      deps.onToast?.("人设摘要不能为空");
      return;
    }
    const current = deps.collectProfileState?.() || character?.profile || {};
    const patch = draftToProfilePatch(edited, current.fields, current.tokens);
    const nextProfile = {
      ...current,
      fields: patch.fields,
      tokens: patch.tokens,
    };
    await syncProfileStateToCharacter(nextProfile, characterId);
    deps.applyProfileState?.(nextProfile);
    close();
    deps.onToast?.("已采用栖笺草稿");
    deps.onAdopted?.();
  });

  document.body.append(modal);
  refreshIcons();
}
