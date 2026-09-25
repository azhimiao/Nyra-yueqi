/**
 *  controlled tools for Qiji assistant Local Agent.
 * Tools only see authorized workspace copies — never full production scan.
 */

import { UnsupportedRuntimeCapabilityError } from "../../integrations/openclaw-mobile/OpenClawMobileProcessController.js";
import { THEMES } from "../../ui/theme.js";

/**
 * @param {import("../../integrations/openclaw-mobile/OpenClawMobileEnvironment.js").OpenClawMobileWorkspace} workspace
 * @param {{ authorizedResourceIds?: Set<string>, allowShell?: boolean }} [opts]
 */
export function createQijiControlledTools(workspace, opts = {}) {
  const authorized = opts.authorizedResourceIds || new Set();

  function assertAuthorized(resourceId) {
    if (!resourceId) return;
    if (authorized.size > 0 && !authorized.has(String(resourceId))) {
      throw Object.assign(new Error(`Unauthorized resource: ${resourceId}`), {
        code: "RESOURCE_UNAUTHORIZED",
      });
    }
  }

  return [
    {
      name: "workspace.list",
      label: "list",
      description: "List workspace paths",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const rows = await workspace.list(params?.path || "");
        return { content: [{ type: "text", text: JSON.stringify(rows) }], details: rows };
      },
    },
    {
      name: "workspace.read_text",
      label: "read",
      description: "Read workspace text file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", minLength: 1 } },
        required: ["path"],
        additionalProperties: false,
      },
      async execute(_id, params, signal) {
        if (signal?.aborted) throw Object.assign(new Error("Aborted"), { code: "ABORTED" });
        const text = await workspace.readText(params.path);
        return { content: [{ type: "text", text }], details: { path: params.path } };
      },
    },
    {
      name: "workspace.write_text",
      label: "write",
      description: "Write workspace text (candidate only)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        if (params?.path === "__shell__" || params?.path === "shell") {
          throw new UnsupportedRuntimeCapabilityError("Shell is unavailable in Nyra mobile runtime.");
        }
        const art = await workspace.createArtifact(params.path, params.content);
        return { content: [{ type: "text", text: JSON.stringify(art) }], details: art };
      },
    },
    {
      name: "workspace.create_artifact",
      label: "artifact",
      description: "Create workspace artifact",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const art = await workspace.createArtifact(params.path, params.content);
        return { content: [{ type: "text", text: JSON.stringify(art) }], details: art };
      },
    },
    {
      name: "workspace.inspect_json",
      label: "inspect_json",
      description: "Parse JSON in workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string", minLength: 1 } },
        required: ["path"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const raw = await workspace.readText(params.path);
        const data = JSON.parse(raw);
        const keys = data && typeof data === "object" ? Object.keys(data) : [];
        const payload = { ok: true, keys, type: Array.isArray(data) ? "array" : typeof data };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "character.inspect",
      label: "inspect",
      description: "Inspect authorized character.json (alias)",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute(toolCallId, params, signal) {
        return inspectCharacter(workspace, signal);
      },
    },
    {
      name: "nyra.character.inspect",
      label: "nyra_inspect",
      description: "Inspect authorized character card copy",
      parameters: {
        type: "object",
        properties: { resourceId: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params, signal) {
        if (params?.resourceId) assertAuthorized(params.resourceId);
        return inspectCharacter(workspace, signal);
      },
    },
    {
      name: "nyra.character.validate",
      label: "validate",
      description: "Validate character card fields",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/character.json";
        const character = JSON.parse(await workspace.readText(path));
        const missing = [];
        if (!character?.name) missing.push("name");
        if (!character?.personality) missing.push("personality");
        const payload = { valid: missing.length === 0, missingFields: missing, character };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.character.create_candidate",
      label: "candidate",
      description: "Write fixed character candidate to workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          character: { type: "object" },
        },
        required: ["character"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params.path || "output/character.fixed.json";
        const art = await workspace.createArtifact(path, JSON.stringify(params.character, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ ...art, path }) }], details: { ...art, path } };
      },
    },
    {
      name: "nyra.character.export",
      label: "export",
      description: "Export authorized character copy as JSON text",
      parameters: {
        type: "object",
        properties: { resourceId: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        if (params?.resourceId) assertAuthorized(params.resourceId);
        const raw = await workspace.readText("input/character.json");
        return { content: [{ type: "text", text: raw }], details: { bytes: raw.length } };
      },
    },
    {
      name: "nyra.worldbook.inspect",
      label: "wb_inspect",
      description: "Inspect worldbook candidate in workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/worldbook.json";
        if (!(await workspace.exists(path))) {
          const payload = { ok: false, message: "No authorized worldbook in workspace" };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
        }
        const data = JSON.parse(await workspace.readText(path));
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, data }) }], details: data };
      },
    },
    {
      name: "nyra.worldbook.validate",
      label: "wb_validate",
      description: "Validate worldbook JSON",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/worldbook.json";
        const data = JSON.parse(await workspace.readText(path));
        const entries = Array.isArray(data) ? data : data?.entries || [];
        const payload = { valid: Array.isArray(entries), count: entries.length };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.worldbook.create_merge_candidate",
      label: "wb_merge",
      description: "Write merged worldbook candidate (no production write)",
      parameters: {
        type: "object",
        properties: {
          entries: { type: "array" },
          path: { type: "string" },
        },
        required: ["entries"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params.path || "output/worldbook.merged.json";
        const seen = new Set();
        const merged = [];
        for (const entry of params.entries || []) {
          const key = String(entry?.title || entry?.id || JSON.stringify(entry));
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(entry);
        }
        const art = await workspace.createArtifact(path, JSON.stringify(merged, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ ...art, path, count: merged.length }) }], details: { path, count: merged.length } };
      },
    },
    {
      name: "nyra.worldbook.export",
      label: "wb_export",
      description: "Export worldbook from workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/worldbook.json";
        const raw = await workspace.readText(path);
        return { content: [{ type: "text", text: raw }], details: { path } };
      },
    },
    {
      name: "nyra.theme.inspect",
      label: "theme_inspect",
      description: "Inspect theme snapshot in workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const settingsPath = params?.path || "input/settings.json";
        const themePath = "input/theme.json";
        let currentId = null;
        let palette = [];
        if (await workspace.exists(settingsPath)) {
          const settings = JSON.parse(await workspace.readText(settingsPath));
          currentId = settings?.theme?.id || null;
        }
        if (await workspace.exists(themePath)) {
          const theme = JSON.parse(await workspace.readText(themePath));
          palette = theme?.palette || theme?.colors || [];
          currentId = currentId || theme?.currentId || theme?.id || null;
        }
        const payload = {
          ok: true,
          currentId,
          palette,
          availableThemes: THEMES.map((t) => ({ id: t.id, label: t.label })),
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.theme.validate_theme",
      label: "theme_validate",
      description: "Validate theme candidate JSON",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "output/theme.candidate.json";
        const theme = JSON.parse(await workspace.readText(path));
        const missing = [];
        if (!theme?.id) missing.push("id");
        if (!THEMES.some((t) => t.id === theme.id)) missing.push("known_theme_id");
        const payload = { valid: missing.length === 0, missingFields: missing, theme };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.theme.create_theme_candidate",
      label: "theme_candidate",
      description: "Write theme candidate to workspace (no production apply)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          theme: { type: "object" },
        },
        required: ["theme"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params.path || "output/theme.candidate.json";
        const theme = params.theme || {};
        const art = await workspace.createArtifact(path, JSON.stringify(theme, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ ...art, path, themeId: theme.id }) }], details: { path, themeId: theme.id } };
      },
    },
    {
      name: "nyra.scenario.inspect",
      label: "scenario_inspect",
      description: "Inspect scenario script in workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/scenario.json";
        if (!(await workspace.exists(path))) {
          const payload = { ok: false, message: "No scenario copy in workspace" };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
        }
        const script = JSON.parse(await workspace.readText(path));
        const payload = {
          ok: true,
          id: script.id,
          title: script.title,
          beatCount: Array.isArray(script.beats) ? script.beats.length : 0,
          hasCast: Boolean(script.cast),
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.scenario.validate",
      label: "scenario_validate",
      description: "Validate scenario script structure",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/scenario.json";
        const script = JSON.parse(await workspace.readText(path));
        const missing = [];
        if (!script?.id) missing.push("id");
        if (!script?.title) missing.push("title");
        if (!Array.isArray(script?.beats) || !script.beats.length) missing.push("beats");
        const payload = { valid: missing.length === 0, missingFields: missing, script };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.scenario.create_candidate",
      label: "scenario_candidate",
      description: "Write repaired scenario candidate to workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          script: { type: "object" },
        },
        required: ["script"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params.path || "output/scenario.repaired.json";
        const script = params.script || {};
        const art = await workspace.createArtifact(path, JSON.stringify(script, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ ...art, path }) }], details: { path } };
      },
    },
    {
      name: "nyra.resource.inspect_manifest",
      label: "pack_inspect",
      description: "Inspect resource pack manifest in workspace",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/pack.manifest.json";
        if (!(await workspace.exists(path))) {
          const payload = { ok: false, message: "No pack manifest in workspace" };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
        }
        const manifest = JSON.parse(await workspace.readText(path));
        const payload = {
          ok: true,
          id: manifest.id,
          schemaVersion: manifest.schemaVersion,
          assetCount: Object.keys(manifest.assets || {}).length,
          keys: Object.keys(manifest),
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.resource.validate_references",
      label: "pack_validate",
      description: "Validate manifest asset references (lightweight JSON check)",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params?.path || "input/pack.manifest.json";
        const manifest = JSON.parse(await workspace.readText(path));
        const missing = [];
        if (!manifest?.id) missing.push("id");
        if (manifest?.schemaVersion == null) missing.push("schemaVersion");
        const assets = manifest.assets || {};
        const broken = [];
        for (const [key, ref] of Object.entries(assets)) {
          if (typeof ref !== "string" || !ref.trim()) broken.push(key);
        }
        const payload = {
          valid: missing.length === 0 && broken.length === 0,
          missingFields: missing,
          brokenReferences: broken,
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "nyra.resource.create_repaired_candidate",
      label: "pack_repair",
      description: "Write repaired pack manifest candidate to workspace",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          manifest: { type: "object" },
        },
        required: ["manifest"],
        additionalProperties: false,
      },
      async execute(_id, params) {
        const path = params.path || "output/pack.repaired.json";
        const manifest = params.manifest || {};
        const art = await workspace.createArtifact(path, JSON.stringify(manifest, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ ...art, path }) }], details: { path } };
      },
    },
    {
      name: "nyra.settings.read",
      label: "settings_read",
      description: "Read non-secret settings snapshot from workspace copy",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const path = "input/settings.json";
        if (!(await workspace.exists(path))) {
          const payload = { theme: null, note: "No settings copy authorized" };
          return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
        }
        const raw = await workspace.readText(path);
        return { content: [{ type: "text", text: raw }], details: JSON.parse(raw) };
      },
    },
    {
      name: "nyra.settings.describe",
      label: "settings_describe",
      description: "Describe settings keys (no write)",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        const payload = {
          writableViaDirectAction: ["appearance.apply_theme", "proactive.update", "voice.update"],
          agentMayNot: ["settings.write", "sqlite", "indexeddb"],
        };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
      },
    },
    {
      name: "shell.exec",
      label: "shell",
      description: "Forbidden",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
      async execute() {
        throw new UnsupportedRuntimeCapabilityError("Shell is unavailable in Nyra mobile runtime.");
      },
    },
  ];
}

async function inspectCharacter(workspace, signal) {
  if (signal?.aborted) throw Object.assign(new Error("Aborted"), { code: "ABORTED" });
  const raw = await workspace.readText("input/character.json");
  const character = JSON.parse(raw);
  const missingFields = [];
  if (!character?.personality) missingFields.push("personality");
  const payload = {
    valid: missingFields.length === 0,
    missingFields,
    suggestedDefaults: { personality: "温和、克制、具有持续记忆" },
    character,
  };
  return { content: [{ type: "text", text: JSON.stringify(payload) }], details: payload };
}

/**
 * Field-level diff for approval UI.
 * @param {object} before
 * @param {object} after
 */
export function buildCharacterDiff(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  /** @type {{ field: string, before: unknown, after: unknown, changed: boolean }[]} */
  const fields = [];
  for (const key of [...keys].sort()) {
    const b = before?.[key];
    const a = after?.[key];
    const changed = JSON.stringify(b) !== JSON.stringify(a);
    fields.push({ field: key, before: b ?? null, after: a ?? null, changed });
  }
  return {
    createNew: true,
    overwriteExisting: false,
    reversible: true,
    fields,
    summary: fields.filter((f) => f.changed).map((f) => f.field),
  };
}
