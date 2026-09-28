"use strict";

const STORAGE_KEY = "olympic-score-app.v1";
const BACKUP_FORMAT = "golf-olympic-backup";
const MEDAL_IDS = new Set(["none", "gold", "silver", "bronze", "iron", "diamond"]);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let rules = null;
let appState = { schemaVersion: 1, activeRoundId: null, activeHole: 1, rounds: [] };
let statusMessage = "";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `round-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function validateRound(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("ラウンドの形式が正しくありません。");
  if (typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 120) throw new Error("ラウンドIDが正しくありません。");
  if (!isDate(candidate.date)) throw new Error("ラウンドの日付が正しくありません。");
  if (![9, 18].includes(candidate.holeCount)) throw new Error("ホール数は9または18にしてください。");
  if (!Array.isArray(candidate.players) || candidate.players.length < 2 || candidate.players.length > 4) throw new Error("プレーヤーは2〜4人にしてください。");
  if (!Number.isInteger(candidate.currentHole) || candidate.currentHole < 1 || candidate.currentHole > candidate.holeCount) throw new Error("ラウンドの再開ホールが正しくありません。");
  const players = candidate.players.map((name) => typeof name === "string" ? name.trim() : "");
  if (players.some((name) => name.length < 1 || name.length > 40)) throw new Error("各プレーヤー名は1〜40文字にしてください。");
  if (typeof candidate.diamondEnabled !== "boolean") throw new Error("ダイヤ設定が正しくありません。");
  if (!isTimestamp(candidate.createdAt) || !isTimestamp(candidate.updatedAt)) throw new Error("ラウンド日時が正しくありません。");
  if (!Array.isArray(candidate.holeResults) || candidate.holeResults.length !== candidate.holeCount) throw new Error("ホール記録の数がラウンド設定と一致しません。");
  const allowed = new Set(["none", ...(rules.playerMedals[String(players.length)] || [])]);
  if (candidate.diamondEnabled) allowed.add("diamond");
  const holeResults = candidate.holeResults.map((result) => {
    if (!Array.isArray(result) || result.length !== players.length) throw new Error("ホールごとのプレーヤー数が一致しません。");
    return result.map((medal) => {
      if (medal !== null && (typeof medal !== "string" || !MEDAL_IDS.has(medal) || !allowed.has(medal))) throw new Error("設定にないメダル記録が含まれています。");
      return medal;
    });
  });
  return {
    id: candidate.id,
    date: candidate.date,
    holeCount: candidate.holeCount,
    currentHole: candidate.currentHole,
    players,
    diamondEnabled: candidate.diamondEnabled,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    holeResults
  };
}

function validateSnapshot(candidate, isBackup = false) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("JSONのルート形式が正しくありません。");
  if (isBackup) {
    if (candidate.format !== BACKUP_FORMAT || candidate.version !== 1 || !isTimestamp(candidate.exportedAt)) throw new Error("このアプリのバックアップ形式ではありません。");
  } else if (candidate.schemaVersion !== 1) {
    throw new Error("保存データのバージョンに対応していません。");
  }
  if (!Array.isArray(candidate.rounds)) throw new Error("ラウンド一覧がありません。");
  const rounds = candidate.rounds.map(validateRound);
  const ids = new Set(rounds.map((round) => round.id));
  if (ids.size !== rounds.length) throw new Error("重複したラウンドIDがあります。");
  const activeRoundId = candidate.activeRoundId === null ? null : candidate.activeRoundId;
  if (activeRoundId !== null && (typeof activeRoundId !== "string" || !ids.has(activeRoundId))) throw new Error("再開中ラウンドの指定が正しくありません。");
  const activeRound = rounds.find((round) => round.id === activeRoundId);
  const activeHole = candidate.activeHole;
  if (!Number.isInteger(activeHole) || activeHole < 1 || activeHole > 18) throw new Error("再開ホールの指定が正しくありません。");
  if (activeRound && activeHole > activeRound.holeCount) throw new Error("再開ホールがラウンドのホール数を超えています。");
  if (activeRound && activeHole !== activeRound.currentHole) throw new Error("ラウンドと再開ホールの指定が一致しません。");
  if (!activeRound && activeHole !== 1) throw new Error("再開中ラウンドがない場合、再開ホールは1にしてください。");
  return { schemaVersion: 1, activeRoundId, activeHole, rounds };
}

function validateRules(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.medals) || !document.playerMedals) throw new Error("rules.json の形式が正しくありません。");
  const expectedPoints = { none: 0, gold: 4, silver: 3, bronze: 2, iron: 1, diamond: 5 };
  const points = Object.fromEntries(document.medals.map((medal) => [medal.id, medal.points]));
  if (document.medals.length !== Object.keys(expectedPoints).length || Object.entries(expectedPoints).some(([id, value]) => points[id] !== value)) throw new Error("rules.json のメダル点数が標準値と一致しません。");
  const expectedOptions = {
    "2": ["gold", "silver"],
    "3": ["gold", "silver", "bronze"],
    "4": ["gold", "silver", "bronze", "iron"]
  };
  if (Object.keys(expectedOptions).some((count) => JSON.stringify(document.playerMedals[count]) !== JSON.stringify(expectedOptions[count]))) throw new Error("rules.json の人数別メダル構成が正しくありません。");
  if (typeof document.diamondEnabledByDefault !== "boolean" || !Array.isArray(document.explanation) || typeof document.calculation !== "string") throw new Error("rules.json の説明または初期設定が正しくありません。");
  return document;
}

function loadSavedState() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    appState = validateSnapshot(JSON.parse(stored));
  } catch (error) {
    statusMessage = `このブラウザーの保存データを読み込めませんでした。${error.message || ""} 新しい操作を保存すると、この保存データは置き換わります。`;
  }
}

function commit(nextState, message = "この変更をブラウザーに保存しました。", focusSelector = null) {
  let saved = false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    appState = nextState;
    statusMessage = message;
    saved = true;
    render();
  } catch (error) {
    statusMessage = `保存できませんでした。ブラウザーの空き容量や保存設定を確認してください。`;
    render();
  }
  if (focusSelector) $(focusSelector)?.focus();
  return saved;
}

function cloneState() {
  return JSON.parse(JSON.stringify(appState));
}

function currentRound() {
  return appState.rounds.find((round) => round.id === appState.activeRoundId) || null;
}

function medalFor(id) {
  return rules.medals.find((medal) => medal.id === id) || rules.medals[0];
}

function formatPoints(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function pointClass(value) {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

function displayDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function calculateScores(round) {
  const count = round.players.length;
  const cumulativeEarned = Array(count).fill(0);
  const cumulativeNet = Array(count).fill(0);
  const netByHole = round.holeResults.map((results) => {
    const earned = results.map((id) => id ? medalFor(id).points : 0);
    const totalEarned = earned.reduce((sum, value) => sum + value, 0);
    earned.forEach((value, index) => { cumulativeEarned[index] += value; });
    const net = earned.map((value) => value * (count - 1) - (totalEarned - value));
    net.forEach((value, index) => { cumulativeNet[index] += value; });
    return { earned, net, totalNet: net.reduce((sum, value) => sum + value, 0) };
  });
  return { netByHole, cumulativeEarned, cumulativeNet, roundNetTotal: cumulativeNet.reduce((sum, value) => sum + value, 0) };
}

function renderStatus() {
  const region = $("#status-message");
  region.textContent = statusMessage;
  region.hidden = !statusMessage;
}

function renderRound() {
  const host = $("#round-panel");
  const round = currentRound();
  if (!round) {
    host.innerHTML = "";
    return;
  }
  appState.activeHole = Math.max(1, Math.min(appState.activeHole, round.holeCount));
  const scores = calculateScores(round);
  const holeIndex = appState.activeHole - 1;
  const holeScore = scores.netByHole[holeIndex];
  const totalScore = scores.roundNetTotal;
  const holeZero = holeScore.totalNet === 0;
  const roundZero = totalScore === 0;
  const roundAllowed = new Set(["none", ...(rules.playerMedals[String(round.players.length)] || [])]);
  if (round.diamondEnabled) roundAllowed.add("diamond");
  const medalButtons = rules.medals.filter((medal) => roundAllowed.has(medal.id));
  const holeGrid = Array.from({ length: round.holeCount }, (_, index) => {
    const recorded = round.holeResults[index].some((result) => result !== null);
    const selected = index + 1 === appState.activeHole;
    return `<button class="hole-button${selected ? " is-current" : ""}${recorded ? " is-recorded" : ""}" type="button" data-hole="${index + 1}" aria-label="ホール ${index + 1}${recorded ? "、記録あり" : ""}"${selected ? " aria-current=\"step\"" : ""}>${index + 1}</button>`;
  }).join("");
  const playerCards = round.players.map((name, index) => {
    const selectedId = round.holeResults[holeIndex][index];
    const selectedMedal = selectedId ? medalFor(selectedId) : null;
    const earned = holeScore.earned[index];
    const net = holeScore.net[index];
    return `<article class="player-card" aria-labelledby="player-title-${index}">
      <div class="player-card-heading">
        <h3 id="player-title-${index}"><span class="player-number" aria-hidden="true">${index + 1}</span>${escapeHtml(name)}</h3>
        <span class="selected-label">${selectedMedal ? `選択中：${escapeHtml(selectedMedal.label)}` : "未記録"}</span>
      </div>
      <div class="medal-options" role="group" aria-label="${escapeHtml(name)}の獲得メダル">
        ${medalButtons.map((medal) => `<button class="medal-button medal-${medal.id}" type="button" data-player="${index}" data-medal="${medal.id}" aria-label="${escapeHtml(name)}：${escapeHtml(medal.label)}、${medal.points}点" aria-pressed="${selectedId === medal.id}">${escapeHtml(medal.label)}<br><span>${medal.points}点</span></button>`).join("")}
      </div>
      <div class="player-scores">
        <div class="score-value"><span>このホールの獲得点</span><strong>${earned}点</strong></div>
        <div class="score-value"><span>このホールの差引点</span><strong class="${pointClass(net)}">${formatPoints(net)}点</strong></div>
      </div>
      <p class="cumulative-line">ラウンド累計：獲得 ${scores.cumulativeEarned[index]}点 ／ 差引 <strong class="${pointClass(scores.cumulativeNet[index])}">${formatPoints(scores.cumulativeNet[index])}点</strong></p>
    </article>`;
  }).join("");
  host.innerHTML = `<section class="round-panel" aria-labelledby="round-title">
    <div class="round-overview surface">
      <div class="section-heading round-heading">
        <div>
          <p class="eyebrow">IN PROGRESS</p>
          <h2 id="round-title" tabindex="-1">${escapeHtml(displayDate(round.date))}のラウンド</h2>
          <p class="round-title-meta"><span>${round.holeCount}ホール</span><span>${round.players.length}人</span><span>ダイヤ ${round.diamondEnabled ? "有効" : "無効"}</span></p>
        </div>
        <div class="round-actions">
          <button class="button button-secondary" type="button" data-round-action="export">バックアップ</button>
        </div>
      </div>
      <div class="round-summary" aria-label="合計点">
        <div class="summary-box ${holeZero ? "zero-sum" : ""}"><span>このホールの差引合計</span><strong>${formatPoints(holeScore.totalNet)}点</strong></div>
        <div class="summary-box ${roundZero ? "zero-sum" : ""}"><span>ラウンド差引合計</span><strong>${formatPoints(totalScore)}点</strong></div>
      </div>
      <div class="hole-navigation" aria-label="ホール移動">
        <button class="button button-secondary" type="button" data-hole-step="-1"${appState.activeHole <= 1 ? " disabled" : ""}>← 前のホール</button>
        <div class="hole-title"><strong>ホール ${appState.activeHole}</strong><span>${round.holeCount}ホール中</span></div>
        <button class="button button-secondary" type="button" data-hole-step="1"${appState.activeHole >= round.holeCount ? " disabled" : ""}>次のホール →</button>
      </div>
      <nav class="hole-grid" aria-label="ホール一覧">${holeGrid}</nav>
    </div>
    <div class="players-heading"><h2>ホール ${appState.activeHole} の記録</h2><p>1パットで獲得したメダルを選択してください。</p></div>
    <div class="player-list">${playerCards}</div>
  </section>`;
}

function renderHistory() {
  const list = $("#history-list");
  const rounds = [...appState.rounds].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  $("#history-count").textContent = `${rounds.length}件`;
  $("#export-button").disabled = rounds.length === 0;
  if (rounds.length === 0) {
    list.innerHTML = `<p class="empty-history">保存済みラウンドはありません。新しいラウンドを作成してください。</p>`;
    return;
  }
  list.className = "history-list";
  list.innerHTML = rounds.map((round) => {
    const totals = calculateScores(round);
    const isActive = appState.activeRoundId === round.id;
    const playerTotals = round.players.map((name, index) => `<span class="history-score">${escapeHtml(name)} <strong class="${pointClass(totals.cumulativeNet[index])}">${formatPoints(totals.cumulativeNet[index])}点</strong> <span class="quiet-count">（獲得 ${totals.cumulativeEarned[index]}点）</span></span>`).join("");
    return `<article class="history-item">
      <div class="history-item-main"><div><h3>${escapeHtml(displayDate(round.date))}のラウンド${isActive ? " <span class=\"quiet-count\">・再開中</span>" : ""}</h3><p>${round.holeCount}ホール ・ ${round.players.length}人 ・ ダイヤ${round.diamondEnabled ? "有効" : "無効"}</p></div></div>
      <div class="history-scores">${playerTotals}</div>
      <div class="history-actions">
        <button class="button button-secondary" type="button" data-round-action="resume" data-round-id="${escapeHtml(round.id)}">${isActive ? "記録を開く" : "再開"}</button>
        <button class="button button-secondary" type="button" data-round-action="export-one" data-round-id="${escapeHtml(round.id)}">JSONを書き出す</button>
        <button class="button button-danger" type="button" data-round-action="delete" data-round-id="${escapeHtml(round.id)}">削除</button>
      </div>
    </article>`;
  }).join("");
}

function renderRules() {
  const medals = rules.medals.filter((medal) => medal.id !== "none").map((medal) => `<li><strong>${escapeHtml(medal.label)} ${medal.points}点</strong> — ${escapeHtml(medal.description)}</li>`).join("");
  $("#rules-content").innerHTML = `<ul>${rules.explanation.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p><strong>点数</strong></p><ul>${medals}</ul><p class="calculation-note">${escapeHtml(rules.calculation)}</p><p>3パット減点、砂イチ・竿イチなどの派生ルールと金額換算は対象外です。点数だけを記録します。</p>`;
}

function render() {
  renderStatus();
  renderRound();
  renderHistory();
}

function setPlayerFields() {
  const count = Number($("#player-count").value);
  $$(".player-field").forEach((field, index) => {
    const input = $("input", field);
    field.hidden = index >= count;
    input.required = index < count;
  });
}

function openSetup() {
  const panel = $("#setup-panel");
  panel.hidden = false;
  $("#round-date").value ||= todayLocal();
  $("[name='player1']").value ||= "プレーヤー1";
  $("[name='player2']").value ||= "プレーヤー2";
  $("[name='player3']").value ||= "プレーヤー3";
  $("[name='player4']").value ||= "プレーヤー4";
  setPlayerFields();
  $("#round-date").focus();
}

function closeSetup() {
  $("#setup-panel").hidden = true;
  $("#new-round-button").focus();
}

function handleCreateRound(event) {
  event.preventDefault();
  const playerCount = Number($("#player-count").value);
  const players = Array.from({ length: playerCount }, (_, index) => $(`[name='player${index + 1}']`).value.trim());
  if (players.some((name) => !name)) {
    statusMessage = "プレーヤー名を入力してください。";
    renderStatus();
    return;
  }
  const holeCount = Number($("#hole-count").value);
  const now = new Date().toISOString();
  const round = {
    id: newId(), date: $("#round-date").value, holeCount, currentHole: 1, players,
    diamondEnabled: $("#diamond-enabled").checked,
    createdAt: now, updatedAt: now,
    holeResults: Array.from({ length: holeCount }, () => Array(playerCount).fill(null))
  };
  if (!isDate(round.date)) {
    statusMessage = "日付を確認してください。";
    renderStatus();
    return;
  }
  const next = cloneState();
  next.rounds.unshift(round);
  next.activeRoundId = round.id;
  next.activeHole = 1;
  if (commit(next, "ラウンドを作成しました。記録は自動保存されます。", "#round-title")) {
    $("#setup-panel").hidden = true;
  }
}

function updateHole(mutate, focusSelector = null) {
  const next = cloneState();
  mutate(next);
  const round = next.rounds.find((item) => item.id === next.activeRoundId);
  if (round) {
    round.currentHole = next.activeHole;
    round.updatedAt = new Date().toISOString();
  }
  commit(next, undefined, focusSelector);
}

function makeBackup(rounds = appState.rounds) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    activeRoundId: appState.activeRoundId,
    activeHole: appState.activeHole,
    rounds
  };
}

function downloadBackup(rounds, filename) {
  const blob = new Blob([JSON.stringify(makeBackup(rounds), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  statusMessage = "JSONバックアップを書き出しました。安全な場所に保管してください。";
  renderStatus();
}

function exportAll() {
  const stamp = todayLocal();
  downloadBackup(appState.rounds, `olympic-backup-${stamp}.json`);
}

function exportOne(roundId) {
  const round = appState.rounds.find((item) => item.id === roundId);
  if (!round) return;
  const oneRoundState = { activeRoundId: roundId, activeHole: round.currentHole };
  const original = appState;
  appState = { ...appState, ...oneRoundState };
  downloadBackup([round], `olympic-backup-${round.date}.json`);
  appState = original;
}

async function importBackup(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const restored = validateSnapshot(parsed, true);
    if (!window.confirm(`バックアップの${restored.rounds.length}件で、現在の保存データ${appState.rounds.length}件を置き換えます。続けますか？`)) return;
    commit(restored, `${restored.rounds.length}件のラウンドを復元しました。`, restored.activeRoundId ? "#round-title" : "#history-title");
  } catch (error) {
    statusMessage = `復元できませんでした。${error.message || "JSONファイルを確認してください。"}`;
    renderStatus();
  } finally {
    $("#import-file").value = "";
  }
}

function handleRoundAction(button) {
  const action = button.dataset.roundAction;
  const roundId = button.dataset.roundId || appState.activeRoundId;
  const round = appState.rounds.find((item) => item.id === roundId);
  if (action === "export") return exportAll();
  if (action === "export-one") return exportOne(roundId);
  if (!round) return;
  if (action === "resume") {
    const next = cloneState();
    next.activeRoundId = round.id;
    next.activeHole = round.currentHole;
    commit(next, `${displayDate(round.date)}のラウンドを開きました。`, "#round-title");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else if (action === "delete") {
    if (!window.confirm(`${displayDate(round.date)}の${round.holeCount}ホール・${round.players.length}人の記録を削除します。この操作は取り消せません。`)) return;
    const next = cloneState();
    next.rounds = next.rounds.filter((item) => item.id !== round.id);
    if (next.activeRoundId === round.id) {
      next.activeRoundId = null;
      next.activeHole = 1;
    }
    commit(next, "ラウンドを削除しました。", "#history-title");
  }
}

function attachEvents() {
  $("#new-round-button").addEventListener("click", openSetup);
  $("#close-setup-button").addEventListener("click", closeSetup);
  $("#player-count").addEventListener("change", setPlayerFields);
  $("#round-form").addEventListener("submit", handleCreateRound);
  $("#export-button").addEventListener("click", exportAll);
  $("#import-button").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("#round-panel").addEventListener("click", (event) => {
    const medalButton = event.target.closest("[data-medal]");
    if (medalButton) {
      const playerIndex = Number(medalButton.dataset.player);
      const medal = medalButton.dataset.medal;
      updateHole((next) => {
        const round = next.rounds.find((item) => item.id === next.activeRoundId);
        if (round) round.holeResults[next.activeHole - 1][playerIndex] = medal;
      }, `[data-player="${playerIndex}"][data-medal="${medal}"]`);
      return;
    }
    const holeButton = event.target.closest("[data-hole]");
    if (holeButton) {
      const selectedHole = Number(holeButton.dataset.hole);
      updateHole((next) => { next.activeHole = selectedHole; }, `[data-hole="${selectedHole}"]`);
      return;
    }
    const stepButton = event.target.closest("[data-hole-step]");
    if (stepButton) {
      const amount = Number(stepButton.dataset.holeStep);
      updateHole((next) => { next.activeHole = Math.max(1, Math.min(currentRound().holeCount, next.activeHole + amount)); }, "#round-title");
      return;
    }
    const actionButton = event.target.closest("[data-round-action]");
    if (actionButton) handleRoundAction(actionButton);
  });
  $("#history-list").addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-round-action]");
    if (actionButton) handleRoundAction(actionButton);
  });
}

async function initialize() {
  attachEvents();
  $("#round-date").value = todayLocal();
  setPlayerFields();
  try {
    const response = await fetch("./rules.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`rules.json を読み込めません（${response.status}）。`);
    rules = validateRules(await response.json());
    $("#diamond-enabled").checked = Boolean(rules.diamondEnabledByDefault);
    loadSavedState();
    appState = validateSnapshot(appState);
    $("#new-round-button").disabled = false;
    $("#import-button").disabled = false;
    renderRules();
    render();
  } catch (error) {
    statusMessage = `ルールを読み込めませんでした。ページを再読み込みしてください。${error.message || ""}`;
    renderStatus();
    $("#round-panel").innerHTML = `<p class="notice notice-error">ルールファイルを読み込めないため、記録を開始できません。</p>`;
  }
}

initialize();
