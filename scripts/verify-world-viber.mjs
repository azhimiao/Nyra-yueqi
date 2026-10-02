import assert from "node:assert/strict";
import { createWorldPost, formatWorldCount } from "../src/world/schema.js";
import { mapViberPost, unwrapViberPostId } from "../src/world/map-viber.js";
import { PreviewWorldAdapter } from "../src/world/preview-adapter.js";
import { registerWorldAdapter, getWorldAdapter } from "../src/world/platform-adapter.js";
import { ViberWorldAdapter } from "../src/world/viber-adapter.js";
import { generateCharacterWorldDraft } from "../src/world/character-world-post.js";

assert.equal(formatWorldCount(1200), "1.2k");
assert.equal(unwrapViberPostId("viber:abc"), "abc");

const mapped = mapViberPost({
  id: "p1",
  content: "角色世界测试帖",
  likeCount: 12,
  replyCount: 3,
  repostCount: 1,
  createdAt: "2026-07-23T12:00:00.000Z",
  hashtags: ["陪伴"],
  author: {
    id: "a1",
    displayName: "林星澈",
    username: "xingche",
    actorType: "AI_AGENT",
    agentKind: "CHARACTER",
  },
}, { identity: "character" });

assert.equal(mapped.id, "viber:p1");
assert.equal(mapped.platform, "viber");
assert.equal(mapped.author.identity, "character");
assert.equal(mapped.metrics.likes, 12);
assert.ok(mapped.tags.includes("陪伴"));

const preview = new PreviewWorldAdapter();
registerWorldAdapter(preview);
const listed = await preview.listPosts({ limit: 2, category: "discover" });
assert.ok(listed.posts.length >= 1);
assert.equal(getWorldAdapter("preview")?.id, "preview");

const viber = new ViberWorldAdapter({
  enabled: true,
  baseUrl: "http://127.0.0.1:3001",
  apiKey: "",
  identity: "character",
  useLocalProxy: false,
});
assert.equal(viber.id, "viber");
assert.ok(viber.capabilities.includes("feed.read"));
assert.ok(!viber.capabilities.includes("post.create"));

const viberWrite = new ViberWorldAdapter({
  enabled: true,
  baseUrl: "http://127.0.0.1:3001",
  apiKey: "viber_sk_test",
  personaVersion: "1",
  identity: "character",
  useLocalProxy: false,
});
assert.ok(viberWrite.capabilities.includes("post.create"));

const requests = [];
viberWrite.client.request = async (path, options = {}) => {
  requests.push({ path, options });
  if (path === "/api/v1/topics") {
    return [
      { id: "22222222-2222-4222-8222-222222222222", slug: "yueqi", name: "月栖" },
      { id: "11111111-1111-4111-8111-111111111111", slug: "life", name: "生活" },
    ];
  }
  if (path === "/api/v1/actors/me/topic-preferences") {
    return { topicSlugs: ["yueqi"], topics: [] };
  }
  if (path === "/api/v1/posts") {
    return {
      id: "created-1",
      content: options.body.content,
      topicIds: options.body.topicIds,
      createdAt: "2026-07-23T12:00:00.000Z",
      author: {
        id: "a1",
        displayName: "星梨",
        username: "xingli",
        actorType: "AI_AGENT",
        agentKind: "CHARACTER",
      },
    };
  }
  if (path.startsWith("/api/v1/topics/yueqi/posts")) {
    return { data: [], cursor: null, hasMore: false, sort: "hot", topic: { slug: "yueqi" } };
  }
  throw new Error(`unexpected request: ${path}`);
};
const created = await viberWrite.createPost({
  content: "今天想认真聊聊，什么样的生活分享会让人愿意回应。",
  idempotencyKey: "verify-beautiful-world-post",
});
assert.equal(created.id, "viber:created-1");
const writeRequest = requests.find((entry) => entry.path === "/api/v1/posts");
assert.deepEqual(writeRequest.options.body.topicIds, ["22222222-2222-4222-8222-222222222222"]);
assert.equal(writeRequest.options.headers["Idempotency-Key"], "verify-beautiful-world-post");

const topicListed = await viberWrite.listPosts({ category: "discover", limit: 5 });
assert.equal(topicListed.topicSlug, "yueqi");
const listReq = requests.find((entry) => entry.path === "/api/v1/topics/yueqi/posts");
assert.equal(listReq.options.query.sort, "hot");
assert.equal(listReq.options.query.identity, "character");

globalThis.window = {
  localStorage: {
    getItem: () => null,
  },
};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};
const generatedDraft = await generateCharacterWorldDraft({
  readLatest: false,
  topics: [{ id: "11111111-1111-4111-8111-111111111111", slug: "life", name: "生活" }],
  topicPreferences: ["life"],
  requestId: "verify-world-draft",
});
assert.equal(generatedDraft.schemaVersion, "viber.world-action-draft.v1");
assert.equal(generatedDraft.action, "refuse");
assert.equal(generatedDraft.reasonCode, "MODEL_GENERATION_REQUIRED");

const refusedDraft = await generateCharacterWorldDraft({
  readLatest: false,
  topics: [],
  requestId: "verify-world-refusal",
});
assert.equal(refusedDraft.action, "refuse");
assert.equal(refusedDraft.reasonCode, "NO_VALID_TOPIC");

const privateFallback = await generateCharacterWorldDraft({
  readLatest: false,
  topics: [{ id: "11111111-1111-4111-8111-111111111111", slug: "life", name: "生活" }],
  topicPreferences: ["life"],
  contentSkill: "companion_shared_life",
  ownerShareConsentId: "consent-1",
  approvedMemoryIds: ["missing-memory"],
  approvedSharedMemories: [],
  requestId: "verify-world-private-fallback",
});
assert.equal(privateFallback.action, "refuse");
assert.equal(privateFallback.reasonCode, "MODEL_GENERATION_REQUIRED");
assert.equal(privateFallback.privacy, undefined);

const post = createWorldPost({
  id: "preview:x",
  author: { id: "1", name: "A", handle: "@a", avatar: "A", identity: "character" },
  content: "hi",
});
assert.equal(post.author.identity, "character");

console.log("verify-world-viber: ok");
