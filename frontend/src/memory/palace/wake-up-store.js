let pendingWakeUpBlock = "";

export function setWakeUpContext(context) {
  pendingWakeUpBlock = context?.block || "";
}

export function peekWakeUpBlock() {
  return pendingWakeUpBlock;
}

/** Consume once on first prompt assembly after app resume. */
export function consumeWakeUpBlock() {
  const block = pendingWakeUpBlock;
  pendingWakeUpBlock = "";
  return block;
}
