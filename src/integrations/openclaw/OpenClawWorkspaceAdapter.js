/**
 * OpenClawWorkspaceAdapter — sandboxed workspace for Adapter runs.
 * OpenClaw never receives raw repo / user-data FS access.
 */
import { mkdir, readFile, writeFile, readdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, normalize, resolve, relative, sep, isAbsolute } from "node:path";

export class OpenClawWorkspaceAdapter {
  /**
   * @param {string} rootDir
   * @param {{ workspaceId?: string }} [opts]
   */
  constructor(rootDir, opts = {}) {
    this.rootDir = resolve(rootDir);
    this.workspaceId = opts.workspaceId || "default";
    /** @type {string[]} */
    this.artifactIds = [];
  }

  async ensureLayout() {
    await mkdir(join(this.rootDir, "input"), { recursive: true });
    await mkdir(join(this.rootDir, "working"), { recursive: true });
    await mkdir(join(this.rootDir, "output"), { recursive: true });
  }

  /**
   * @param {string} relPath
   * @returns {string}
   */
  resolvePath(relPath) {
    if (typeof relPath !== "string" || !relPath.trim()) {
      throw Object.assign(new Error("Workspace path must be a non-empty string"), {
        code: "WORKSPACE_INVALID_PATH",
      });
    }
    // Decode once to catch %2e%2e style escapes, reject absolute paths.
    let decoded = relPath;
    try {
      decoded = decodeURIComponent(relPath);
    } catch {
      decoded = relPath;
    }
    if (isAbsolute(decoded) || /^[A-Za-z]:[\\/]/.test(decoded) || decoded.startsWith("\\\\")) {
      throw Object.assign(new Error(`Absolute workspace path blocked: ${relPath}`), {
        code: "WORKSPACE_PATH_ESCAPE",
      });
    }
    const cleaned = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
    if (cleaned.split("/").some((p) => p === "..")) {
      throw Object.assign(new Error(`Workspace path escape blocked: ${relPath}`), {
        code: "WORKSPACE_PATH_ESCAPE",
      });
    }
    const abs = resolve(this.rootDir, cleaned);
    const rel = relative(this.rootDir, abs);
    if (
      rel.startsWith("..") ||
      rel === ".." ||
      normalize(rel).startsWith(`..${sep}`) ||
      !abs.startsWith(this.rootDir)
    ) {
      throw Object.assign(new Error(`Workspace path escape blocked: ${relPath}`), {
        code: "WORKSPACE_PATH_ESCAPE",
      });
    }
    return abs;
  }

  async readText(relPath) {
    return readFile(this.resolvePath(relPath), "utf8");
  }

  async writeText(relPath, content) {
    const abs = this.resolvePath(relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return abs;
  }

  async list(relPath = ".") {
    const abs = this.resolvePath(relPath === "" ? "." : relPath);
    const ents = await readdir(abs, { withFileTypes: true });
    return ents.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
    }));
  }

  /**
   * @param {string} relPath
   * @param {string} content
   */
  async createArtifact(relPath, content) {
    const abs = await this.writeText(relPath, content);
    const id = relPath.replace(/\\/g, "/");
    this.artifactIds.push(id);
    return { id, absolutePath: abs };
  }

  async exists(relPath) {
    try {
      await access(this.resolvePath(relPath), fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
