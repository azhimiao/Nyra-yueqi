/**
 * Nyra Agent Runtime contracts — product code depends on these only.
 * OpenClaw types must not leak past the integrations/openclaw adapter boundary.
 */

/**
 * @typedef {object} NyraAgentModel
 * @property {string} provider
 * @property {string} modelId
 * @property {string} [baseUrl]
 * @property {string} [apiKey]
 * @property {'fake'|'mock-nyra'|'byok'} [mode]
 */

/**
 * @typedef {object} NyraToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {object} parametersJsonSchema
 * @property {'low'|'medium'|'high'} [riskLevel]
 * @property {string[]} [requiredCapabilities]
 * @property {number} [timeoutMs]
 * @property {(args: object, ctx: { signal?: AbortSignal, callId: string, workspace: import('./OpenClawWorkspaceAdapter.js').OpenClawWorkspaceAdapter }) => Promise<{ content: string, details?: object }>} execute
 */

/**
 * @typedef {object} NyraAgentRunRequest
 * @property {string} runId
 * @property {string} instruction
 * @property {string} workspaceId
 * @property {NyraToolDefinition[]} tools
 * @property {NyraAgentModel} model
 * @property {number} maxSteps
 * @property {AbortSignal} [signal]
 * @property {string} [systemPrompt]
 * @property {string} [workspaceRoot]
 * @property {'happy'|'unknown_tool'|'bad_schema'|'max_steps'|'cancel'|'path_escape'|'tool_timeout'} [testScenario]
 */

/**
 * @typedef {
 *   | { type: 'run_started'; runId: string }
 *   | { type: 'model_requested'; step: number }
 *   | { type: 'tool_requested'; toolName: string; callId: string }
 *   | { type: 'tool_completed'; toolName: string; callId: string; isError?: boolean }
 *   | { type: 'approval_required'; approvalId: string }
 *   | { type: 'run_completed'; summary: string; artifactIds: string[] }
 *   | { type: 'run_failed'; code: string; message: string }
 * } NyraAgentRuntimeEvent
 */

/**
 * @typedef {object} NyraAgentRuntime
 * @property {(request: NyraAgentRunRequest) => AsyncIterable<NyraAgentRuntimeEvent>} run
 * @property {(runId: string) => Promise<void>} cancel
 */

export {};
