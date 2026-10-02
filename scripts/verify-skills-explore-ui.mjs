/**
 * P4 — Explore App + Agent Picker/Composer UI verify.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P4");

/** @type {{ id: string, name: string, pass: boolean, detail: string }[]} */
const cases = [];

function record(id, name, pass, detail = "") {
  cases.push({ id, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${name}${detail ? ` — ${detail}` : ""}`);
}

function readFixtureFiles(dir, prefix = "") {
  /** @type {Record<string, string>} */
  const files = {};
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) {
      Object.assign(files, readFixtureFiles(full, rel));
    } else {
      files[rel.replace(/\\/g, "/")] = readFileSync(full, "utf8");
    }
  }
  return files;
}

function readText(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

// Case 1: modules export mount functions
{
  const explore = await import("../src/skill-platform/ui/explore-ui.js");
  const detail = await import("../src/skill-platform/ui/skill-detail-ui.js");
  const scope = await import("../src/skill-platform/ui/scope-sheet.js");
  const session = await import("../src/skill-platform/ui/skill-session-ui.js");
  const picker = await import("../src/agents/ui/agent-picker.js");
  const composer = await import("../src/agents/ui/agent-composer.js");

  const ok = typeof explore.mountExploreApp === "function"
    && typeof explore.buildExploreScreenHtml === "function"
    && typeof detail.mountSkillDetailUi === "function"
    && typeof scope.mountScopeSheet === "function"
    && typeof scope.normalizeScopeSheetPayload === "function"
    && typeof session.mountSkillSessionUi === "function"
    && typeof picker.mountAgentPickerHost === "function"
    && typeof picker.openAgentPicker === "function"
    && typeof composer.composeAgentDraft === "function";

  record("exports_mount", "UI modules export mount/build functions", ok);
}

// Case 2: explore registered in apps catalog and on home desktop
{
  const catalog = await import("../src/phone-shell/apps-catalog.js");
  const layout = await import("../src/phone-shell/home-layout.js");
  const app = catalog.PHONE_APP_MAP.explore;
  const onHome = Array.isArray(layout.C1_GRID_ORDER) && layout.C1_GRID_ORDER.includes("explore");
  const hasLabel = Boolean(app?.labelKey || app?.label);
  record(
    "catalog_explore",
    "explore appId on home desktop grid (not via qishi only)",
    Boolean(app?.id === "explore" && hasLabel && app.icon && onHome && app.via !== "qishi"),
    app ? `${app.labelKey || app.label} / ${app.icon} / home=${onHome}` : "missing",
  );
}

// Case 3: import fixture → preview card fields
{
  const importer = await import("../src/skill-platform/importer.js");
  const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");
  const files = readFixtureFiles(fixtureDir);
  const preview = importer.previewSkillBundle(files, { sourceLabel: "verify:p4" });
  const card = preview.ok ? preview.skills[0]?.preview : null;
  record(
    "import_preview_card",
    "Fixture import preview has name, willRead, mayProposeTasks",
    preview.ok
      && card?.name
      && Array.isArray(card.willRead)
      && card.willRead.length > 0
      && Array.isArray(card.mayProposeTasks),
    card ? `name=${card.name} willRead=${card.willRead.length}` : preview.reason,
  );
}

// Case 4: scope sheet normalize → valid run create payload
{
  const { normalizeScopeSheetPayload } = await import("../src/skill-platform/ui/scope-sheet.js");
  const { validateSkillRun, createSkillRun } = await import("../src/skill-platform/run-schema.js");

  const normalized = normalizeScopeSheetPayload(
    { mode: "isolated_new", characterVisibility: "private" },
    { skillId: "relationship-intelligence", agentId: "relationship-guide", characterId: "xingli" },
  );

  let runValid = false;
  if (normalized.ok) {
    try {
      const run = createSkillRun(normalized.value);
      runValid = validateSkillRun(run).ok;
    } catch {
      runValid = false;
    }
  }

  record(
    "scope_normalize_run",
    "Scope sheet normalize produces valid SkillRun create payload",
    normalized.ok && runValid,
    normalized.ok ? `mode=${normalized.value.mode}` : normalized.reason,
  );
}

// Case 5: composer offline draft for 跑团主持人
{
  const { composeAgentDraft } = await import("../src/agents/ui/agent-composer.js");
  const draft = await composeAgentDraft("我的跑团主持人");
  record(
    "composer_gm_offline",
    "Composer offline draft for 跑团主持人 yields agent profile shape",
    draft.ok
      && draft.value?.name
      && draft.value?.kind === "user_created"
      && draft.card?.willRead?.length > 0
      && draft.card?.mayPropose?.length > 0,
    draft.ok ? `name=${draft.value.name} source=${draft.source}` : draft.reason,
  );
}

// Case 6: no deskpet asset references in explore css/js
{
  const paths = [
    "src/skill-platform/ui/explore.css",
    "src/skill-platform/ui/explore-ui.js",
    "src/skill-platform/ui/skill-detail-ui.js",
    "src/skill-platform/ui/scope-sheet.js",
    "src/skill-platform/ui/skill-session-ui.js",
    "src/agents/ui/agent-picker.js",
    "src/agents/ui/agent-composer.js",
  ];
  const forbidden = /deskpet|desk-pet|floating.?pet|picture-in-picture-2/i;
  const hits = paths.filter((p) => forbidden.test(readText(p)));
  record(
    "no_deskpet_refs",
    "No deskpet asset references in explore css/js",
    hits.length === 0,
    hits.length ? hits.join(", ") : "clean",
  );
}

// Case 7: chat-first shell with Chat + Tasks + Market (operable geometry contract)
{
  const { buildExploreScreenHtml } = await import("../src/skill-platform/ui/explore-ui.js");
  const { tx } = await import("../src/skill-platform/ui/i18n.js");
  const css = readText("src/skill-platform/ui/explore.css");
  const html = buildExploreScreenHtml();
  const tabCount = (html.match(/data-explore-tab=/g) || []).length;
  const hasGuideCopy = String(tx("tabChat", "zh-CN")) === "对话"
    && String(tx("tabTasks", "zh-CN")).includes("任务")
    && String(tx("tabMarket", "zh-CN")).includes("插件");
  const legacyHide = /\.explore-tabs:not\(\.explore-tabs--two\)\s*\{[^}]*display\s*:\s*none/i.test(css);
  const threeTabVisible = /\.explore-tabs--three\s*\{[^}]*display\s*:\s*grid/i.test(css);
  record(
    "chat_first_shell",
    "Explore has Chat + Tasks + Market with visible three-tab layout",
    tabCount === 3
      && html.includes('data-explore-tab="chat"')
      && html.includes('data-explore-tab="tasks"')
      && html.includes('data-explore-tab="market"')
      && html.includes("explore-tabs--three")
      && !html.includes('data-explore-tab="import"')
      && hasGuideCopy
      && !legacyHide
      && threeTabVisible,
    `tabs=${tabCount} legacyHide=${legacyHide} threeVisible=${threeTabVisible}`,
  );
}

// Case 8: App drawer exposes Explore entry
{
  const indexHtml = readText("index.html");
  const navJs = readText("src/panels/nav.js");
  const appJs = readText("src/app.js");
  const hasDrawer = indexHtml.includes('data-drawer-nav="explore"');
  const hasHandler = navJs.includes('panel === "explore"') && appJs.includes("yueqi.explore.navigate");
  record(
    "app_explore_entry",
    "App mode drawer has Explore entry wired to phone Explore",
    hasDrawer && hasHandler,
    `drawer=${hasDrawer} handler=${hasHandler}`,
  );
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P4-explore-ui",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:skills:explore",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_EXPLORE.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_EXPLORE.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
