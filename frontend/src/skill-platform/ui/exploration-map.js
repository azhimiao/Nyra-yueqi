/**
 * Exploration map side panel — 探索地图 / 当前理解 from SkillRun host state.
 * Pure model + minimal DOM render for P4/P5 explore sessions.
 */

import { getLocale } from "../../i18n/index.js";
import { readHostState } from "../state-machine.js";
import { normalizeWorkingFormulation } from "../adapters/relationship-intelligence.js";
import { tx } from "./i18n.js";

const PHASE_KEYS = Object.freeze({
  ENTRY: "phaseEntry",
  WORKING_ALLIANCE: "phaseWorkingAlliance",
  OPEN_NARRATIVE: "phaseOpenNarrative",
  WORKING_FORMULATION: "phaseWorkingFormulation",
  TARGETED_CLARIFICATION: "phaseTargetedClarification",
  PERSONALIZED_SIMULATION: "phasePersonalizedSimulation",
  SCENARIO_DEBRIEF: "phaseScenarioDebrief",
  SYNTHESIS: "phaseSynthesis",
  USER_PAUSE: "phaseUserPause",
  SAFETY_CHECK: "phaseSafetyCheck",
  CRISIS_RESPONSE: "phaseCrisisResponse",
  ABUSE_RESPONSE: "phaseAbuseResponse",
  MINOR_PROTECTION: "phaseMinorProtection",
});

function phaseLabel(phase, locale) {
  const key = PHASE_KEYS[String(phase || "")];
  return key ? tx(key, locale) : String(phase || "—");
}

/**
 * @param {object} run
 * @param {string} [locale]
 */
export function buildExplorationMapModel(run, locale) {
  const loc = locale || getLocale();
  const state = readHostState(run);
  const wf = normalizeWorkingFormulation(state.workingFormulation);
  /** @type {{ role: string, text: string, confidence?: number, testable?: boolean }[]} */
  const hypotheses = [];
  if (wf?.primaryHypothesis) {
    hypotheses.push({ role: "primary", ...wf.primaryHypothesis });
  }
  if (wf?.alternateHypothesis) {
    hypotheses.push({ role: "alternate", ...wf.alternateHypothesis });
  }

  const phase = String(state.phase || "ENTRY");
  const phaseLabelText = phaseLabel(phase, loc);

  return {
    title: tx("mapTitle", loc),
    subtitle: tx("mapSubtitle", loc),
    locale: loc,
    runId: run?.id || "",
    skillId: run?.skillId || "",
    phase,
    phaseLabel: phaseLabelText,
    hypotheses,
    questionEndingStreak: Number(state.questionEndingStreak ?? 0),
    safetyFlags: Array.isArray(state.safetyFlags) ? [...state.safetyFlags] : [],
    updatedAt: run?.updatedAt || null,
  };
}

/**
 * @param {ReturnType<typeof buildExplorationMapModel>} model
 */
export function explorationMapModelToPlainText(model) {
  const loc = model.locale || getLocale();
  const lines = [
    model.title,
    tx("mapPhase", loc, { label: model.phaseLabel }),
    tx("mapQuestionStreak", loc, { n: model.questionEndingStreak }),
  ];
  if (model.hypotheses.length === 0) {
    lines.push(tx("mapNoHypothesis", loc));
  } else {
    for (const h of model.hypotheses) {
      const label = h.role === "primary" ? tx("mapPrimary", loc) : tx("mapAlternate", loc);
      const conf = h.confidence != null ? `（${Math.round(h.confidence * 100)}%）` : "";
      lines.push(`${label}${conf}：${h.text}`);
    }
  }
  if (model.safetyFlags.length > 0) {
    lines.push(tx("mapSafety", loc, { flags: model.safetyFlags.join("、") }));
  }
  return lines.join("\n");
}

/**
 * Minimal DOM render — safe to call headless with jsdom or browser panel.
 * @param {HTMLElement|null} container
 * @param {ReturnType<typeof buildExplorationMapModel>} model
 */
export function renderExplorationMap(container, model) {
  if (!container) {
    return { ok: false, reason: "missing_container" };
  }
  const loc = model.locale || getLocale();
  container.replaceChildren();
  container.classList.add("skill-exploration-map");

  const heading = document.createElement("h3");
  heading.className = "skill-exploration-map__title";
  heading.textContent = model.title;
  container.appendChild(heading);

  const phase = document.createElement("p");
  phase.className = "skill-exploration-map__phase";
  phase.textContent = tx("mapPhase", loc, { label: model.phaseLabel });
  container.appendChild(phase);

  const hypoSection = document.createElement("section");
  hypoSection.className = "skill-exploration-map__hypotheses";
  const hypoTitle = document.createElement("h4");
  hypoTitle.textContent = model.subtitle;
  hypoSection.appendChild(hypoTitle);

  if (model.hypotheses.length === 0) {
    const empty = document.createElement("p");
    empty.className = "skill-exploration-map__empty";
    empty.textContent = tx("mapEmptyHypothesis", loc);
    hypoSection.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    for (const h of model.hypotheses) {
      const li = document.createElement("li");
      const role = h.role === "primary" ? tx("mapRolePrimary", loc) : tx("mapRoleAlternate", loc);
      const conf = h.confidence != null ? `${Math.round(h.confidence * 100)}%` : "—";
      li.textContent = `[${role} · ${conf}] ${h.text}`;
      list.appendChild(li);
    }
    hypoSection.appendChild(list);
  }
  container.appendChild(hypoSection);

  if (model.safetyFlags.length > 0) {
    const safety = document.createElement("p");
    safety.className = "skill-exploration-map__safety";
    safety.textContent = tx("mapSafety", loc, { flags: model.safetyFlags.join("、") });
    container.appendChild(safety);
  }

  return { ok: true };
}
