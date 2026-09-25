/**
 * P4 Local/offline research — every conclusion carries source attribution.
 * Live web search is external_pending (blocked unless explicitly authorized).
 * Risk R1 for research-only; R2 when saving materials.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";
import { searchOfflineCorpus } from "./offline-corpus.js";

/**
 * @param {string} query
 * @param {{ saveMaterials?: boolean }} [opts]
 */
export function runLocalResearch(query, opts = {}) {
  const q = String(query || "").trim();
  const hits = searchOfflineCorpus(q, { limit: 5 });
  /** @type {{ statement: string, sourceIds: string[], sources: object[] }[]} */
  const conclusions = [];

  if (!hits.length) {
    return {
      query: q,
      conclusions: [],
      sources: [],
      comparison: null,
      ok: false,
      reason: "no_sources",
    };
  }

  const sources = hits.map(({ doc, score }) => ({
    id: doc.id,
    title: doc.title,
    url: doc.url,
    excerpt: doc.excerpt,
    score,
  }));

  conclusions.push({
    statement: `关于「${q}」：${hits[0].doc.excerpt}`,
    sourceIds: [hits[0].doc.id],
    sources: [sources[0]],
  });

  if (hits.length >= 2) {
    conclusions.push({
      statement: `补充视角：${hits[1].doc.excerpt}`,
      sourceIds: [hits[1].doc.id],
      sources: [sources[1]],
    });
  }

  const comparison = {
    axis: "要点对比",
    rows: hits.slice(0, 3).map(({ doc }) => ({
      sourceId: doc.id,
      title: doc.title,
      point: doc.excerpt,
      url: doc.url,
    })),
  };

  // Gate: every conclusion must have ≥1 source
  const allAttributed = conclusions.every(
    (c) => Array.isArray(c.sources) && c.sources.length > 0 && Array.isArray(c.sourceIds) && c.sourceIds.length > 0,
  );

  return {
    query: q,
    conclusions,
    sources,
    comparison,
    summary: conclusions.map((c) => c.statement).join(" "),
    saveMaterials: Boolean(opts.saveMaterials),
    ok: allAttributed && conclusions.length > 0,
    reason: allAttributed ? null : "missing_source_attribution",
  };
}

export const localResearchCapability = {
  id: "local-research",
  label: "本地研究",
  risk: "R1",
  description: "离线语料检索、对比与摘要；每个结论保留来源。联网搜索为 external_pending。",

  validateInput(input = {}) {
    const query = String(input.query || input.text || "").trim();
    if (!query) return { ok: false, reason: "empty_query" };
    if (query.length > 500) return { ok: false, reason: "query_too_long" };
    return {
      ok: true,
      value: {
        query,
        saveMaterials: Boolean(input.saveMaterials),
        characterId: String(input.characterId || ""),
        projectId: String(input.projectId || "default"),
        liveWeb: Boolean(input.liveWeb),
      },
    };
  },

  plan(intent) {
    const save = Boolean(intent?.input?.saveMaterials);
    return {
      nodes: [
        {
          id: "res1",
          stepId: "res1",
          capabilityId: "local-research",
          label: save ? "研究并保存材料" : "本地研究（带来源）",
          risk: save ? "R2" : "R1",
          requiresApproval: save,
          inputSummary: "查询词与离线语料",
          effectSummary: save ? "写入带来源的研究材料" : "返回带来源的结论",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const result = runLocalResearch(input.query || input.text || "");
    return {
      exactEffect: result.ok
        ? `产出 ${result.conclusions.length} 条带来源的研究结论${input.saveMaterials ? "并保存材料" : ""}`
        : `研究失败：${result.reason || "无结果"}`,
      dataUsed: (result.sources || []).map((s) => s.url || s.id),
      affects: input.saveMaterials ? ["本地研究材料产物"] : ["仅会话结果，无写入"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    // Live web is external_pending
    if (validated.value.liveWeb || ctx.fetchLiveWeb || ctx.attemptExternalWrite) {
      recordWriteAttempt({
        kind: "external",
        authorized: Boolean(ctx.externalAuthorized),
        detail: "local-research live web external_pending",
        taskId: ctx.taskId || "",
      });
      if (!ctx.externalAuthorized) {
        return {
          ok: false,
          reason: "external_pending",
          claimedCompleted: false,
          message: "真实联网搜索尚未接入（external_pending）",
        };
      }
    }

    const result = runLocalResearch(validated.value.query, {
      saveMaterials: validated.value.saveMaterials,
    });

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason || "research_failed",
        claimedCompleted: false,
        result,
      };
    }

    // Hard rule: never complete without sources on every conclusion
    const missing = result.conclusions.filter((c) => !c.sources?.length);
    if (missing.length) {
      return {
        ok: false,
        reason: "missing_source_attribution",
        claimedCompleted: false,
        result,
      };
    }

    if (validated.value.saveMaterials) {
      if (!ctx.approved) {
        return { ok: false, reason: "approval_required", preview: result, claimedCompleted: false };
      }
      const artifact = {
        id: newId("research"),
        kind: "research-material",
        capabilityId: "local-research",
        characterId: validated.value.characterId || ctx.characterId || "",
        projectId: validated.value.projectId,
        query: result.query,
        conclusions: result.conclusions,
        sources: result.sources,
        comparison: result.comparison,
        createdAt: nowIso(),
        taskId: ctx.taskId || "",
        undoable: true,
      };
      saveArtifact(artifact);
      recordWriteAttempt({
        kind: "local",
        authorized: true,
        detail: `research:${artifact.id}`,
        taskId: ctx.taskId || "",
      });
      return {
        ok: true,
        artifactId: artifact.id,
        artifact,
        result,
        summary: `已保存研究材料（${result.conclusions.length} 结论 / ${result.sources.length} 来源）`,
        claimedCompleted: true,
      };
    }

    // R1 read path — artifact is optional result record (not a "false complete" write)
    const artifact = {
      id: newId("research"),
      kind: "research-result",
      capabilityId: "local-research",
      characterId: validated.value.characterId || ctx.characterId || "",
      query: result.query,
      conclusions: result.conclusions,
      sources: result.sources,
      comparison: result.comparison,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      result,
      summary: `研究完成：${result.conclusions.length} 条结论，均带来源`,
      claimedCompleted: true,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: a?.id,
      message: "可删除该研究材料/结果",
    };
  },
};
