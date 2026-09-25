/**
 * OpenClawCancellationAdapter — per-run AbortController registry.
 */
export class OpenClawCancellationAdapter {
  constructor() {
    /** @type {Map<string, AbortController>} */
    this.controllers = new Map();
  }

  /**
   * @param {string} runId
   * @param {AbortSignal} [external]
   */
  begin(runId, external) {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    if (external) {
      if (external.aborted) controller.abort();
      else {
        external.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }
    return controller.signal;
  }

  /**
   * @param {string} runId
   */
  async cancel(runId) {
    const c = this.controllers.get(runId);
    if (c && !c.signal.aborted) c.abort();
  }

  /**
   * @param {string} runId
   */
  end(runId) {
    this.controllers.delete(runId);
  }
}
