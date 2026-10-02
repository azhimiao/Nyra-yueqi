/**
 * Regex / TurnUnderstanding / OpenClaw produce ToolRun proposals only.
 * Side effects stay in companion-tool-loop.
 */

import { toolRunFromModelCall } from "./tool-run-repository.js";

export function proposalToToolRun(proposal = {}, source = "turn_understanding") {
  return toolRunFromModelCall({
    capabilityId: proposal.capabilityId,
    operation: proposal.operation,
    parameters: proposal.parameters || {},
    risk: proposal.risk || "R2",
    exactEffect: proposal.exactEffect || proposal.title || `${proposal.capabilityId}.${proposal.operation}`,
    idempotencyKey: proposal.proposalId || proposal.idempotencyKey,
    proposalSource: source,
  });
}

export function regexAllowsWrite(text) {
  const raw = String(text || "");
  if (/(不要|别|取消|不是).{0,8}(提醒|日程|日历)/.test(raw)) return false;
  if (/[“"'「].*(提醒|日程).*[”"'」]/.test(raw)) return false;
  if (/\?|？/.test(raw) && /(提醒|日程)/.test(raw)) return false;
  return /(提醒|日程|日历)/.test(raw);
}
