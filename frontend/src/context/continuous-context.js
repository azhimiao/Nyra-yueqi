/**
 * Continuous Context: small every-turn Broker block.
 * Preferences / relationship facts / open commitments / life focus / unresolved.
 * Not Palace Deep Recall; not gated by message length.
 * Full CompanionLifeSnapshot is injected separately by Broker ().
 */

import { getLifeState } from "../companion/life-state.js";
import {
  formatContinuityPromptBlock,
  getOrProjectContinuity,
} from "../relationship/index.js";
import { isFeatureEnabled } from "../features/flags.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";

const LINE_LIMIT = 8;

/**
 * @param {{
 *   companionId?: string,
 *   userId?: string,
 *   locale?: string,
 *   query?: string,
 * }} input
 * @returns {{ text: string, source: string, lines: string[] }}
 */
export function buildContinuousContext(input = {}) {
  const companionId = String(input.companionId || "").trim();
  if (!companionId) return { text: "", source: "context.continuous", lines: [] };

  const locale = input.locale === "en" ? "en" : "zh-CN";
  const lines = [];

  try {
    if (isFeatureEnabled("relationshipContinuityV1")) {
      const continuity = getOrProjectContinuity({
        companionId,
        userId: String(input.userId || "local").trim() || "local",
        snapshot: createTemporalSnapshotV1({ locale }),
        locale,
      });
      const block = formatContinuityPromptBlock(continuity, { locale });
      if (block) {
        for (const line of block.split("\n")) {
          const t = line.trim();
          if (!t || t.startsWith("【") || t.startsWith("(") || t.startsWith("（")) continue;
          if (t.startsWith("- ")) lines.push(t.slice(2));
          else if (!t.endsWith("：") && !t.endsWith(":")) lines.push(t);
          if (lines.length >= LINE_LIMIT) break;
        }
      }
    }
  } catch {
    /* optional */
  }

  try {
    const life = getLifeState(companionId);
    if (life.currentMood) lines.push(locale === "en" ? `mood: ${life.currentMood}` : `心情：${life.currentMood}`);
    for (const goal of (life.currentGoals || []).slice(0, 2)) {
      if (lines.length >= LINE_LIMIT) break;
      lines.push(locale === "en" ? `focus: ${goal}` : `关注：${goal}`);
    }
    for (const ev of (life.pendingEvents || []).slice(0, 2)) {
      if (lines.length >= LINE_LIMIT) break;
      const summary = typeof ev === "string" ? ev : (ev?.summary || ev?.text || "");
      if (summary) lines.push(locale === "en" ? `unresolved: ${summary}` : `未决：${summary}`);
    }
  } catch {
    /* optional */
  }

  const unique = [];
  const seen = new Set();
  for (const line of lines) {
    const key = String(line).slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
    if (unique.length >= LINE_LIMIT) break;
  }

  if (!unique.length) return { text: "", source: "context.continuous", lines: [] };

  const header = locale === "en"
    ? "[Continuous context — stable facts for this turn; not deep recall]"
    : "【连续上下文 — 本轮稳定事实；非宫殿深检索】";
  const text = [header, ...unique.map((l) => `- ${l}`)].join("\n");
  return { text, source: "context.continuous", lines: unique };
}
