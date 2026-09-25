/**
 * P4 Local files — helpers within authorized roots only; preview before write/move.
 * Risk R2. Real OS FS beyond in-memory sandbox = external_pending / host bridge.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";
import {
  getAuthorizedFileRoots,
  isPathAuthorized,
  setAuthorizedFileRoots,
  assertExploreFilesAllowed,
} from "./prefs.js";

/** @type {Map<string, { path: string, content: string, kind: string }>} */
const vfs = new Map();

export function __resetLocalVfsForTests() {
  vfs.clear();
}

export function __seedLocalVfsForTests(entries = []) {
  for (const e of entries) {
    const path = normalize(e.path);
    vfs.set(path, {
      path,
      content: String(e.content || ""),
      kind: String(e.kind || "file"),
    });
  }
}

export function listVfsPaths() {
  return [...vfs.keys()].sort();
}

function normalize(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .trim();
}

/**
 * @param {Record<string, unknown>} input
 */
export function buildFileOpPreview(input = {}) {
  const op = String(input.op || "write").toLowerCase();
  const path = normalize(input.path || "");
  const dest = normalize(input.dest || input.to || "");
  const content = String(input.content || input.draft || "");
  const roots = getAuthorizedFileRoots();

  if (op === "list") {
    const root = normalize(input.root || roots[0] || "");
    const authorized = root ? isPathAuthorized(root, roots) : false;
    const files = authorized
      ? listVfsPaths().filter((p) => p === root || p.startsWith(`${root}/`))
      : [];
    return {
      op,
      exactEffect: authorized
        ? `列出授权目录 ${root} 下 ${files.length} 个文件（不写入）`
        : `拒绝列出未授权目录 ${root || "(empty)"}`,
      authorized,
      files,
      mutation: null,
      error: authorized ? null : "path_not_authorized",
    };
  }

  if (op === "write" || op === "draft") {
    const authorized = isPathAuthorized(path, roots);
    return {
      op,
      exactEffect: authorized
        ? `写入本地文件草稿 ${path}（${content.length} 字，确认前不落盘）`
        : `拒绝写入未授权路径 ${path || "(empty)"}`,
      authorized,
      mutation: authorized
        ? { op: "write", path, content, previous: vfs.get(path)?.content ?? null }
        : null,
      error: authorized ? null : "path_not_authorized",
    };
  }

  if (op === "move") {
    const okFrom = isPathAuthorized(path, roots);
    const okTo = isPathAuthorized(dest, roots);
    const authorized = okFrom && okTo && Boolean(vfs.get(path));
    return {
      op,
      exactEffect: authorized
        ? `移动 ${path} → ${dest}（确认前不执行）`
        : `拒绝移动：${!okFrom || !okTo ? "路径未授权" : "源文件不存在"}`,
      authorized,
      mutation: authorized
        ? { op: "move", from: path, to: dest, content: vfs.get(path)?.content || "" }
        : null,
      error: authorized ? null : okFrom && okTo ? "source_missing" : "path_not_authorized",
    };
  }

  return {
    op,
    exactEffect: `未知文件操作 ${op}`,
    authorized: false,
    mutation: null,
    error: "unknown_op",
  };
}

export const localFilesCapability = {
  id: "local-files",
  label: "本地文件助手",
  risk: "R2",
  description: "仅在授权目录内列出/写草稿/移动文件，确认前只展示预览。",

  validateInput(input = {}) {
    const exploreGate = assertExploreFilesAllowed();
    if (!exploreGate.ok) return { ok: false, reason: exploreGate.reason };

    const op = String(input.op || "write").toLowerCase();
    const allowed = ["list", "write", "draft", "move", "grant-root"];
    if (!allowed.includes(op)) return { ok: false, reason: "unknown_op" };

    if (op === "grant-root") {
      const root = normalize(input.root || input.path || "");
      if (!root || root.includes("..")) return { ok: false, reason: "invalid_root" };
      return {
        ok: true,
        value: { op, root, path: "", dest: "", content: "", characterId: String(input.characterId || "") },
      };
    }

    if (op === "list") {
      return {
        ok: true,
        value: {
          op,
          root: normalize(input.root || input.path || ""),
          path: "",
          dest: "",
          content: "",
          characterId: String(input.characterId || ""),
        },
      };
    }

    if (op === "move") {
      if (!normalize(input.path || "") || !normalize(input.dest || input.to || "")) {
        return { ok: false, reason: "missing_paths" };
      }
    }

    if ((op === "write" || op === "draft") && !normalize(input.path || "")) {
      return { ok: false, reason: "missing_path" };
    }

    return {
      ok: true,
      value: {
        op: op === "draft" ? "write" : op,
        path: normalize(input.path || ""),
        dest: normalize(input.dest || input.to || ""),
        content: String(input.content || input.draft || ""),
        root: normalize(input.root || ""),
        characterId: String(input.characterId || ""),
      },
    };
  },

  plan(intent) {
    const op = String(intent?.input?.op || "write");
    const write = op !== "list";
    return {
      nodes: [
        {
          id: "file1",
          stepId: "file1",
          capabilityId: "local-files",
          label: write ? "预览后写入/移动文件" : "列出授权目录",
          risk: write ? "R2" : "R0",
          requiresApproval: write,
          inputSummary: `文件操作 ${op}`,
          effectSummary: write ? "授权目录内变更" : "只读列表",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    if (String(input.op) === "grant-root") {
      return {
        exactEffect: `授权文件根目录 ${input.root || input.path}（确认后生效）`,
        dataUsed: ["用户选择的目录路径"],
        affects: ["能力偏好 authorizedFileRoots"],
      };
    }
    const preview = buildFileOpPreview(input);
    return {
      exactEffect: preview.exactEffect,
      dataUsed: ["授权目录列表", preview.mutation?.path || preview.mutation?.from || input.root || ""].filter(Boolean),
      affects: preview.authorized && preview.mutation ? ["本地虚拟文件区 / 授权目录"] : ["无写入"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    if (ctx.attemptExternalWrite || ctx.forceRealFs) {
      recordWriteAttempt({
        kind: "external",
        authorized: Boolean(ctx.externalAuthorized),
        detail: "local-files real FS external_pending",
        taskId: ctx.taskId || "",
      });
      if (!ctx.externalAuthorized) {
        return { ok: false, reason: "external_pending", claimedCompleted: false };
      }
    }

    if (validated.value.op === "grant-root") {
      if (!ctx.approved) {
        return {
          ok: false,
          reason: "approval_required",
          preview: { root: validated.value.root },
          claimedCompleted: false,
        };
      }
      const prefs = setAuthorizedFileRoots([...getAuthorizedFileRoots(), validated.value.root]);
      const artifact = {
        id: newId("filegrant"),
        kind: "file-grant",
        capabilityId: "local-files",
        root: validated.value.root,
        roots: prefs.authorizedFileRoots,
        createdAt: nowIso(),
        taskId: ctx.taskId || "",
        undoable: true,
      };
      saveArtifact(artifact);
      recordWriteAttempt({
        kind: "local",
        authorized: true,
        detail: `file-grant:${validated.value.root}`,
        taskId: ctx.taskId || "",
      });
      return {
        ok: true,
        artifactId: artifact.id,
        artifact,
        summary: `已授权目录 ${validated.value.root}`,
        claimedCompleted: true,
      };
    }

    const preview = buildFileOpPreview(validated.value);

    if (validated.value.op === "list") {
      if (preview.error) {
        return { ok: false, reason: preview.error, claimedCompleted: false, preview };
      }
      const artifact = {
        id: newId("filelist"),
        kind: "file-list",
        capabilityId: "local-files",
        files: preview.files,
        createdAt: nowIso(),
        taskId: ctx.taskId || "",
        undoable: false,
      };
      saveArtifact(artifact);
      return {
        ok: true,
        artifactId: artifact.id,
        artifact,
        preview,
        summary: preview.exactEffect,
        claimedCompleted: true,
      };
    }

    if (!ctx.approved) {
      return { ok: false, reason: "approval_required", preview, claimedCompleted: false };
    }

    if (!preview.authorized || !preview.mutation) {
      return {
        ok: false,
        reason: preview.error || "path_not_authorized",
        claimedCompleted: false,
        preview,
      };
    }

    if (preview.mutation.op === "write") {
      vfs.set(preview.mutation.path, {
        path: preview.mutation.path,
        content: preview.mutation.content,
        kind: "file",
      });
    } else if (preview.mutation.op === "move") {
      vfs.delete(preview.mutation.from);
      vfs.set(preview.mutation.to, {
        path: preview.mutation.to,
        content: preview.mutation.content,
        kind: "file",
      });
    }

    const artifact = {
      id: newId("fileop"),
      kind: "file-mutation",
      capabilityId: "local-files",
      op: preview.mutation.op,
      mutation: preview.mutation,
      previewExactEffect: preview.exactEffect,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `file:${preview.mutation.op}:${preview.mutation.path || preview.mutation.to}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      summary: `已执行文件${preview.mutation.op}`,
      claimedCompleted: true,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    if (a?.mutation?.op === "write" && a.mutation.previous == null) {
      vfs.delete(a.mutation.path);
      return { ok: true, action: "delete_file", path: a.mutation.path };
    }
    if (a?.mutation?.op === "write" && a.mutation.previous != null) {
      vfs.set(a.mutation.path, {
        path: a.mutation.path,
        content: a.mutation.previous,
        kind: "file",
      });
      return { ok: true, action: "restore_content", path: a.mutation.path };
    }
    if (a?.mutation?.op === "move") {
      vfs.delete(a.mutation.to);
      vfs.set(a.mutation.from, {
        path: a.mutation.from,
        content: a.mutation.content,
        kind: "file",
      });
      return { ok: true, action: "move_back", from: a.mutation.to, to: a.mutation.from };
    }
    return { ok: true, action: "noop" };
  },
};
