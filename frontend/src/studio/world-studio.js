/**
 * World Studio: worldbook, places, events, props, backgrounds, scripts, shared-experience templates.
 * Real capabilities only via declared Skill Package dependency (see privilege-gate).
 */

import { validateWorldManifest } from "./schema.js";
import { assertWorldHasNoSystemPrivileges } from "./privilege-gate.js";

/**
 * @param {unknown} raw
 */
export function normalizeWorldPackage(raw) {
  const validated = validateWorldManifest(raw);
  if (!validated.ok) return validated;

  const privilege = assertWorldHasNoSystemPrivileges(validated.value);
  if (!privilege.ok) return privilege;

  const world = validated.value;
  const errors = [];

  const worldbookEntries = Array.isArray(world.worldbook?.entries)
    ? world.worldbook.entries.map(normalizeWorldbookEntry).filter(Boolean)
    : [];

  const places = (world.places || []).map(normalizePlace).filter(Boolean);
  const events = (world.events || []).map(normalizeEvent).filter(Boolean);
  const props = (world.props || []).map(normalizeProp).filter(Boolean);
  const backgrounds = (world.backgrounds || []).map(normalizeBackground).filter(Boolean);
  const scripts = (world.scripts || []).map(normalizeScript).filter(Boolean);
  const sharedExperienceTemplates = (world.sharedExperienceTemplates || [])
    .map(normalizeSharedExperience)
    .filter(Boolean);

  // Scripts are narrative templates only — never executable code blobs
  for (const s of scripts) {
    if (s.executable) errors.push(`script_executable_forbidden:${s.id}`);
    if (s.containsCode) errors.push(`script_code_forbidden:${s.id}`);
  }

  if (errors.length) {
    return { ok: false, reason: "invalid_world_content", errors };
  }

  return {
    ok: true,
    value: {
      ...world,
      worldbook: { entries: worldbookEntries },
      places,
      events,
      props,
      backgrounds,
      scripts,
      sharedExperienceTemplates,
    },
  };
}

function normalizeWorldbookEntry(e) {
  if (!e || typeof e !== "object") return null;
  const id = String(e.id || "").trim();
  const title = String(e.title || "").trim();
  const body = String(e.body || e.content || "").trim();
  if (!id || !title || !body) return null;
  return {
    id,
    title,
    body,
    triggers: Array.isArray(e.triggers)
      ? e.triggers.map((t) => String(t).trim()).filter(Boolean)
      : [],
    enabled: e.enabled !== false,
  };
}

function normalizePlace(p) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "").trim();
  const name = String(p.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: String(p.description || "").trim(),
    backgroundId: p.backgroundId ? String(p.backgroundId).trim() : undefined,
  };
}

function normalizeEvent(ev) {
  if (!ev || typeof ev !== "object") return null;
  const id = String(ev.id || "").trim();
  const title = String(ev.title || "").trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    description: String(ev.description || "").trim(),
    placeId: ev.placeId ? String(ev.placeId).trim() : undefined,
    relationEventHint: ev.relationEventHint
      ? String(ev.relationEventHint).trim()
      : undefined,
  };
}

function normalizeProp(p) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "").trim();
  const name = String(p.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    description: String(p.description || "").trim(),
    assetRef: p.assetRef ? String(p.assetRef).trim() : undefined,
  };
}

function normalizeBackground(b) {
  if (!b || typeof b !== "object") return null;
  const id = String(b.id || "").trim();
  if (!id) return null;
  return {
    id,
    label: String(b.label || id).trim(),
    assetRef: String(b.assetRef || "").trim(),
    mood: String(b.mood || "neutral").trim(),
  };
}

function normalizeScript(s) {
  if (!s || typeof s !== "object") return null;
  const id = String(s.id || "").trim();
  const title = String(s.title || "").trim();
  if (!id || !title) return null;
  const beats = Array.isArray(s.beats)
    ? s.beats.map((b) => String(b).trim()).filter(Boolean)
    : [];
  const body = String(s.body || "").trim();
  const containsCode = /(?:\beval\b|\bFunction\b|\bimport\s*\(|<script|require\s*\()/i.test(
    body + beats.join("\n"),
  );
  return {
    id,
    title,
    beats,
    body,
    executable: s.executable === true,
    containsCode,
  };
}

function normalizeSharedExperience(t) {
  if (!t || typeof t !== "object") return null;
  const id = String(t.id || "").trim();
  const title = String(t.title || "").trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    summary: String(t.summary || "").trim(),
    placeId: t.placeId ? String(t.placeId).trim() : undefined,
    eventId: t.eventId ? String(t.eventId).trim() : undefined,
  };
}

/**
 * Resolve a skill dependency for a world capability — never grants host privileges.
 * @param {object} worldManifest
 * @param {string} skillId
 * @param {(id: string) => object|null} getInstalledSkill
 */
export function resolveWorldSkillDependency(worldManifest, skillId, getInstalledSkill) {
  const id = String(skillId || "").trim();
  const deps = Array.isArray(worldManifest?.skillDependencies)
    ? worldManifest.skillDependencies
    : [];
  if (!deps.includes(id)) {
    return { ok: false, reason: "skill_not_declared" };
  }
  const installed = typeof getInstalledSkill === "function" ? getInstalledSkill(id) : null;
  if (!installed) {
    return { ok: false, reason: "skill_not_installed" };
  }
  return { ok: true, skillId: id, skill: installed };
}
