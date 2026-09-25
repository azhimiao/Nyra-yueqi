/**
 * Execute or gate companion capability intents from chat.
 */

import { checkPermission, ensurePermission } from "../platform/permissions.js";
import { isFeatureEnabled } from "../features/flags.js";
import { getCharacterSync } from "../characters/store.js";
import { postMomentForCharacter } from "../moments/auto-post.js";
import { ensureBuiltinBook, ensureBuiltinTracks } from "../library/builtin-catalog.js";
import { listBooks } from "../phone-shell/phone-data.js";
import { createActionProposalV1 } from "../contracts/action-proposal-v1.js";
import { processActionProposals } from "../turn-understanding/executor.js";
import { CAPABILITY_OPEN_EVENT, CAPABILITY_PERMISSION_EVENT } from "../chat/capability-message.js";

function enLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("en");
}

function speechForOpen(intent, locale) {
  const en = enLocale(locale);
  const map = {
    "read.open": en ? "Okay — opening Read together." : "好，我打开一起看。",
    "imagegen.open": en ? "Drawing needs the image studio — I’ll open it for you." : "画画要去生图那边，我帮你打开。",
    "gift.open": en ? "Opening the gift sheet." : "好，打开送礼。",
    "economy.transfer": en ? "Opening the transfer sheet." : "好，打开转账。",
    "scenario.open": en ? "Opening Scenario." : "好，打开情景剧。",
    "scroll.open": en ? "Opening Scroll." : "好，打开漫卷。",
    "adventure.open": en ? "Opening Adventure." : "好，打开冒险。",
    "cocreate.open": en ? "Opening Co-create." : "好，打开共创。",
    "backup.open": en ? "Backup is in Settings — opening it." : "备份在设置里，我帮你打开。",
  };
  return map[intent.id] || (en ? "Okay, opening that for you." : "好，我帮你打开。");
}

function speechForPermission(intent, locale) {
  const en = enLocale(locale);
  const labels = {
    "location.current": en ? "location" : "定位",
    "screen.capture": en ? "screen capture" : "看屏",
    camera: en ? "camera" : "相机",
    microphone: en ? "microphone" : "麦克风",
    notification: en ? "notifications" : "通知",
  };
  const label = labels[intent.permissionId] || intent.permissionId;
  return en
    ? `I need ${label} permission before I can do that — tap the button below.`
    : `要先拿到「${label}」权限我才能继续，点下面按钮申请一下。`;
}

function dispatchOpen(intent) {
  if (typeof document === "undefined" || !document.dispatchEvent) return;
  document.dispatchEvent(new CustomEvent(CAPABILITY_OPEN_EVENT, {
    detail: {
      intentId: intent.id,
      openApp: intent.openApp || "",
      event: intent.event || "",
    },
  }));
  if (intent.event) {
    document.dispatchEvent(new CustomEvent(intent.event, { detail: { intentId: intent.id } }));
  }
}

/**
 * @param {import("./capability-intents.js").CapabilityIntent} intent
 * @param {{
 *   userText?: string,
 *   companionId?: string,
 *   locale?: string,
 *   collectProviderConfig?: () => object,
 *   storeMediaFile?: Function,
 * }} opts
 */
export async function requestCompanionCapability(intent, opts = {}) {
  if (!intent?.id) {
    return { ok: false, reason: "NO_INTENT", message: "我还不知道要做什么。" };
  }
  const locale = opts.locale || "zh-CN";
  const en = enLocale(locale);
  const companionId = String(opts.companionId || "").trim();

  if (intent.kind === "permission" && intent.permissionId) {
    let state = "prompt";
    try {
      state = await checkPermission(intent.permissionId);
    } catch {
      state = "prompt";
    }
    if (state === "granted") {
      dispatchOpen({ ...intent, openApp: intent.openApp || "pop" });
      return {
        ok: true,
        reason: "permission_already_granted",
        speech: en
          ? "Permission is already on — continuing."
          : "权限已经有了，我继续。",
        message: en ? "Permission is already on — continuing." : "权限已经有了，我继续。",
        metadata: {
          kind: "capability-action",
          mediaType: "activity",
          activityType: "capability",
          capabilityId: intent.id,
          permissionId: intent.permissionId,
          permissionState: "granted",
          openApp: intent.openApp || "",
        },
      };
    }
    return {
      ok: true,
      reason: "permission_required",
      speech: speechForPermission(intent, locale),
      message: speechForPermission(intent, locale),
      metadata: {
        kind: "capability-action",
        mediaType: "activity",
        activityType: "capability",
        capabilityId: intent.id,
        permissionId: intent.permissionId,
        permissionState: state,
        actionLabel: en ? "Request permission" : "申请权限",
        secondaryLabel: intent.openApp ? (en ? "Open settings" : "打开相关页") : "",
        openApp: intent.openApp || "",
        needsPermission: true,
      },
    };
  }

  if (intent.id === "moments.publish") {
    const character = companionId ? getCharacterSync(companionId) : null;
    if (!character) {
      dispatchOpen({ ...intent, openApp: "moments" });
      return {
        ok: true,
        reason: "open_compose",
        speech: en ? "Opening Moments so you can post." : "我打开朋友圈，你可以直接发。",
        message: en ? "Opening Moments so you can post." : "我打开朋友圈，你可以直接发。",
        metadata: {
          kind: "capability-action",
          mediaType: "activity",
          activityType: "capability",
          capabilityId: intent.id,
          openApp: "moments",
          actionLabel: en ? "Open Moments" : "打开朋友圈",
        },
      };
    }
    const wantCompanionPost = /你发|帮我发|替我发|发一条|发个/.test(String(opts.userText || ""));
    if (wantCompanionPost) {
      try {
        const hint = String(opts.userText || "").replace(/.*?(?:发|写).{0,8}(?:朋友圈|动态)/, "").trim();
        const moment = await postMomentForCharacter(character, {
          hint: hint.slice(0, 120),
          shareWithCompanion: true,
          collectProviderConfig: opts.collectProviderConfig,
        });
        if (moment?.content) {
          dispatchOpen({ ...intent, openApp: "moments" });
          return {
            ok: true,
            reason: "moment_published",
            speech: en
              ? "Posted to Moments — go take a look."
              : "已经发到朋友圈了，你去看看～",
            message: en ? "Posted to Moments — go take a look." : "已经发到朋友圈了，你去看看～",
            metadata: {
              kind: "capability-action",
              mediaType: "activity",
              activityType: "capability",
              capabilityId: intent.id,
              openApp: "moments",
              actionLabel: en ? "View Moments" : "查看朋友圈",
              momentId: moment.id || "",
            },
          };
        }
      } catch (error) {
        console.warn("[yueqi.capability] moment post failed", error);
      }
    }
    dispatchOpen({ ...intent, openApp: "moments" });
    return {
      ok: true,
      reason: "open_compose",
      speech: en ? "Opening Moments compose." : "好，打开朋友圈编辑。",
      message: en ? "Opening Moments compose." : "好，打开朋友圈编辑。",
      metadata: {
        kind: "capability-action",
        mediaType: "activity",
        activityType: "capability",
        capabilityId: intent.id,
        openApp: "moments",
        actionLabel: en ? "Open Moments" : "打开朋友圈",
        event: "yueqi:open-moment-compose",
      },
    };
  }

  if (intent.id === "read.open") {
    try {
      await ensureBuiltinBook({ storeMediaFile: opts.storeMediaFile });
    } catch {
      /* shelf may still open */
    }
    const books = listBooks();
    const title = books[0]?.title || "";
    dispatchOpen(intent);
    return {
      ok: true,
      reason: "opened_read",
      speech: title
        ? (en ? `Opening «${title}».` : `好，打开《${title}》。`)
        : (en ? "Opening Read together." : "好，打开一起看。"),
      message: title
        ? (en ? `Opening «${title}».` : `好，打开《${title}》。`)
        : (en ? "Opening Read together." : "好，打开一起看。"),
      metadata: {
        kind: "capability-action",
        mediaType: "activity",
        activityType: "capability",
        capabilityId: intent.id,
        openApp: "read",
        actionLabel: en ? "Open Read" : "打开一起看",
        bookTitle: title,
      },
    };
  }

  if (intent.id === "calendar.remind") {
    const text = String(opts.userText || "").trim();
    const proposal = createActionProposalV1({
      proposalId: `cap-cal-${Date.now().toString(36)}`,
      capabilityId: "calendar",
      operation: "create_reminder",
      title: en ? "Create reminder" : "创建提醒",
      parameters: {
        whenText: text,
        title: text.replace(/提醒我|设个?提醒|加个?(?:日程|日历)/g, "").trim().slice(0, 80) || (en ? "Reminder" : "提醒"),
      },
      risk: "R2",
      explicitness: "explicit_command",
      exactEffect: en
        ? "Create a Nyra calendar reminder after you confirm."
        : "确认后写入月栖日历提醒（不会偷偷写系统日历）。",
      requiresApproval: true,
      reversible: true,
      evidenceRefs: [text.slice(0, 120)],
      status: "proposed",
    });
    try {
      await processActionProposals({
        turnId: `cap-${Date.now().toString(36)}`,
        userText: text,
        companionId,
        actionProposals: [proposal],
        scope: { companionId, userId: "local" },
      }, { sourceText: text });
    } catch (error) {
      console.warn("[yueqi.capability] calendar proposal failed", error);
      dispatchOpen(intent);
      return {
        ok: false,
        reason: "calendar_proposal_failed",
        speech: en ? "I couldn’t create the reminder card — open Calendar to add it." : "提醒卡片没做成，你也可以在日历里加。",
        message: en ? "I couldn’t create the reminder card — open Calendar to add it." : "提醒卡片没做成，你也可以在日历里加。",
        metadata: {
          kind: "capability-action",
          mediaType: "activity",
          activityType: "capability",
          capabilityId: intent.id,
          openApp: "calendar",
          actionLabel: en ? "Open Calendar" : "打开日历",
        },
      };
    }
    return {
      ok: true,
      reason: "calendar_pending_approval",
      speech: en
        ? "I drafted a reminder — confirm the card below and I’ll save it."
        : "我拟好了提醒，点下面卡片确认后才会写入。",
      message: en
        ? "I drafted a reminder — confirm the card below and I’ll save it."
        : "我拟好了提醒，点下面卡片确认后才会写入。",
      metadata: {
        kind: "capability-action",
        mediaType: "activity",
        activityType: "capability",
        capabilityId: intent.id,
        proposalId: proposal.proposalId,
        needsConfirm: true,
      },
    };
  }

  if (intent.id === "web.search") {
    if (!isFeatureEnabled("webRetrievalV1")) {
      dispatchOpen({ ...intent, openApp: "assist" });
      return {
        ok: true,
        reason: "search_unavailable",
        speech: en
          ? "Web search isn’t on in this build. I can open Assist for you, or you can paste what you found."
          : "这版还没开联网搜索。我可以打开助手，或者你把查到的贴给我。",
        message: en
          ? "Web search isn’t on in this build. I can open Assist for you, or you can paste what you found."
          : "这版还没开联网搜索。我可以打开助手，或者你把查到的贴给我。",
        metadata: {
          kind: "capability-action",
          mediaType: "activity",
          activityType: "capability",
          capabilityId: intent.id,
          openApp: "assist",
          actionLabel: en ? "Open Assist" : "打开助手",
        },
      };
    }
    dispatchOpen(intent);
    return {
      ok: true,
      reason: "search_routed",
      speech: en ? "Opening Assist to look that up." : "好，打开助手帮你查。",
      message: en ? "Opening Assist to look that up." : "好，打开助手帮你查。",
      metadata: {
        kind: "capability-action",
        mediaType: "activity",
        activityType: "capability",
        capabilityId: intent.id,
        openApp: "assist",
        actionLabel: en ? "Open Assist" : "打开助手",
      },
    };
  }

  // Generic open / event
  try {
    ensureBuiltinTracks();
  } catch {
    /* ignore */
  }
  dispatchOpen(intent);
  const speech = speechForOpen(intent, locale);
  return {
    ok: true,
    reason: "opened",
    speech,
    message: speech,
    metadata: {
      kind: "capability-action",
      mediaType: "activity",
      activityType: "capability",
      capabilityId: intent.id,
      openApp: intent.openApp || "",
      event: intent.event || "",
      actionLabel: en ? "Open" : "打开",
    },
  };
}

/** Re-export for click handlers */
export { ensurePermission, CAPABILITY_PERMISSION_EVENT };
