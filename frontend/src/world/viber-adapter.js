import { WorldPlatformAdapter } from "./platform-adapter.js";
import { WORLD_CAPABILITIES, WORLD_PLATFORM_STATUS, WORLD_WRITE_CAPABILITIES } from "./schema.js";
import { ViberHttpClient } from "./viber-client.js";
import { mapViberPost, unwrapViberActorId, unwrapViberPostId } from "./map-viber.js";
import { isViberWriteReady } from "./viber-credentials.js";
import { isRealCharacterAvatar } from "../characters/avatar.js";
import {
  CHARACTER_WORLD_DEFAULT_BASE_URL,
  CHARACTER_WORLD_TOPIC_SLUG,
} from "./character-world-config.js";

/**
 * Character-world adapter.
 * Default board: local topic, identity=character.
 */
export class ViberWorldAdapter extends WorldPlatformAdapter {
  constructor(creds = {}) {
    const canWrite = isViberWriteReady(creds);
    super({
      id: "viber",
      name: "角色世界",
      capabilities: canWrite
        ? [...WORLD_CAPABILITIES, ...WORLD_WRITE_CAPABILITIES]
        : [...WORLD_CAPABILITIES],
    });
    this.creds = {
      ...creds,
      baseUrl: String(creds.baseUrl || CHARACTER_WORLD_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    };
    this.identity = creds.identity || "character";
    this.topicSlug = String(creds.topicSlug || CHARACTER_WORLD_TOPIC_SLUG).trim() || CHARACTER_WORLD_TOPIC_SLUG;
    this.client = new ViberHttpClient(this.creds);
  }

  #topicPostsPath() {
    return `/api/v1/topics/${encodeURIComponent(this.topicSlug)}/posts`;
  }

  #sortForCategory(category) {
    if (category === "ranking" || category === "trending") return "top";
    if (category === "following" || category === "home") return "new";
    return "hot";
  }

  #scopeForCategory(category) {
    if (category === "following" || category === "home") return "following";
    return "all";
  }

  async listPosts({
    cursor = null,
    limit = 20,
    category = "discover",
    identity,
  } = {}) {
    const idFilter = identity || this.identity || "character";
    const pageLimit = Math.min(Math.max(Number(limit) || 20, 1), 30);
    const sort = this.#sortForCategory(category);
    const scope = this.#scopeForCategory(category);

    // 关注流需要 Key；无 Key 时回落到公开推荐
    const effectiveScope = scope === "following" && !this.creds.apiKey ? "all" : scope;

    const page = await this.client.request(this.#topicPostsPath(), {
      method: "GET",
      query: {
        cursor: cursor || undefined,
        limit: pageLimit,
        identity: idFilter === "all" ? undefined : idFilter,
        sort,
        scope: effectiveScope === "following" ? "following" : undefined,
      },
    });

    const rows = Array.isArray(page?.data) ? page.data : [];
    const posts = rows.map((post) =>
      mapViberPost(
        {
          ...post,
          author: post.author || {
            id: post.authorId,
            displayName: "角色",
            username: String(post.authorId || "").slice(0, 8),
            agentKind: idFilter === "character" ? "CHARACTER" : undefined,
            actorType: idFilter === "human" ? "HUMAN" : "AI_AGENT",
          },
        },
        {
          category: effectiveScope === "following" ? "following" : "discover",
          identity: idFilter === "character" ? "character" : undefined,
        },
      ),
    );

    return {
      posts,
      nextCursor: page?.cursor ?? page?.nextCursor ?? null,
      fetchedAt: new Date().toISOString(),
      identity: idFilter,
      topicSlug: this.topicSlug,
      sort: page?.sort || sort,
      scope: page?.scope || effectiveScope,
    };
  }

  async getPost(postId) {
    const id = unwrapViberPostId(postId);
    const post = await this.client.request(`/api/v1/posts/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return mapViberPost(post, { identity: this.identity === "character" ? "character" : undefined });
  }

  async searchPosts({ q = "", cursor = null, limit = 20 } = {}) {
    const page = await this.client.request("/api/v1/search", {
      method: "GET",
      query: {
        q: String(q || "").trim(),
        type: "posts",
        cursor: cursor || undefined,
        limit: Math.min(Math.max(Number(limit) || 20, 1), 40),
      },
    });
    const rows = Array.isArray(page?.posts)
      ? page.posts
      : Array.isArray(page?.data)
        ? page.data
        : [];
    const mapped = rows.map((post) => mapViberPost(post));
    // Prefer posts that carry the character-world topic when present
    const topicTagged = mapped.filter((post) =>
      (post.tags || []).some((tag) => String(tag).toLowerCase() === this.topicSlug)
      || (post.rawTopics || []).some?.((t) => t?.slug === this.topicSlug),
    );
    let posts = topicTagged.length ? topicTagged : mapped;
    if (this.identity === "character") {
      posts = posts.filter((post) => post.author?.identity === "character");
    }
    return {
      posts,
      nextCursor: page?.nextCursor ?? null,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getTrending({ limit = 20 } = {}) {
    const page = await this.client.request(this.#topicPostsPath(), {
      method: "GET",
      query: {
        limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
        identity: this.identity === "all" ? undefined : this.identity,
        sort: "top",
      },
    });
    const rows = Array.isArray(page?.data) ? page.data : [];
    const items = rows.map((post, index) => {
      const world = mapViberPost(post, {
        identity: this.identity === "character" ? "character" : undefined,
      });
      return {
        rank: index + 1,
        label: world.content.slice(0, 48) || world.author.name,
        volume: `${world.metrics.likes} 赞`,
        postId: world.id,
      };
    });
    return { items, fetchedAt: new Date().toISOString(), topicSlug: this.topicSlug };
  }

  async getProfile(authorId) {
    const id = unwrapViberActorId(authorId);
    let profile;
    try {
      profile = await this.client.request(`/api/v1/actors/${encodeURIComponent(id)}`, {
        method: "GET",
      });
    } catch {
      profile = await this.client.request(`/api/v1/actors/by-username/${encodeURIComponent(id)}`, {
        method: "GET",
      });
    }
    const feed = await this.client.request(`/api/v1/feed/actors/${encodeURIComponent(profile.id)}`, {
      method: "GET",
      query: { limit: 20 },
    });
    const posts = (Array.isArray(feed?.data) ? feed.data : []).map((post) =>
      mapViberPost(post),
    );
    return {
      id: String(profile.id),
      name: profile.displayName || profile.username,
      handle: profile.username ? `@${profile.username}` : "@unknown",
      avatar: isRealCharacterAvatar(profile.avatarUrl) ? profile.avatarUrl : String(profile.displayName || "角").slice(0, 1),
      verified: Boolean(profile.personaLocked),
      identity: profile.agentKind === "CHARACTER" ? "character" : profile.actorType === "HUMAN" ? "human" : "agent",
      bio: profile.bio || "",
      posts,
    };
  }

  async listTopics() {
    const topics = await this.client.request("/api/v1/topics", { method: "GET" });
    return Array.isArray(topics) ? topics : [];
  }

  async getTopicPreferences() {
    if (!this.creds.apiKey) return { topicSlugs: [], topics: [] };
    const preferences = await this.client.request("/api/v1/actors/me/topic-preferences", {
      method: "GET",
    });
    return {
      topicSlugs: Array.isArray(preferences?.topicSlugs) ? preferences.topicSlugs : [],
      topics: Array.isArray(preferences?.topics) ? preferences.topics : [],
    };
  }

  async #resolveTopicIds({ topicIds = [], topicSlugs = [] } = {}) {
    const explicitIds = [...new Set(topicIds.map((id) => String(id || "").trim()).filter(Boolean))];
    if (explicitIds.length) {
      if (explicitIds.length > 3) throw new Error("角色世界原帖最多选择 3 个分区");
      return explicitIds;
    }

    const available = await this.listTopics();
    const bySlug = new Map(available.map((topic) => [String(topic.slug || "").toLowerCase(), topic.id]));

    // Character world always pins 月栖 first
    const preferred = [
      this.topicSlug,
      ...topicSlugs,
    ].map((slug) => String(slug || "").trim().toLowerCase()).filter(Boolean);

    if (!bySlug.has(this.topicSlug)) {
      throw new Error(`角色世界缺少分区「${this.topicSlug}」`);
    }

    const unique = [...new Set(preferred)].slice(0, 3);
    const resolved = unique.map((slug) => bySlug.get(slug)).filter(Boolean);
    if (!resolved.length) {
      throw new Error("无法解析角色世界分区");
    }
    return resolved;
  }

  /**
   * Post as the Character bound to the API key into Topic 月栖.
   */
  async createPost({ content, topicIds = [], topicSlugs = [], idempotencyKey } = {}) {
    if (!this.capabilities.includes("post.create")) {
      throw new Error("未配置可发帖的角色世界 API Key");
    }
    const text = String(content || "").trim();
    if (!text) throw new Error("帖子内容不能为空");
    const resolvedTopicIds = await this.#resolveTopicIds({
      topicIds,
      topicSlugs: topicSlugs.length ? topicSlugs : [this.topicSlug],
    });
    const stableKey = String(idempotencyKey || "").trim()
      || `yueqi-world-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    const post = await this.client.request("/api/v1/posts", {
      method: "POST",
      headers: { "Idempotency-Key": stableKey },
      body: { content: text, topicIds: resolvedTopicIds },
    });
    return mapViberPost(post, { identity: "character" });
  }

  async healthCheck() {
    try {
      await this.client.request(this.#topicPostsPath(), {
        method: "GET",
        query: {
          limit: 1,
          identity: this.identity === "all" ? undefined : this.identity,
          sort: "hot",
        },
      });
      return {
        ok: true,
        status: WORLD_PLATFORM_STATUS.CONNECTED,
        message: this.creds.apiKey
          ? `已连接角色世界 · ${this.topicSlug}（identity=${this.identity}）`
          : `已连接角色世界公开流 · ${this.topicSlug}（发帖需 API Key）`,
      };
    } catch (error) {
      return {
        ok: false,
        status: WORLD_PLATFORM_STATUS.ERROR,
        message: error?.message || "无法连接角色世界",
      };
    }
  }
}
