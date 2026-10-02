/**
 * OC-skill-broker — Context Broker wired into Skill Runtime + safe Explore ZIP intake.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P3");
const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");

/** @type {{ id: string, name: string, pass: boolean, detail: string }[]} */
const cases = [];

function record(id, name, pass, detail = "") {
  cases.push({ id, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
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

const storage = memoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const conversationStore = await import("../src/conversation/store.js");
const store = await import("../src/skill-platform/store.js");
const runStore = await import("../src/skill-platform/run-store.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const importer = await import("../src/skill-platform/importer.js");
const runtime = await import("../src/skill-platform/runtime.js");
const { createSkillBrokerDeps } = await import("../src/skill-platform/skill-broker.js");
const { buildHostModelMessages } = await import("../src/skill-platform/host-model.js");
const { inspectZipBytes } = await import("../src/skill-platform/package-intake.js");
const { memoryIncludeFlagsForScopes } = await import("../src/skill-platform/context-request.js");

conversationStore.__setConversationStorageForTests(storage);
store.__setSkillPlatformStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
store.clearAllSkillPlatformData();
runStore.clearAllSkillRuns();

const api = binding.createProductionConversationApi();
const characterId = "xingli";
const fixtureFiles = readFixtureFiles(fixtureDir);

importer.importSkillBundle({
  files: fixtureFiles,
  sourceLabel: "fixture:skill-broker",
  confirm: true,
  grantedCapabilities: [],
});

const run = runStore.createSkillRunRecord(
  {
    skillId: "relationship-intelligence",
    agentId: "work-agent",
    characterId,
    mode: "isolated_new",
    scopes: {
      conversationRead: "none",
      memoryRead: "relationship",
      characterVisibility: "selected_character",
      memoryWrite: "off",
    },
  },
  { conversationApi: api },
);

// Case 1: broker wired → non-null envelope when companion scope available
{
  const broker = createSkillBrokerDeps();
  const envelope = await runtime.buildHostEnvelope({
    runId: run.value.id,
    userText: "帮我理一理关系",
    deps: broker,
  });
  const ctx = envelope.value?.context;
  record(
    "broker_non_null_envelope",
    "buildHostEnvelope + broker → context.envelope non-null with companionId",
    envelope.ok
      && ctx?.envelope != null
      && ctx?.request?.characterId === characterId
      && ctx?.ok === true,
    ctx?.envelope ? `blocks=${ctx.envelope.blocks?.length ?? 0}` : "envelope=null",
  );
}

// Case 2: without broker dep envelope stays null (regression guard)
{
  const envelope = await runtime.buildHostEnvelope({
    runId: run.value.id,
    userText: "无 broker",
    deps: {},
  });
  record(
    "broker_absent_null",
    "Without buildContextEnvelope dep → envelope null (explicit wiring required)",
    envelope.ok && envelope.value?.context?.envelope == null,
  );
}

// Case 3: host-model injects memory/relationship blocks when companion-scoped
{
  const msgs = buildHostModelMessages(
    {
      resources: { system: "Skill 系统", policies: [] },
      allowedActions: ["REPLY"],
      context: {
        request: {
          characterId,
          ...memoryIncludeFlagsForScopes({
            memoryRead: "relationship",
            characterVisibility: "selected_character",
          }),
        },
        envelope: {
          blocks: [
            { id: "cohabit", text: "【关系记忆】你们曾在雨夜一起等末班车。" },
            { id: "context_graph", text: "【长期记忆】用户偏好直接沟通。" },
          ],
        },
      },
    },
    { history: [] },
  );
  const system = msgs.find((m) => m.role === "system")?.content || "";
  record(
    "host_model_memory_blocks",
    "host-model includes broker memory/relationship blocks (companion-scoped only)",
    system.includes("授权上下文资料")
      && system.includes("关系记忆")
      && system.includes("长期记忆"),
  );
}

// Case 4: host-model skips memory blocks without companion scope
{
  const msgs = buildHostModelMessages(
    {
      resources: { system: "Skill 系统", policies: [] },
      allowedActions: ["REPLY"],
      context: {
        request: { characterId: "", includeContextGraph: true, includeCohabit: true },
        envelope: {
          blocks: [{ id: "cohabit", text: "【关系记忆】不应出现" }],
        },
      },
    },
    { history: [] },
  );
  const system = msgs.find((m) => m.role === "system")?.content || "";
  record(
    "host_model_no_companion_skip",
    "host-model skips memory blocks when characterId missing",
    !system.includes("关系记忆"),
  );
}

// Case 5: safe ZIP parse accepts fixture bundle
{
  const zipBytes = zipSync(
    Object.fromEntries(Object.entries(fixtureFiles).map(([path, content]) => [path, strToU8(content)])),
  );
  const inspected = inspectZipBytes(zipBytes);
  const preview = inspected.ok ? importer.previewSkillBundle(inspected.files, { sourceLabel: "zip" }) : null;
  record(
    "zip_safe_parse_accept",
    "inspectZipBytes accepts skill fixture ZIP → preview ok",
    inspected.ok && preview?.ok === true && preview.skills?.length >= 1,
    inspected.ok ? `files=${inspected.fileCount}` : inspected.errors?.join(","),
  );
}

// Case 6: unsafe ZIP rejected (path traversal)
{
  const evil = zipSync({
    "../escape/SKILL.md": strToU8("# evil"),
    "SKILL.md": strToU8("---\nid: evil\nname: Evil\nversion: 1.0.0\n---\n"),
  });
  const inspected = inspectZipBytes(evil);
  record(
    "zip_unsafe_reject",
    "inspectZipBytes rejects path traversal (no RCE surface)",
    inspected.ok === false && (inspected.errors || []).includes("path_traversal"),
    (inspected.errors || []).join(","),
  );
}

// Case 7: explore-ui wires inspectZipBytes
{
  const exploreSrc = readFileSync(join(root, "src/skill-platform/ui/explore-ui.js"), "utf8");
  const sessionSrc = readFileSync(join(root, "src/skill-platform/ui/skill-session-ui.js"), "utf8");
  record(
    "explore_product_wiring",
    "Explore session + ZIP intake wired to broker",
    exploreSrc.includes("inspectZipBytes")
      && sessionSrc.includes("createSkillBrokerDeps")
      && existsSync(join(root, "src/skill-platform/skill-broker.js")),
  );
}

const failed = cases.filter((c) => !c.pass).length;
mkdirSync(outDir, { recursive: true });
const report = {
  at: new Date().toISOString(),
  command: "npm run verify:skill-broker",
  finding: "OC-skill-broker",
  passed: cases.length - failed,
  failed,
  cases,
};
writeFileSync(join(outDir, "VERIFY_SKILL_BROKER.json"), JSON.stringify(report, null, 2));
console.log(`\nverify:skill-broker: ${report.passed}/${cases.length}`);
process.exit(failed ? 1 : 0);
