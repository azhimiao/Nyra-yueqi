/**
 * Skill Context Broker — wires Explore / Skill Runtime to central buildContextEnvelope.
 * Product surfaces pass createSkillBrokerDeps() into buildHostEnvelope deps.
 */

import { buildContextEnvelope } from "../context/index.js";

/**
 * @returns {{ buildContextEnvelope: typeof buildContextEnvelope }}
 */
export function createSkillBrokerDeps() {
  return { buildContextEnvelope };
}

export { buildContextEnvelope };
