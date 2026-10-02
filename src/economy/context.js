const SNAPSHOT_KEY = "yueqi.economy.snapshots.v1";
const MAX_SNAPSHOTS = 12;

function readBag() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(SNAPSHOT_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBag(value) {
  try {
    globalThis.localStorage?.setItem(SNAPSHOT_KEY, JSON.stringify(value));
  } catch {
    // Cache only. The server remains authoritative.
  }
}

export function saveEconomySnapshot(snapshot) {
  const actorId = String(snapshot?.actor?.actorId || "").trim();
  if (!actorId) return snapshot;
  const bag = readBag();
  bag[actorId] = snapshot;
  const companionId = String(snapshot?.actor?.companionId || "").trim();
  if (companionId) bag[`companion:${companionId}`] = snapshot;
  const compact = Object.entries(bag)
    .sort((a, b) => String(b[1]?.generatedAt || "").localeCompare(String(a[1]?.generatedAt || "")))
    .slice(0, MAX_SNAPSHOTS * 2);
  writeBag(Object.fromEntries(compact));
  return snapshot;
}

export function readEconomySnapshot(identity = {}) {
  const bag = readBag();
  const actorId = String(identity.actorId || "").trim();
  const companionId = String(identity.companionId || "").trim();
  return (actorId && bag[actorId]) || (companionId && bag[`companion:${companionId}`]) || null;
}

export function formatEconomySnapshotBlock(snapshot) {
  if (!snapshot?.actor?.actorId) return "";
  const intents = (snapshot.activeIntents || []).slice(0, 3).map((intent) =>
    `- ${intent.desire || intent.recipeId || "未命名意图"}${intent.expectedNextTrigger ? `；下一触发：${intent.expectedNextTrigger}` : ""}`,
  );
  const objects = (snapshot.relevantObjects || []).slice(0, 4).map((object) =>
    `- ${object.title || object.artifactType || object.objectType}${object.abstract ? `：${object.abstract}` : ""}`,
  );
  const transactions = (snapshot.recentTransactions || []).slice(0, 4).map((row) =>
    `- ${row.createdAt || ""} ${row.delta > 0 ? "+" : ""}${row.delta || 0} ${row.note || row.kind || ""}`.trim(),
  );
  return [
    "[角色经济与生产状态｜服务器快照]",
    `主体：${snapshot.actor.displayName || snapshot.actor.actorId}`,
    `可用栖币：${Number(snapshot.available ?? snapshot.balance) || 0}（这是角色世界经济，不是订阅/API 积分）`,
    intents.length ? `持续意图：\n${intents.join("\n")}` : "持续意图：暂无",
    objects.length ? `真实产出：\n${objects.join("\n")}` : "真实产出：暂无",
    transactions.length ? `近期经济行为：\n${transactions.join("\n")}` : "近期经济行为：暂无",
    "约束：不得声称完成了未出现在真实产出中的作品；不得把余额编造成现实货币。",
  ].join("\n");
}

export function formatCachedEconomySnapshotBlock(identity = {}) {
  return formatEconomySnapshotBlock(readEconomySnapshot(identity));
}

