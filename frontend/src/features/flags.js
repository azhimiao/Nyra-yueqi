import { DEFAULT_FEATURES, LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import {
  ensureCutoverProfileResolved,
  getCutoverProfile,
  mergeFeatureFlagsWithProfile,
} from "./cutover-profile.js";

const FEATURE_ATTR = {
  promptAssembly: "data-feature-prompt",
  worldbook: "data-feature-worldbook",
  memoryRag: "data-feature-rag",
  summary: "data-summary-master",
  proactive: "data-feature-proactive",
  external: "data-feature-external",
  voice: "data-feature-voice",
  temporalContextV1: "data-feature-temporal-context",
  turnUnderstandingV1: "data-feature-turn-understanding",
  relationshipContinuityV1: "data-feature-relationship-continuity",
  palaceProjectionV1: "data-feature-palace-projection",
  webRetrievalV1: "data-feature-web-retrieval",
  // Unified memory M0+ — distinct from palaceProjectionV1 (see DEFAULT_FEATURES note)
  unifiedMemoryAdaptersV1: "data-feature-unified-memory-adapters",
  memoryProjectionOutboxV1: "data-feature-memory-projection-outbox",
  diaryRepositoryV1: "data-feature-diary-repository",
  palaceProjectionOnlyV1: "data-feature-palace-projection-only",
  contextGraphProjectionOnlyV1: "data-feature-context-graph-projection-only",
  singleBrokerRetrievalV1: "data-feature-single-broker-retrieval",
  unifiedMemoryForgetV1: "data-feature-unified-memory-forget",
};

const SETTINGS_FEATURES_ROOT = "[data-settings-features]";

function featureInputs(attr) {
  return [...document.querySelectorAll(`${SETTINGS_FEATURES_ROOT} [${attr}]`)];
}

/**
 * Effective flags = DEFAULT_FEATURES + storage + cutover profile resolver.
 * Modules must use this (or isFeatureEnabled) — do not invent localStorage defaults.
 */
export function getFeatureFlags() {
  ensureCutoverProfileResolved();
  const stored = readLocalObject(LOCAL_KEYS.featuresKey, {}) || {};
  return mergeFeatureFlagsWithProfile(DEFAULT_FEATURES, stored, getCutoverProfile());
}

export function saveFeatureFlags(flags) {
  writeLocalObject(LOCAL_KEYS.featuresKey, flags);
}

export function applyFeatureFlagsToUi(flags = getFeatureFlags()) {
  Object.entries(FEATURE_ATTR).forEach(([key, attr]) => {
    const checked = flags[key] !== false;
    featureInputs(attr).forEach((node) => {
      node.checked = checked;
    });
  });
}

export function syncFeatureFlagsFromUi(changedNode = null) {
  const flags = getFeatureFlags();
  Object.entries(FEATURE_ATTR).forEach(([key, attr]) => {
    const nodes = featureInputs(attr);
    if (!nodes.length) return;
    if (changedNode && nodes.includes(changedNode)) {
      flags[key] = changedNode.checked;
      return;
    }
    flags[key] = nodes[0].checked;
  });
  saveFeatureFlags(flags);
  applyFeatureFlagsToUi(flags);
  return flags;
}

export function wireFeatureFlagControls(onChange) {
  Object.values(FEATURE_ATTR).forEach((attr) => {
    featureInputs(attr).forEach((node) => {
      node.addEventListener("change", () => {
        const flags = syncFeatureFlagsFromUi(node);
        onChange?.(flags);
      });
    });
  });
}

export function isFeatureEnabled(key) {
  // Opt-in only: unknown / misspelled keys must stay OFF (never `undefined !== false`).
  return getFeatureFlags()[key] === true;
}
