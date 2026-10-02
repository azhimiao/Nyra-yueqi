/**
 * Open Experience W7 — quality, safety, a11y, regression.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §14 W7 / §15 / §7–11
 *
 * - Re-runs or imports prior wave gates (W1–W6); no silent score invent
 * - Production path: no nextByChoice in experience package path; offlineDirectorTurn never default
 * - Character / branch / memory privacy / export scrub smoke
 * - Package input safety (no arbitrary JS; URL allowlist)
 * - prefers-reduced-motion + touch-target CSS presence
 * - ARIA basics on studio / opening picker / branch panel
 * - Honest evidence_pending gaps documented (do NOT claim product_review)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const regressionPath = join(root, "docs/qa/open-experience/W7_REGRESSION.json");

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

const PRIOR_WAVES = [
  { id: "w1", npm: "verify:core-w1", expectedPass: 80, expectedTotal: 80, re: /W1 Conversation V2 score:\s*(\d+)\/(\d+)/ },
  { id: "w2", npm: "verify:core-w2", expectedPass: 41, expectedTotal: 41, re: /W2 verify score:\s*(\d+)\/(\d+)/ },
  { id: "w3", npm: "verify:core-w3", expectedPass: 47, expectedTotal: 47, re: /W3 verify score:\s*(\d+)\/(\d+)/ },
  { id: "w4", npm: "verify:core-w4", expectedPass: 53, expectedTotal: 53, re: /W4 verify:\s*(\d+)\/(\d+)/ },
  { id: "w5", npm: "verify:core-w5", expectedPass: 45, expectedTotal: 45, re: /W5 score:\s*(\d+)\/(\d+)/ },
  { id: "w6", npm: "verify:core-w6", expectedPass: 57, expectedTotal: 57, re: /W6 Studio verify:\s*(\d+)\/(\d+)/ },
];

/**
 * @param {{ id: string, npm: string, expectedPass: number, expectedTotal: number, re: RegExp }} wave
 */
function runPriorWave(wave) {
  const result = spawnSync("npm", ["run", wave.npm], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  const m = out.match(wave.re);
  const passed = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : wave.expectedTotal;
  const exitOk = result.status === 0;
  return {
    id: wave.id,
    npm: wave.npm,
    exitCode: result.status ?? 1,
    passed,
    total,
    expectedPass: wave.expectedPass,
    expectedTotal: wave.expectedTotal,
    ok: exitOk && passed === wave.expectedPass && total === wave.expectedTotal,
    parsed: Boolean(m),
  };
}

const skipSub = process.env.W7_SKIP_SUBGATES === "1";
/** @type {Record<string, any>} */
let priorSummary = {};

if (skipSub && existsSync(regressionPath)) {
  try {
    const cached = JSON.parse(readFileSync(regressionPath, "utf8"));
    priorSummary = cached.priorWaves || {};
    console.log("W7_SKIP_SUBGATES=1 — using cached prior wave scores from W7_REGRESSION.json");
  } catch {
    priorSummary = {};
  }
}

if (!skipSub || !Object.keys(priorSummary).length) {
  console.log("\n=== Re-running prior wave gates (W1–W6) ===\n");
  for (const wave of PRIOR_WAVES) {
    const r = runPriorWave(wave);
    priorSummary[wave.id] = r;
    check(
      `prior ${wave.id} ${r.passed}/${r.total} (expect ${wave.expectedPass}/${wave.expectedTotal})`,
      r.ok,
      r.parsed ? `exit=${r.exitCode}` : `unparsed exit=${r.exitCode}`,
    );
  }
} else {
  for (const wave of PRIOR_WAVES) {
    const r = priorSummary[wave.id];
    const ok = r
      && r.passed === wave.expectedPass
      && r.total === wave.expectedTotal
      && r.ok !== false;
    check(
      `prior ${wave.id} cached ${r?.passed ?? "?"}/${r?.total ?? "?"} (expect ${wave.expectedPass}/${wave.expectedTotal})`,
      ok,
      "from W7_REGRESSION.json",
    );
  }
}

console.log("\n=== W7 quality / safety / a11y ===\n");

const requiredFiles = [
  "docs/qa/open-experience/W7_QUALITY.md",
  "docs/qa/open-experience/W7_REGRESSION.json",
  "docs/qa/open-experience/EXECUTION_STATE.md",
  "scripts/verify-core-w7-quality.mjs",
];
for (const rel of requiredFiles) {
  // REGRESSION may be written at end of this run — allow missing until write
  if (rel.endsWith("W7_REGRESSION.json")) continue;
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

// --- Production path: no nextByChoice in experience package path ---
const experienceProdFiles = [
  "src/experience/runtime.js",
  "src/experience/director.js",
  "src/experience/reducer.js",
  "src/experience/store.js",
  "src/experience/package-io.js",
  "src/experience/presets/night-rain-station.js",
  "src/experience/presets/mist-harbor-lighthouse.js",
  "src/experience/studio/studio-ui.js",
  "src/experience/studio/sandbox.js",
];
let nextByChoiceHits = [];
for (const rel of experienceProdFiles) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    nextByChoiceHits.push(`${rel}:missing`);
    continue;
  }
  const src = readFileSync(abs, "utf8");
  // schema.js may list the forbidden key name; production logic must not call/use the graph.
  if (/\.nextByChoice\b|nextByChoice\s*\(/.test(src)) {
    nextByChoiceHits.push(rel);
  }
  if (rel.includes("presets/") && /nextByChoice\s*:/.test(src)) {
    nextByChoiceHits.push(`${rel}:graph-field`);
  }
}
check(
  "experience production path has no nextByChoice calls/graphs",
  nextByChoiceHits.length === 0,
  nextByChoiceHits.join(",") || "clean",
);

const schemaSrc = readFileSync(join(root, "src/experience/schema.js"), "utf8");
check(
  "experience schema still forbids nextByChoice key",
  /FORBIDDEN_PACKAGE_GRAPH_KEYS/.test(schemaSrc) && /"nextByChoice"/.test(schemaSrc),
);

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check(
  "player does not default offlineDirectorTurn",
  /offlineDirectorTurn/.test(playerSrc)
    && /useOfflineFixed/.test(playerSrc)
    && /allowOfflineDirector/.test(playerSrc)
    && /never default|forceOfflineFixed|devDemo/.test(playerSrc),
);
check(
  "player catch path does not silently offlineDirectorTurn",
  !/catch\s*\([^)]*\)\s*\{[^}]*offlineDirectorTurn/s.test(playerSrc),
);

const adapterSrc = readFileSync(join(root, "src/scenario/runtime/director-adapter.js"), "utf8");
check(
  "offlineDirectorTurn throws without explicit flags",
  /offlineDirectorTurn_requires_devDemo_or_forceOfflineFixed/.test(adapterSrc),
);

// --- Package input safety ---
const pkgIoSrc = readFileSync(join(root, "src/experience/package-io.js"), "utf8");
check(
  "package-io forbids arbitrary JS keys",
  /FORBIDDEN_PACKAGE_JS_KEYS/.test(pkgIoSrc) && /findForbiddenJsKeys/.test(pkgIoSrc),
);
check(
  "package-io URL allowlist present",
  /isAllowedResourceUrl/.test(pkgIoSrc)
    && /ALLOWED_EXTERNAL_PROTOCOLS/.test(pkgIoSrc)
    && /dangerous_url_scheme/.test(pkgIoSrc),
);
check(
  "package-io export scrub present",
  /scrubPrivacyFromExport/.test(pkgIoSrc) && /EXPORT_SCRUB_KEYS/.test(pkgIoSrc),
);

// --- prefers-reduced-motion ---
const scenarioCss = readFileSync(join(root, "src/ui/scenario-theater.css"), "utf8");
const phoneCss = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");
const studioCss = readFileSync(join(root, "src/experience/studio/studio.css"), "utf8");
check(
  "scenario CSS has prefers-reduced-motion",
  /prefers-reduced-motion:\s*reduce/.test(scenarioCss),
);
check(
  "phone CSS has prefers-reduced-motion",
  /prefers-reduced-motion:\s*reduce/.test(phoneCss),
);
check(
  "experience studio CSS has prefers-reduced-motion",
  /prefers-reduced-motion:\s*reduce/.test(studioCss),
);

// --- Touch targets (documented / CSS where feasible) ---
check(
  "scenario CSS documents 44px touch targets",
  /min-height:\s*44px/.test(scenarioCss),
);
check(
  "phone CSS documents 44px touch targets",
  /min-height:\s*44px/.test(phoneCss) && /min-width:\s*44px/.test(phoneCss),
);
check(
  "studio CSS enforces 44px min on tabs/actions",
  /\.exp-studio__tab[\s\S]*min-height:\s*44px/.test(studioCss)
    && /\.exp-studio__actions button[\s\S]*min-height:\s*44px/.test(studioCss),
);

// --- ARIA basics ---
const studioUiSrc = readFileSync(join(root, "src/experience/studio/studio-ui.js"), "utf8");
const branchSrc = readFileSync(join(root, "src/scenario/player/branch-panel.js"), "utf8");
check(
  "experience studio ARIA: tablist/tab/status",
  /role="tablist"/.test(studioUiSrc)
    && /role="tab"/.test(studioUiSrc)
    && /aria-selected=/.test(studioUiSrc)
    && /role="status"/.test(studioUiSrc),
);
check(
  "opening picker ARIA: group/listbox/option",
  /aria-label="选择开场"/.test(playerSrc)
    && /role="listbox"/.test(playerSrc)
    && /role="option"/.test(playerSrc)
    && /aria-selected=/.test(playerSrc),
);
check(
  "branch panel ARIA: dialog + listbox",
  /role", "dialog"/.test(branchSrc)
    && /aria-label", "时间线分支"/.test(branchSrc)
    && /role="listbox"/.test(branchSrc)
    && /aria-label="关闭分支面板"/.test(branchSrc),
);

// --- Isolation / privacy smoke (runtime) ---
const convStorage = memoryStorage();
globalThis.localStorage = convStorage;
globalThis.sessionStorage = memoryStorage();
globalThis.window = { localStorage: convStorage };

const {
  __setConversationStorageForTests,
  __resetConversationIdSeqForTests,
  clearAllConversations,
  getOrCreateActiveSession,
  getSession,
  sendUser,
  forkFromMessage,
  selectVisibleHistory,
  listSessions,
  switchBranch,
} = await import("../src/conversation/index.js");

const {
  validateExperiencePackage,
  exportExperiencePackage,
  findForbiddenJsKeys,
  isAllowedResourceUrl,
  scrubPrivacyFromExport,
} = await import("../src/experience/package-io.js");

const {
  __setExperienceMemoryStorageForTests,
  __clearExperienceMemoryForTests,
  __resetExperienceMemoryIdSeqForTests,
  proposeCandidatesFromSignals,
  rejectCandidate,
  retrieveAcceptedExperiences,
} = await import("../src/experience/memory.js");

__setConversationStorageForTests(convStorage);
clearAllConversations();
__resetConversationIdSeqForTests();

const memStorage = memoryStorage();
__setExperienceMemoryStorageForTests(memStorage);
__clearExperienceMemoryForTests();
__resetExperienceMemoryIdSeqForTests();

const charA = getOrCreateActiveSession({ characterId: "w7-char-a" });
const charB = getOrCreateActiveSession({ characterId: "w7-char-b" });
const sendA = sendUser(charA.id, "A-private-marker-umbrella", { source: "w7" });
const sendB = sendUser(charB.id, "B-private-marker-ticket", { source: "w7" });
const liveA0 = getSession(charA.id);
const liveB0 = getSession(charB.id);
const histA = selectVisibleHistory(liveA0);
const histB = selectVisibleHistory(liveB0);
check(
  "character isolation: A history excludes B marker",
  sendA.ok
    && histA.some((m) => /A-private-marker-umbrella/.test(m.text || m.content || ""))
    && !histA.some((m) => /B-private-marker-ticket/.test(m.text || m.content || "")),
);
check(
  "character isolation: B history excludes A marker",
  sendB.ok
    && histB.some((m) => /B-private-marker-ticket/.test(m.text || m.content || ""))
    && !histB.some((m) => /A-private-marker-umbrella/.test(m.text || m.content || "")),
);
check(
  "character isolation: listSessions separates characters",
  listSessions({ characterId: "w7-char-a" }).every((s) => s.characterId === "w7-char-a")
    && listSessions({ characterId: "w7-char-b" }).every((s) => s.characterId === "w7-char-b"),
);

const userMsgId = sendA.node?.id || histA[0]?.id;
const fork = forkFromMessage(charA.id, userMsgId, { label: "w7-fork" });
check("branch isolation: fork ok", fork?.ok === true, fork?.reason || "");
const liveA = getSession(charA.id);
const branchCount = liveA?.branches ? Object.keys(liveA.branches).length : 0;
check("branch isolation: ≥2 branches retained", branchCount >= 2, `count=${branchCount}`);
if (liveA?.branches) {
  const ids = Object.keys(liveA.branches).filter(
    (id) => liveA.branches[id]?.status !== "archived",
  );
  const other = ids.find((id) => id !== liveA.activeBranchId);
  if (other) {
    const sw = switchBranch(charA.id, other);
    check("branch isolation: switchBranch works", sw?.ok === true, sw?.reason || "");
  } else {
    check("branch isolation: switchBranch works", false, "no other branch");
  }
} else {
  check("branch isolation: switchBranch works", false, "no branches");
}

const propose = proposeCandidatesFromSignals({
  characterId: "w7-char-a",
  experienceSessionId: "w7-sess-a",
  branchId: liveA?.activeBranchId || "branch-main",
  signals: [
    {
      summary: "W7-memory-private-summary",
      type: "shared_event",
      confidence: 0.9,
      sourceMessageIds: [userMsgId].filter(Boolean),
    },
  ],
  source: "w7.smoke",
});
const cand = propose?.created?.[0];
if (cand?.id) {
  rejectCandidate(cand.id);
  const retrieved = retrieveAcceptedExperiences({ characterId: "w7-char-a", query: "W7-memory" });
  const items = retrieved?.items || [];
  check(
    "memory privacy: rejected not retrieved",
    !items.some((c) => /W7-memory-private-summary/.test(c.summary || "")),
    `items=${items.length}`,
  );
} else {
  check(
    "memory privacy: rejected not retrieved",
    false,
    `propose unexpected: created=${propose?.created?.length} reason=${propose?.reason || ""}`,
  );
}

const dirtyPkg = {
  id: "exp-w7-scrub-test",
  title: "W7 Scrub",
  schemaVersion: 1,
  openings: [
    {
      id: "opening-a",
      title: "A",
      teaser: "t",
      relationshipPremise: "p",
    },
  ],
  apiKey: "sk-secret-should-scrub",
  chatHistory: [{ role: "user", content: "private" }],
  longTermMemory: ["secret-memory"],
  resources: [{ id: "r1", license: "CC0", source: "local", url: "./assets/x.png" }],
};
const scrubbed = scrubPrivacyFromExport(dirtyPkg);
const scrubJson = JSON.stringify(scrubbed);
check(
  "export scrub removes apiKey/chat/memory",
  !/sk-secret-should-scrub/.test(scrubJson)
    && !/"chatHistory"/.test(scrubJson)
    && !/"longTermMemory"/.test(scrubJson),
);

check(
  "URL allowlist rejects javascript:",
  !isAllowedResourceUrl("javascript:alert(1)").ok,
);
check(
  "URL allowlist allows https",
  isAllowedResourceUrl("https://example.com/a.png").ok,
);
check(
  "findForbiddenJsKeys flags hooks",
  findForbiddenJsKeys({ hooks: { onEnter: "x" } }).includes("hooks"),
);

const nightRain = (await import("../src/experience/presets/night-rain-station.js"))
  .NIGHT_RAIN_STATION_PACKAGE;
const nrValidate = validateExperiencePackage(nightRain);
check("night-rain package still validates", nrValidate.ok, (nrValidate.errors || []).join(";"));

const exported = exportExperiencePackage(nightRain);
check(
  "night-rain export ok without privacy keys",
  exported.ok
    && !/apiKey|sk-/.test(JSON.stringify(exported.json || exported.bundle || {})),
  (exported.errors || []).join(";"),
);

// Docs honesty
const qualityDoc = readFileSync(join(root, "docs/qa/open-experience/W7_QUALITY.md"), "utf8");
check(
  "W7_QUALITY.md lists evidence_pending gaps",
  /evidence_pending/.test(qualityDoc)
    && /30.?round|手感|visual|视觉/i.test(qualityDoc),
);
check(
  "W7_QUALITY.md does not claim product_review done",
  !/status:\s*\*?\*?product_review/i.test(qualityDoc)
    && !/标记为\s*`?product_review`?/.test(qualityDoc),
);

const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
check("EXECUTION_STATE has W7 row", /W7/.test(execState));
check(
  "EXECUTION_STATE does not self-sign end-user acceptance literally",
  !/\buser_accepted\b/.test(execState),
);
check(
  "EXECUTION_STATE does not mark product_review for W7 alone",
  !/W7[^|\n]*\|\s*\*?product_review\*?/.test(execState),
);

// Optional e2e status (honest; not inventing greens)
/** @type {Record<string, any>} */
let e2eStatus = { "e2e:v0": { status: "not_run_this_pass" }, "e2e:w4-stage": { status: "not_run_this_pass" } };
if (existsSync(regressionPath)) {
  try {
    const prev = JSON.parse(readFileSync(regressionPath, "utf8"));
    if (prev.e2e) e2eStatus = { ...e2eStatus, ...prev.e2e };
  } catch {
    /* ignore */
  }
}
if (process.env.W7_E2E_V0_STATUS) {
  e2eStatus["e2e:v0"] = {
    status: process.env.W7_E2E_V0_STATUS,
    detail: process.env.W7_E2E_V0_DETAIL || "",
  };
}
if (process.env.W7_E2E_W4_STATUS) {
  e2eStatus["e2e:w4-stage"] = {
    status: process.env.W7_E2E_W4_STATUS,
    detail: process.env.W7_E2E_W4_DETAIL || "",
  };
}

check(
  "e2e results recorded honestly (not silent pass)",
  Object.values(e2eStatus).every((e) => e && e.status && e.status !== "silent_pass"),
  JSON.stringify(e2eStatus),
);

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

mkdirSync(dirname(regressionPath), { recursive: true });

const regression = {
  wave: "W7",
  generatedAt: new Date().toISOString(),
  status: failed === 0 ? "implementation_green" : "red",
  priorWaves: priorSummary,
  priorExpected: Object.fromEntries(
    PRIOR_WAVES.map((w) => [w.id, `${w.expectedPass}/${w.expectedTotal}`]),
  ),
  w7Checks: {
    passed,
    total: checks.length,
    failed,
    items: checks,
  },
  e2e: e2eStatus,
  evidenceGaps: [
    {
      id: "real_llm_30_round_dom",
      status: "evidence_pending",
      blocks: "product_review",
      note: "§15.5 / §16 / DoD#3 — real provider 30-round DOM path not filmed this wave",
    },
    {
      id: "handfeel_video_390_375",
      status: "evidence_pending",
      blocks: "product_review",
      note: "§15.8 filmed pager/icon/lifecycle clips for 390×844 and 375×812",
    },
    {
      id: "visual_matrix_viewports",
      status: "evidence_pending",
      blocks: "product_review",
      note: "§15.10 screenshot matrix across viewports / states",
    },
  ],
  notes: [
    "Do not mark product_review in W7; W8 owns the merge pack.",
    "Prior wave scores must not regress from W1 80/80 … W6 57/57.",
  ],
  verifyScore: `${passed}/${checks.length}`,
};

writeFileSync(regressionPath, `${JSON.stringify(regression, null, 2)}\n`, "utf8");
check(`wrote ${"docs/qa/open-experience/W7_REGRESSION.json"}`, existsSync(regressionPath));

// Re-write once so the final write-check is included in the artifact score.
const finalPassed = checks.filter((c) => c.pass).length;
const finalFailed = checks.filter((c) => !c.pass).length;
regression.w7Checks = {
  passed: finalPassed,
  total: checks.length,
  failed: finalFailed,
  items: checks,
};
regression.verifyScore = `${finalPassed}/${checks.length}`;
regression.status = finalFailed === 0 ? "implementation_green" : "red";
writeFileSync(regressionPath, `${JSON.stringify(regression, null, 2)}\n`, "utf8");

console.log(`\nW7 quality verify: ${finalPassed}/${checks.length} passed, ${finalFailed} failed`);
console.log(
  finalFailed
    ? "W7 RED — fix failures; do not invent greens."
    : "W7 implementation_green (evidence_pending gaps remain for product_review / W8 honesty).",
);
if (finalFailed) process.exitCode = 1;
