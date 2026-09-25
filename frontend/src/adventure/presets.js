/** Adventure packages: no bundled default stories. User worlds live in user-worlds.js. */

import { getUserWorld, listUserWorlds } from "./user-worlds.js";

/** @deprecated Kept empty — do not ship canned adventures. */
export const ADVENTURE_PACKAGES = [];

export const BUNDLED_WORLDS = ADVENTURE_PACKAGES;

export function getPackage(packageId) {
  const id = String(packageId || "");
  if (!id) return null;
  return getUserWorld(id) || ADVENTURE_PACKAGES.find((item) => item.id === id) || null;
}

export function listPackages() {
  return listUserWorlds().map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.subtitle || item.summary || "",
    summary: item.summary || "",
    tags: item.tags || [],
    tone: item.tone,
    tutorial: false,
    userDefined: true,
    openingCount: item.openings?.length || 0,
    locationCount: item.locations?.length || 0,
  }));
}

export function listWorlds() {
  return listPackages().map((item) => ({ ...item, hook: item.subtitle, nodeCount: item.locationCount }));
}

/** No default canned world. */
export function defaultPackage() {
  return listUserWorlds()[0] || null;
}

export const defaultWorld = defaultPackage;
export const getWorld = getPackage;

/** @deprecated Removed canned packages */
export const RAIN_HARBOR_PACKAGE = null;
export const GLASS_OBSERVATORY_PACKAGE = null;
export const TUTORIAL_PACKAGE = null;
export const RAIN_HARBOR_WORLD = null;
