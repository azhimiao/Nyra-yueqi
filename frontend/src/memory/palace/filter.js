import { resolveDiaryStyleId } from "../../diary/fields.js";
import { tokenize } from "../../lib/utils.js";
import { getAllRecords, normalizeMemory } from "../../storage/db.js";
import { getRagSettings } from "../../settings/preferences.js";
import { filterRowsByCompanionScope } from "../companion-scope.js";
import { inferWingRoom } from "./recall.js";

function selectScope(query) {
  const tokens = tokenize(query).join("");
  if (/雨|睡|夜|安|陪|难过|想|亲|回/.test(tokens)) {
    return { wing: "Relationship" };
  }
  if (/书|店|场景|世界|设定/.test(tokens)) {
    return { wing: "World" };
  }
  return {};
}

export async function filterDrawers(query, options = {}) {
  const settings = getRagSettings();
  const scopeFilter = options.scope || "all";
  const inferred = inferWingRoom(query);
  const wing = options.wing ?? inferred.wing;
  const room = options.room ?? inferred.room;

  let records = (await getAllRecords("memories"))
    .map(normalizeMemory)
    .filter((record) => record.searchable && !record.invalidatedAt);

  if (scopeFilter === "diary") {
    records = records.filter((record) => record.source === "diary.memory");
  } else if (scopeFilter === "chat") {
    records = records.filter((record) => record.source === "chat.memory");
  } else if (wing) {
    records = records.filter((record) => record.wing === wing);
  } else if (!inferred.characterPast) {
    const autoScope = selectScope(query);
    if (autoScope.wing) {
      records = records.filter((record) => record.wing === autoScope.wing);
    }
  }

  if (room) {
    const roomHits = records.filter((record) => record.room === room);
    if (roomHits.length) records = roomHits;
  }

  const styleFilter = options.diaryStyle ?? settings.diaryStyle;
  if (styleFilter) {
    records = records.filter((record) => {
      if (record.source !== "diary.memory") {
        return scopeFilter !== "diary";
      }
      return resolveDiaryStyleId(record) === styleFilter;
    });
  }

  const companionId = String(options.companionId || options.characterId || "").trim();
  if (companionId) {
    records = filterRowsByCompanionScope(records, {
      companionId,
      userId: options.userId || "local",
      allowGlobal: false,
    });
  }

  return records;
}
