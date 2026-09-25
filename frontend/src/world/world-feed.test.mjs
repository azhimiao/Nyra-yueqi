import assert from "node:assert/strict";
import { postCard } from "./world-feed.js";
import { createWorldPost } from "./schema.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("post card is a timeline row, not a dashboard chip", () => {
  const html = postCard(createWorldPost({
    id: "preview:rain-city",
    author: {
      id: "night-pages",
      name: "夜航书页",
      handle: "@night_pages",
      avatar: "夜",
      verified: true,
    },
    content: "雨停以后，城市里所有的灯都像刚刚醒来。",
    createdAt: "2026-09-24T15:42:00+08:00",
    tags: ["城市散步", "旧书店"],
    metrics: { likes: 2841, replies: 126, reposts: 483, views: 42000 },
  }));
  assert.match(html, /world-feed-card/);
  assert.match(html, /@night_pages/);
  assert.match(html, /world-feed-verified/);
  assert.match(html, /#城市散步/);
  assert.match(html, /world-feed-stat--reply/);
  assert.match(html, /world-feed-stat--repost/);
  assert.match(html, /world-feed-stat--like/);
  assert.doesNotMatch(html, /world-feed-identity/);
  assert.doesNotMatch(html, /world-feed-card--rose/);
});

console.log(`${passed} passed`);
