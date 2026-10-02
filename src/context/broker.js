/** Open-source tree: context brokerage across memory, worldbook, and life logs is removed. */

export async function buildContextEnvelope() {
  return {
    historyMessages: [],
    blocks: [],
    worldbook: { activated: [], trimmed: [], trace: null },
    trace: {},
    request: { profile: { totalInputTokens: 8000, outputReserveTokens: 1800 } },
    authority: null,
  };
}

export function formatImplicitEnvelope() {
  return "";
}
