/** OpenAI-compatible event framing and completion semantics shared by browser and gateway. */
export function modelStreamError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("请求已取消。", "AbortError");
}

export function assertNotAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

export function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(abortReason(signal)); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** The deadline owns the entire body, including retry delay and native response parsing. */
export async function withModelDeadline(work, { signal, timeoutMs = 90000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(abortReason(signal));
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("模型回复超时。", "TimeoutError")), Math.max(1, timeoutMs));
  try {
    assertNotAborted(controller.signal);
    return await withAbort(work(controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createSseDecoder(onEvent) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", data = [], event = "";
  const dispatch = () => {
    if (data.length) onEvent(data.join("\n"), event);
    data = []; event = "";
  };
  const line = value => {
    const row = value.replace(/\r$/, "");
    if (!row) { dispatch(); return; }
    if (row.startsWith(":")) return;
    const colon = row.indexOf(":");
    const field = colon < 0 ? row : row.slice(0, colon);
    const valueText = colon < 0 ? "" : row.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data.push(valueText);
    if (field === "event") event = valueText;
  };
  const drain = () => {
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const next = buffer.slice(0, at); buffer = buffer.slice(at + 1); line(next);
    }
  };
  return {
    push(bytes) { buffer += decoder.decode(bytes, { stream: true }); drain(); },
    finish() {
      buffer += decoder.decode(); drain();
      if (buffer) { line(buffer); buffer = ""; }
      dispatch();
    },
  };
}

export function assertCompletion({ finishReason = "", done = false, toolCalls = [] } = {}, { allowMissing = false } = {}) {
  if (finishReason === "length" || finishReason === "max_tokens") {
    throw modelStreamError("MODEL_OUTPUT_TRUNCATED", "回复达到长度上限，尚未完整生成，请重试。");
  }
  if (finishReason === "content_filter") {
    throw modelStreamError("MODEL_OUTPUT_FILTERED", "模型未能完成这次回复，请调整内容后重试。");
  }
  if (finishReason && !["stop", "tool_calls", "function_call", "end_turn"].includes(finishReason)) {
    throw modelStreamError("MODEL_FINISH_UNSUPPORTED", "模型返回了未支持的结束状态。");
  }
  if (!allowMissing && !done && !finishReason) {
    throw modelStreamError("MODEL_STREAM_INCOMPLETE", "回复连接提前结束，内容尚未完整生成，请重试。");
  }
  if (["tool_calls", "function_call"].includes(finishReason) && !toolCalls.length) {
    throw modelStreamError("MODEL_TOOL_CALL_INCOMPLETE", "模型工具请求不完整。");
  }
  for (const call of toolCalls) {
    if (!call.function?.name) throw modelStreamError("MODEL_TOOL_CALL_INCOMPLETE", "模型工具请求不完整。");
    try { JSON.parse(call.function.arguments || "{}"); }
    catch { throw modelStreamError("MODEL_TOOL_CALL_INCOMPLETE", "模型工具参数未完整生成。"); }
  }
}

export async function consumeModelStream(response, options = {}) {
  const reader = response.body?.getReader();
  if (!reader) throw modelStreamError("MODEL_STREAM_UNAVAILABLE", "模型未提供可读取的回复流。");
  const state = { content: "", reasoningLength: 0, finishReason: "", done: false, toolCalls: [], usage: null, model: "", execution: {} };
  const decoder = createSseDecoder((data, event) => {
    if (data.trim() === "[DONE]") { state.done = true; options.onPayload?.("[DONE]"); return; }
    let payload;
    try { payload = JSON.parse(data); }
    catch { throw modelStreamError("MODEL_STREAM_MALFORMED", "模型回复流包含无法读取的数据。"); }
    if (event === "error" || payload.error) {
      // Provider diagnostics may contain prompts or credentials; expose a bounded code only.
      const code = String(payload.error?.code || "");
      const acceptedCode = /^MODEL_(?:STREAM_[A-Z_]+|OUTPUT_(?:TRUNCATED|FILTERED)|TOOL_CALL_INCOMPLETE|FINISH_UNSUPPORTED)$/.test(code)
        ? code : "MODEL_STREAM_ERROR";
      throw modelStreamError(acceptedCode, "模型在回复过程中返回错误，请重试。");
    }
    if (payload.yueqi) state.execution = { ...state.execution, ...payload.yueqi };
    if (payload.usage) state.usage = payload.usage;
    if (payload.model) state.model = payload.model;
    const choice = payload.choices?.[0];
    if (choice?.finish_reason) state.finishReason = String(choice.finish_reason);
    const delta = choice?.delta || {};
    const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || "";
    if (reasoning) {
      state.reasoningLength += String(reasoning).length;
      options.onReasoning?.({ phase: "reasoning", length: state.reasoningLength });
    }
    if (typeof delta.content === "string" && delta.content) {
      if (state.done) throw modelStreamError("MODEL_STREAM_AFTER_DONE", "模型在结束标记后仍发送正文。");
      state.content += delta.content;
      options.onDelta?.(state.content, delta.content);
    }
    const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls
      : delta.function_call ? [{ index: 0, function: delta.function_call }] : [];
    for (const part of calls) {
      const index = Number(part?.index) || 0;
      const current = state.toolCalls[index] || { id: "", type: "function", function: { name: "", arguments: "" } };
      if (part.id) current.id = part.id;
      if (part.function?.name) current.function.name += part.function.name;
      if (part.function?.arguments) current.function.arguments += part.function.arguments;
      state.toolCalls[index] = current;
    }
    options.onPayload?.(payload);
  });
  let finished = false;
  try {
    while (true) {
      assertNotAborted(options.signal);
      const chunk = await withAbort(reader.read(), options.signal);
      if (chunk.done) break;
      decoder.push(chunk.value);
    }
    decoder.finish();
    assertNotAborted(options.signal);
    state.toolCalls = state.toolCalls.filter(Boolean);
    assertCompletion(state);
    finished = true;
    return state;
  } finally {
    if (!finished) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* already disconnected */ } }
    reader.releaseLock();
  }
}
