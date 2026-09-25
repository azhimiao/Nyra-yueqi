/**
 * 游戏大厅 — Pop 一起玩为主；内置小品降级为单人练手
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  createMatchBoard,
  flipBackMismatched,
  flipMatchCard,
  isMatchComplete,
  scoreMatchPairs,
} from "./match-pairs.js";
import { scoreTapHit, spawnTapTarget, TAP_DURATION_MS } from "./tap-rhythm.js";
import { getGameScore, listGameMeta, recordGameScore } from "./store.js";
import { listPopGames } from "./pop-games.js";
import { listGames as listGroupGames } from "./group/games/index.js";
import { listInstalledGames } from "../yeos/registry-games.js";
import { getLocalRoomStatus } from "../multiplayer/local-room.js";
import { loadMultiplayerPrefs } from "../multiplayer/prefs.js";
import { t } from "../i18n/index.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   onOpenYeosGame?: (gameId: string) => void,
 *   onPlayInPop?: (gameId?: string) => void,
 *   onPlayGroupGame?: (gameId: string) => void,
 * }} [deps]
 */
export function mountGamesLobby(root, deps = {}) {
  if (!root) return { destroy() {}, open() {} };

  /** @type {"lobby"|"match-pairs"|"tap-rhythm"|"result"} */
  let view = "lobby";
  let lastGameId = "";
  let lastScore = 0;
  let destroyed = false;

  /** match state */
  let matchBoard = [];
  let matchOpen = [];
  let matchMoves = 0;
  let matchMatched = 0;
  let matchStartedAt = 0;
  let matchFlipTimer = 0;

  /** tap state */
  let tapScore = 0;
  let tapCombo = 0;
  let tapSeed = 1;
  let tapIndex = 0;
  let tapTarget = null;
  let tapTimer = 0;
  let tapSpawnTimer = 0;
  let tapEndsAt = 0;

  root.classList.add("games-app");
  root.innerHTML = `
    <div class="games-shell" data-games-shell>
      <section class="games-view is-active" data-games-view="lobby">
        <header class="games-top">
          <p class="games-brand">${t("games.brand")}</p>
          <h1>${t("games.lobbyTitle")}</h1>
          <p class="games-lead">${t("games.lobbyLead")}</p>
        </header>
        <div class="games-cards" data-games-cards></div>
        <div class="games-mp" data-games-mp></div>
      </section>

      <section class="games-view" data-games-view="match-pairs" hidden>
        <header class="games-bar">
          <button type="button" class="games-back" data-games-to-lobby aria-label="${t("games.backLobby")}">
            <i data-lucide="chevron-left"></i>
          </button>
          <strong>${t("games.matchPairs")}</strong>
          <span data-match-hud>${t("games.moves", { count: 0 })}</span>
        </header>
        <div class="match-grid" data-match-grid></div>
        <div class="games-scorebar">
          <span>${t("games.currentScore")} <strong data-match-score>0</strong></span>
          <span>${t("games.highScore")} <strong data-match-high>0</strong></span>
        </div>
      </section>

      <section class="games-view" data-games-view="tap-rhythm" hidden>
        <header class="games-bar">
          <button type="button" class="games-back" data-games-to-lobby aria-label="${t("games.backLobby")}">
            <i data-lucide="chevron-left"></i>
          </button>
          <strong>${t("games.tapRhythm")}</strong>
          <span data-tap-hud>30s</span>
        </header>
        <div class="tap-arena" data-tap-arena>
          <button type="button" class="tap-dot" data-tap-dot hidden aria-label="${t("games.target")}"></button>
        </div>
        <div class="games-scorebar">
          <span>${t("games.score")} <strong data-tap-score>0</strong></span>
          <span>${t("games.combo")} <strong data-tap-combo>0</strong></span>
        </div>
      </section>

      <section class="games-view" data-games-view="result" hidden>
        <div class="games-result">
          <p class="games-brand">${t("games.results")}</p>
          <h2 data-result-title>${t("games.roundOver")}</h2>
          <p>${t("games.currentScore")} <strong data-result-score>0</strong> · ${t("games.highScore")} <strong data-result-high>0</strong></p>
          <div class="games-cta-row">
            <button type="button" class="games-cta" data-games-replay>${t("games.replay")}</button>
            <button type="button" class="games-cta games-cta--ghost" data-games-to-lobby>${t("games.returnLobby")}</button>
          </div>
        </div>
      </section>
    </div>
  `;

  function setView(next) {
    view = next;
    root.querySelectorAll("[data-games-view]").forEach((node) => {
      const active = node.dataset.gamesView === next;
      node.classList.toggle("is-active", active);
      node.hidden = !active;
    });
    refreshIcons();
  }

  function clearTimers() {
    if (matchFlipTimer) window.clearTimeout(matchFlipTimer);
    if (tapTimer) window.clearInterval(tapTimer);
    if (tapSpawnTimer) window.clearTimeout(tapSpawnTimer);
    matchFlipTimer = 0;
    tapTimer = 0;
    tapSpawnTimer = 0;
  }

  function renderLobby() {
    const host = root.querySelector("[data-games-cards]");
    if (host) {
      const popCards = listPopGames().map((game) => `
          <article class="games-card tone-${escapeHtml(game.tone)}">
            <div>
              <strong>${escapeHtml(game.title)}</strong>
              <p>${escapeHtml(game.blurb)}</p>
              <em>${t("games.popCurrent")}</em>
            </div>
            <button type="button" class="games-cta" data-games-pop="${escapeHtml(game.id)}">${t("games.playInChat")}</button>
          </article>
        `).join("");
      const groupTones = ["ember", "lilac", "sky", "gold"];
      const groupCards = listGroupGames().map((game, index) => `
          <article class="games-card tone-${escapeHtml(groupTones[index % groupTones.length])}">
            <div>
              <strong>${escapeHtml(game.title)}</strong>
              <p>${escapeHtml(game.description || "")}</p>
              <em>${t("games.groupPlayers", { min: game.players?.min || 4, max: game.players?.max || 8 })}</em>
            </div>
            <button type="button" class="games-cta" data-games-group="${escapeHtml(game.id)}">${t("games.playInGroup")}</button>
          </article>
        `).join("");
      const yeosGames = listInstalledGames().filter((game) => game.enabled !== false);
      const yeosCards = yeosGames.map((game) => `
          <article class="games-card tone-ember">
            <div>
              <strong>${escapeHtml(game.manifest?.name || game.id)}</strong>
              <p>${escapeHtml(game.manifest?.description || t("games.installedDescription"))}</p>
              <em>${t("games.installedVersion", { version: game.manifest?.version || "—" })}</em>
            </div>
            <button type="button" class="games-cta" data-games-yeos="${escapeHtml(game.id)}">${t("games.start")}</button>
          </article>
        `).join("");
      const builtinCards = listGameMeta().map((game) => {
        const score = getGameScore(game.id);
        return `
          <article class="games-card tone-${escapeHtml(game.tone)} games-card--soft">
            <div>
              <strong>${escapeHtml(game.title)}</strong>
              <p>${escapeHtml(game.blurb)}</p>
              <em>${t("games.practiceBest", { score: score.high || "—" })}</em>
            </div>
            <button type="button" class="games-cta games-cta--ghost" data-games-start="${escapeHtml(game.id)}">${t("games.soloPractice")}</button>
          </article>
        `;
      }).join("");
      host.innerHTML = `
        <p class="games-section-label">${t("games.sections.duo")}</p>
        ${popCards}
        <p class="games-section-label">${t("games.sections.group")}</p>
        ${groupCards}
        <p class="games-section-label">${t("games.sections.other")}</p>
        ${yeosCards}
        ${builtinCards}
        <p class="games-lead games-lead--soft">${t("games.footerHint")}</p>
      `;
    }
    const mp = root.querySelector("[data-games-mp]");
    if (mp) {
      const prefs = loadMultiplayerPrefs();
      const status = getLocalRoomStatus();
      mp.innerHTML = `
        <div class="games-mp-card">
          <strong>${t("games.multiplayerTitle")}</strong>
          <p>${prefs.enabled && prefs.mode === "local" ? escapeHtml(status.reason) : t("games.multiplayerPaused")}</p>
          <span class="games-mp-badge">${t("games.multiplayerBadge")}</span>
        </div>
      `;
    }
  }

  function startMatch() {
    clearTimers();
    lastGameId = "match-pairs";
    matchBoard = createMatchBoard(Date.now() % 100000);
    matchOpen = [];
    matchMoves = 0;
    matchMatched = 0;
    matchStartedAt = Date.now();
    const high = root.querySelector("[data-match-high]");
    if (high) high.textContent = String(getGameScore("match-pairs").high || 0);
    renderMatch();
    setView("match-pairs");
  }

  function renderMatch() {
    const grid = root.querySelector("[data-match-grid]");
    const hud = root.querySelector("[data-match-hud]");
    const scoreEl = root.querySelector("[data-match-score]");
    if (hud) hud.textContent = t("games.moves", { count: matchMoves });
    const live = scoreMatchPairs({
      moves: matchMoves,
      elapsedMs: Date.now() - matchStartedAt,
      matchedPairs: matchMatched,
    });
    if (scoreEl) scoreEl.textContent = String(live);
    if (!grid) return;
    grid.innerHTML = matchBoard.map((card) => `
      <button type="button"
        class="match-card ${card.faceUp || card.matched ? "is-up" : ""} ${card.matched ? "is-matched" : ""}"
        data-match-id="${card.id}"
        aria-label="${t("games.cardFace")}">
        <span>${card.faceUp || card.matched ? escapeHtml(card.symbol) : ""}</span>
      </button>
    `).join("");
  }

  function onMatchFlip(cardId) {
    if (matchOpen.length >= 2) return;
    const result = flipMatchCard(matchBoard, cardId, matchOpen);
    matchBoard = result.board;
    matchOpen = result.openIds;
    matchMoves += result.movesDelta || 0;
    if (result.matchedPair) matchMatched += 1;
    renderMatch();
    if (result.needFlipBack) {
      matchFlipTimer = window.setTimeout(() => {
        matchBoard = flipBackMismatched(matchBoard, matchOpen);
        matchOpen = [];
        renderMatch();
      }, 520);
      return;
    }
    if (isMatchComplete(matchBoard)) {
      finishGame(scoreMatchPairs({
        moves: matchMoves,
        elapsedMs: Date.now() - matchStartedAt,
        matchedPairs: matchMatched,
      }));
    }
  }

  function startTap() {
    clearTimers();
    lastGameId = "tap-rhythm";
    tapScore = 0;
    tapCombo = 0;
    tapSeed = Date.now() % 100000;
    tapIndex = 0;
    tapEndsAt = Date.now() + TAP_DURATION_MS;
    const dot = root.querySelector("[data-tap-dot]");
    if (dot) dot.hidden = true;
    updateTapHud();
    setView("tap-rhythm");
    scheduleTapSpawn();
    tapTimer = window.setInterval(() => {
      const left = Math.max(0, tapEndsAt - Date.now());
      const hud = root.querySelector("[data-tap-hud]");
      if (hud) hud.textContent = `${Math.ceil(left / 1000)}s`;
      if (left <= 0) {
        finishGame(tapScore);
      }
    }, 200);
  }

  function updateTapHud() {
    const scoreEl = root.querySelector("[data-tap-score]");
    const comboEl = root.querySelector("[data-tap-combo]");
    if (scoreEl) scoreEl.textContent = String(tapScore);
    if (comboEl) comboEl.textContent = String(tapCombo);
  }

  function scheduleTapSpawn() {
    if (destroyed || view !== "tap-rhythm") return;
    const dot = root.querySelector("[data-tap-dot]");
    tapTarget = spawnTapTarget(tapSeed, tapIndex, Date.now());
    tapIndex += 1;
    if (dot && tapTarget) {
      dot.hidden = false;
      dot.style.left = `${tapTarget.x}%`;
      dot.style.top = `${tapTarget.y}%`;
      dot.classList.add("is-show");
    }
    tapSpawnTimer = window.setTimeout(() => {
      if (tapTarget) {
        const miss = scoreTapHit({ combo: tapCombo, miss: true });
        tapCombo = miss.nextCombo;
        updateTapHud();
        if (dot) {
          dot.hidden = true;
          dot.classList.remove("is-show");
        }
        tapTarget = null;
        if (Date.now() < tapEndsAt) scheduleTapSpawn();
      }
    }, tapTarget?.ttlMs || 1600);
  }

  function onTapHit() {
    if (!tapTarget) return;
    window.clearTimeout(tapSpawnTimer);
    const hit = scoreTapHit({ combo: tapCombo, hit: true });
    tapScore += hit.scoreDelta;
    tapCombo = hit.nextCombo;
    tapTarget = null;
    const dot = root.querySelector("[data-tap-dot]");
    if (dot) {
      dot.hidden = true;
      dot.classList.remove("is-show");
    }
    updateTapHud();
    if (Date.now() < tapEndsAt) {
      tapSpawnTimer = window.setTimeout(() => scheduleTapSpawn(), 280);
    }
  }

  function finishGame(score) {
    clearTimers();
    lastScore = Math.max(0, Math.floor(score));
    const row = recordGameScore(lastGameId, lastScore);
    const title = root.querySelector("[data-result-title]");
    const meta = listGameMeta().find((g) => g.id === lastGameId);
    if (title) title.textContent = meta?.title || t("games.roundOver");
    const scoreEl = root.querySelector("[data-result-score]");
    const highEl = root.querySelector("[data-result-high]");
    if (scoreEl) scoreEl.textContent = String(lastScore);
    if (highEl) highEl.textContent = String(row.high);
    deps.onSessionCompleted?.({
      gameId: lastGameId,
      score: lastScore,
      highScore: row.high,
    });
    setView("result");
  }

  const onClick = (event) => {
    if (destroyed) return;
    const popId = event.target.closest("[data-games-pop]")?.dataset.gamesPop;
    if (popId) {
      deps.onPlayInPop?.(popId);
      return;
    }
    const groupId = event.target.closest("[data-games-group]")?.dataset.gamesGroup;
    if (groupId) {
      if (typeof deps.onPlayGroupGame === "function") {
        deps.onPlayGroupGame(groupId);
      } else {
        deps.onToast?.(t("games.groupStartToast"));
      }
      return;
    }
    const startId = event.target.closest("[data-games-start]")?.dataset.gamesStart;
    if (startId === "match-pairs") {
      startMatch();
      return;
    }
    if (startId === "tap-rhythm") {
      startTap();
      return;
    }
    const yeosId = event.target.closest("[data-games-yeos]")?.dataset.gamesYeos;
    if (yeosId) {
      deps.onOpenYeosGame?.(yeosId);
      return;
    }
    if (event.target.closest("[data-games-to-lobby]")) {
      clearTimers();
      renderLobby();
      setView("lobby");
      return;
    }
    if (event.target.closest("[data-games-replay]")) {
      if (lastGameId === "tap-rhythm") startTap();
      else startMatch();
      return;
    }
    const matchId = event.target.closest("[data-match-id]")?.dataset.matchId;
    if (matchId != null && view === "match-pairs") {
      onMatchFlip(Number(matchId));
      return;
    }
    if (event.target.closest("[data-tap-dot]") && view === "tap-rhythm") {
      onTapHit();
    }
  };

  root.addEventListener("click", onClick);
  renderLobby();
  setView("lobby");
  refreshIcons();

  return {
    open() {
      clearTimers();
      renderLobby();
      setView("lobby");
    },
    destroy() {
      destroyed = true;
      clearTimers();
      root.removeEventListener("click", onClick);
      root.replaceChildren();
    },
  };
}
