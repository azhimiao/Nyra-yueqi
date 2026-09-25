import { t } from "../i18n/index.js";
import { WorldPlatformAdapter } from "./platform-adapter.js";
import {
  WORLD_AI_INSIGHTS,
  WORLD_FILTERS,
  WORLD_MOCK_POSTS,
  WORLD_TRENDS,
} from "./mock-data.js";
import { WORLD_PLATFORM_STATUS } from "./schema.js";

export class PreviewWorldAdapter extends WorldPlatformAdapter {
  constructor() {
    super({ id: "preview", name: t("pages.worldChrome.localDemoName") });
  }

  async listPosts({ cursor = null, limit = 20, category = "discover" } = {}) {
    const filtered = WORLD_MOCK_POSTS.filter(
      (post) => category === "discover" || category === "following"
        ? (category === "following" ? post.following : true)
        : post.category === category,
    );
    const start = cursor ? Number(cursor) || 0 : 0;
    const slice = filtered.slice(start, start + limit);
    const next = start + limit < filtered.length ? String(start + limit) : null;
    return {
      posts: slice,
      nextCursor: next,
      fetchedAt: new Date().toISOString(),
      insight: WORLD_AI_INSIGHTS[category] || WORLD_AI_INSIGHTS.discover,
      filters: WORLD_FILTERS,
    };
  }

  async getPost(postId) {
    const post = WORLD_MOCK_POSTS.find((item) => item.id === postId);
    if (!post) throw new Error("帖子不存在");
    return post;
  }

  async searchPosts({ q = "", limit = 20 } = {}) {
    const needle = String(q).trim().toLowerCase();
    const posts = WORLD_MOCK_POSTS.filter((post) => {
      if (!needle) return true;
      return (
        post.content.toLowerCase().includes(needle)
        || post.author.name.toLowerCase().includes(needle)
        || post.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    }).slice(0, limit);
    return {
      posts,
      nextCursor: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getTrending() {
    return {
      items: WORLD_TRENDS,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getProfile(authorId) {
    const post = WORLD_MOCK_POSTS.find((item) => item.author.id === authorId);
    if (!post) throw new Error("作者不存在");
    return {
      ...post.author,
      bio: "",
      posts: WORLD_MOCK_POSTS.filter((item) => item.author.id === authorId),
    };
  }

  async healthCheck() {
    return {
      ok: true,
      status: WORLD_PLATFORM_STATUS.PREVIEW,
      message: t("pages.worldChrome.localDemoMessage"),
    };
  }

  get displayName() {
    return t("pages.worldChrome.localDemoName");
  }
}
