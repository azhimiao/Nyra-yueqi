/**
 * Split IM replies into WeChat/QQ-style short bubbles.
 */

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Keep only the first IM sentence so one tap = one bubble.
 * @param {string} text
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
export function takeFirstImSentence(text, { maxChars = 56 } = {}) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const firstLine = raw.split(/\n+/)[0]?.trim() || raw;
  const match = firstLine.match(/^[\s\S]*?[。！？!?…]+/);
  let one = (match ? match[0] : firstLine).trim();
  if (one.length > maxChars) {
    const soft = one.slice(0, maxChars);
    const cut = soft.search(/[，,；;、]\s*[^，,；;、]*$/);
    one = (cut > 12 ? soft.slice(0, cut + 1) : soft).trim();
  }
  return one.replace(/^[，。、；：\s]+|[，。、；：\s]+$/g, "").trim();
}

/**
 * Prefer sentence ends and newlines; soft-split long runs so bubbles stay short.
 * @param {string} text
 * @param {{ maxParts?: number, maxChars?: number }} [opts]
 * @returns {string[]}
 */
export function splitBySentence(text, { maxParts = 5, maxChars = 42 } = {}) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  // Explicit single-bubble callers only; default keeps full reply and splits by sentence.
  if (maxParts <= 1) {
    const one = takeFirstImSentence(raw, { maxChars: Math.max(maxChars, 56) });
    return one ? [one] : [];
  }

  const rough = raw
    .split(/(?<=[。！？!?…]+|\n)\s*/)
    .map((line) => line.replace(/\n+/g, " ").trim())
    .filter(Boolean);

  const parts = [];
  for (const chunk of rough) {
    if (chunk.length <= maxChars) {
      parts.push(chunk);
      continue;
    }
    const soft = chunk
      .split(/(?<=[，,；;、])\s*/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (soft.length <= 1) {
      for (let i = 0; i < chunk.length; i += maxChars) {
        parts.push(chunk.slice(i, i + maxChars).trim());
      }
      continue;
    }
    let buf = "";
    for (const piece of soft) {
      if (!buf) {
        buf = piece;
        continue;
      }
      if (`${buf}${piece}`.length <= maxChars) {
        buf += piece;
      } else {
        parts.push(buf);
        buf = piece;
      }
    }
    if (buf) parts.push(buf);
  }

  if (!parts.length) return [raw];
  if (parts.length <= maxParts) return parts;

  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join("");
  return [...head, tail].filter(Boolean);
}

/**
 * Deliver multi-sentence replies as separate bubbles.
 * onPart(part, index, parts) fires before each bubble (for summary updates).
 * generationToken + isCurrentGeneration() prevent cross-talk between runs.
 */
export async function deliverSegmentedText(text, {
  addMessage,
  delayMs = 720,
  role = "ai",
  onPart = null,
  isCurrentGeneration = null,
  maxParts = 5,
  maxChars = 42,
} = {}) {
  const parts = splitBySentence(text, { maxParts, maxChars });
  if (!parts.length) return [];

  const alive = () => (typeof isCurrentGeneration === "function" ? isCurrentGeneration() : true);

  for (let index = 0; index < parts.length; index += 1) {
    if (!alive()) return parts.slice(0, index);
    const part = parts[index];
    onPart?.(part, index, parts);
    if (!alive()) return parts.slice(0, index);
    await addMessage(part, role, { persist: true });
    if (index < parts.length - 1) {
      // Slightly stagger later bubbles so it feels like typing, not a dump
      const wait = delayMs + Math.min(480, Math.round(part.length * 18));
      await sleep(wait);
    }
  }
  return parts;
}
