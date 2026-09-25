/**
 * Unified Game Registry — duo | group | native | yeos
 */

import { listDuoGames, getDuoGame } from "../duo/games/index.js";
import { listGames as listGroupGames, getGame as getGroupGame } from "../group/games/index.js";
import { listGameMeta } from "../store.js";
import { validateGamePackage } from "./package.js";

/**
 * @typedef {"duo"|"group"|"native"|"yeos"} RuntimeKind
 */

/**
 * @returns {Array<{
 *   id: string,
 *   kind: string,
 *   runtime: RuntimeKind,
 *   version: string,
 *   title: string,
 *   description?: string,
 *   section: "duo"|"group"|"other",
 * }>}
 */
export function listAllGameDefinitions() {
  const duo = listDuoGames().map((d) => ({
    id: d.id,
    kind: d.kind || "nyra.duo-game.v1",
    runtime: /** @type {RuntimeKind} */ ("duo"),
    version: d.version || "1.0.0",
    title: d.title,
    description: d.description || d.blurb || "",
    section: /** @type {const} */ ("duo"),
    tone: d.tone || "mint",
  }));

  const group = listGroupGames().map((d) => ({
    id: d.id,
    kind: d.kind || "nyra.group-game.v1",
    runtime: /** @type {RuntimeKind} */ ("group"),
    version: d.version || "1.0.0",
    title: d.title,
    description: d.description || "",
    section: /** @type {const} */ ("group"),
    tone: d.tone || "ember",
  }));

  const native = listGameMeta().map((d) => ({
    id: d.id,
    kind: "native",
    runtime: /** @type {RuntimeKind} */ ("native"),
    version: "1.0.0",
    title: d.title,
    description: d.blurb || "",
    section: /** @type {const} */ ("other"),
    tone: d.tone || "mint",
  }));

  return [...duo, ...group, ...native];
}

/**
 * @param {string} gameId
 */
export function resolveGameDefinition(gameId) {
  const id = String(gameId || "").trim();
  const duo = getDuoGame(id);
  if (duo) {
    return {
      runtime: "duo",
      definition: duo.definition,
      engine: duo,
    };
  }
  const group = getGroupGame(id);
  if (group) {
    return {
      runtime: "group",
      definition: group.definition,
      engine: group,
    };
  }
  const native = listGameMeta().find((g) => g.id === id);
  if (native) {
    return {
      runtime: "native",
      definition: {
        id: native.id,
        kind: "native",
        version: "1.0.0",
        title: native.title,
        description: native.blurb,
      },
      engine: null,
    };
  }
  return null;
}

/**
 * Optional YEOS entries (lazy — avoid hard fail if yeos missing in node tests).
 * @param {() => Array<object>} [listInstalled]
 */
export function listLegacyYeosDefinitions(listInstalled) {
  try {
    const rows = typeof listInstalled === "function" ? listInstalled() : [];
    return (rows || []).map((g) => ({
      id: String(g.id || g.gameId || ""),
      kind: "yeos",
      runtime: /** @type {RuntimeKind} */ ("yeos"),
      version: String(g.version || "1.0.0"),
      title: String(g.title || g.name || g.id || "YEOS"),
      description: String(g.description || g.blurb || ""),
      section: /** @type {const} */ ("other"),
    })).filter((g) => g.id);
  } catch {
    return [];
  }
}

export function registerExternalPackage(raw) {
  const validated = validateGamePackage(raw);
  if (!validated.ok) return validated;
  // Launch v1: packages ship in-repo; external register is validate-only.
  return { ok: true, package: validated.package, registered: false, reason: "builtin_only_v1" };
}
