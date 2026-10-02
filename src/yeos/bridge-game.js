/**
 * NyraGame host bridge — permission-gated API for sideloaded games
 */

import { APP_VERSION, DEFAULT_PROMPT_SYSTEM } from "../constants.js";
import {
  PermissionDeniedError,
  checkPermission,
} from "./kinds.js";
import {
  getInstalledGame,
  grantGamePermission,
} from "./registry-games.js";
import { loadGameSave, saveGameSave } from "./saves.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { emitAppEvent } from "../world/app-events.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { t } from "../i18n/index.js";

/**
 * Minimal role package — persona system prompt only (no API keys).
 * @param {object|null} character
 * @param {{ activationContext?: string }} [opts]
 */
export function buildRoleLightPackage(character, opts = {}) {
  if (!character) throw new Error("角色不存在");
  const system = String(character.profile?.promptSystem || DEFAULT_PROMPT_SYSTEM).trim()
    || DEFAULT_PROMPT_SYSTEM;
  const context = String(opts.activationContext || "").trim();
  const messages = [{ role: "system", content: system }];
  if (context) {
    messages.push({ role: "system", content: context.slice(0, 800) });
  }
  return {
    characterId: character.id,
    name: character.name,
    avatar: resolveCharacterAvatarUrl(character),
    messages,
  };
}

/**
 * @param {object|null} character
 * @param {{ activationContext?: string }} [opts]
 */
export function buildRoleFullPackage(character, opts = {}) {
  const base = buildRoleLightPackage(character, opts);
  const dev = String(character.profile?.promptDeveloper || "").trim();
  if (dev) {
    base.messages.push({ role: "system", content: dev.slice(0, 1200) });
  }
  return base;
}

/**
 * @param {{
 *   pkgId: string,
 *   permissions?: string[],
 *   grantedPermissions?: string[],
 *   getCharacters?: () => Promise<object[]>|object[],
 *   getPlayer?: () => Promise<object|null>|object|null,
 *   callModel?: (input: { characterId?: string, messages: object[], appId?: string }) => Promise<{ content: string, model?: string }>,
 *   buildRolePackage?: (characterId: string, opts?: object) => Promise<object>|object,
 *   save?: (data: unknown) => Promise<void>|void,
 *   load?: () => Promise<unknown|null>|unknown,
 *   recordEvent?: (input: { characterIds: string[], summary: string }) => Promise<void>|void,
 *   onSessionCompleted?: (detail: { appId: string, pkgId: string, summary: string, characterIds: string[], score?: number }) => Promise<void>|void,
 *   requestPermissionUi?: (permissionId: string, meta?: object) => Promise<boolean>,
 *   onClose?: () => void,
 *   setChrome?: (opts: object) => Promise<void>|void,
 * }} deps
 */
export function createNyraGameBridge(deps) {
  const pkgId = String(deps.pkgId || "").trim();
  const declared = Array.isArray(deps.permissions) ? deps.permissions : [];

  function currentGranted() {
    if (Array.isArray(deps.grantedPermissions)) return deps.grantedPermissions;
    return getInstalledGame(pkgId)?.grantedPermissions || [];
  }

  async function ensure(permissionId) {
    if (!declared.includes(permissionId)) {
      throw new PermissionDeniedError(permissionId, "此游戏未声明该权限");
    }
    if (checkPermission(currentGranted(), permissionId)) return;
    const allowed = deps.requestPermissionUi
      ? await deps.requestPermissionUi(permissionId, {
        pkgId,
        game: getInstalledGame(pkgId),
      })
      : false;
    if (allowed) {
      grantGamePermission(pkgId, permissionId);
      return;
    }
    throw new PermissionDeniedError(permissionId);
  }

  async function resolveCharacters() {
    const rows = await Promise.resolve(deps.getCharacters?.() || []);
    return (rows || []).map((ch) => ({
      id: String(ch.id || ""),
      name: String(ch.name || ch.alias || "角色"),
      avatar: resolveCharacterAvatarUrl(ch),
      subtitle: String(ch.alias || ch.profile?.fields?.[1] || "").slice(0, 40),
    })).filter((ch) => ch.id);
  }

  async function findCharacter(characterId) {
    const rows = await Promise.resolve(deps.getCharacters?.() || []);
    return (rows || []).find((ch) => String(ch.id) === String(characterId)) || null;
  }

  const appId = `game:${pkgId}`;

  const bridge = {
    version: APP_VERSION,
    pkgId,

    async setChrome(opts = {}) {
      await Promise.resolve(deps.setChrome?.(opts));
    },

    async close() {
      await Promise.resolve(deps.onClose?.());
    },

    async getPlayerProfile() {
      await ensure("profile.read");
      const player = await Promise.resolve(deps.getPlayer?.() || null);
      if (!player) return { name: "你" };
      return {
        name: String(player.name || player.displayName || "你"),
        avatarUrl: String(player.avatarUrl || ""),
      };
    },

    async listCharacters() {
      await ensure("character.list");
      return resolveCharacters();
    },

    async getRoleLightPackage(characterId, opts = {}) {
      await ensure("character.package.light");
      if (typeof deps.buildRolePackage === "function") {
        return Promise.resolve(deps.buildRolePackage(characterId, { ...opts, mode: "light" }));
      }
      const character = await findCharacter(characterId);
      return buildRoleLightPackage(character, opts);
    },

    async getRoleFullPackage(characterId, opts = {}) {
      await ensure("character.package.full");
      if (typeof deps.buildRolePackage === "function") {
        return Promise.resolve(deps.buildRolePackage(characterId, { ...opts, mode: "full" }));
      }
      const character = await findCharacter(characterId);
      return buildRoleFullPackage(character, opts);
    },

    async callLLM(input = {}) {
      await ensure("llm.character");
      if (typeof deps.callModel !== "function") {
        throw new Error(t("errors.noApiKey"));
      }
      const characterId = String(input.characterId || "").trim();
      if (!characterId) throw new Error("缺少 characterId");
      const messages = Array.isArray(input.messages) ? input.messages : [];
      const result = await deps.callModel({
        characterId,
        messages,
        appId,
      });
      return {
        content: String(result?.content || ""),
        model: result?.model,
      };
    },

    async callGlobalLLM(input = {}) {
      await ensure("llm.global");
      if (typeof deps.callModel !== "function") {
        throw new Error(t("errors.noApiKey"));
      }
      const messages = Array.isArray(input.messages) ? input.messages : [];
      const result = await deps.callModel({
        messages,
        appId,
      });
      return {
        content: String(result?.content || ""),
        model: result?.model,
      };
    },

    async saveGame(data) {
      await ensure("game.save");
      if (typeof deps.save === "function") {
        await Promise.resolve(deps.save(data));
        return;
      }
      saveGameSave(pkgId, data);
    },

    async loadGame() {
      await ensure("game.save");
      if (typeof deps.load === "function") {
        return Promise.resolve(deps.load());
      }
      return loadGameSave(pkgId);
    },

    async recordGameEvent(input = {}) {
      await ensure("game.event");
      const summary = String(input.summary || "").trim();
      if (!summary) throw new Error("summary 不能为空");
      const payload = {
        characterIds: Array.isArray(input.characterIds) ? input.characterIds.map(String) : [],
        summary: summary.slice(0, 240),
      };
      if (typeof deps.recordEvent === "function") {
        await Promise.resolve(deps.recordEvent(payload));
      } else {
        appendCohabitEvent({
          appId,
          kind: "game.finish",
          summary: payload.summary,
          characterId: payload.characterIds[0] || "",
          meta: { pkgId, characterIds: payload.characterIds },
        });
      }

      /** @type {{ appId: string, pkgId: string, summary: string, characterIds: string[], score?: number }} */
      const sessionDetail = {
        appId,
        pkgId,
        summary: payload.summary,
        characterIds: payload.characterIds,
      };
      if (input.score != null && Number.isFinite(Number(input.score))) {
        sessionDetail.score = Math.floor(Number(input.score));
      }
      if (typeof deps.onSessionCompleted === "function") {
        await Promise.resolve(deps.onSessionCompleted(sessionDetail));
      } else {
        emitAppEvent("game.session.completed", sessionDetail);
      }
    },
  };

  return bridge;
}

/**
 * Dispatch bridge method from postMessage proxy.
 * @param {ReturnType<typeof createNyraGameBridge>} bridge
 * @param {string} method
 * @param {unknown[]} args
 */
export async function invokeNyraGameMethod(bridge, method, args = []) {
  const fn = bridge?.[method];
  if (typeof fn !== "function") {
    throw new Error(`未知方法：${method}`);
  }
  return fn(...args);
}
