import { getPalaceStatus } from "./search.js";

/**
 * MemPalace wake-up context for app resume.
 * P0: must not inject unscoped session diary / global KG into Pop prompts.
 */
export async function buildWakeUpContext() {
  const status = await getPalaceStatus().catch(() => null);
  return {
    sessionDiary: "",
    status,
    kgFacts: [],
    block: "",
  };
}
