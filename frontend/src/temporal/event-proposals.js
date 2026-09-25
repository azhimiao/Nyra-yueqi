/**
 * Event proposals from TurnUnderstanding (W3).
 * Passes through validated eventProposals; does not invent or write.
 */

/**
 * @param {object} [understanding] TurnUnderstandingV1
 * @returns {object[]}
 */
export function proposeTemporalEventsFromUnderstanding(understanding) {
  return Array.isArray(understanding?.eventProposals) ? [...understanding.eventProposals] : [];
}
