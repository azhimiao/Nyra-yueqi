/**
 * Builtin capability barrel — P1 adapters + P4 first-party skills.
 */

import { registerCapability, ensureBuiltinCapabilities, listCapabilities, getCapability } from "./registry.js";
import { noteFromChatCapability } from "./note-from-chat.js";
import { calendarDraftCapability } from "./calendar-draft.js";
import { pageSummaryCapability } from "./page-summary.js";
import { calendarCrudCapability } from "./calendar-crud.js";
import { structuredNotesCapability } from "./structured-notes.js";
import { localResearchCapability } from "./local-research.js";
import { localFilesCapability } from "./local-files.js";
import { messageDraftsCapability } from "./message-drafts.js";
import { dailyBriefingCapability } from "./daily-briefing.js";
import { economyReadCapability, economyWriteCapability } from "./economy.js";

export function registerBuiltinCapabilities() {
  registerCapability(noteFromChatCapability);
  registerCapability(calendarDraftCapability);
  registerCapability(pageSummaryCapability);
  registerCapability(calendarCrudCapability);
  registerCapability(structuredNotesCapability);
  registerCapability(localResearchCapability);
  registerCapability(localFilesCapability);
  registerCapability(messageDraftsCapability);
  registerCapability(dailyBriefingCapability);
  registerCapability(economyReadCapability);
  registerCapability(economyWriteCapability);
  return listCapabilities();
}

export {
  ensureBuiltinCapabilities,
  listCapabilities,
  getCapability,
  noteFromChatCapability,
  calendarDraftCapability,
  pageSummaryCapability,
  calendarCrudCapability,
  structuredNotesCapability,
  localResearchCapability,
  localFilesCapability,
  messageDraftsCapability,
  dailyBriefingCapability,
  economyReadCapability,
  economyWriteCapability,
};
