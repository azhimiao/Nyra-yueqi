/**
 * 漫卷 AI 帧解析 — 自研协议，不复制外部提示词。
 * 期望模型输出 JSON：
 * { "frames":[{ "speaker":"", "text":"", "portrait":"" }], "options":[{ "id":"", "label":"" }] | null, "ending": null|{ "id","title","summary"} }
 */

function trim(value) {
  return String(value || "").trim();
}

function extractJsonObject(text) {
  const raw = String(text || "");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {string} rawText
 * @returns {{ frames: object[], options: object[]|null, ending: object|null, ok: boolean, fallbackText?: string }}
 */
export function parseVnResponse(rawText) {
  const parsed = extractJsonObject(rawText);
  if (!parsed || typeof parsed !== "object") {
    const text = trim(rawText);
    if (!text) return { ok: false, frames: [], options: null, ending: null };
    return {
      ok: true,
      frames: [{ id: "f1", speaker: "", text: text.slice(0, 800), portrait: "" }],
      options: [
        { id: "continue", label: "继续" },
        { id: "speak", label: "我想说一句…" },
      ],
      ending: null,
      fallbackText: text,
    };
  }

  const framesIn = Array.isArray(parsed.frames) ? parsed.frames : [];
  const frames = framesIn
    .map((item, index) => {
      const text = trim(item?.text || item?.body || item?.content);
      if (!text) return null;
      return {
        id: trim(item?.id) || `f${index + 1}`,
        speaker: trim(item?.speaker || item?.name),
        text: text.slice(0, 1200),
        portrait: trim(item?.portrait),
        bg: trim(item?.bg),
      };
    })
    .filter(Boolean);

  if (!frames.length) {
    const blob = trim(parsed.text || parsed.content || rawText);
    if (!blob) return { ok: false, frames: [], options: null, ending: null };
    frames.push({ id: "f1", speaker: "", text: blob.slice(0, 800), portrait: "" });
  }

  let options = null;
  if (Array.isArray(parsed.options) && parsed.options.length) {
    options = parsed.options
      .map((item, index) => {
        const label = trim(item?.label || item?.text);
        if (!label) return null;
        return { id: trim(item?.id) || `opt-${index + 1}`, label: label.slice(0, 48) };
      })
      .filter(Boolean);
    if (!options.length) options = null;
  }

  let ending = null;
  if (parsed.ending && typeof parsed.ending === "object") {
    const title = trim(parsed.ending.title) || "结局";
    const summary = trim(parsed.ending.summary);
    const id = trim(parsed.ending.id) || `ending-${Date.now().toString(36)}`;
    if (summary || title) ending = { id, title, summary: summary || title };
  }

  return { ok: true, frames, options, ending };
}
