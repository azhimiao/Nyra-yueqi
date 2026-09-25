import { refreshIcons } from "../lib/icons.js";
import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import { resolveActiveWorldAdapter, bootstrapWorldAdapters } from "./bootstrap.js";
import {
  loadViberCredentials,
  saveViberCredentials,
  isViberConfigured,
  isViberWriteReady,
} from "./viber-credentials.js";
import { formatWorldCount, formatWorldRelativeTime } from "./schema.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { isRealCharacterAvatar } from "../characters/avatar.js";

let wired = false;
let loading = false;
let nextCursor = null;
let posts = [];
let trends = [];
let platformId = "preview";
let statusText = "";

function $(sel) {
  return document.querySelector(sel);
}

const VERIFIED_BADGE = `<svg class="world-feed-verified" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11" fill="currentColor"/><path fill="#fff" d="M9.2 15.1 5.8 11.7l1.4-1.4 2 2 5.4-5.4 1.4 1.4z"/></svg>`;

function currentCategory() {
  return $("[data-world-feed-category]")?.value || "discover";
}

function syncRankingSurface() {
  const hotOnly = currentCategory() === "ranking" && trends.length > 0 && posts.length === 0;
  $("[data-world-mode-viber]")?.classList.toggle("is-ranking", hotOnly);
}

function composeAvatarHtml() {
  const id = getActiveCharacterId();
  const character = id ? getCharacterSync(id) : null;
  const name = String(character?.name || t("character.fallbackName")).trim() || t("character.fallbackName");
  const url = isRealCharacterAvatar(character?.avatarUrl) ? String(character.avatarUrl).trim() : "";
  if (url) return `<img src="${escapeHtml(url)}" alt="" />`;
  return `<span>${escapeHtml(name.slice(0, 1))}</span>`;
}

function hydrateComposeAvatar() {
  const el = $("[data-world-compose-avatar]");
  if (el) el.innerHTML = composeAvatarHtml();
}

export function postCard(post) {
  const avatar = post.author?.avatar || t("character.fallbackName").slice(0, 1);
  const avatarHtml = /^https?:\/\//i.test(String(avatar)) || String(avatar).startsWith("data:image/")
    ? `<img src="${escapeHtml(avatar)}" alt="" />`
    : `<span>${escapeHtml(avatar)}</span>`;
  const handle = post.author?.handle || "";
  const name = post.author?.name || t("character.fallbackName");
  const likes = formatWorldCount(post.metrics?.likes);
  const replies = formatWorldCount(post.metrics?.replies);
  const reposts = formatWorldCount(post.metrics?.reposts);
  return `
    <article class="world-feed-card" data-world-post-id="${escapeHtml(post.id)}">
      <div class="world-feed-avatar">${avatarHtml}</div>
      <div class="world-feed-body">
        <header>
          <div class="world-feed-byline">
            <strong>${escapeHtml(name)}</strong>
            ${post.author?.verified ? VERIFIED_BADGE : ""}
            ${handle ? `<span class="world-feed-handle">${escapeHtml(handle)}</span>` : ""}
            <span class="world-feed-dot" aria-hidden="true">·</span>
            <time datetime="${escapeHtml(post.createdAt || "")}">${escapeHtml(formatWorldRelativeTime(post.createdAt))}</time>
          </div>
        </header>
        <p>${escapeHtml(post.content)}</p>
        ${post.tags?.length ? `<div class="world-feed-tags">${post.tags.slice(0, 4).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <footer class="world-feed-actions">
          <button type="button" class="world-feed-stat world-feed-stat--reply"><i data-lucide="message-circle"></i><span>${replies}</span></button>
          <button type="button" class="world-feed-stat world-feed-stat--repost"><i data-lucide="repeat-2"></i><span>${reposts}</span></button>
          <button type="button" class="world-feed-stat world-feed-stat--like"><i data-lucide="heart"></i><span>${likes}</span></button>
        </footer>
      </div>
    </article>
  `;
}

function renderFeed() {
  const root = $("[data-world-feed]");
  const empty = $("[data-world-feed-empty]");
  const more = $("[data-world-feed-more]");
  const status = $("[data-world-feed-status]");
  const ranking = currentCategory() === "ranking";
  const hotOnly = ranking && trends.length > 0 && posts.length === 0;
  if (!root) return;
  syncRankingSurface();
  root.innerHTML = hotOnly ? "" : posts.map(postCard).join("");
  if (empty) empty.hidden = hotOnly || posts.length > 0;
  if (more) more.hidden = hotOnly || !nextCursor;
  if (status) {
    const showStatus = Boolean(statusText) && (loading || /失败|没发/.test(statusText));
    status.hidden = !showStatus;
    status.textContent = showStatus ? statusText : "";
  }
  refreshIcons();
}

function renderTrends() {
  const root = $("[data-world-trends]");
  const host = $("[data-world-trends-host]");
  if (!root) return;
  if (!trends.length) {
    root.innerHTML = "";
    if (host) host.hidden = true;
    return;
  }
  if (host) host.hidden = false;
  root.innerHTML = trends.map((item, index) => {
    const rank = Number(item.rank) || index + 1;
    return `
    <li>
      <span class="world-hot-rank">${rank}</span>
      <span class="world-hot-label">${escapeHtml(item.label)}</span>
      <em class="world-hot-volume">${escapeHtml(item.volume || "")}</em>
    </li>`;
  }).join("");
}

async function loadRanking(adapter) {
  posts = [];
  nextCursor = null;
  if (typeof adapter.getTrending !== "function") {
    trends = [];
    return;
  }
  try {
    const trending = await adapter.getTrending({ limit: 10 });
    const items = trending?.items || [];
    trends = adapter.id === "preview"
      ? items
      : items.filter((item) => item?.label);
  } catch {
    trends = [];
  }
  if (!trends.length && adapter.id !== "preview") {
    const result = await adapter.listPosts({
      cursor: null,
      limit: 15,
      category: "ranking",
      identity: "character",
    });
    posts = result.posts || [];
    nextCursor = result.nextCursor || null;
  }
}

async function refreshWorldFeed({ append = false } = {}) {
  if (loading) return;
  loading = true;
  const category = currentCategory();
  statusText = append ? t("pages.worldChrome.loadingMore") : t("pages.worldChrome.loadingFeed");
  renderFeed();
  try {
    const { adapter, platformId: pid } = await resolveActiveWorldAdapter();
    platformId = pid;
    if (category === "ranking" && !append) {
      await loadRanking(adapter);
      renderTrends();
    } else {
      trends = [];
      renderTrends();
      const result = await adapter.listPosts({
        cursor: append ? nextCursor : null,
        limit: 15,
        category,
        identity: "character",
      });
      posts = append ? [...posts, ...(result.posts || [])] : (result.posts || []);
      nextCursor = result.nextCursor || null;
    }
    const health = await adapter.healthCheck();
    if (adapter.id === "viber") {
      statusText = health.ok
        ? (health.message || t("pages.worldChrome.feedStatusLive"))
        : (health.message || t("pages.worldChrome.loadFailed"));
    } else {
      const adapterLabel = t("pages.worldChrome.localDemoName");
      statusText = `${adapterLabel} · ${health.message || platformId}`;
    }
  } catch (error) {
    if (!append) {
      posts = [];
      trends = [];
      renderTrends();
    }
    statusText = error?.message || t("pages.worldChrome.loadFailed");
  } finally {
    loading = false;
    renderFeed();
  }
}

async function hydrateViberSettingsForm() {
  const creds = await loadViberCredentials();
  const enabled = $("[data-viber-enabled]");
  const baseUrl = $("[data-viber-base-url]");
  const apiKey = $("[data-viber-api-key]");
  const persona = $("[data-viber-persona-version]");
  const proxy = $("[data-viber-use-proxy]");
  const status = $("[data-viber-status]");
  if (enabled) enabled.checked = Boolean(creds.enabled);
  if (baseUrl) baseUrl.value = creds.baseUrl || "";
  if (apiKey) apiKey.value = creds.apiKey || "";
  if (persona) persona.value = creds.personaVersion || "";
  if (proxy) proxy.checked = creds.useLocalProxy !== false;
  if (status) {
    if (!creds.enabled) status.textContent = t("pages.worldChrome.feedStatusOffline");
    else if (isViberWriteReady(creds)) status.textContent = t("pages.worldChrome.feedStatusReadWrite");
    else if (isViberConfigured(creds) && String(creds.apiKey || "").startsWith("viber_sk_")) {
      status.textContent = t("pages.worldChrome.feedStatusNeedPersona");
    } else if (isViberConfigured(creds)) {
      status.textContent = t("pages.worldChrome.feedStatusReadOnly");
    } else status.textContent = t("pages.worldChrome.feedStatusIncomplete");
  }
}

async function saveViberSettingsFromForm() {
  const result = $("[data-viber-result]");
  const wantOnline = Boolean($("[data-viber-enabled]")?.checked);
  const next = await saveViberCredentials({
    enabled: wantOnline,
    forceOfflinePreview: !wantOnline,
    baseUrl: $("[data-viber-base-url]")?.value?.trim() || "",
    apiKey: $("[data-viber-api-key]")?.value ?? "",
    personaVersion: $("[data-viber-persona-version]")?.value?.trim() || "",
    useLocalProxy: $("[data-viber-use-proxy]")?.checked !== false,
    identity: "character",
    topicSlug: "yueqi",
  });
  // force re-register adapter with new creds
  const { ViberWorldAdapter } = await import("./viber-adapter.js");
  const { registerWorldAdapter } = await import("./platform-adapter.js");
  if (isViberConfigured(next)) {
    registerWorldAdapter(new ViberWorldAdapter(next));
  }
  await hydrateViberSettingsForm();
  if (result) result.textContent = `saved\nenabled: ${next.enabled}\nbase: ${next.baseUrl}`;
  return next;
}

async function testViberConnection() {
  const result = $("[data-viber-result]");
  await saveViberSettingsFromForm();
  const { adapter } = await resolveActiveWorldAdapter();
  const health = await adapter.healthCheck();
  if (result) {
    result.textContent = `status: ${health.status}\nok: ${health.ok}\n${health.message || ""}`;
  }
  return health;
}

function setWorldMode(mode) {
  const moments = $("[data-world-mode-moments]");
  const viber = $("[data-world-mode-viber]");
  document.querySelectorAll("[data-world-mode-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.worldModeTab === mode);
  });
  if (moments) moments.hidden = mode !== "moments";
  if (viber) viber.hidden = mode !== "viber";
  if (mode === "viber") {
    hydrateComposeAvatar();
    refreshWorldFeed();
  }
}

function wireWorldFeedUi() {
  if (wired) return;
  wired = true;

  document.querySelectorAll("[data-world-mode-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setWorldMode(btn.dataset.worldModeTab || "viber"));
  });

  $("[data-world-feed-refresh]")?.addEventListener("click", () => refreshWorldFeed());
  $("[data-world-feed-more]")?.addEventListener("click", () => refreshWorldFeed({ append: true }));
  $("[data-world-feed-category]")?.addEventListener("change", () => refreshWorldFeed());

  $("[data-viber-save]")?.addEventListener("click", () => {
    saveViberSettingsFromForm().catch((error) => {
      const result = $("[data-viber-result]");
      if (result) result.textContent = error?.message || String(error);
    });
  });
  $("[data-viber-test]")?.addEventListener("click", () => {
    testViberConnection().catch((error) => {
      const result = $("[data-viber-result]");
      if (result) result.textContent = error?.message || String(error);
    });
  });

  $("[data-world-compose]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("[data-world-compose-input]");
    const submit = $("[data-world-invite-submit]");
    const hint = input?.value?.trim() || "";
    if (submit) submit.disabled = true;
    statusText = t("pages.worldChrome.inviteGenerating");
    renderFeed();
    try {
      const { adapter, creds } = await resolveActiveWorldAdapter();
      if (typeof adapter.createPost !== "function" || !isViberWriteReady(creds)) {
        throw new Error(t("pages.worldChrome.postNotSupported"));
      }
      const { generateCharacterWorldDraft } = await import("./character-world-post.js");
      let topics = [];
      try {
        topics = typeof adapter.listTopics === "function" ? await adapter.listTopics() : [];
      } catch {
        topics = [];
      }
      if (!topics.some((topic) => String(topic?.slug || "").toLowerCase() === "yueqi")) {
        topics = [
          { id: "yueqi-local", slug: "yueqi", name: "月栖" },
          ...topics,
        ];
      }
      const draft = await generateCharacterWorldDraft({
        posts,
        topics,
        topicPreferences: ["yueqi"],
        contentSkill: "personal_life",
        postingVoice: "viber_daily",
        audience: "月栖角色世界的公开读者",
        subject: hint ? "主人提示" : "",
        point: hint,
        personaVersion: Number(creds.personaVersion) || 1,
        characterId: getActiveCharacterId() || "",
      });
      if (draft.action !== "post.create") {
        throw new Error(draft.message || t("pages.worldChrome.inviteFailed"));
      }
      await adapter.createPost({
        content: draft.content,
        topicSlugs: [...new Set(["yueqi", ...(draft.topicSlugs || [])])].slice(0, 3),
        idempotencyKey: `yueqi-world-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      });
      if (input) input.value = "";
      statusText = t("pages.worldChrome.inviteDoneWorld");
      await refreshWorldFeed();
    } catch (error) {
      statusText = error?.message || t("pages.worldChrome.postFailed");
      renderFeed();
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.addEventListener("yueqi:locale-changed", () => {
    hydrateComposeAvatar();
    refreshWorldFeed().catch(() => {});
    hydrateViberSettingsForm().catch(() => {});
    renderTrends();
  });
}

export async function initWorldFeedUi() {
  wireWorldFeedUi();
  await bootstrapWorldAdapters();
  await hydrateViberSettingsForm();
  hydrateComposeAvatar();
  // Character world (广场) is primary; 朋友圈 is a nested feature.
  setWorldMode("moments");
}
