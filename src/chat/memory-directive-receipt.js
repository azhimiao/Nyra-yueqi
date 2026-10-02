import { getSession, selectVisibleHistory, updateMessageMeta } from "../conversation/index.js";
import { extractAndApplyMemoryOperations } from "../context/extraction.js";
import { evidenceFingerprint, FORGET_DIRECTIVE, isCorrection, userFactSpans } from "../memory/evidence.js";

function directiveSource(text) {
  if (FORGET_DIRECTIVE.test(String(text || "").trim())) return "forget_directive";
  return isCorrection(text) && userFactSpans(text).length ? "correction_directive" : "";
}

/** Read an execution result only for the same still-visible user evidence. */
export function readMemoryDirectiveReceipt(input = {}) {
  const characterId = String(input.characterId || input.companionId || "");
  const sessionId = String(input.conversationSessionId || "");
  const messageId = String(input.userMessageId || input.userEvidenceRef || "");
  const text = String(input.userText || "").trim();
  if (!characterId || !sessionId || !messageId || !text) return null;
  const session = getSession(sessionId);
  const row = selectVisibleHistory(session).find((item) => item.id === messageId && item.role === "user");
  const receipt = row?.meta?.memoryDirectiveReceipt;
  if (!receipt || receipt.version !== 1 || receipt.source !== directiveSource(text)
    || !["forget_directive", "correction_directive"].includes(receipt.source)
    || session?.characterId !== characterId
    || receipt.characterId !== characterId || receipt.conversationSessionId !== sessionId
    || receipt.userMessageId !== messageId || receipt.sourceFingerprint !== evidenceFingerprint(text)
    || String(row.content || "").trim() !== text
    || !["applied", "failed"].includes(receipt.status)) return null;
  return receipt;
}

/** Execute once; keep the receipt on the existing V2 user node, without targets. */
export async function applyMemoryDirectiveWithReceipt(input = {}, deps = {}) {
  const source = directiveSource(input.userText);
  const prior = source ? readMemoryDirectiveReceipt(input) : null;
  if (prior) return prior;
  let result;
  try {
    result = await (deps.extract || extractAndApplyMemoryOperations)(input);
  } catch (error) {
    if (!source) throw error;
    result = { ok: false };
  }
  if (!source) return null;
  const expectedSource = source === "forget_directive" ? source : "user_evidence";
  const applied = result?.source === expectedSource && result.ok === true && result.results?.length > 0
    && result.results.every((row) => row.ok === true
      && (source === "forget_directive" || (row.stage === "stable" && row.stable?.memoryId)));
  const receipt = {
    version: 1,
    source,
    characterId: String(input.characterId || input.companionId || ""),
    conversationSessionId: String(input.conversationSessionId || ""),
    userMessageId: String(input.userEvidenceRef || ""),
    sourceFingerprint: evidenceFingerprint(String(input.userText || "").trim()),
    status: applied ? "applied" : "failed",
    ...(source === "correction_directive" ? {
      supersededCount: (result?.results || []).reduce((sum, row) => sum + (Number(row.superseded?.replaced) || 0), 0),
    } : {}),
  };
  const saved = updateMessageMeta(receipt.conversationSessionId, receipt.userMessageId, { memoryDirectiveReceipt: receipt });
  if (!saved.ok) throw new Error("memory_directive_receipt_write_failed");
  return receipt;
}

/** This short result is reserved and injected unchanged in the same request. */
export function buildMemoryDirectiveReceiptMessage(receipt, lang, turnIntent = "user_message") {
  if (!receipt || !["user_message", "regenerate"].includes(turnIntent)) return null;
  const en = String(lang?.conversationLanguage || lang || "").toLowerCase().startsWith("en");
  const success = receipt.status === "applied";
  if (receipt.source === "correction_directive") {
    const content = en ? [
      "[Actual result of this user's memory correction]",
      success ? "The user's current fact was saved successfully. Use that correction in this reply."
        : "The memory update did not fully succeed. Respect the user's current correction, but do not claim it was saved.",
      ...(receipt.supersededCount > 0 ? ["Earlier records were replaced; superseded passages are deliberately omitted from the supplied history. They existed before this correction."] : []),
      "Both dialogue and inner voice must accept the correction. Missing old passages are not proof that the user or character never said them. Do not invent their wording or narrate memory/search mechanics as inner feelings.",
      ...(turnIntent === "regenerate" ? ["This is the recorded result, not a new execution."] : []),
    ].join("\n") : [
      "【本轮记忆更正的实际执行结果】",
      success ? "本轮明确事实已保存，以用户现在的更正为准。" : "本轮记忆更新未全部成功。仍应尊重用户当前更正，但不能声称已保存。",
      ...(receipt.supersededCount > 0 ? ["已有旧记忆被替换，其旧表述已从传入历史中隐藏；它们在更正前确实存在。"] : []),
      "正文和心里话都接受更正。旧片段缺失不等于用户或角色之前没说过，勿否认、勿补写缺失原话；心里话表达感受，不评论检索或记忆读写。",
      ...(turnIntent === "regenerate" ? ["这是此前的执行结果，没有再次执行操作。"] : []),
    ].join("\n");
    return { role: "system", content, blockId: "runtime_context", provenance: "runtime.memory_directive" };
  }
  const content = en ? [
    "[Verified result of this user's forgetting request]",
    success
      ? "Done: the requested content is now excluded from future conversation context. The original chat transcript is retained. Briefly confirm the completed request in character, referring only to 'those details'. Neither dialogue nor inner voice may repeat the targets or infer that they never existed from their absence now. Any inner voice should express feelings about the boundary, not discuss memory retrieval."
      : "The forgetting request did not fully succeed. Explain that it was not completed; do not claim the information was forgotten or cleared, or promise that the restriction is already in effect. The original chat transcript is retained.",
    ...(turnIntent === "regenerate" ? ["This is the recorded result for the same user message, not a new execution."] : []),
  ].join("\n") : [
    "【本轮遗忘请求的实际执行结果】",
    success
      ? "已处理：指定内容不再用于后续对话；原聊天记录仍保留。用角色口吻简短确认完成，只用‘这些事’指代目标。正文和心里话都不重复目标名称，不把处理后的缺失说成‘本来就没有’或‘没印象’。心里话若有，应表达对边界的感受，不评论记忆检索。"
      : "本轮遗忘请求没有全部成功。应如实说明尚未完成，不得声称已经忘记、已清除或保证限制已生效；原聊天记录仍保留。",
    ...(turnIntent === "regenerate" ? ["这是同一用户消息此前的执行结果，重生成没有再次执行操作。"] : []),
  ].join("\n");
  return { role: "system", content, blockId: "runtime_context", provenance: "runtime.memory_directive" };
}
