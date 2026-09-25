/**
 * Capability registry — schema check, risk, deterministic local adapters only.
 */

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   description: string,
 *   validateInput: (input: Record<string, unknown>) => { ok: boolean, reason?: string, value?: Record<string, unknown> },
 *   plan: (intent: object) => { nodes: object[], edges?: object[] },
 *   previewEffect: (input: Record<string, unknown>, ctx?: object) => { exactEffect: string, dataUsed: string[], affects: string[] },
 *   execute: (input: Record<string, unknown>, ctx: object) => Promise<object>|object,
 *   compensates?: (artifact: object, ctx: object) => object,
 * }} capability
 */
export function registerCapability(capability) {
  if (!capability?.id) throw new Error("capability_missing_id");
  registry.set(capability.id, capability);
  return capability;
}

/**
 * @param {string} id
 */
export function getCapability(id) {
  return registry.get(String(id || "")) || null;
}

export function listCapabilities() {
  return [...registry.values()].map((c) => ({
    id: c.id,
    label: c.label,
    risk: c.risk,
    description: c.description,
  }));
}

export function clearCapabilityRegistry() {
  registry.clear();
}

const P4_IDS = [
  "calendar-crud",
  "structured-notes",
  "local-research",
  "local-files",
  "message-drafts",
  "daily-briefing",
  "economy-read",
  "economy-write",
];

/**
 * Ensure built-in adapters are registered (idempotent).
 */
export async function ensureBuiltinCapabilities() {
  const ready =
    registry.has("note-from-chat")
    && registry.has("calendar-draft")
    && registry.has("page-summary")
    && P4_IDS.every((id) => registry.has(id));
  if (ready) return listCapabilities();

  const { noteFromChatCapability } = await import("./note-from-chat.js");
  const { calendarDraftCapability } = await import("./calendar-draft.js");
  const { pageSummaryCapability } = await import("./page-summary.js");
  const { calendarCrudCapability } = await import("./calendar-crud.js");
  const { structuredNotesCapability } = await import("./structured-notes.js");
  const { localResearchCapability } = await import("./local-research.js");
  const { localFilesCapability } = await import("./local-files.js");
  const { messageDraftsCapability } = await import("./message-drafts.js");
  const { dailyBriefingCapability } = await import("./daily-briefing.js");
  const { economyReadCapability, economyWriteCapability } = await import("./economy.js");

  if (!registry.has("note-from-chat")) registerCapability(noteFromChatCapability);
  if (!registry.has("calendar-draft")) registerCapability(calendarDraftCapability);
  if (!registry.has("page-summary")) registerCapability(pageSummaryCapability);
  if (!registry.has("calendar-crud")) registerCapability(calendarCrudCapability);
  if (!registry.has("structured-notes")) registerCapability(structuredNotesCapability);
  if (!registry.has("local-research")) registerCapability(localResearchCapability);
  if (!registry.has("local-files")) registerCapability(localFilesCapability);
  if (!registry.has("message-drafts")) registerCapability(messageDraftsCapability);
  if (!registry.has("daily-briefing")) registerCapability(dailyBriefingCapability);
  if (!registry.has("economy-read")) registerCapability(economyReadCapability);
  if (!registry.has("economy-write")) registerCapability(economyWriteCapability);
  return listCapabilities();
}
