/**
 * Synthetic fixture image provider (never publishable).
 */
import path from "node:path";
import { writeFixturePng } from "../fixture-art.mjs";

export class FixtureProvider {
  id = "fixture";
  model = "fixture";
  promptTemplateVersion = "v1-fixture";

  /**
   * @param {{ spec: object, outDir: string, count?: number }} args
   */
  async generateIdentity({ spec, outDir, count = 4 }) {
    const paths = [];
    for (let i = 1; i <= count; i++) {
      const out = path.join(outDir, `candidate-0${i}.png`);
      await writeFixturePng(out, {
        kind: "idle",
        characterId: `${spec.characterId}-${i}`,
      });
      paths.push(out);
    }
    return paths;
  }

  /**
   * @param {{ spec: object, lockedPath: string, outDir: string }} args
   */
  async generateCanonical({ spec, outDir }) {
    const map = {
      "full-body.png": "idle",
      "bust.png": "bust",
      "face.png": "face",
      "neutral-reference.png": "idle",
    };
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, kind] of Object.entries(map)) {
      const p = path.join(outDir, name);
      await writeFixturePng(p, { kind, characterId: spec.characterId });
      out[name] = p;
    }
    return out;
  }

  /**
   * @param {{ spec: object, action: string, frameIndex: number, outPath: string }} args
   */
  async generateActionFrame({ spec, action, frameIndex, outPath }) {
    await writeFixturePng(outPath, {
      kind: action,
      characterId: `${spec.characterId}-${action}-${frameIndex}`,
    });
    return outPath;
  }

  /**
   * @param {{ spec: object, part: string, variant: string, outPath: string }} args
   */
  async inpaintFacePart({ spec, part, variant, outPath }) {
    let kind = "face";
    if (part === "eyes") {
      kind = variant === "closed" || variant === "half" ? "eyes_closed" : "eyes_open";
    } else if (part === "mouth") {
      kind = variant === "open" || variant === "medium" ? "mouth_open" : "mouth_closed";
    } else if (part === "brows" || part === "blush") {
      kind = "eyes_closed";
    } else if (part === "base") {
      kind = "face";
    }
    await writeFixturePng(outPath, {
      kind,
      characterId: `${spec.characterId}-${part}-${variant}`,
    });
    return { path: outPath, degraded: true, note: "fixture synthetic face part" };
  }
}
