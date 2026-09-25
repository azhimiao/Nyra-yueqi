/**
 * Enriched 栖机 app registry (catalog + capability surface).
 */

import { PHONE_APPS, PHONE_APP_MAP } from "./apps-catalog.js";

/** @typedef {'live' | 'minimal' | 'closed'} AppStatus */

/** @type {Record<string, { hasUi: boolean, hasStore: boolean, hasEvents: boolean, status: AppStatus }>} */
const CAPABILITIES = {
  pop: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  moments: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  listen: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  pet: { hasUi: true, hasStore: false, hasEvents: false, status: "minimal" },
  scenario: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  scroll: { hasUi: true, hasStore: true, hasEvents: false, status: "closed" },
  diary: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  cocreate: { hasUi: true, hasStore: true, hasEvents: false, status: "closed" },
  gallery: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  calendar: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  read: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  adventure: { hasUi: true, hasStore: true, hasEvents: false, status: "closed" },
  memory: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  explore: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  assist: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  profile: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  beautify: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  settings: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  qishi: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  games: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  theater: { hasUi: true, hasStore: true, hasEvents: true, status: "live" },
  shop: { hasUi: true, hasStore: true, hasEvents: false, status: "live" },
  lab: { hasUi: true, hasStore: true, hasEvents: false, status: "minimal" },
  assets: { hasUi: true, hasStore: true, hasEvents: false, status: "minimal" },
};

/** P0: experience RP apps frozen — archive migration later; not interactive. */
export const ARCHIVED_EXPERIENCE_APPS = Object.freeze([
  "scroll",
  "adventure",
  "cocreate",
]);

export function isArchivedExperienceApp(id) {
  return ARCHIVED_EXPERIENCE_APPS.includes(String(id || "").trim());
}

/** Removed / stub apps — kept for slot cleanup, not interactive. */
const CLOSED_APPS = Object.freeze([
  "sidewrite",
  "story",
  "studio",
  "experience-studio",
  "workshop",
  ...ARCHIVED_EXPERIENCE_APPS,
]);

const DEFAULT_CAP = Object.freeze({
  hasUi: false,
  hasStore: false,
  hasEvents: false,
  status: "closed",
});

/**
 * @param {object} app
 * @returns {object}
 */
export function enrichAppEntry(app) {
  const id = String(app?.id || "").trim();
  const cap = CAPABILITIES[id] || DEFAULT_CAP;
  const status = CLOSED_APPS.includes(id) ? "closed" : cap.status;
  return {
    ...app,
    hasUi: cap.hasUi,
    hasStore: cap.hasStore,
    hasEvents: cap.hasEvents,
    status,
  };
}

export const PHONE_APP_REGISTRY = PHONE_APPS.map(enrichAppEntry);

export const PHONE_APP_REGISTRY_MAP = Object.fromEntries(
  PHONE_APP_REGISTRY.map((app) => [app.id, app]),
);

export function getAppRegistryEntry(id) {
  return PHONE_APP_REGISTRY_MAP[id] || enrichAppEntry({ id, label: id });
}

export function listLiveApps() {
  return PHONE_APP_REGISTRY.filter((app) => app.status === "live");
}

export function listEventCapableApps() {
  return PHONE_APP_REGISTRY.filter((app) => app.hasEvents && app.status !== "closed");
}

export { PHONE_APPS, PHONE_APP_MAP };
