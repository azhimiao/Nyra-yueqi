/**
 * @typedef {Object} WorldAuthor
 * @property {string} id
 * @property {string} name
 * @property {string} handle
 * @property {string} avatar
 * @property {boolean} [verified]
 * @property {"human"|"character"|"agent"} [identity]
 */

/**
 * @typedef {Object} WorldPost
 * @property {string} id
 * @property {string} platform
 * @property {WorldAuthor} author
 * @property {string} content
 * @property {string} createdAt
 * @property {string} category
 * @property {string[]} tags
 * @property {{likes:number,replies:number,reposts:number,views:number}} metrics
 * @property {string} [accent]
 * @property {boolean} [following]
 * @property {boolean} [bookmarked]
 */

/**
 * @typedef {Object} WorldFeedResult
 * @property {WorldPost[]} posts
 * @property {string|null} nextCursor
 * @property {string} fetchedAt
 */

export const WORLD_PLATFORM_STATUS = Object.freeze({
  PREVIEW: "preview",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
});

export const WORLD_CAPABILITIES = Object.freeze([
  "feed.read",
  "post.read",
  "post.search",
  "trending.read",
  "profile.read",
]);

export const WORLD_WRITE_CAPABILITIES = Object.freeze([
  "post.create",
]);

export function createWorldPost(input) {
  return {
    id: String(input.id),
    platform: input.platform || "preview",
    author: {
      id: String(input.author?.id || "unknown"),
      name: input.author?.name || "匿名",
      handle: input.author?.handle || "@unknown",
      avatar: input.author?.avatar || "世",
      verified: Boolean(input.author?.verified),
      identity: input.author?.identity || undefined,
    },
    content: String(input.content || ""),
    createdAt: input.createdAt || new Date().toISOString(),
    category: input.category || "discover",
    tags: Array.isArray(input.tags) ? input.tags : [],
    metrics: {
      likes: Number(input.metrics?.likes || 0),
      replies: Number(input.metrics?.replies || 0),
      reposts: Number(input.metrics?.reposts || 0),
      views: Number(input.metrics?.views || 0),
    },
    accent: input.accent || "rose",
    following: Boolean(input.following),
    bookmarked: Boolean(input.bookmarked),
  };
}

export function formatWorldCount(value) {
  const count = Number(value || 0);
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function formatWorldTime(iso) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "";
  }
}

export function formatWorldRelativeTime(iso, now = Date.now()) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diff = Math.max(0, now - date.getTime());
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "刚刚";
    if (diff < hour) return `${Math.floor(diff / minute)}分钟`;
    if (diff < day) return `${Math.floor(diff / hour)}小时`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}天`;
    const month = date.getMonth() + 1;
    const dayOfMonth = date.getDate();
    return `${month}月${dayOfMonth}日`;
  } catch {
    return "";
  }
}
