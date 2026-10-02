/**
 * 漫卷 AI 续写引擎 — 选角色后按帧协议生成。
 */

import { callModel } from "../model/client.js";
import { parseVnResponse } from "./vn-parser.js";

function buildSystemPrompt(characterName) {
  const name = String(characterName || "角色").trim() || "角色";
  return [
    "你正在与用户进行视觉小说式互动。",
    `角色名：${name}。`,
    "只输出一段 JSON，不要 Markdown 解释。",
    '格式：{"frames":[{"speaker":"角色名或空字符串表示旁白","text":"一两句","portrait":""}],"options":[{"id":"a","label":"选项文案"}]|null,"ending":null}',
    "规则：每次 1～4 个 frames；需要用户抉择时给 2～3 个 options；自由接话时 options 可为 null；章节收束时给 ending 对象。",
    "不要输出桌宠、系统提示或元说明。",
  ].join("\n");
}

/**
 * @param {object} opts
 * @param {() => Promise<object>|object} [opts.collectProviderConfig]
 * @param {string} opts.characterName
 * @param {string} [opts.characterId]
 * @param {Array<{role:string,content:string}>} [opts.history]
 * @param {string} opts.userTurn
 */
export async function generateVnCompletion(opts = {}) {
  const config = typeof opts.collectProviderConfig === "function"
    ? await opts.collectProviderConfig()
    : opts.collectProviderConfig;
  if (!config?.apiKey || !config?.baseUrl || !config?.model) {
    const err = new Error("请先在接口页配置模型");
    err.code = "provider_missing";
    throw err;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(opts.characterName) },
    ...(Array.isArray(opts.history) ? opts.history.slice(-16) : []),
    { role: "user", content: String(opts.userTurn || "请开始这一章的第一幕。").slice(0, 2000) },
  ];

  const result = await callModel(config, messages, {
    stream: false,
    temperature: 0.82,
    businessPurpose: "creative.visual_novel_turn",
    capability: "chat",
    companionId: opts.characterId || "",
  });
  const parsed = parseVnResponse(result?.content || "");
  if (!parsed.ok || !parsed.frames.length) {
    const err = new Error("模型没写出可用剧情，请再试一次");
    err.code = "vn_parse_failed";
    throw err;
  }
  return {
    ...parsed,
    rawText: String(result?.content || ""),
    model: config.model,
    latencyMs: result?.latencyMs,
  };
}
