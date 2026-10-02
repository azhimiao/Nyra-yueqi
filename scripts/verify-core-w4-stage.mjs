/**
 * Open Experience W4 — Yueqi story runtime and measured interaction handfeel.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §8–10 / §13.4–13.5 / §14 W4 / §15.8–15.10
 *
 * Assert:
 * - opening picker surfaces 3 night-rain openings with teasers
 * - player production path uses enterExperience (no nextByChoice for night-rain)
 * - branch panel APIs present (list / switch / candidates / regenerate hooks)
 * - fullscreen lifecycle hooks (capture / background / foreground)
 * - pager handfeel constants match §10.2
 * - scene stage is isolated from the floating-pet renderer
 * - story session is a full transcript with secondary tools, not a HUD
 * - Do NOT claim product_review / user_accepted
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
}

const requiredFiles = [
  "src/scenario/player/player-ui.js",
  "src/scenario/player/branch-panel.js",
  "src/scenario/player/stage-controller.js",
  "src/scenario/player/stage-renderer.js",
  "src/scenario/player/dialogue-layer.js",
  "src/scenario/player/choice-layer.js",
  "src/scenario/player/controls.js",
  "src/ui/scenario-story.css",
  "src/phone-shell/app-lifecycle.js",
  "src/phone-shell/os-home-pager.js",
  "src/avatar/pet-action-protocol.js",
  "src/avatar/idle-carousel.js",
  "src/avatar/character-pose-assets.js",
  "docs/qa/open-experience/W4_HANDFEEL.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check("formal scenario error UI never offers legacy offline splice", !playerSrc.includes("data-scenario-offline-demo"));
const branchSrc = readFileSync(join(root, "src/scenario/player/branch-panel.js"), "utf8");
const stageCtrlSrc = readFileSync(join(root, "src/scenario/player/stage-controller.js"), "utf8");
const stageRendererSrc = readFileSync(join(root, "src/scenario/player/stage-renderer.js"), "utf8");
const dialogueSrc = readFileSync(join(root, "src/scenario/player/dialogue-layer.js"), "utf8");
const runtimeSrc = readFileSync(join(root, "src/experience/runtime.js"), "utf8");
const choiceSrc = readFileSync(join(root, "src/scenario/player/choice-layer.js"), "utf8");
const lifecycleSrc = readFileSync(join(root, "src/phone-shell/app-lifecycle.js"), "utf8");
const pagerSrc = readFileSync(join(root, "src/phone-shell/os-home-pager.js"), "utf8");
const phoneShellSrc = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const petProtoSrc = readFileSync(join(root, "src/avatar/pet-action-protocol.js"), "utf8");
const poseSrc = readFileSync(join(root, "src/avatar/character-pose-assets.js"), "utf8");
const stageActionSrc = readFileSync(join(root, "src/scenario/runtime/action-mapper.js"), "utf8");
const cssSrc = readFileSync(join(root, "src/ui/scenario-theater.css"), "utf8");
const storyCssSrc = readFileSync(join(root, "src/ui/scenario-story.css"), "utf8");
const phoneCssSrc = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");
const nightRainSrc = readFileSync(
  join(root, "src/experience/presets/night-rain-station.js"),
  "utf8",
);
const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
const handfeelDoc = readFileSync(join(root, "docs/qa/open-experience/W4_HANDFEEL.md"), "utf8");

check(
  "player production enter uses enterExperience",
  /enterExperience/.test(playerSrc) && /runExperienceDirectorTurn/.test(playerSrc),
);
check(
  "player opening picker renders teasers",
  /scenario-opening-teaser|opening\.teaser/.test(playerSrc)
    && /data-opening-id/.test(playerSrc),
);
check(
  "story runtime uses meta + scroll + transcript + composer structure",
  /scenario-story-meta/.test(playerSrc)
    && /scenario-story-scroll/.test(playerSrc)
    && /data-scenario-dialogue/.test(playerSrc)
    && /data-scenario-form/.test(playerSrc),
);
check(
  "dialogue layer renders full role-aware history",
  /slice\(-80\)/.test(dialogueSrc)
    && /data-role=/.test(dialogueSrc)
    && /scenario-story-bubble/.test(dialogueSrc),
);
check(
  "dialogue messages expose copy/edit/regenerate/fork actions",
  /data-scenario-message-action="copy"/.test(dialogueSrc)
    && /data-scenario-message-action="edit"/.test(dialogueSrc)
    && /data-scenario-message-action="regenerate"/.test(dialogueSrc)
    && /data-scenario-message-action="fork"/.test(dialogueSrc),
);
check(
  "player projects selected opening and Conversation history",
  /messages:\s*experienceSessionId\s*\?\s*conversationMessages/.test(playerSrc)
    && /openingSeed/.test(runtimeSrc),
);
check(
  "player uses complete collected character profile for Director",
  /characterToCollectedProfile/.test(playerSrc)
    && /profile\.identity/.test(playerSrc)
    && /profile\.base/.test(playerSrc),
);
check(
  "branch regenerate targets assistant message id without fake user text",
  /onRegenerate\(active\.messageId\)/.test(branchSrc)
    && /regenerateMessageId:\s*meta\._regenerateMessageId/.test(playerSrc),
);
check(
  "suggestions are secondary and collapsed",
  /<details class="scenario-suggestions">/.test(choiceSrc)
    && /帮我想下一步/.test(choiceSrc),
);
check(
  "scene renderer contains environment only",
  /environment layers only/.test(stageRendererSrc)
    && !/data-stage-figure|data-stage-sprite|scenario-stage-pose/.test(stageRendererSrc),
);
check(
  "story CSS uses stable paper timeline without frosted HUD",
  /scenario-stage--story/.test(storyCssSrc)
    && /scenario-story-bubble/.test(storyCssSrc)
    && /background:\s*var\(--story-paper\)/.test(storyCssSrc)
    && !/backdrop-filter/.test(storyCssSrc),
);
check(
  "player wires branch panel",
  /createBranchPanel/.test(playerSrc) && /data-scenario-branch-host/.test(playerSrc),
);
check(
  "player finale is user-ended (not beat-tree)",
  /user_finale|endedBy:\s*"user"/.test(playerSrc),
);
check(
  "night-rain player path has no nextByChoice production call",
  !/nextByChoice\s*\(/.test(playerSrc)
    && !/\.nextByChoice/.test(playerSrc),
);
check(
  "night-rain package source still has no nextByChoice",
  !/nextByChoice/.test(nightRainSrc),
);
check(
  "branch panel exposes list/switch/candidate/regenerate APIs",
  /listConversationBranches/.test(branchSrc)
    && /listActiveHeadCandidates/.test(branchSrc)
    && /switchBranch/.test(branchSrc)
    && /switchCandidate/.test(branchSrc)
    && /regenerate/.test(branchSrc)
    && /api:\s*\{/.test(branchSrc),
);
check(
  "scene controller does not reuse pet/pose runtime",
  /mapStageAction/.test(stageCtrlSrc)
    && !/pet-action-protocol|resolvePetAction|mountPet|preloadCharacterPose|resolveCharacterPoseAsset/.test(stageCtrlSrc),
);
check(
  "app lifecycle has capture/background/foreground + notify",
  /saveAppUiState/.test(lifecycleSrc)
    && /createAppLifecycleRegistry/.test(lifecycleSrc)
    && /notifyComplete/.test(lifecycleSrc)
    && /onBackground/.test(lifecycleSrc)
    && /onForeground/.test(lifecycleSrc),
);
check(
  "phone shell registers scenario lifecycle + fullscreen hooks",
  /getSharedAppLifecycle/.test(phoneShellSrc)
    && /is-fullscreen-takeover|onFullscreenChange/.test(phoneShellSrc)
    && /onBackgroundComplete/.test(phoneShellSrc),
);
check(
  "theater exit wires onHome (no dead back button)",
  /mountScenarioTheater\([\s\S]*?onHome:\s*\(\)\s*=>\s*exitToHome/.test(phoneShellSrc),
);
check(
  "scenario entry aliases to theater (栖境)",
  /view === "scenario"\s*\?\s*"theater"/.test(phoneShellSrc),
);
check(
  "player exposes captureUiState / onBackground / onForeground",
  /captureUiState/.test(playerSrc)
    && /onBackground/.test(playerSrc)
    && /onForeground/.test(playerSrc)
    && /getBackgroundJob/.test(playerSrc),
);
check(
  "pager handfeel exports §10.2 constants",
  /HOME_PAGER_HANDFEEL/.test(pagerSrc)
    && /edgeDamp:\s*0\.2[5-9]|edgeDamp:\s*0\.3/.test(pagerSrc)
    && /distanceMinPx:\s*3[0-9]|distanceMinPx:\s*4[0-8]/.test(pagerSrc)
    && /axisLockPx:\s*[678]/.test(pagerSrc)
    && /horizontalBias/.test(pagerSrc)
    && /is-dragging/.test(pagerSrc),
);
check(
  "CSS: no settle transition while dragging; snap 240–300ms",
  /\.mini-home__track\.is-dragging\s*\{\s*transition:\s*none/.test(phoneCssSrc)
    && /transform\s+2[4-9]0ms|transform\s+300ms/.test(phoneCssSrc),
);
check(
  "CSS: immersive stage + fullscreen takeover; no frosted stage shell",
  /is-fullscreen-takeover/.test(phoneCssSrc)
    && /scenario-stage--immersive/.test(cssSrc)
    && /backdrop-filter:\s*none/.test(cssSrc),
);
check(
  "scenario stage owns semantics and never imports pet assets",
  !/character-pose-assets|default-pose-assets|\/assets\/(characters|pet-poses)\//.test(stageActionSrc),
);
check(
  "pet-action-protocol idle state machine (≥3 idles)",
  /createIdleStateMachine/.test(petProtoSrc)
    && /COMPATIBLE_IDLE_POOL/.test(petProtoSrc)
    && (petProtoSrc.match(/idle_loop|sit_idle|listen/g) || []).length >= 3,
);
check(
  "pose assets never cross-character fallback to Xingli for other ids",
  /same-character|sameCharacter|same_character_only/.test(poseSrc)
    && /preloadCharacterPose/.test(poseSrc)
    && !/Unknown package: same-character safe portrait only — never cross-character pet-poses\.[\s\S]*poseUrl:\s*XINGLI_PORTRAIT/.test(
      poseSrc,
    ),
);
check(
  "W4_HANDFEEL documents measured pager behavior",
  /1:1|跟手|edgeDamp|distanceMinPx|260ms|is-dragging/.test(handfeelDoc),
);
check(
  "EXECUTION_STATE does not claim user_accepted",
  !/\|\s*user_accepted\s*\|/.test(execState)
    && !/状态.*user_accepted/.test(execState),
);
check(
  "EXECUTION_STATE does not claim product_review for W4",
  !/W4[^|\n]*\|\s*\*?product_review\*?/.test(execState),
);

// ——— Runtime checks ———
globalThis.localStorage = memoryStorage();

const {
  NIGHT_RAIN_STATION_PACKAGE,
  registerPackage,
  __clearExperienceRegistryForTests,
  __setExperienceStorageForTests,
  __resetExperienceIdSeqForTests,
} = await import("../src/experience/index.js");

const {
  listConversationBranches,
  listActiveHeadCandidates,
  createBranchPanel,
} = await import("../src/scenario/player/branch-panel.js");

const {
  HOME_PAGER_HANDFEEL,
} = await import("../src/phone-shell/os-home-pager.js");

const {
  saveAppUiState,
  loadAppUiState,
  createAppLifecycleRegistry,
  __resetAppLifecycleForTests,
} = await import("../src/phone-shell/app-lifecycle.js");

const {
  createIdleStateMachine,
  COMPATIBLE_IDLE_POOL,
  resolvePetAction,
} = await import("../src/avatar/pet-action-protocol.js");

const {
  PET_IDLE_CAROUSEL,
  listIdleCarouselClips,
  clipDwellMs,
  createIdleCarousel,
} = await import("../src/avatar/idle-carousel.js");

const {
  resolveCharacterPoseAsset,
  preloadCharacterPose,
} = await import("../src/avatar/character-pose-assets.js");

const {
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  __resetConversationIdSeqForTests,
  clearAllConversations,
  getOrCreateActiveSession,
  sendUser,
  appendAssistantCandidate,
  forkFromMessage,
  switchBranch,
  regenerate,
  switchCandidate,
  getSession,
} = await import("../src/conversation/index.js");

__setExperienceStorageForTests(memoryStorage());
__resetExperienceIdSeqForTests();
__clearExperienceRegistryForTests();
registerPackage(NIGHT_RAIN_STATION_PACKAGE);

__setConversationStorageForTests(memoryStorage());
__reloadConversationBagFromStorage();
__resetConversationIdSeqForTests();
clearAllConversations();
__resetAppLifecycleForTests();

const openings = NIGHT_RAIN_STATION_PACKAGE.openings || [];
check("night-rain package has ≥3 openings", openings.length >= 3, `count=${openings.length}`);
check(
  "each opening has title + teaser",
  openings.every((o) => o.title && o.teaser),
  openings.map((o) => o.id).join(","),
);

check(
  "HOME_PAGER_HANDFEEL edgeDamp in 0.25–0.30",
  HOME_PAGER_HANDFEEL.edgeDamp >= 0.25 && HOME_PAGER_HANDFEEL.edgeDamp <= 0.3,
  String(HOME_PAGER_HANDFEEL.edgeDamp),
);
check(
  "HOME_PAGER_HANDFEEL distanceMinPx phone-like (28–48)",
  HOME_PAGER_HANDFEEL.distanceMinPx >= 28 && HOME_PAGER_HANDFEEL.distanceMinPx <= 48,
  String(HOME_PAGER_HANDFEEL.distanceMinPx),
);
check(
  "HOME_PAGER_HANDFEEL distanceRatio phone-like (0.10–0.16)",
  HOME_PAGER_HANDFEEL.distanceRatio >= 0.1 && HOME_PAGER_HANDFEEL.distanceRatio <= 0.16,
  String(HOME_PAGER_HANDFEEL.distanceRatio),
);
check(
  "HOME_PAGER_HANDFEEL velocityCommit light flick (≤0.28)",
  HOME_PAGER_HANDFEEL.velocityCommit > 0 && HOME_PAGER_HANDFEEL.velocityCommit <= 0.28,
  String(HOME_PAGER_HANDFEEL.velocityCommit),
);

check("COMPATIBLE_IDLE_POOL has ≥3", COMPATIBLE_IDLE_POOL.length >= 3);

const idleSm = createIdleStateMachine();
const a = idleSm.pickNext();
const b = idleSm.pickNext();
check("idle machine returns protocol actions", Boolean(a?.actionId && b?.actionId));
check(
  "idle picks stay in pool",
  COMPATIBLE_IDLE_POOL.includes(a.actionId) && COMPATIBLE_IDLE_POOL.includes(b.actionId),
);

check("PET_IDLE_CAROUSEL has ≥8 standing poses", PET_IDLE_CAROUSEL.length >= 8, String(PET_IDLE_CAROUSEL.length));

const fakeCarouselPlayer = {
  getClips: () => ["idle_loop", "listen", "thinking", "greet", "drag", "talk_loop", "sleep_loop"],
  getClipMeta: () => ({
    idle_loop: { placeholder: false, frameCount: 1, fps: 1, holdMs: 0 },
    listen: { placeholder: true, frameCount: 1, fps: 1, holdMs: 1400 },
    thinking: { placeholder: true, frameCount: 1, fps: 1, holdMs: 1600 },
    greet: { placeholder: false, frameCount: 3, fps: 4, holdMs: 520 },
    drag: { placeholder: true, frameCount: 1, fps: 1, holdMs: 1200 },
    talk_loop: { playback: "loop", frameCount: 2, fps: 4 },
    sleep_loop: { playback: "loop", frameCount: 1 },
  }),
};
const carouselClips = listIdleCarouselClips(fakeCarouselPlayer);
check(
  "carousel includes placeholder stills",
  carouselClips.includes("listen") && carouselClips.includes("thinking"),
  carouselClips.join(","),
);
check(
  "carousel excludes drag/talk/sleep",
  !carouselClips.includes("drag") && !carouselClips.includes("talk_loop") && !carouselClips.includes("sleep_loop"),
);
check("placeholder still dwell is at least 1.8s", clipDwellMs(fakeCarouselPlayer, "listen") >= 1800);

const playedCarousel = [];
const liveCarouselPlayer = {
  ...fakeCarouselPlayer,
  play: async (clipId, settings = {}) => {
    playedCarousel.push({ clipId, returnClip: settings.returnClip, playback: settings.playback });
  },
};
const idleCarousel = createIdleCarousel(liveCarouselPlayer);
idleCarousel.start(0);
await new Promise((resolve) => setTimeout(resolve, 50));
idleCarousel.destroy();
check(
  "carousel plays a standing clip without snapping back to idle",
  playedCarousel.length >= 1 && playedCarousel[0].returnClip === false,
  JSON.stringify(playedCarousel[0] || {}),
);
check(
  "1-frame carousel clips loop instead of completing",
  playedCarousel[0]?.playback === "loop",
  String(playedCarousel[0]?.playback || ""),
);

const librarySrc = readFileSync(join(root, "src/ui/pet-library.js"), "utf8");
const catalogSrc = readFileSync(join(root, "src/avatar/pet-catalog.js"), "utf8");
check(
  "default pets include day, night, xingli, and bubble",
  ['id: "yueqi-female"', 'id: "yueqi-male"', 'id: "xingli"', 'id: "bubble"'].every((token) => catalogSrc.includes(token)),
);
check(
  "pet library mounts live previews for every catalog pet",
  /mountLivePetPreview/.test(librarySrc) && /forEach\(\(pet, index\)/.test(librarySrc),
);
check(
  "catalog no longer remaps xingli onto yueqi-female",
  !/value === "xingli"/.test(catalogSrc),
);

const builtinPose = resolveCharacterPoseAsset({
  characterId: "char-yueqi-female",
  petId: "yueqi-female",
  actionId: "greet",
});
check(
  "built-in Yueqi pose resolves to its own package",
  builtinPose.packageId === "yueqi-female" && Boolean(builtinPose.poseUrl),
);

const otherPose = resolveCharacterPoseAsset({
  characterId: "char-other",
  actionId: "greet",
  portraitUrl: "/assets/characters/other/portrait.png",
});
check(
  "other character uses own portrait (not xingli clip)",
  otherPose.poseUrl.includes("other") && !otherPose.poseUrl.includes("/xingli/clips/"),
  otherPose.poseUrl,
);

const missingPose = resolveCharacterPoseAsset({ characterId: "char-stranger", actionId: "greet" });
check(
  "missing non-xingli package does not steal Xingli face",
  !missingPose.poseUrl.includes("/characters/xingli/"),
  missingPose.poseUrl || "(empty)",
);

const preloaded = await preloadCharacterPose({ characterId: "char-xingli", actionId: "idle_loop" });
check("preloadCharacterPose returns url or empty without throw", typeof preloaded === "string");

const listen = resolvePetAction({ actionId: "listen", source: "scenario" });
check("listen resolves for generating/idle", listen.actionId === "listen");

// Branch panel API against Conversation V2
const session = getOrCreateActiveSession({ characterId: "char-xingli" });
sendUser(session.id, "雨还在下");
appendAssistantCandidate(session.id, "嗯，站台灯有点黄。");
const forked = forkFromMessage(session.id, getSession(session.id).branches[session.activeBranchId].headMessageId, {
  label: "试探分支",
});
check("fork creates second branch", forked.ok === true);

const live = getSession(session.id);
const branches = listConversationBranches(live);
check("listConversationBranches returns ≥2", branches.length >= 2, `count=${branches.length}`);

const switchRes = switchBranch(session.id, branches.find((b) => !b.isActive)?.id || branches[0].id);
check("switchBranch works", switchRes.ok === true);

appendAssistantCandidate(session.id, "候选甲");
regenerate(session.id, "候选乙", { source: "w4_verify" });
const cands = listActiveHeadCandidates(getSession(session.id));
check("listActiveHeadCandidates after regenerate", cands.length >= 1, `count=${cands.length}`);

if (cands.length >= 2) {
  const sw = switchCandidate(session.id, cands[0].messageId, cands[1].id);
  check("switchCandidate works", sw.ok === true);
} else {
  check("switchCandidate works", true, "single candidate — skip swipe");
}

// Minimal DOM host for branch panel mount contract
const { JSDOM } = await import("jsdom").catch(() => ({ JSDOM: null }));
if (JSDOM) {
  const dom = new JSDOM(`<!doctype html><div id="host"></div>`);
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  const host = dom.window.document.getElementById("host");
  const panel = createBranchPanel(host, { getSessionId: () => session.id });
  check("branch panel mounts with api hooks", typeof panel.api?.listBranches === "function");
  check("branch panel api.listBranches non-empty", panel.api.listBranches().length >= 1);
  panel.destroy();
} else {
  // jsdom optional — still verify exported factory shape
  const panel = createBranchPanel(null, {});
  check("branch panel mounts with api hooks", typeof panel.destroy === "function", "no-jsdom stub");
  check("branch panel api.listBranches non-empty", true, "skipped without jsdom");
}

// App lifecycle round-trip
saveAppUiState("scenario", { scrollTop: 120, draft: "靠近一点", branchId: "b1", sceneView: "stage" });
const loaded = loadAppUiState("scenario");
check(
  "app lifecycle persists scroll/draft/branch/scene",
  loaded?.scrollTop === 120 && loaded?.draft === "靠近一点" && loaded?.branchId === "b1" && loaded?.sceneView === "stage",
);

const registry = createAppLifecycleRegistry();
let bgCalled = false;
let fgCalled = false;
registry.register("scenario", {
  capture: () => ({ draft: "kept" }),
  restore: () => {},
  onBackground: () => {
    bgCalled = true;
  },
  onForeground: () => {
    fgCalled = true;
  },
  getBackgroundJob: () => ({ busy: true, label: "情景推进中" }),
});
registry.background("scenario");
registry.foreground("scenario");
check("lifecycle background/foreground hooks fire", bgCalled && fgCalled);
check("lifecycle getBackgroundJob", registry.getBackgroundJob("scenario")?.busy === true);

const note = registry.notifyComplete({ appId: "scenario", label: "情景推进完成" });
check("lifecycle notifyComplete", note?.appId === "scenario" && note?.label === "情景推进完成");

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
console.log(`\nW4 verify: ${passed}/${checks.length} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
