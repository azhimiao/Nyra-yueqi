/**
 * Map a Nyra character / .nychar components → generic open card JSON (v2/v3).
 * Explicit lossy warning list — never claim a lossless round trip.
 */

import { buildNycharComponents } from "./export.js";

function asString(value) {
  return value == null ? "" : String(value).trim();
}

/**
 * @param {object} character local character record
 * @param {{
 *   version?: "v2"|"v3",
 *   worldbook?: object,
 *   relationship?: object,
 *   appearance?: object,
 *   actions?: object,
 *   voice?: object,
 *   skills?: object,
 *   greetings?: string[],
 *   creator?: object,
 *   components?: object,
 * }} [options]
 * @returns {{
 *   card: object,
 *   json: string,
 *   version: "v2"|"v3",
 *   warnings: string[],
 *   lossy: { dropped: string[], transformed: string[], unsupported: string[] },
 * }}
 */
export function exportCharacterAsGenericCard(character, options = {}) {
  const version = options.version === "v3" ? "v3" : "v2";
  const components = options.components || buildNycharComponents(character, options);
  const c = components.character || {};
  const persona = c.persona || {};

  const dropped = [];
  const transformed = [];
  const unsupported = [];

  if (components.worldbook?.entries?.length) {
    dropped.push("worldbook.entries");
  }
  if (components.relationship) {
    dropped.push("relationship (initial-portable-config)");
  }
  if (components.appearance && (components.appearance.description || components.appearance.avatarPath || components.appearance.pet)) {
    dropped.push("appearance package structure / assets");
  }
  if (components.actions?.actions?.length) {
    dropped.push("actions");
  }
  if (components.voice && (components.voice.displayName || components.voice.styleDescription || components.voice.samplePaths?.length)) {
    dropped.push("voice");
  }
  if (components.skills?.skills?.length) {
    dropped.push("skills");
  }
  if (c.prompts?.system || c.prompts?.developer) {
    unsupported.push("character.prompts (Nyra-only; not mapped to open-card fields)");
  }
  if (Array.isArray(c.greetings) && c.greetings.length > 1) {
    transformed.push("greetings[1…] dropped; only first greeting → first_mes");
  }
  if (c.creator && typeof c.creator === "object") {
    transformed.push("creator object → flat creator string when present");
  }
  dropped.push("packaged assets (avatar.png / pet / voice samples)");

  const data = {
    name: asString(c.name) || "\u672a\u547d\u540d",
    description: asString(persona.description) || "\u5f85\u8865\u5145\u4eba\u8bbe",
    personality: asString(persona.personality) || "",
    scenario: asString(persona.scenario) || "",
    first_mes: Array.isArray(c.greetings) && c.greetings[0] ? asString(c.greetings[0]) : "",
    tags: Array.isArray(c.tags) ? c.tags.map((t) => asString(t)).filter(Boolean) : [],
  };

  if (asString(c.alias) && c.alias !== c.name) {
    data.nickname = asString(c.alias);
  }
  if (asString(c.identity)) {
    data.role = asString(c.identity);
  }
  if (c.creator?.name) {
    data.creator = asString(c.creator.name);
  }

  /** @type {object} */
  let card;
  if (version === "v3") {
    card = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data,
    };
  } else {
    card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data,
    };
  }

  const warnings = [
    ...dropped.map((d) => `dropped:${d}`),
    ...transformed.map((t) => `transformed:${t}`),
    ...unsupported.map((u) => `unsupported:${u}`),
  ];

  return {
    card,
    json: JSON.stringify(card, null, 2),
    version,
    warnings,
    lossy: { dropped, transformed, unsupported },
  };
}
