/**
 * Package validation for nyra.duo-game.v1 / nyra.group-game.v1
 * Launch v1: JSON declarative only — no arbitrary script fields.
 */

const DUO_KIND = "nyra.duo-game.v1";
const GROUP_KIND = "nyra.group-game.v1";
const FORBIDDEN_KEYS = new Set([
  "script",
  "scripts",
  "eval",
  "module",
  "entrypointJs",
  "nativeCode",
  "remoteScript",
]);

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function hasForbidden(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 8) return false;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbidden(obj[key], depth + 1)) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, package: object } | { ok: false, error: string }}
 */
export function validateGamePackage(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "package_not_object" };
  if (hasForbidden(raw)) return { ok: false, error: "forbidden_executable_fields" };

  const kind = clean(raw.kind, 64);
  const id = clean(raw.id, 80);
  const version = clean(raw.version, 32) || "1.0.0";
  const title = clean(raw.title, 80);
  const runtime = clean(raw.runtime, 32);

  if (!id || !title) return { ok: false, error: "id_and_title_required" };

  if (kind === DUO_KIND) {
    if (runtime && runtime !== "duo") return { ok: false, error: "duo_runtime_mismatch" };
    const players = raw.players && typeof raw.players === "object" ? raw.players : {};
    if (Number(players.human) !== 1 || Number(players.character) !== 1) {
      return { ok: false, error: "duo_players_must_be_1_1" };
    }
    return {
      ok: true,
      package: {
        kind: DUO_KIND,
        id,
        version,
        title,
        description: clean(raw.description, 240),
        runtime: "duo",
        players: { human: 1, character: 1 },
        icon: clean(raw.icon, 200),
        cover: clean(raw.cover, 200),
      },
    };
  }

  if (kind === GROUP_KIND) {
    if (runtime && runtime !== "group") return { ok: false, error: "group_runtime_mismatch" };
    const players = raw.players && typeof raw.players === "object" ? raw.players : {};
    const min = Math.max(2, Math.floor(Number(players.min) || 0));
    const max = Math.max(min, Math.floor(Number(players.max) || min));
    return {
      ok: true,
      package: {
        kind: GROUP_KIND,
        id,
        version,
        title,
        description: clean(raw.description, 240),
        runtime: "group",
        players: { min, max },
        features: raw.features && typeof raw.features === "object" ? { ...raw.features } : {},
        icon: clean(raw.icon, 200),
        cover: clean(raw.cover, 200),
      },
    };
  }

  if (kind === "native" || kind === "yeos") {
    return {
      ok: true,
      package: {
        kind,
        id,
        version,
        title,
        description: clean(raw.description, 240),
        runtime: kind,
      },
    };
  }

  return { ok: false, error: `unsupported_kind:${kind || "empty"}` };
}

export { DUO_KIND, GROUP_KIND };
