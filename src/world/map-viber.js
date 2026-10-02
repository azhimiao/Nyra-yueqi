/**
 * Map Viber API post/author payloads into Beautiful WorldPost objects.
 * Character-world default: identity is always "character" when filtered upstream.
 */

import { createWorldPost } from "./schema.js";
import { isRealCharacterAvatar } from "../characters/avatar.js";

const ACCENTS = ["rose", "violet", "sage", "blue", "amber", "peach"];

function pickAccent(seed = "") {
  let hash = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

function authorAvatar(author) {
  if (isRealCharacterAvatar(author?.avatarUrl)) return author.avatarUrl;
  const name = author?.displayName || author?.username || "角";
  return String(name).slice(0, 1);
}

function resolveIdentity(author) {
  if (!author) return "character";
  if (author.actorType === "HUMAN") return "human";
  if (author.agentKind === "CHARACTER" || author.badge === "character" || String(author.badgeLabel || "").startsWith("Character")) {
    return "character";
  }
  if (author.actorType === "AI_AGENT") return "agent";
  return "character";
}

/**
 * @param {object} post Viber post view
 * @param {object} [opts]
 */
export function mapViberPost(post, opts = {}) {
  const author = post?.author || {};
  const identity = opts.identity || resolveIdentity(author);
  const postId = String(post?.id || "");
  const tags = Array.isArray(post?.hashtags)
    ? post.hashtags.map((tag) => (typeof tag === "string" ? tag : tag?.name)).filter(Boolean)
    : [];

  return createWorldPost({
    id: `viber:${postId}`,
    platform: "viber",
    author: {
      id: String(author.id || "unknown"),
      name: author.displayName || author.username || "角色",
      handle: author.username ? `@${author.username}` : "@unknown",
      avatar: authorAvatar(author),
      verified: Boolean(author.personaLocked || author.agentKind === "CHARACTER"),
      identity,
    },
    content: String(post?.content || post?.text || ""),
    createdAt: post?.createdAt || new Date().toISOString(),
    category: opts.category || "discover",
    tags,
    metrics: {
      likes: Number(post?.likeCount ?? post?.likesCount ?? post?._count?.likes ?? 0),
      replies: Number(post?.replyCount ?? post?.repliesCount ?? post?._count?.replies ?? 0),
      reposts: Number(post?.repostCount ?? post?.repostsCount ?? post?._count?.reposts ?? 0),
      views: Number(post?.viewCount ?? 0),
    },
    accent: pickAccent(postId || author.username),
    following: Boolean(post?.viewerFollowsAuthor),
  });
}

export function unwrapViberPostId(worldPostId) {
  const raw = String(worldPostId || "");
  if (raw.startsWith("viber:")) return raw.slice("viber:".length);
  return raw;
}

export function unwrapViberActorId(authorId) {
  return String(authorId || "").replace(/^viber:/, "");
}
