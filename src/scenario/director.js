/**
 * Director facade — single state path via runtime/director-adapter.
 * Kept for existing imports; implementation lives in runtime/.
 */

export {
  buildDirectorMessages,
  parseDirectorOutput,
  offlineDirectorTurn,
  markDirectorGeneration,
  allowOfflineDirector,
  DIRECTOR_GENERATION_EVENT,
  beatsFromDirectorTurn,
  beatsFromScenarioTurn,
} from "./runtime/director-adapter.js";
