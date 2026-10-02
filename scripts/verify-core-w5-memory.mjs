/**
 * Open Experience W5 — Experience memory reflux + cross-mode lifeline.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §11 / §14 W5 / §15.7 / L8
 *
 * Assert:
 * - ExperienceMemoryCandidate lifecycle (pending/accept/reject/revoke)
 * - idempotent commit keyed by sessionId+branchId+candidateId (NOT fuzzy 夜雨/谢幕)
 * - rejected / archived branch / preview / test never project to diary/confluence consumers
 * - Pop/deskpet retrieve accepted only
 * - relationship reducer applies accepted events only
 * - Do NOT claim product_review / user_accepted
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
    _map: map,
  };
}

const requiredFiles = [
  "src/experience/memory.js",
  "src/experience/relationship.js",
  "src/experience/index.js",
  "docs/qa/open-experience/W5_MEMORY.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const memorySrc = readFileSync(join(root, "src/experience/memory.js"), "utf8");
check(
  "memory.js defines ExperienceMemoryCandidate fields",
  /branchId/.test(memorySrc)
    && /confidence/.test(memorySrc)
    && /sessionId|experienceSessionId/.test(memorySrc)
    && /candidateId/.test(memorySrc)
    && /pending|proposed/.test(memorySrc)
    && /accepted/.test(memorySrc)
    && /rejected/.test(memorySrc)
    && /revoked/.test(memorySrc),
);
check(
  "memory.js projectionKey uses session+branch+candidate",
  /projectionKey/.test(memorySrc) && /sessionId.*branchId.*candidateId|join\("::"\)/.test(memorySrc),
);
check(
  "memory.js blocks preview/test/archived",
  /preview_or_test_blocked/.test(memorySrc) && /archived_branch_blocked/.test(memorySrc),
);

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check(
  "player finale wires commitFinaleReview",
  /commitFinaleReview/.test(playerSrc) && /proposeCandidatesFromSignals/.test(playerSrc),
);

const modeSrc = readFileSync(join(root, "src/prompt/mode-contributions.js"), "utf8");
check(
  "mode contributions retrieve accepted experiences",
  /assembleAcceptedExperienceContribution/.test(modeSrc),
);

const proactiveSrc = readFileSync(join(root, "src/proactive/pipeline.js"), "utf8");
check(
  "proactive pipeline can consume accepted experiences",
  /assembleAcceptedExperienceContribution/.test(proactiveSrc),
);

const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
check("EXECUTION_STATE has W5 row", /W5/.test(execState));
check(
  "EXECUTION_STATE does not self-sign user acceptance literally",
  !/\buser_accepted\b/.test(execState),
);
check(
  "EXECUTION_STATE does not claim product_review for W5 alone",
  !/W5[^\n]*product_review/.test(execState),
);

const ls = memoryStorage();
globalThis.window = { localStorage: ls };
globalThis.localStorage = ls;

const {
  __setExperienceMemoryStorageForTests,
  __clearExperienceMemoryForTests,
  __resetExperienceMemoryIdSeqForTests,
  __setRelationshipStorageForTests,
  __clearRelationshipForTests,
  __resetRelationshipIdSeqForTests,
  __setExperienceStorageForTests,
  __clearExperienceRegistryForTests,
  clearAllExperienceSessions,
  createExperienceMemoryCandidate,
  saveCandidate,
  proposeCandidatesFromSignals,
  findDuplicateCandidate,
  findConflictCandidates,
  acceptCandidate,
  rejectCandidate,
  revokeCandidate,
  commitCandidateProjection,
  commitFinaleReview,
  listCandidates,
  listProjections,
  listProjectedDiaryEntries,
  projectionKey,
  retrieveAcceptedExperiences,
  assembleAcceptedExperienceContribution,
  suggestPostSceneCompanionAction,
  getRelationshipState,
  applyAcceptedRelationPatch,
  normalizeCandidateStatus,
  CANDIDATE_STATUSES,
} = await import("../src/experience/index.js");

const {
  __setContextStorageForTests,
  clearAllContextItems,
} = await import("../src/context/store.js");

const storage = memoryStorage();
__setExperienceMemoryStorageForTests(storage);
__setRelationshipStorageForTests(storage);
__setExperienceStorageForTests(storage);
__setContextStorageForTests(storage);
__clearExperienceMemoryForTests();
__clearRelationshipForTests();
__clearExperienceRegistryForTests();
clearAllExperienceSessions();
clearAllContextItems();
__resetExperienceMemoryIdSeqForTests();
__resetRelationshipIdSeqForTests();

const characterId = "char-w5-xingli";
const sessionId = "exps-w5-session-1";
const branchId = "branch-main";
const uniqueSummary = `W5-KEYED-EVENT-${sessionId}-${branchId}-unique-rain-umbrella`;

// --- propose + identity ---
const proposed = proposeCandidatesFromSignals({
  characterId,
  experienceSessionId: sessionId,
  branchId,
  signals: [
    {
      summary: uniqueSummary,
      type: "shared_event",
      confidence: 0.8,
      sourceMessageIds: ["msg-a", "msg-b"],
      proposedRelationPatch: { intimacyDelta: 1, trustDelta: 1, kind: "shared_experience" },
    },
    {
      summary: uniqueSummary,
      type: "shared_event",
      confidence: 0.9,
    },
  ],
  source: "test.signals",
});
check("propose creates one candidate (dedupe second)", proposed.created.length === 1, `created=${proposed.created.length} reused=${proposed.reused.length}`);
check("dedupe reuses same summary", proposed.reused.length === 1);
const cand = proposed.created[0];
check(
  "candidate has source confidence branch session ids",
  cand
    && cand.source
    && cand.confidence >= 0.8
    && cand.branchId === branchId
    && cand.sessionId === sessionId
    && cand.candidateId
    && normalizeCandidateStatus(cand.status) === "pending"
    && Array.isArray(cand.sourceMessageIds)
    && cand.sourceMessageIds.includes("msg-a"),
);

const dup = findDuplicateCandidate({
  ...cand,
  id: "other",
  summary: uniqueSummary,
});
check("findDuplicateCandidate finds peer", Boolean(dup && dup.id === cand.id));

// conflict
const prefA = saveCandidate(
  createExperienceMemoryCandidate({
    characterId,
    experienceSessionId: sessionId,
    branchId,
    type: "preference",
    summary: "喜欢红茶",
    status: "pending",
  }),
);
const prefB = createExperienceMemoryCandidate({
  characterId,
  experienceSessionId: sessionId,
  branchId,
  type: "preference",
  summary: "不喜欢红茶",
  status: "pending",
});
const conflicts = findConflictCandidates(prefB);
check("conflict detects opposing preference", conflicts.some((c) => c.id === prefA.value.id));

// pending must NOT project
const pendingCommit = commitCandidateProjection(cand.id, { skipExternal: true });
check("pending cannot project", !pendingCommit.ok && pendingCommit.reason === "not_accepted");

// reject path
const rejected = saveCandidate(
  createExperienceMemoryCandidate({
    characterId,
    experienceSessionId: sessionId,
    branchId,
    summary: "REJECTED-ONLY-NEVER-PROJECT",
    status: "pending",
  }),
);
rejectCandidate(rejected.value.id);
const rejectCommit = commitCandidateProjection(rejected.value.id, { skipExternal: true });
check("rejected cannot project", !rejectCommit.ok);

// archived branch blocked
const archivedCand = saveCandidate(
  createExperienceMemoryCandidate({
    characterId,
    experienceSessionId: sessionId,
    branchId: "branch-archived",
    summary: "ARCHIVED-BRANCH-EVENT",
    status: "pending",
  }),
);
acceptCandidate(archivedCand.value.id, { force: true });
// accept may also gate — force accept by save then commit with override
saveCandidate({ ...getFresh(archivedCand.value.id), status: "accepted", acceptedAt: new Date().toISOString() });
const archivedCommit = commitCandidateProjection(archivedCand.value.id, {
  skipExternal: true,
  branchStatus: "archived",
});
check(
  "archived branch never projects",
  !archivedCommit.ok && archivedCommit.reason === "archived_branch_blocked",
);

function getFresh(id) {
  return listCandidates({ sessionId, limit: 500 }).find((c) => c.id === id);
}

// preview / test blocked
const previewCand = saveCandidate(
  createExperienceMemoryCandidate({
    characterId,
    experienceSessionId: "exps-preview",
    branchId: "branch-preview",
    summary: "PREVIEW-RUN-EVENT",
    status: "accepted",
    acceptedAt: new Date().toISOString(),
  }),
);
const previewCommit = commitCandidateProjection(previewCand.value.id, {
  skipExternal: true,
  runKind: "preview",
});
check("preview run never projects", !previewCommit.ok && previewCommit.reason === "preview_or_test_blocked");

const testCand = saveCandidate(
  createExperienceMemoryCandidate({
    characterId,
    experienceSessionId: "exps-test",
    branchId: "branch-test",
    summary: "TEST-RUN-EVENT",
    status: "accepted",
    acceptedAt: new Date().toISOString(),
  }),
);
const testCommit = commitCandidateProjection(testCand.value.id, {
  skipExternal: true,
  runKind: "test",
});
check("test run never projects", !testCommit.ok && testCommit.reason === "preview_or_test_blocked");

// accept + commit happy path
const accepted = acceptCandidate(cand.id);
check("accept pending → accepted", accepted.ok && accepted.value.status === "accepted");

const key = projectionKey(sessionId, branchId, cand.candidateId || cand.id);
const first = commitCandidateProjection(cand.id, {
  skipExternal: true,
  packageTitle: "Keyed Experience Pack",
});
check("first commit projects", first.ok && !first.alreadyCommitted, first.reason || "");
check(
  "projection keyed by sessionId+branchId+candidateId",
  first.projectionKey === key && first.projection?.sessionId === sessionId,
);

const second = commitCandidateProjection(cand.id, { skipExternal: true });
check("idempotent second commit", second.ok && second.alreadyCommitted === true);

const diaryRows = listProjectedDiaryEntries({ characterId, sessionId });
check(
  "diary ledger contains accepted keyed row",
  diaryRows.some((r) => r.projectionKey === key && r.candidateId === (cand.candidateId || cand.id)),
);
check(
  "diary ledger does NOT use fuzzy 夜雨/谢幕 alone",
  diaryRows.every((r) => r.projectionKey.includes("::") && r.sessionId && r.branchId && r.candidateId),
);
check(
  "rejected summary never in diary ledger",
  !diaryRows.some((r) => String(r.body).includes("REJECTED-ONLY-NEVER-PROJECT")),
);
check(
  "archived/preview/test summaries never in diary ledger",
  !diaryRows.some((r) => /ARCHIVED-BRANCH-EVENT|PREVIEW-RUN-EVENT|TEST-RUN-EVENT/.test(String(r.body))),
);

const finale = commitFinaleReview({
  experienceSessionId: sessionId,
  branchId,
  characterId,
  skipExternal: true,
});
check("finale review idempotent reuse", finale.ok && finale.reused >= 1);

// relationship reducer (dedicated key — commit may have already applied cand patch)
const relKey = "rel-unit::branch::cand";
const relBefore = getRelationshipState(characterId);
const relApplied = applyAcceptedRelationPatch(
  relBefore,
  { intimacyDelta: 1, trustDelta: 0, kind: "shared_experience" },
  {
    characterId,
    projectionKey: relKey,
    candidateId: "rel-unit-cand",
    sessionId,
    branchId,
    summary: "relationship-unit-event",
  },
);
check("relationship reducer applies accepted patch", relApplied.applied === true);
const relAgain = applyAcceptedRelationPatch(relApplied.state, { intimacyDelta: 1 }, {
  characterId,
  projectionKey: relKey,
  candidateId: "rel-unit-cand",
});
check("relationship reducer idempotent by projectionKey", relAgain.applied === false);

// retrieve accepted only
const retrieved = retrieveAcceptedExperiences({
  characterId,
  query: "W5-KEYED",
  mode: "pop",
  markUsed: true,
});
check(
  "retrieve returns accepted keyed experience",
  retrieved.ok
    && retrieved.items.some((it) => it.projectionKey === key && it.candidateId === cand.id),
);
check(
  "retrieve excludes rejected/preview/test",
  !retrieved.items.some((it) =>
    /REJECTED|PREVIEW|TEST-RUN|ARCHIVED/.test(String(it.summary || "")),
  ),
);

const contribution = assembleAcceptedExperienceContribution({
  characterId,
  mode: "deskpet",
  limit: 3,
});
check(
  "deskpet contribution includes accepted summary",
  contribution.text.includes(uniqueSummary.slice(0, 40)) || contribution.text.includes("共同经历"),
);

const companion = suggestPostSceneCompanionAction({ characterId });
check(
  "post-scene companion driven by accepted event",
  companion.ok && companion.projectionKey === key && companion.actionId,
);

// revoke removes from consumers
revokeCandidate(cand.id);
const afterRevoke = listProjectedDiaryEntries({ characterId, sessionId });
check(
  "revoke removes diary ledger consumer row",
  !afterRevoke.some((r) => r.projectionKey === key),
);
const retrieveAfterRevoke = retrieveAcceptedExperiences({
  characterId,
  markUsed: false,
  limit: 20,
});
check(
  "revoke excludes from retrieve",
  !retrieveAfterRevoke.items.some((it) => it.projectionKey === key),
);

// status vocabulary
check(
  "status vocabulary includes pending accepted rejected revoked",
  CANDIDATE_STATUSES.includes("pending")
    && CANDIDATE_STATUSES.includes("accepted")
    && CANDIDATE_STATUSES.includes("rejected")
    && CANDIDATE_STATUSES.includes("revoked"),
);

const projectionsLive = listProjections({ characterId, includeRevoked: false });
check("live projections empty after revoke", projectionsLive.length === 0);

const w5Doc = readFileSync(join(root, "docs/qa/open-experience/W5_MEMORY.md"), "utf8");
check("W5_MEMORY.md references verify:core-w5", /verify:core-w5/.test(w5Doc));
check("W5_MEMORY.md does not claim product_review as done", !/Status:.*product_review/.test(w5Doc));

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
console.log(`\nW5 score: ${passed}/${checks.length} (failed ${failed})`);
if (failed) {
  for (const c of checks.filter((x) => !x.pass)) {
    console.log(`  FAIL detail: ${c.name} — ${c.detail}`);
  }
  process.exitCode = 1;
}
