import { escapeHtml } from "../../lib/utils.js";
import { TA_APP_META } from "../constants.js";
import { taAppGlyphHtml } from "./ta-glyphs.js";

function formatClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * @param {Date|string} [input]
 */
function formatDate(input = new Date()) {
  let date = input instanceof Date ? input : null;
  if (!date && typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [y, m, d] = input.trim().split("-").map(Number);
    date = new Date(y, m - 1, d);
  }
  if (!date || Number.isNaN(date.getTime())) date = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${week}`;
}

const UNLOCK_PULL_PX = 78;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * TA lock — full-bleed wallpaper, big clock, follow-finger swipe unlock.
 */
export function renderTaLock(host, opts) {
  if (!host) return { destroy() {}, tick() {} };

  const character = opts.character || { name: "TA" };
  const notes = (opts.notifications || []).slice(0, 3);
  const lifeDate = String(opts.localDate || "").trim();

  host.innerHTML = `
    <div class="ta-lock" data-ta-screen="lock" data-ta-life-date="${escapeHtml(lifeDate)}">
      <div class="ta-lock__wash" aria-hidden="true"></div>
      <header class="ta-lock__status">
        <strong data-ta-clock>${formatClock()}</strong>
        <div class="ta-lock__status-right" aria-hidden="true">
          <svg viewBox="0 0 18 12" width="16" height="11"><path fill="currentColor" d="M1 8.5h1.6v3H1zm3.2-2h1.6v5H4.2zm3.2-2.5h1.6v7.5H7.4zm3.2-2.5h1.6V11.5H10.6zm3.2 1.2h1.6v6.3H13.8z"/></svg>
          <svg viewBox="0 0 26 12" width="24" height="11"><rect x="0.6" y="1.2" width="20" height="9.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.2" y="2.8" width="14" height="6.4" rx="1.2" fill="currentColor"/><path fill="currentColor" d="M22.2 4.2h1.6a1.2 1.2 0 010 2.4h-1.6z"/></svg>
        </div>
      </header>
      <div class="ta-lock__hero" data-ta-lock-hero>
        <strong class="ta-lock__clock" data-ta-lock-clock>${formatClock()}</strong>
        <span class="ta-lock__date" data-ta-date>${formatDate(lifeDate || new Date())}</span>
      </div>
      <ul class="ta-lock__notes" data-ta-lock-notes>
        ${notes.map((n) => {
          const meta = TA_APP_META[n.app] || { label: n.app, tone: "ink" };
          return `
            <li class="ta-lock__note">
              <span class="ta-lock__note-icon" data-tone="${escapeHtml(meta.tone || "ink")}">${taAppGlyphHtml(n.app, { size: 16 })}</span>
              <span>
                <strong>${escapeHtml(n.title)}</strong>
                <em>${escapeHtml(n.body)}</em>
              </span>
            </li>
          `;
        }).join("")}
      </ul>
      <div class="ta-lock__hint" data-ta-lock-hint>
        <i class="ta-lock__chevron" aria-hidden="true"></i>
        <span>上滑解锁</span>
      </div>
      <button type="button" class="ta-lock__exit" data-ta-lock-back aria-label="退出">×</button>
    </div>
  `;

  const root = host.querySelector(".ta-lock");
  const hero = host.querySelector("[data-ta-lock-hero]");
  const hint = host.querySelector("[data-ta-lock-hint]");
  let unlocking = false;
  let startY = 0;
  let active = false;
  let pulling = false;
  let offset = 0;

  const commitUnlock = () => {
    if (unlocking) return;
    unlocking = true;
    root?.classList.add("is-unlocking");
    window.setTimeout(() => {
      opts.onUnlock?.();
      unlocking = false;
    }, 280);
  };

  function setPull(px, animate) {
    offset = Math.max(0, px);
    const progress = Math.min(1, offset / UNLOCK_PULL_PX);
    const transition = animate ? `transform 320ms ${EASE}, opacity 320ms ${EASE}` : "none";
    if (hero) {
      hero.style.transition = transition;
      hero.style.transform = `translate3d(0, ${-offset * 0.28}px, 0)`;
      hero.style.opacity = String(Math.max(0.25, 1 - progress * 0.55));
    }
    if (hint) {
      hint.style.transition = transition;
      hint.style.transform = `translate3d(0, ${-offset * 0.4}px, 0)`;
      hint.style.opacity = String(0.5 + progress * 0.5);
      hint.classList.toggle("is-dragging", !animate && offset > 0);
    }
    root?.classList.toggle("is-pulling", offset > 0 && !animate);
  }

  function resetPull() {
    setPull(0, true);
    window.setTimeout(() => {
      if (hero) {
        hero.style.transition = "";
        hero.style.transform = "";
        hero.style.opacity = "";
      }
      if (hint) {
        hint.style.transition = "";
        hint.style.transform = "";
        hint.style.opacity = "";
        hint.classList.remove("is-dragging");
      }
      root?.classList.remove("is-pulling");
    }, 340);
  }

  const onPointerDown = (event) => {
    if (unlocking) return;
    if (event.target.closest("[data-ta-lock-back]")) return;
    if (event.button != null && event.button !== 0) return;
    active = true;
    pulling = false;
    startY = event.clientY;
    try {
      root?.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (event) => {
    if (!active || unlocking) return;
    const dy = startY - event.clientY;
    if (!pulling) {
      if (dy < 8) return;
      pulling = true;
    }
    event.preventDefault();
    setPull(Math.min(dy, UNLOCK_PULL_PX * 1.35), false);
  };

  const onPointerUp = () => {
    if (!active) return;
    active = false;
    if (pulling && offset >= UNLOCK_PULL_PX) {
      commitUnlock();
    } else if (pulling) {
      resetPull();
    }
    pulling = false;
  };

  const onClick = (event) => {
    if (event.target.closest("[data-ta-lock-back]")) {
      opts.onBack?.();
      return;
    }
    if (event.target.closest("[data-ta-lock-hint]")) commitUnlock();
  };

  root?.addEventListener("pointerdown", onPointerDown);
  root?.addEventListener("pointermove", onPointerMove);
  root?.addEventListener("pointerup", onPointerUp);
  root?.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("click", onClick);

  return {
    tick(now = new Date()) {
      const clock = formatClock(now);
      host.querySelectorAll("[data-ta-clock], [data-ta-lock-clock]").forEach((node) => {
        node.textContent = clock;
      });
      const date = host.querySelector("[data-ta-date]");
      if (date && !lifeDate) date.textContent = formatDate(now);
    },
    destroy() {
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("pointermove", onPointerMove);
      root?.removeEventListener("pointerup", onPointerUp);
      root?.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("click", onClick);
    },
  };
}

/**
 * First-visit relationship boundary (once per character).
 */
export function renderTaConsent(host, opts) {
  if (!host) return { destroy() {} };
  const name = opts.character?.name || "TA";
  host.innerHTML = `
    <div class="ta-consent" data-ta-screen="consent">
      <div class="ta-consent__body">
        <p class="ta-consent__eyebrow">查手机</p>
        <h2>进入${escapeHtml(name)}的手机</h2>
        <p>锁屏、讯息、相册和备忘，都是ta今天留下的痕迹。</p>
        <p>请轻轻看。ta或许会感觉到，但不会把未分享的私密一口气说给你听。</p>
        <button type="button" class="ta-btn ta-consent__ok" data-ta-consent-ok>解锁查看</button>
        <button type="button" class="ta-consent__cancel" data-ta-consent-back>先不看</button>
      </div>
    </div>
  `;
  const onClick = (event) => {
    if (event.target.closest("[data-ta-consent-back]")) {
      opts.onBack?.();
      return;
    }
    if (event.target.closest("[data-ta-consent-ok]")) {
      opts.onAccept?.();
    }
  };
  host.addEventListener("click", onClick);
  return {
    destroy() {
      host.removeEventListener("click", onClick);
    },
  };
}
