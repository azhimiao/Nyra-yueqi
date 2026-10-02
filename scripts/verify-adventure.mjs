/** Adventure regression aligned with the product rule: no bundled stories. */
import {
  acceptPendingAdventureTurn,
  buildDmMessages,
  createAdventureRun,
  forkAdventureRun,
  getAdventureRun,
  getPackage,
  listAdventureRuns,
  listPackages,
  requestDmCandidate,
  resetAdventureStore,
  stageAdventureTurn,
  validateAdventurePackage,
} from "../src/adventure/index.js";
import { createUserWorld } from "../src/adventure/user-worlds.js";

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  },
};

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}
function snapshot(run) {
  return JSON.stringify({ state: run.state, turns: run.turns, pendingTurn: run.pendingTurn });
}

resetAdventureStore();
check("library starts without copyrighted canned worlds", listPackages().length === 0);
const created = createUserWorld({
  title: "雾港信号",
  subtitle: "用户自己的开放冒险",
  openingTitle: "零点来电",
  openingText: "零点，废弃值班室的电话响了。",
  locationName: "旧值班室",
});
check("user can create a playable world", created.ok, created.reason);
const pkg = getPackage(created.world.id);
const contract = validateAdventurePackage(pkg);
check("user world satisfies package contract", contract.ok, contract.errors.join(","));
check("library lists only user-created world", listPackages().length === 1 && listPackages()[0].userDefined === true);

const formal = createAdventureRun({
  packageId: pkg.id,
  openingId: pkg.openings[0].id,
  character: { name: "岚", archetypeId: "observer" },
});
const before = snapshot(formal);
const baseMessages = buildDmMessages(pkg, formal, { mode: "say", text: "我接起电话。" });
check("DM context includes package and current state", baseMessages.some((m) => m.content.includes(pkg.id)) && baseMessages.some((m) => m.content.includes("currentState")));
check("DM context includes action mode", baseMessages.some((m) => m.content.includes('"actionMode":"say"')));

let noModelCode = "";
try {
  await requestDmCandidate({ pkg, run: formal, input: { mode: "do", text: "检查电话线。" }, callModel: null, providerConfig: {} });
} catch (error) {
  noModelCode = error?.code || "";
}
check("formal run refuses fake offline narration", noModelCode === "model_not_configured", noModelCode);
check("model failure leaves run unchanged", snapshot(getAdventureRun(formal.id)) === before);

const candidate = await requestDmCandidate({
  pkg,
  run: getAdventureRun(formal.id),
  input: { mode: "say", text: "你是谁？" },
  providerConfig: { baseUrl: "https://model.test/v1", apiKey: "test", model: "dm-test" },
  callModel: async () => ({ content: JSON.stringify({
    narration: "听筒里传来一段倒放的天气预报。",
    choices: [{ id: "trace", label: "追查线路", mode: "do", actionText: "我检查墙后的电话线。" }],
    checks: [],
    effects: [{ type: "set_flag", key: "heard_reverse_forecast", value: true }, { type: "advance_time", hours: 1 }],
  }) }),
});
const stateBeforeStage = JSON.stringify(getAdventureRun(formal.id).state);
stageAdventureTurn(formal.id, { mode: "say", text: "你是谁？" }, candidate);
check("candidate is staged without state mutation", JSON.stringify(getAdventureRun(formal.id).state) === stateBeforeStage);
const accepted = acceptPendingAdventureTurn(formal.id, { rng: () => 0.5 });
check("accepted model turn persists whitelisted effects", accepted.state.flags.heard_reverse_forecast === true && accepted.state.clock.hour === formal.state.clock.hour + 1);
check("accepted turn keeps model provenance", accepted.turns.at(-1)?.candidate?.source === "model");

let invalidJsonCode = "";
try {
  await requestDmCandidate({
    pkg, run: accepted, input: { mode: "do", text: "继续调查。" },
    providerConfig: { baseUrl: "https://model.test/v1", apiKey: "test", model: "dm-test" },
    callModel: async () => ({ content: "not json" }),
  });
} catch (error) { invalidJsonCode = error?.code || ""; }
check("DM rejects invalid JSON", invalidJsonCode === "model_invalid_json", invalidJsonCode);

let forbiddenEffectCode = "";
try {
  await requestDmCandidate({
    pkg, run: accepted, input: { mode: "story", text: "瞬移。" },
    providerConfig: { baseUrl: "https://model.test/v1", apiKey: "test", model: "dm-test" },
    callModel: async () => ({ content: JSON.stringify({ narration: "错误候选", choices: [], checks: [], effects: [{ type: "move", locationId: "missing" }] }) }),
  });
} catch (error) { forbiddenEffectCode = error?.code || ""; }
check("DM rejects unauthorized effects", forbiddenEffectCode === "model_contract_invalid", forbiddenEffectCode);

const branch = forkAdventureRun(formal.id, accepted.turns.at(-1).id);
check("fork creates independent world line", branch.id !== formal.id && branch.parentRunId === formal.id);
check("both world lines remain available", listAdventureRuns().some((run) => run.id === formal.id) && listAdventureRuns().some((run) => run.id === branch.id));
let invalidFork = "";
try { forkAdventureRun(formal.id, "missing-turn"); } catch (error) { invalidFork = error?.message || ""; }
check("invalid turn never silently forks latest", invalidFork === "adventure_turn_not_found", invalidFork);

const failed = checks.filter((item) => !item.pass);
console.log(`\nverify:adventure ${checks.length - failed.length}/${checks.length}${failed.length ? " RED" : " GREEN"}`);
if (failed.length) process.exitCode = 1;
