/**
 * C6 — Creator center hub: character/project overview, then edit.
 * Advanced tools only; API/TTS/backup stay in Settings.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  getActiveCharacterId,
  getCharacterSync,
  listCharactersSync,
  setActiveCharacterId,
} from "../characters/store.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";

/** Primary creative tools shown as project tiles. */
export const CREATOR_PROJECTS = Object.freeze([
  { id: "cocreate", label: "共创", hint: "从一句想法开始，与 TA 一起完成", icon: "sparkles" },
  { id: "experience-studio", label: "作品工坊", hint: "开放情境包编辑与预览", icon: "clapperboard" },
  { id: "story", label: "剧章工坊", hint: "互动阅读与节拍", icon: "book-marked" },
  { id: "assets", label: "资源库", hint: "卡书贴纸与设定", icon: "archive" },
  { id: "studio", label: "绘境", hint: "角色相关生图", icon: "wand-sparkles" },
]);

/** Experimental / frozen — secondary, not default romance path. */
export const CREATOR_EXPERIMENTAL = Object.freeze([
  { id: "shop", label: "栖店", hint: "实验", icon: "shopping-bag" },
  { id: "qishi", label: "栖市", hint: "实验", icon: "store" },
  { id: "games", label: "游戏", hint: "实验", icon: "gamepad-2" },
]);

/**
 * @param {HTMLElement|null} host
 * @param {{
 *   onOpenApp?: (id: string) => void,
 *   onOpenProfile?: () => void,
 *   onClose?: () => void,
 * }} [hooks]
 */
export function mountCreatorHub(host, hooks = {}) {
  if (!host) return { refresh: () => {}, destroy: () => {} };

  let selectedId = getActiveCharacterId() || "";

  function characters() {
    return listCharactersSync() || [];
  }

  function render() {
    const list = characters();
    if (!selectedId && list[0]) selectedId = list[0].id;
    const active = getCharacterSync(selectedId) || list[0] || null;
    const portrait = resolveCharacterAvatarUrl(active);
    const name = active?.name || active?.profile?.name || "未选择角色";
    const identity = active?.profile?.fields?.[2] || active?.profile?.identity || "先选角色，再编辑资源";

    host.innerHTML = `
      <div class="creator-hub" data-creator-hub>
        <header class="creator-hub__top">
          <button type="button" class="mini-icon-button" data-creator-close aria-label="关闭"><i data-lucide="x"></i></button>
          <div>
            <strong>创作者中心</strong>
            <span>先选择一起创作的角色</span>
          </div>
          <span></span>
        </header>

        <section class="creator-hub__character" data-creator-character>
          ${portrait
            ? `<img src="${escapeHtml(portrait)}" alt="" class="creator-hub__portrait" />`
            : `<span class="creator-hub__portrait creator-hub__portrait--empty" aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span>`}
          <div class="creator-hub__character-meta">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(String(identity).slice(0, 48))}</span>
          </div>
          <button type="button" class="creator-hub__edit" data-creator-edit-profile>
            编辑角色
          </button>
        </section>

        <section class="creator-hub__picker" aria-label="选择角色">
          <p class="creator-hub__section-label">角色</p>
          <div class="creator-hub__chips" data-creator-chips>
            ${list.map((c) => `
              <button type="button"
                class="creator-hub__chip${c.id === selectedId ? " is-active" : ""}"
                data-creator-pick="${escapeHtml(c.id)}">
                ${escapeHtml(c.name || c.id)}
              </button>
            `).join("") || '<p class="mini-empty">还没有角色</p>'}
          </div>
        </section>

        <section class="creator-hub__projects" aria-label="项目">
          <p class="creator-hub__section-label">项目概览</p>
          <div class="creator-hub__grid">
            ${CREATOR_PROJECTS.map((p) => `
              <button type="button" class="creator-hub__tile" data-creator-open="${p.id}">
                <i data-lucide="${p.icon}"></i>
                <strong>${escapeHtml(p.label)}</strong>
                <span>${escapeHtml(p.hint)}</span>
              </button>
            `).join("")}
          </div>
        </section>

        <details class="creator-hub__experimental">
          <summary>实验能力（可选）</summary>
          <div class="creator-hub__exp-list">
            ${CREATOR_EXPERIMENTAL.map((p) => `
              <button type="button" class="mini-settings-row" data-creator-open="${p.id}">
                <i data-lucide="${p.icon}"></i>
                <span>${escapeHtml(p.label)}</span>
                <em>${escapeHtml(p.hint)}</em>
                <i data-lucide="chevron-right"></i>
              </button>
            `).join("")}
            <p class="mini-app-lead">模型接口、TTS 与备份在「设置」中配置，不在此编辑。</p>
            <button type="button" class="mini-settings-row" data-creator-open-settings>
              <i data-lucide="settings-2"></i><span>打开设置 · 接口与备份</span><i data-lucide="chevron-right"></i>
            </button>
          </div>
        </details>
      </div>
    `;
    refreshIcons();
  }

  function onClick(event) {
    const close = event.target.closest("[data-creator-close]");
    if (close) {
      hooks.onClose?.();
      return;
    }
    const pick = event.target.closest("[data-creator-pick]");
    if (pick) {
      selectedId = pick.getAttribute("data-creator-pick") || "";
      if (selectedId) {
        try {
          setActiveCharacterId(selectedId);
        } catch {
          /* ignore */
        }
      }
      render();
      return;
    }
    if (event.target.closest("[data-creator-edit-profile]")) {
      hooks.onOpenProfile?.();
      return;
    }
    if (event.target.closest("[data-creator-open-settings]")) {
      hooks.onOpenApp?.("settings");
      return;
    }
    const open = event.target.closest("[data-creator-open]");
    if (open) {
      const id = open.getAttribute("data-creator-open");
      if (id) hooks.onOpenApp?.(id);
    }
  }

  host.addEventListener("click", onClick);
  render();

  return {
    refresh: render,
    destroy() {
      host.removeEventListener("click", onClick);
      host.innerHTML = "";
    },
  };
}
