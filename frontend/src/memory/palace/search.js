import { getStorageMode, getAllRecords, normalizeMemory } from "../../storage/db.js";
import { getPalaceSettings } from "../../settings/preferences.js";
import { getRagSettings } from "../../settings/preferences.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { preferSourcedPalaceHits } from "../projection/index.js";
import {
  filterPalaceHitsBySourceRef,
  isPalaceProjectionOnlyEnabled,
} from "./source-validator.js";
import { filterDrawers } from "./filter.js";
import { searchDrawersSqlite } from "./native-search.js";
import { buildCandidatePool, poolSizeFor, rankCandidatePool } from "./pool-rank.js";
import { formatKgBlock, isRelationalQuery, matchKgToQuery, queryKg, inferKgSubjects } from "./kg.js";
import { inferWingRoom, shouldRecall } from "./recall.js";
import { listWings, listRooms, getTaxonomy } from "./taxonomy.js";

// Palace retrieval is allowed to return several real memories for a broad
// question, but it must not turn a missing topic into a random semantic hit.
// The local embedding is intentionally lightweight (character n-grams), so a
// small evidence gate is needed before rows reach the model.
const QUERY_FILLER_RE = /我们|我和你|你和我|共同|一起|你|我|他|她|它|的|了|是|吗|呢|么|什么|哪些|多少|事情|记得|记忆|回忆|以前|之前|过去|曾经|有|对|关于|里面|里|时候|做过|说过|聊过|想知道|告诉我/gu;
const EN_FILLERS = new Set(["the", "a", "an", "you", "i", "we", "me", "my", "your", "what", "which", "anything", "remember", "memory", "before", "past"]);

function meaningfulQueryTerms(query) {
  const text = String(query || "").trim();
  if (!text) return [];
  const stripped = text.replace(QUERY_FILLER_RE, " ");
  const hanRuns = stripped.match(/[\p{Script=Han}]{2,}/gu) || [];
  const han = [...new Set(hanRuns.flatMap((run) => {
    const terms = [run];
    for (let index = 0; index < run.length - 1; index += 1) terms.push(run.slice(index, index + 2));
    return terms;
  }))];
  const words = (stripped.toLowerCase().match(/[a-z0-9_]+/g) || [])
    .filter((word) => !EN_FILLERS.has(word));
  return [...new Set([...han, ...words])];
}

export function filterPalaceResultsByEvidence(results = [], query = "", options = {}) {
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length || options.scope === "diary") return rows;
  // A direct question about the companion's own past is already a concrete
  // scope. Do not require the wording of the question to appear verbatim in
  // every authored history entry ("你的人生经历" will not match a chapter
  // titled "第一次知道我").
  if (options.characterPast === true) return rows;
  const terms = meaningfulQueryTerms(query);
  // Questions without a concrete topic ("你记得什么") intentionally return
  // real memories; there is no safe way to narrow those further.
  if (!terms.length) return rows;

  const direct = rows.filter((row) => {
    const haystack = `${row.title || ""}\n${row.rawText || ""}\n${(row.tags || []).join(" ")}`.toLowerCase();
    const coverage = terms.filter((term) => haystack.includes(String(term).toLowerCase())).length / terms.length;
    // Evidence is a ranking aid, not a brittle allow/deny gate. A matching
    // title/tag or roughly half the query terms is enough; vector ranking
    // still decides which records are actually kept.
    const threshold = terms.length <= 2 ? 0.5 : 0.4;
    return coverage >= threshold || Boolean(row.titleBoost);
  });
  if (!direct.length) {
    // A concrete topic without any textual evidence is a miss, not an
    // invitation to fill the prompt with a nearby hash collision. The wide
    // fallback is opt-in for callers that have a stronger semantic index.
    // Character history has its own explicit path above and does not need it.
    if (options.allowSoftFallback !== true) return [];
    return rows.filter((row) => (
      Number(row.similarity || 0) >= 0.65
      || Number(row.finalScore || 0) >= 0.36
      || Number(row.keywordScore || 0) >= 0.75
    )).slice(0, Math.max(1, Number(options.softMinResults) || 1));
  }

  const directIds = new Set(direct.map((row) => row.id));
  return rows.filter((row) => directIds.has(row.id) || directIds.has(row.neighborOf));
}

export async function searchDrawersMemory(query, options = {}) {
  const settings = getRagSettings();
  const topK = options.topK ?? options.limit ?? settings.topK ?? 5;
  const poolSize = poolSizeFor(topK);

  const records = await filterDrawers(query, options);
  if (!records.length) return [];

  const pool = buildCandidatePool(records, query, poolSize);
  const ranked = rankCandidatePool(pool, query, records, { topK });
  return ranked.map((row) => ({ ...row, palaceBackend: "memory-union" }));
}

export async function searchDrawers(query, options = {}) {
  if (getStorageMode() === "sqlite") {
    return searchDrawersSqlite(query, options);
  }
  return searchDrawersMemory(query, options);
}

export async function searchPalace(query, options = {}) {
  const settings = getPalaceSettings();
  const inferred = inferWingRoom(query);
  const characterHistoryRecall = inferred.characterPast === true || options.forceCharacterHistory === true;
  const force = options.force === true || characterHistoryRecall;
  const recall = force || shouldRecall(query, { mode: settings.recallMode });

  if (!recall) {
    return { recalled: false, skipped: true, results: [], kgFacts: [], query };
  }

  const searchOpts = {
    ...options,
    // defaultWing is a browsing preference, not a retrieval boundary.
    wing: options.wing ?? inferred.wing,
    room: options.room ?? (characterHistoryRecall ? "History" : inferred.room),
    characterPast: characterHistoryRecall,
    topK: characterHistoryRecall
      ? Math.max(Number(options.topK ?? 0) || 0, 10)
      : options.topK,
  };

  const companionId = String(searchOpts.companionId || searchOpts.characterId || "").trim();
  const [rawResults, kgAll] = await Promise.all([
    searchDrawers(query, searchOpts),
    !companionId && isRelationalQuery(query) ? queryKg({}) : Promise.resolve([]),
  ]);
  const results = filterPalaceResultsByEvidence(rawResults, query, searchOpts);

  const subjects = inferKgSubjects(query);
  const kgFiltered = subjects.length
    ? kgAll.filter((fact) => subjects.includes(fact.subject))
    : kgAll;
  const kgFacts = isRelationalQuery(query) ? matchKgToQuery(query, kgFiltered).slice(0, 5) : [];
  const backend = getStorageMode() === "sqlite" ? "sqlite-fts-union" : "memory-union";

  // W5: when palaceProjectionV1 is on, prefer source-traceable hits (soft).
  // M7: when palaceProjectionOnlyV1 is on, strictly filter orphans without sourceRef.
  const projectionOn = isFeatureEnabled("palaceProjectionV1");
  const projectionOnlyOn = isPalaceProjectionOnlyEnabled();
  let hydrated = projectionOn ? preferSourcedPalaceHits(results) : results;
  if (projectionOnlyOn) {
    hydrated = filterPalaceHitsBySourceRef(hydrated, {
      flagOn: true,
      companionId,
      realityNamespace: searchOpts.realityNamespace,
    });
  }

  return {
    recalled: true,
    skipped: false,
    results: hydrated,
    kgFacts,
    kgBlock: companionId ? "" : formatKgBlock(kgFacts),
    query,
    backend,
    preferSourced: projectionOn,
    projectionOnly: projectionOnlyOn,
    characterHistoryRecall,
  };
}

export async function getPalaceStatus() {
  const settings = getPalaceSettings();
  const wings = await listWings();
  const drawers = wings.reduce((sum, wing) => sum + wing.drawers, 0);
  const storage = getStorageMode();
  const kgFacts = await queryKg({});
  const chunkDrawers = (await getAllRecords("memories"))
    .map(normalizeMemory)
    .filter((record) => (record.chunkTotal ?? 0) > 1).length;
  return {
    mode: storage === "sqlite" ? "app" : "web-preview",
    engine: storage === "sqlite"
      ? "sqlite-fts+union+closet+neighbor"
      : "memory-union+closet+neighbor",
    storage,
    drawers,
    chunkDrawers,
    wings: wings.length,
    kgFacts: kgFacts.length,
    settings,
  };
}

export { listWings, listRooms, getTaxonomy, listDrawers } from "./taxonomy.js";
