/**
 * Experience Studio sandbox — preview + Prompt Inspector (W6 / §12.2).
 * Preview runs never write long-term memory (runKind=preview).
 */

import { inspectPromptBlocks, formatInspectorReport } from "../../prompt/inspector.js";
import {
  assembleExperienceTurn,
  createDeterministicExperienceModelStub,
  runExperienceDirectorTurn,
} from "../director.js";
import { enterExperience, endExperience } from "../runtime.js";
import { registerPackage } from "../store.js";
import { getPackageOpening } from "../package-io.js";

/**
 * Assemble prompt for a draft package and return inspector report.
 * @param {{
 *   pkg: object,
 *   openingId?: string,
 *   userInput?: string,
 *   characterName?: string,
 * }} input
 */
export function inspectStudioPrompt(input = {}) {
  const pkg = input.pkg;
  if (!pkg) return { ok: false, reason: "package_required", report: null, text: "" };
  const opening = getPackageOpening(pkg, input.openingId) || pkg.openings?.[0];
  if (!opening) return { ok: false, reason: "opening_required", report: null, text: "" };

  const fakeSession = {
    sceneState: { ...(opening.initialSceneState || {}), turnIndex: 0 },
    directorAgenda: opening.directorAgenda || pkg.directorPolicy?.defaultAgenda || {},
    conversationSessionId: "",
  };

  const { assembled, loreResult } = assembleExperienceTurn({
    pkg,
    opening,
    session: fakeSession,
    userInput: input.userInput || "……",
    characterName: input.characterName || "主演",
    characterBrief: `角色：${input.characterName || "主演"}。身份连续。`,
    loreEntries: pkg.embeddedLorebook || [],
  });

  const report =
    assembled?.inspector
    || inspectPromptBlocks(assembled?.blocks || [], {
      order: assembled?.order || assembled?.inspector?.order,
    });
  return {
    ok: true,
    report,
    text: formatInspectorReport(report),
    loreTrace: loreResult?.trace || null,
    activatedLoreIds: (loreResult?.activated || loreResult?.entries || [])
      .map((e) => (typeof e === "string" ? e : e?.id))
      .filter(Boolean),
  };
}

/**
 * Enter a sandbox preview session (does not project memory).
 * @param {{
 *   pkg: object,
 *   openingId?: string,
 *   characterId: string,
 * }} opts
 */
export function startStudioSandbox(opts = {}) {
  const pkg = opts.pkg;
  if (!pkg?.id) return { ok: false, reason: "package_required" };
  const characterId = String(opts.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "character_id_required" };

  registerPackage(pkg);
  return enterExperience({
    packageId: pkg.id,
    package: pkg,
    openingId: opts.openingId,
    characterId,
    runKind: "preview",
    meta: { preview: true, studioSandbox: true },
  });
}

/**
 * Run one sandbox turn with deterministic stub (no long-term memory commit).
 * @param {{
 *   experienceSessionId: string,
 *   userInput: string,
 * }} opts
 */
export async function runStudioSandboxTurn(opts = {}) {
  const stub = createDeterministicExperienceModelStub();
  return runExperienceDirectorTurn({
    experienceSessionId: opts.experienceSessionId,
    userInput: opts.userInput,
    callModel: stub,
  });
}

/**
 * @param {string} experienceSessionId
 */
export function endStudioSandbox(experienceSessionId) {
  return endExperience(experienceSessionId, { archive: true, reason: "studio_preview_end" });
}

export { getPackageOpening };
