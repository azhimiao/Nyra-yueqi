/**
 * Scenario audit — read-only workspace tools, no approval / production write.
 */

import { OpenClawMobileWorkspace } from "../../integrations/openclaw-mobile/OpenClawMobileEnvironment.js";
import { createQijiControlledTools } from "./controlled-tools.js";
import {
  createAssistantTask,
  updateAssistantTask,
  getAssistantTask,
} from "./task-store.js";

import { SCENARIO_AUDIT_FIXTURE } from "./fixtures.js";

/**
 * @param {object} opts
 */
export async function runScenarioAuditAgentTask(opts = {}) {
  const scenarioPayload = opts.scenarioPayload || SCENARIO_AUDIT_FIXTURE;

  let task = createAssistantTask({
    title: opts.title || "情景剧包检查",
    instruction: opts.instruction || "检查情景剧包是否完整",
    status: "RUNNING",
    authorizedResources: [{ type: "scenario", resourceId: "fixture:scenario", access: "read" }],
    requiredCapabilities: ["nyra.scenario.inspect", "nyra.scenario.validate"],
    workspaceId: `ws-scenario-${Date.now().toString(36)}`,
    checkpoint: { step: "audit", completedSideEffects: [] },
  });
  opts.onEvent?.({ type: "task_started" });

  const ws = new OpenClawMobileWorkspace(task.workspaceId);
  await ws.writeText("input/scenario.json", JSON.stringify(scenarioPayload, null, 2));
  const tools = createQijiControlledTools(ws);
  const inspect = tools.find((t) => t.name === "nyra.scenario.inspect");
  const validate = tools.find((t) => t.name === "nyra.scenario.validate");

  const inspectResult = await inspect.execute("1", {});
  const validateResult = await validate.execute("1", { path: "input/scenario.json" });
  const report = {
    inspect: inspectResult.details,
    validate: validateResult.details,
  };

  const valid = Boolean(validateResult.details?.valid);
  task = updateAssistantTask(task.id, {
    status: "SUCCEEDED",
    stepSummary: valid
      ? `情景剧包检查通过（${report.inspect?.title || scenarioPayload.title}）`
      : `发现缺失字段：${(report.validate?.missingFields || []).join("、") || "未知"}`,
    candidate: { kind: "scenario-audit", report, valid },
    artifactIds: ["input/scenario.json"],
  }) || task;

  return {
    ok: true,
    task: getAssistantTask(task.id),
    report,
    speech: task.stepSummary,
  };
}
