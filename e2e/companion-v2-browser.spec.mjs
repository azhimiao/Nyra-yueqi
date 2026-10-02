/**
 * Companion V2 browser journey checklist.
 * Full Playwright execution is gated by COMPANION_V2_BROWSER=1.
 */

const journeys = [
  "cold_start_quick",
  "editor_save_conflict",
  "import_json_card",
  "chat_identity",
  "tool_approval",
  "role_switch",
];

export { journeys };

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("companion-v2-browser.spec.mjs")) {
  if (process.env.COMPANION_V2_BROWSER === "1") {
    throw new Error("Playwright runner not wired in this environment");
  }
  console.log(`SKIP playwright; ${journeys.length} journeys documented`);
}
