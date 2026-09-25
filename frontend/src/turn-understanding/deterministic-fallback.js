/**
 * Deterministic TurnUnderstanding fallback (plan §7 / §14.1 必测语句).
 * Produces proposals only — never writes calendar or timeline.
 */

import { createTemporalEventV1 } from "../contracts/temporal-event-v1.js";
import { createActionProposalV1 } from "../contracts/action-proposal-v1.js";
import { resolveRelativeTemporal, parseExplicitHour } from "../temporal/resolve.js";

const DEFENSE_RE = /答辩|面试|考试|开题|汇报|presentation|interview|exam/i;
const TOMORROW_RE = /明天|明早|明晚|tomorrow/i;
const AFTERNOON_RE = /下午|afternoon/i;
const WEEKEND_RE = /周末|周六|周日|saturday|sunday|weekend/i;
const MOVIE_RE = /电影|看电影|movie/i;
const MAYBE_RE = /可能|或许|也许|maybe|might|想看/i;
const FOLLOW_ASK_RE = /记得问我|回来告诉我|考完告诉我|结束以后告诉我|ask me (when|after)|remind me to ask/i;
const CALENDAR_CMD_RE = /帮我.{0,12}(加|创建|设).{0,12}(提醒|日历|日程)|加.{0,8}提醒|remind me|add .{0,20}(calendar|reminder)/i;
/** Long-lived reminder preference — Candidate stub only; never a calendar row (§8.3). */
const REMINDER_PREF_RE =
  /重要事件提前(一天)?提醒|提前一天提醒我|大事提前提醒|remind me .+ day before|day-before reminder/i;
const WEATHER_RE = /查(一下)?.{0,8}天气|天气怎么样|weather/i;
const WEB_SEARCH_RE =
  /查一下(?!.*天气)|帮我搜|搜索一下|帮我查(?!.*天气)|look\s*up|search\s+(for|the)\b|联网查|网上查/i;
const SEND_MSG_RE = /帮我发(消息|短信|微信)|发消息告诉|send (a )?message|text (him|her|them)/i;
const SHARED_PLAN_RE = /一起.{0,8}(看|去)|约好|记住/;
const BOUNDARY_RE = /不要再叫|别再叫|别叫我|不要叫我|don't call me|stop calling/i;

/**
 * Stable hash for idempotent proposal ids within a turn.
 * @param {string} text
 */
function hashSlice(text) {
  const s = String(text || "").replace(/\s+/g, " ").slice(0, 120);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(36)}_${s.length}`;
}

/**
 * @param {string} turnId
 * @param {string} kind
 * @param {string} key
 */
function proposalId(turnId, kind, key) {
  return `ap_${hashSlice(`${turnId}|${kind}|${key}`)}`;
}

/**
 * @param {string} turnId
 * @param {string} kind
 * @param {string} key
 */
function eventId(turnId, kind, key) {
  return `evt_${hashSlice(`${turnId}|${kind}|${key}`)}`;
}

/**
 * Pick longest contiguous evidence span that appears in user text.
 * @param {string} userText
 * @param {string[]} candidates
 */
function pickEvidence(userText, candidates) {
  const user = String(userText || "");
  let best = "";
  for (const c of candidates) {
    const span = String(c || "").trim();
    if (span && user.includes(span) && span.length > best.length) best = span;
  }
  return best || (user.trim() ? user.trim().slice(0, 80) : "");
}

/**
 * Rule-based extraction for plan 必测语句 patterns.
 *
 * @param {{
 *   text?: string,
 *   turnId?: string,
 *   snapshot?: object,
 *   scope?: object,
 * }} input
 */
export function interpretDeterministic(input = {}) {
  const text = String(input.text || "").trim();
  const turnId = String(input.turnId || "").trim() || `turn_${hashSlice(text)}`;
  const snapshot = input.snapshot || {};
  const scope = input.scope && typeof input.scope === "object" ? input.scope : {};
  const userId = String(scope.userId || "local").trim() || "local";
  const companionId = String(scope.companionId || scope.characterId || "").trim();
  const relationshipId = String(scope.relationshipId || "").trim();
  const timezone = String(snapshot.timezone || "Asia/Shanghai");

  const temporalMentions = [];
  const eventProposals = [];
  const actionProposals = [];
  const relationshipSignals = [];
  const webRequests = [];
  const memoryCandidates = [];
  const evidenceRefs = [];
  let conversationalIntent = "chat";

  if (!text) {
    return {
      conversationalIntent,
      memoryCandidates,
      temporalMentions,
      eventProposals,
      actionProposals,
      relationshipSignals,
      webRequests,
      evidenceRefs,
      interpreter: "deterministic",
    };
  }

  // 0) Reminder preference — understanding candidate only (no calendar ActionProposal)
  if (REMINDER_PREF_RE.test(text) && !CALENDAR_CMD_RE.test(text)) {
    conversationalIntent = "chat";
    const evidence = pickEvidence(text, [
      text.match(/重要事件提前一天提醒/)?.[0],
      text.match(/提前一天提醒我/)?.[0],
      text.match(/重要事件提前.{0,8}提醒/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    memoryCandidates.push({
      claim: evidence,
      category: "reminder_preference",
      confidence: 0.9,
      evidenceRefs: [evidence],
      promoteToStable: false,
    });
  }

  // 1) “帮我明天下午三点加答辩提醒” — R2 calendar action (check before bare observation)
  if (CALENDAR_CMD_RE.test(text) && DEFENSE_RE.test(text)) {
    conversationalIntent = "task";
    const evidence = pickEvidence(text, [
      text.match(/帮我.{0,24}提醒/)?.[0],
      text.match(/加.{0,12}提醒/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    const resolved = resolveRelativeTemporal(text, snapshot);
    const hour = parseExplicitHour(text);
    temporalMentions.push({
      text: evidence,
      kind: "calendar_intent",
      commitment: true,
      resolved: resolved.ok ? resolved : null,
      evidenceRefs: [evidence],
    });
    actionProposals.push(
      createActionProposalV1({
        proposalId: proposalId(turnId, "calendar", evidence),
        capabilityId: "calendar",
        operation: "create_reminder",
        title: DEFENSE_RE.test(text) && /答辩/.test(text) ? "加答辩提醒" : "加日程提醒",
        parameters: {
          title: /答辩/.test(text) ? "答辩" : "提醒",
          whenText: text.slice(0, 80),
          startsAt: resolved.ok ? resolved.startsAt : undefined,
          hour: hour?.hour,
          minute: hour?.minute,
          timezone,
        },
        risk: "R2",
        explicitness: "explicit_command",
        exactEffect: "写入本地日历一条提醒（需确认后执行）",
        requiresApproval: true,
        reversible: true,
        evidenceRefs: [evidence],
        status: "proposed",
      }),
    );
  } else if (
    DEFENSE_RE.test(text)
    && (TOMORROW_RE.test(text) || /今[天日]|today|下午|晚上/.test(text))
    && !CALENDAR_CMD_RE.test(text)
  ) {
    // 2) “我明天下午答辩” — observation / temporal mention, NO action
    conversationalIntent = "chat";
    const evidence = pickEvidence(text, [
      text.match(/我?明天.{0,12}(答辩|面试|考试)/)?.[0],
      text.match(/明天下午答辩/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    const resolved = resolveRelativeTemporal(text, snapshot);
    temporalMentions.push({
      text: evidence,
      kind: "observation",
      commitment: false,
      period: AFTERNOON_RE.test(text) ? "afternoon" : undefined,
      // Coarse period only — do not invent 15:00
      exactTime: false,
      resolved: resolved.ok ? resolved : null,
      evidenceRefs: [evidence],
    });
    eventProposals.push(
      createTemporalEventV1({
        eventId: eventId(turnId, "observation", evidence),
        userId,
        companionId,
        relationshipId,
        kind: "observation",
        title: /答辩/.test(text) ? "答辩" : /面试/.test(text) ? "面试" : "安排",
        timezone,
        temporalText: evidence,
        status: "proposed",
        confidence: 0.85,
        sourceType: "conversation",
        sourceId: turnId,
        evidenceRefs: [evidence],
        needsFollowUp: false,
        startsAt: resolved.ok ? resolved.startsAt : undefined,
        endsAt: resolved.ok ? resolved.endsAt : undefined,
      }),
    );
  }

  // 3) “答辩后记得问我” — follow_up event
  if (FOLLOW_ASK_RE.test(text) || (DEFENSE_RE.test(text) && /记得问/.test(text))) {
    conversationalIntent = conversationalIntent === "task" ? "mixed" : "chat";
    const evidence = pickEvidence(text, [
      text.match(/答辩后记得问我/)?.[0],
      text.match(/.{0,8}记得问我/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    eventProposals.push(
      createTemporalEventV1({
        eventId: eventId(turnId, "follow_up", evidence),
        userId,
        companionId,
        relationshipId,
        kind: "follow_up",
        title: "答辩后询问结果",
        timezone,
        temporalText: evidence,
        status: "confirmed",
        confidence: 0.92,
        sourceType: "conversation",
        sourceId: turnId,
        evidenceRefs: [evidence],
        needsFollowUp: true,
        followUpPolicy: "ask_once",
      }),
    );
  }

  // 4) “周末可能想看电影” — proposed mention, NOT commitment
  if (WEEKEND_RE.test(text) && MOVIE_RE.test(text)) {
    const shared = SHARED_PLAN_RE.test(text) && !MAYBE_RE.test(text);
    const evidence = pickEvidence(text, [
      text.match(/周末可能想看电影/)?.[0],
      text.match(/周末.{0,16}电影/)?.[0],
      text.match(/我们周六晚上一起看电影/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    temporalMentions.push({
      text: evidence,
      kind: shared ? "shared_plan" : "mention",
      commitment: shared,
      proposedOnly: !shared,
      evidenceRefs: [evidence],
    });
    if (shared) {
      conversationalIntent = "chat";
      eventProposals.push(
        createTemporalEventV1({
          eventId: eventId(turnId, "commitment", evidence),
          userId,
          companionId,
          relationshipId,
          kind: "commitment",
          title: "一起看电影",
          timezone,
          temporalText: evidence,
          status: "confirmed",
          confidence: 0.9,
          sourceType: "conversation",
          sourceId: turnId,
          evidenceRefs: [evidence],
          needsFollowUp: true,
        }),
      );
    } else {
      // Soft mention only — no commitment event that looks like a shared plan
      eventProposals.push(
        createTemporalEventV1({
          eventId: eventId(turnId, "mention", evidence),
          userId,
          companionId,
          relationshipId,
          kind: "observation",
          title: "可能想看电影",
          timezone,
          temporalText: evidence,
          status: "proposed",
          confidence: 0.55,
          sourceType: "conversation",
          sourceId: turnId,
          evidenceRefs: [evidence],
          needsFollowUp: false,
        }),
      );
    }
  }

  // 5) “查一下明天上海天气” — webRequest + R0 weather action
  if (WEATHER_RE.test(text)) {
    conversationalIntent = conversationalIntent === "chat" ? "question" : "mixed";
    const evidence = pickEvidence(text, [
      text.match(/查一下明天上海天气/)?.[0],
      text.match(/查.{0,16}天气/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    const cityMatch = text.match(/(上海|北京|广州|深圳|杭州|成都|[\u4e00-\u9fff]{2,4})(?=天气)/);
    const city = cityMatch?.[1] || "当地";
    webRequests.push({
      requestId: `web_${hashSlice(`${turnId}|weather|${evidence}`)}`,
      kind: "weather",
      query: evidence,
      city,
      whenText: TOMORROW_RE.test(text) ? "明天" : "今天",
      evidenceRefs: [evidence],
    });
    actionProposals.push(
      createActionProposalV1({
        proposalId: proposalId(turnId, "weather", evidence),
        capabilityId: "web.weather",
        operation: "lookup",
        title: `查询${city}天气`,
        parameters: { city, whenText: TOMORROW_RE.test(text) ? "明天" : "今天", query: evidence },
        risk: "R0",
        explicitness: "explicit_command",
        exactEffect: "读取天气信息并带来源与时间（不写日历）",
        requiresApproval: false,
        reversible: true,
        evidenceRefs: [evidence],
        status: "proposed",
      }),
    );
  } else if (WEB_SEARCH_RE.test(text)) {
    // 5b) Generic explicit web search — R0; complete only with WebEvidence when webRetrievalV1 on
    conversationalIntent = conversationalIntent === "chat" ? "question" : "mixed";
    const evidence = pickEvidence(text, [
      text.match(/查一下.{0,40}/)?.[0],
      text.match(/帮我搜.{0,40}/)?.[0],
      text.match(/搜索一下.{0,40}/)?.[0],
      text.match(/网上查.{0,40}/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    const query = evidence.replace(/^(查一下|帮我搜|搜索一下|帮我查|网上查|联网查)\s*/i, "").trim() || evidence;
    webRequests.push({
      requestId: `web_${hashSlice(`${turnId}|search|${evidence}`)}`,
      kind: "search",
      query,
      evidenceRefs: [evidence],
    });
    actionProposals.push(
      createActionProposalV1({
        proposalId: proposalId(turnId, "web_search", evidence),
        capabilityId: "web.search",
        operation: "search",
        title: `联网检索：${query.slice(0, 40)}`,
        parameters: { query, evidence },
        risk: "R0",
        explicitness: "explicit_command",
        exactEffect: "经服务端网关检索并带来源（不写稳定记忆；默认不持久化）",
        requiresApproval: false,
        reversible: true,
        evidenceRefs: [evidence],
        status: "proposed",
      }),
    );
  }

  // 6) “帮我发消息告诉他我会迟到” — R3 external send
  if (SEND_MSG_RE.test(text)) {
    conversationalIntent = "task";
    const evidence = pickEvidence(text, [
      text.match(/帮我发消息告诉他我会迟到/)?.[0],
      text.match(/帮我发消息.{0,24}/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    actionProposals.push(
      createActionProposalV1({
        proposalId: proposalId(turnId, "send_message", evidence),
        capabilityId: "messaging.external",
        operation: "send_message",
        title: "代发消息",
        parameters: { draft: text.slice(0, 200) },
        risk: "R3",
        explicitness: "explicit_command",
        exactEffect: "向外部联系人发送消息（永远需逐项确认，禁止自动发送）",
        requiresApproval: true,
        reversible: false,
        evidenceRefs: [evidence],
        status: "proposed",
      }),
    );
  }

  // Boundary correction (plan table bonus)
  if (BOUNDARY_RE.test(text)) {
    const evidence = pickEvidence(text, [
      text.match(/不要再叫我.{0,12}/)?.[0],
      text.match(/别叫我.{0,12}/)?.[0],
      text,
    ]);
    evidenceRefs.push(evidence);
    relationshipSignals.push({
      kind: "boundary",
      text: evidence,
      supersedePriorAddress: true,
      evidenceRefs: [evidence],
    });
    memoryCandidates.push({
      claim: evidence,
      category: "boundary",
      confidence: 0.95,
      evidenceRefs: [evidence],
    });
  }

  // Dedupe evidence refs
  const uniqueEvidence = [...new Set(evidenceRefs.filter(Boolean))];

  return {
    conversationalIntent,
    memoryCandidates,
    temporalMentions,
    eventProposals,
    actionProposals,
    relationshipSignals,
    webRequests,
    evidenceRefs: uniqueEvidence,
    interpreter: "deterministic",
  };
}
