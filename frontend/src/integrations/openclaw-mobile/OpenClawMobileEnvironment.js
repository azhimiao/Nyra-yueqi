/**
 * In-memory App Workspace for mobile/browser — no node:fs.
 */
export class OpenClawMobileWorkspace {
  constructor(workspaceId = "mobile") {
    this.workspaceId = workspaceId;
    /** @type {Map<string, string>} */
    this.files = new Map();
    this.artifactIds = [];
  }

  normalize(relPath) {
    if (typeof relPath !== "string" || !relPath.trim()) {
      throw Object.assign(new Error("invalid path"), { code: "WORKSPACE_INVALID_PATH" });
    }
    let decoded = relPath;
    try {
      decoded = decodeURIComponent(relPath);
    } catch {
      /* keep */
    }
    if (/^[A-Za-z]:[\\/]/.test(decoded) || decoded.startsWith("/") || decoded.startsWith("\\\\")) {
      throw Object.assign(new Error(`Absolute path blocked: ${relPath}`), {
        code: "WORKSPACE_PATH_ESCAPE",
      });
    }
    const parts = decoded.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
    if (parts.some((p) => p === "..")) {
      throw Object.assign(new Error(`Path escape blocked: ${relPath}`), {
        code: "WORKSPACE_PATH_ESCAPE",
      });
    }
    return parts.join("/");
  }

  async readText(relPath) {
    const key = this.normalize(relPath);
    if (!this.files.has(key)) throw new Error(`File not found: ${key}`);
    return this.files.get(key);
  }

  async writeText(relPath, content) {
    const key = this.normalize(relPath);
    this.files.set(key, String(content));
    return key;
  }

  async list(relPath = "") {
    const prefix = relPath ? this.normalize(relPath) + "/" : "";
    const names = new Set();
    for (const key of this.files.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        const rest = prefix ? key.slice(prefix.length) : key;
        names.add(rest.split("/")[0]);
      }
    }
    return [...names].map((name) => ({ name, type: "file" }));
  }

  async createArtifact(relPath, content) {
    const id = await this.writeText(relPath, content);
    this.artifactIds.push(id);
    return { id };
  }

  async exists(relPath) {
    try {
      return this.files.has(this.normalize(relPath));
    } catch {
      return false;
    }
  }
}
