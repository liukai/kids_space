/**
 * Math Game — 九九乘法表 practice (plain JS, no build)
 *
 * - Scoring: points from the smaller factor (2×9 & 9×2 both use 2); flair + flying 🎉
 * - Trophies: trophyCountFromScore(), progress bar (20 pts each), flying 🏆 to count + pop, maybeCelebrateTrophy()
 * - Set-of-10: stats panel (Set bar + Right %); timer (Q1 on first digit, Q2+ on show) + avg time when right; openSetSummary()
 * - Table filter: getActiveTables(), buildQuestionPool(); Clear → 1× only
 * - Ladder table + bars: renderFullTable(), cellStats (localStorage), showTableChinese, Clear history
 * - Cheat: tiny corner control; fills answer in a peek font, no auto-advance — 🔎 or Enter continues
 * - Tried: totalTried — each valid Check this session (wrong retries count)
 * - Practice totals: localStorage mathPracticeState (score / cheat / tried survive reload)
 * - Wrong: up to 2 retries; 3rd wrong shows answer then auto-advance. Correct: short pause then next.
 * - Secrets (answer + Check, no score): 0410 → number rain; 1218 → party emoji rain + floor bounce.
 * - Check button: under the answer; pointerdown prevents blur when tapping 🔎 on touch devices.
 * - Sounds (Web Audio): type tap, correct chord, gentle wrong, tada on new trophy.
 */

(function () {
  "use strict";

  var gameAudioCtx = null;

  function unlockGameAudio() {
    try {
      if (!gameAudioCtx) {
        gameAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (gameAudioCtx.state === "suspended") {
        gameAudioCtx.resume();
      }
    } catch (err) {
      /* ignore */
    }
  }

  function playTone(freq, duration, type, peakGain, delayFromNow) {
    if (!gameAudioCtx) return;
    var t0 = gameAudioCtx.currentTime + (delayFromNow || 0);
    var osc = gameAudioCtx.createOscillator();
    var g = gameAudioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0002), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(gameAudioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function playSoundType() {
    try {
      unlockGameAudio();
      if (!gameAudioCtx) return;
      playTone(920, 0.032, "sine", 0.055, 0);
    } catch (err) {
      /* ignore */
    }
  }

  function playSoundCorrect() {
    try {
      unlockGameAudio();
      if (!gameAudioCtx) return;
      playTone(523.25, 0.1, "sine", 0.11, 0);
      playTone(659.25, 0.11, "sine", 0.1, 0.08);
      playTone(783.99, 0.14, "sine", 0.09, 0.16);
    } catch (err) {
      /* ignore */
    }
  }

  /** Soft, low — wrong answer (not harsh). */
  function playSoundWrong() {
    try {
      unlockGameAudio();
      if (!gameAudioCtx) return;
      playTone(207.65, 0.14, "triangle", 0.045, 0);
      playTone(174.61, 0.2, "triangle", 0.028, 0.11);
    } catch (err) {
      /* ignore */
    }
  }

  /** Short fanfare when a trophy is earned. */
  function playSoundTada() {
    try {
      unlockGameAudio();
      if (!gameAudioCtx) return;
      var d = 0;
      var notes = [392, 493.88, 587.33, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        playTone(notes[i], 0.13, "sine", 0.11, d);
        d += 0.1;
      }
      playTone(1318.51, 0.22, "sine", 0.06, d + 0.02);
    } catch (err) {
      /* ignore */
    }
  }

  const CHINESE_RHYME = {
    "1-1": "一一得一",
    "1-2": "一二得二",
    "1-3": "一三得三",
    "1-4": "一四得四",
    "1-5": "一五得五",
    "1-6": "一六得六",
    "1-7": "一七得七",
    "1-8": "一八得八",
    "1-9": "一九得九",
    "2-2": "二二得四",
    "2-3": "二三得六",
    "2-4": "二四得八",
    "2-5": "二五一十",
    "2-6": "二六十二",
    "2-7": "二七十四",
    "2-8": "二八十六",
    "2-9": "二九十八",
    "3-3": "三三得九",
    "3-4": "三四十二",
    "3-5": "三五十五",
    "3-6": "三六十八",
    "3-7": "三七二十一",
    "3-8": "三八二十四",
    "3-9": "三九二十七",
    "4-4": "四四十六",
    "4-5": "四五二十",
    "4-6": "四六二十四",
    "4-7": "四七二十八",
    "4-8": "四八三十二",
    "4-9": "四九三十六",
    "5-5": "五五二十五",
    "5-6": "五六三十",
    "5-7": "五七三十五",
    "5-8": "五八四十",
    "5-9": "五九四十五",
    "6-6": "六六三十六",
    "6-7": "六七四十二",
    "6-8": "六八四十八",
    "6-9": "六九五十四",
    "7-7": "七七四十九",
    "7-8": "七八五十六",
    "7-9": "七九六十三",
    "8-8": "八八六十四",
    "8-9": "八九七十二",
    "9-9": "九九八十一",
  };

  function getChineseReading(a, b) {
    const x = Math.min(a, b);
    const y = Math.max(a, b);
    return CHINESE_RHYME[`${x}-${y}`] || "";
  }

  function pairKey(a, b) {
    const x = Math.min(a, b);
    const y = Math.max(a, b);
    return `${x}-${y}`;
  }

  function loadCellStats() {
    try {
      const raw = localStorage.getItem(CELL_STATS_KEY);
      if (!raw) {
        cellStats = {};
        return;
      }
      const parsed = JSON.parse(raw);
      cellStats = typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (err) {
      cellStats = {};
    }
  }

  function saveCellStats() {
    try {
      localStorage.setItem(CELL_STATS_KEY, JSON.stringify(cellStats));
    } catch (err) {
      /* ignore */
    }
  }

  function loadPracticeState() {
    try {
      var raw = localStorage.getItem(PRACTICE_STATE_KEY);
      if (!raw) {
        return;
      }
      var o = JSON.parse(raw);
      if (typeof o.totalScore === "number" && o.totalScore >= 0) {
        totalScore = o.totalScore;
      }
      if (typeof o.cheatCount === "number" && o.cheatCount >= 0) {
        cheatCount = o.cheatCount;
      }
      if (typeof o.totalTried === "number" && o.totalTried >= 0) {
        totalTried = o.totalTried;
      }
    } catch (err) {
      /* ignore */
    }
  }

  function savePracticeState() {
    try {
      localStorage.setItem(
        PRACTICE_STATE_KEY,
        JSON.stringify({
          totalScore: totalScore,
          cheatCount: cheatCount,
          totalTried: totalTried,
        })
      );
    } catch (err) {
      /* ignore */
    }
  }

  /** Remove saved ladder bars and practice totals from this browser (localStorage). */
  function clearStoredCellHistory() {
    try {
      localStorage.removeItem(CELL_STATS_KEY);
      localStorage.removeItem(PRACTICE_STATE_KEY);
    } catch (err) {
      /* ignore */
    }
    cellStats = {};
    totalScore = 0;
    cheatCount = 0;
    totalTried = 0;
    updateScoreDisplay();
    updateCheatDisplay();
    updateTriedDisplay();
    renderFullTable();
  }

  /** Count a Check result for the ladder bars (cheat does not update). */
  function recordPairAttempt(a, b, isCorrect) {
    const key = pairKey(a, b);
    if (!cellStats[key]) {
      cellStats[key] = { r: 0, w: 0 };
    }
    if (isCorrect) {
      cellStats[key].r += 1;
    } else {
      cellStats[key].w += 1;
    }
    saveCellStats();
    if (!el.fullTableWrap.hidden) {
      renderFullTable();
    }
  }

  function barAriaLabel(i, j, st) {
    const total = st.r + st.w;
    if (total === 0) {
      return `${i}×${j}: no tries yet`;
    }
    return `${i}×${j}: ${st.r} right, ${st.w} wrong`;
  }

  function buildCorrectnessBar(i, j) {
    const key = pairKey(i, j);
    const st = cellStats[key] ? { r: cellStats[key].r || 0, w: cellStats[key].w || 0 } : { r: 0, w: 0 };
    const total = st.r + st.w;

    const bar = document.createElement("div");
    bar.className = "cell-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", barAriaLabel(i, j, st));

    const track = document.createElement("div");
    track.className = "cell-bar-track";

    if (total === 0) {
      const grey = document.createElement("div");
      grey.className = "cell-bar-seg cell-bar-grey";
      track.appendChild(grey);
    } else {
      if (st.r > 0) {
        const g = document.createElement("div");
        g.className = "cell-bar-seg cell-bar-green";
        g.style.flex = st.r + " 1 0";
        track.appendChild(g);
      }
      if (st.w > 0) {
        const rSeg = document.createElement("div");
        rSeg.className = "cell-bar-seg cell-bar-red";
        rSeg.style.flex = st.w + " 1 0";
        track.appendChild(rSeg);
      }
    }

    bar.appendChild(track);
    return bar;
  }

  /** Points use the smaller factor (e.g. 2×9 and 9×2 → tier of 2 → 2 pt). */
  function pointsForQuestion(a, b) {
    const m = Math.min(a, b);
    if (m <= 1) return 1;
    if (m <= 2) return 2;
    if (m <= 5) return 3;
    return 4;
  }

  /** One trophy every 20 points (same as progress bar). */
  const POINTS_PER_TROPHY = 20;

  function trophyCountFromScore(score) {
    return Math.floor(score / POINTS_PER_TROPHY);
  }

  const el = {
    equation: document.getElementById("equation"),
    questionPoints: document.getElementById("question-points"),
    answerInput: document.getElementById("answer-input"),
    btnCheat: document.getElementById("btn-cheat"),
    feedback: document.getElementById("feedback-area"),
    totalScore: document.getElementById("total-score"),
    trophyDisplay: document.getElementById("trophy-display"),
    trophyProgressBar: document.getElementById("trophy-progress-bar"),
    trophyProgressFill: document.getElementById("trophy-progress-fill"),
    trophyProgressCount: document.getElementById("trophy-progress-count"),
    trophyProgressGoal: document.getElementById("trophy-progress-goal"),
    cheatCount: document.getElementById("cheat-count"),
    triedCount: document.getElementById("tried-count"),
    setProgress: document.getElementById("set-progress"),
    setProgressBar: document.getElementById("set-progress-bar"),
    setProgressFill: document.getElementById("set-progress-fill"),
    setAccuracy: document.getElementById("set-accuracy"),
    questionTimer: document.getElementById("question-timer"),
    setAvgRightTime: document.getElementById("set-avg-right-time"),
    tableChips: document.getElementById("table-chips"),
    btnAllTables: document.getElementById("btn-all-tables"),
    btnClearTables: document.getElementById("btn-clear-tables"),
    btnToggleTable: document.getElementById("btn-toggle-table"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    btnChineseTable: document.getElementById("btn-chinese-table"),
    fullTableWrap: document.getElementById("full-table-wrap"),
    fullTable: document.getElementById("full-table"),
    btnAnswerCheck: document.getElementById("btn-answer-check"),
    celebrationToast: document.getElementById("celebration-toast"),
    trophyToast: document.getElementById("trophy-toast"),
    setSummary: document.getElementById("set-summary"),
    setSummaryText: document.getElementById("set-summary-text"),
    setSummaryContinue: document.getElementById("set-summary-continue"),
    successBurst: document.getElementById("success-burst"),
  };

  const THEME_KEY = "mathGameTheme";
  const THEMES = ["classic", "retro", "unicorn"];

  let totalScore = 0;
  let cheatCount = 0;
  /** Every valid Check press this session (includes wrong retries). */
  let totalTried = 0;
  let currentA = 1;
  let currentB = 1;
  let currentAnswer = 1;
  let answered = false;
  /** Wrong Check submissions in a row on this question; 3rd wrong shows the answer. */
  let wrongAttemptsOnQuestion = 0;
  const MAX_WRONG_BEFORE_ANSWER = 3;
  /** Chinese lines only on the ladder table */
  let showTableChinese = false;

  const CELL_STATS_KEY = "mathCellStats";
  /** Saved score, cheat, tried — survives reload (browser localStorage, not HTTP cookies). */
  const PRACTICE_STATE_KEY = "mathPracticeState";
  /** Per pair "min-max": { r: right count, w: wrong count } */
  let cellStats = {};

  function initAnswerCheckButton() {
    if (!el.btnAnswerCheck) return;

    el.btnAnswerCheck.addEventListener(
      "pointerdown",
      function (e) {
        e.preventDefault();
      },
      true
    );

    el.btnAnswerCheck.addEventListener("click", function () {
      if (cheatAwaitingContinue) {
        advanceAfterAttempt();
        return;
      }
      if (!el.answerInput.disabled) {
        el.answerInput.focus();
      }
      submitAnswer();
    });
  }

  let selectedTables = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const QUESTIONS_PER_SET = 10;

  let slotInSet = 1;
  let setCorrect = 0;
  let setTotal = 0;
  /** Milliseconds from question shown until each correct Check (this set only). */
  let setCorrectDurationsMs = [];
  let questionStartedAtMs = 0;
  /** Frozen elapsed ms when question is finished (correct, cheat, or gave up). */
  let questionFrozenElapsedMs = 0;
  let questionTimerIntervalId = null;
  /** True once the clock is running (Q1: after first digit; Q2+: when question appears). */
  let questionTimerStarted = false;

  let trophyToastTimer = null;
  let celebrationToastTimer = null;
  /** True while waiting to auto-advance (correct or after answer reveal). */
  let waitingAutoAdvance = false;
  /** After cheat: answer shown; 🔎 or Enter advances (no auto timer). */
  let cheatAwaitingContinue = false;

  function removeRainLayers() {
    var a = document.getElementById("number-rain-layer");
    if (a) {
      a.remove();
    }
    var b = document.getElementById("party-rain-layer");
    if (b) {
      b.remove();
    }
  }

  /** Answer "0410" + Check — raining digits, no stats change. */
  function startNumberRain() {
    removeRainLayers();
    var layer = document.createElement("div");
    layer.id = "number-rain-layer";
    layer.className = "number-rain-layer";
    layer.setAttribute("aria-hidden", "true");
    var n = 80;
    for (var i = 0; i < n; i++) {
      var drop = document.createElement("span");
      drop.className = "number-rain-drop";
      drop.textContent = String(Math.floor(Math.random() * 10));
      drop.style.left = Math.random() * 100 + "%";
      drop.style.animationDuration = 2.2 + Math.random() * 4 + "s";
      drop.style.animationDelay = Math.random() * 2.2 + "s";
      drop.style.fontSize = 0.85 + Math.random() * 1.35 + "rem";
      drop.style.color = "hsl(" + Math.floor(Math.random() * 360) + ",72%,58%)";
      layer.appendChild(drop);
    }
    document.body.appendChild(layer);
    window.setTimeout(function () {
      if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
    }, 9500);
  }

  var PARTY_EMOJI = [
    "🎉",
    "🎊",
    "🥳",
    "🎈",
    "🎁",
    "✨",
    "🪩",
    "🍰",
    "🎂",
    "🥤",
    "🌟",
    "💫",
    "🎵",
    "🕺",
    "💃",
    "🎆",
    "🎇",
    "🥂",
    "🍭",
    "🦄",
  ];

  /** Answer "1218" + Check — party emojis with bounce on the “floor”. */
  function startPartyEmojiRain() {
    removeRainLayers();
    var layer = document.createElement("div");
    layer.id = "party-rain-layer";
    layer.className = "party-rain-layer";
    layer.setAttribute("aria-hidden", "true");
    var n = 64;
    for (var i = 0; i < n; i++) {
      var drop = document.createElement("span");
      drop.className = "party-rain-drop";
      drop.textContent = PARTY_EMOJI[Math.floor(Math.random() * PARTY_EMOJI.length)];
      drop.style.left = Math.random() * 100 + "%";
      drop.style.animationDuration = 2.8 + Math.random() * 3.8 + "s";
      drop.style.animationDelay = Math.random() * 2.5 + "s";
      drop.style.fontSize = 1.25 + Math.random() * 1.25 + "rem";
      layer.appendChild(drop);
    }
    document.body.appendChild(layer);
    window.setTimeout(function () {
      if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
    }, 11000);
  }

  function applyTheme(theme) {
    if (!THEMES.includes(theme)) {
      theme = "classic";
    }
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* ignore */
    }
    document.querySelectorAll(".btn-theme").forEach(function (btn) {
      var t = btn.getAttribute("data-set-theme");
      btn.setAttribute("aria-pressed", t === theme ? "true" : "false");
    });
  }

  function initTheme() {
    var saved = "classic";
    try {
      saved = localStorage.getItem(THEME_KEY) || "classic";
    } catch (err) {
      /* ignore */
    }
    applyTheme(saved);
    document.querySelectorAll(".btn-theme").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-set-theme"));
      });
    });
  }

  function showCelebration(message) {
    var t = el.celebrationToast;
    t.hidden = false;
    t.textContent = message;
    t.classList.remove("show");
    void t.offsetWidth;
    t.classList.add("show");
    if (celebrationToastTimer) {
      window.clearTimeout(celebrationToastTimer);
    }
    celebrationToastTimer = window.setTimeout(function () {
      t.classList.remove("show");
      celebrationToastTimer = window.setTimeout(function () {
        t.hidden = true;
      }, 350);
    }, 1500);
  }

  function playEquationYay() {
    el.equation.classList.remove("equation--yay");
    void el.equation.offsetWidth;
    el.equation.classList.add("equation--yay");
    window.setTimeout(function () {
      el.equation.classList.remove("equation--yay");
    }, 700);
  }

  /**
   * Active tables for practice. Empty selection is not used — Clear sets {1} only.
   * If somehow empty, fall back to 1×.
   */
  function getActiveTables() {
    if (selectedTables.size === 0) {
      return new Set([1]);
    }
    return selectedTables;
  }

  function buildQuestionPool() {
    const tables = getActiveTables();
    const pool = [];
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        if (tables.has(a) || tables.has(b)) {
          pool.push([a, b]);
        }
      }
    }
    return pool;
  }

  function pickRandomQuestion() {
    const pool = buildQuestionPool();
    const pair = pool[Math.floor(Math.random() * pool.length)];
    currentA = pair[0];
    currentB = pair[1];
    currentAnswer = currentA * currentB;
  }

  function updateQuestionPointsLabel() {
    if (!el.questionPoints) return;
    el.questionPoints.classList.remove("question-points-flair--earned");
    const p = pointsForQuestion(currentA, currentB);
    el.questionPoints.textContent = p + " pt";
    el.questionPoints.setAttribute(
      "aria-label",
      p === 1 ? "Worth 1 point" : "Worth " + p + " points"
    );
  }

  function renderEquation() {
    el.equation.textContent = `${currentA} × ${currentB} = ?`;
    updateQuestionPointsLabel();
  }

  /** One 🎉 flies from the points flair to the Score number (skipped if reduced motion). */
  function spawnFlyingCelebrationToScore() {
    if (!el.questionPoints || !el.totalScore) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    var fr = el.questionPoints.getBoundingClientRect();
    var sr = el.totalScore.getBoundingClientRect();
    var startX = fr.left + fr.width / 2;
    var startY = fr.top + fr.height / 2;
    var endX = sr.left + sr.width / 2;
    var endY = sr.top + sr.height / 2;

    var node = document.createElement("div");
    node.className = "flying-celebration";
    node.textContent = "🎉";
    node.setAttribute("aria-hidden", "true");
    node.style.setProperty("--fly-start-x", startX + "px");
    node.style.setProperty("--fly-start-y", startY + "px");
    node.style.setProperty("--fly-end-x", endX + "px");
    node.style.setProperty("--fly-end-y", endY + "px");
    document.body.appendChild(node);
    void node.offsetWidth;
    node.classList.add("flying-celebration--fly");

    window.setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 920);
  }

  function animateQuestionPointsFlairEarned(pts) {
    if (!el.questionPoints) return;
    el.questionPoints.textContent = "+" + pts + " pt 🎉";
    el.questionPoints.setAttribute(
      "aria-label",
      pts === 1
        ? "You earned 1 point. Celebration!"
        : "You earned " + pts + " points. Celebration!"
    );
    el.questionPoints.classList.remove("question-points-flair--earned");
    void el.questionPoints.offsetWidth;
    el.questionPoints.classList.add("question-points-flair--earned");
    window.requestAnimationFrame(function () {
      spawnFlyingCelebrationToScore();
    });
  }

  function updateTrophyProgressDisplay() {
    if (!el.trophyProgressFill || !el.trophyProgressBar) return;
    var into = totalScore % POINTS_PER_TROPHY;
    var pct = (into / POINTS_PER_TROPHY) * 100;
    el.trophyProgressFill.style.width = pct + "%";
    el.trophyProgressFill.classList.toggle(
      "trophy-progress-fill--has",
      into > 0
    );
    el.trophyProgressBar.setAttribute("aria-valuenow", String(into));
    el.trophyProgressBar.setAttribute("aria-valuemax", String(POINTS_PER_TROPHY));
    el.trophyProgressBar.setAttribute(
      "aria-valuetext",
      into +
        " of " +
        POINTS_PER_TROPHY +
        " points to next trophy"
    );
    if (el.trophyProgressCount) {
      el.trophyProgressCount.textContent =
        into + " / " + POINTS_PER_TROPHY;
    }
  }

  function updateTrophyCountText(n) {
    if (el.trophyDisplay) {
      el.trophyDisplay.textContent = String(n);
    }
  }

  /** @param {{ deferTrophyCount?: boolean }} [opts] */
  function updateScoreDisplay(opts) {
    opts = opts || {};
    el.totalScore.textContent = String(totalScore);
    if (!opts.deferTrophyCount) {
      updateTrophyCountText(trophyCountFromScore(totalScore));
    }
    updateTrophyProgressDisplay();
  }

  function triggerTrophyValuePop() {
    if (!el.trophyDisplay) return;
    el.trophyDisplay.classList.remove("trophy-value-pop");
    void el.trophyDisplay.offsetWidth;
    el.trophyDisplay.classList.add("trophy-value-pop");
  }

  function spawnSingleFlyingTrophy(done) {
    var startEl = el.trophyProgressGoal;
    if (!startEl || !el.trophyDisplay) {
      if (done) done();
      return;
    }
    var fr = startEl.getBoundingClientRect();
    var sr = el.trophyDisplay.getBoundingClientRect();
    var startX = fr.left + fr.width / 2;
    var startY = fr.top + fr.height / 2;
    var endX = sr.left + sr.width / 2;
    var endY = sr.top + sr.height / 2;

    var node = document.createElement("div");
    node.className = "flying-trophy";
    node.textContent = "🏆";
    node.setAttribute("aria-hidden", "true");
    node.style.setProperty("--fly-start-x", startX + "px");
    node.style.setProperty("--fly-start-y", startY + "px");
    node.style.setProperty("--fly-end-x", endX + "px");
    node.style.setProperty("--fly-end-y", endY + "px");
    document.body.appendChild(node);
    void node.offsetWidth;
    node.classList.add("flying-trophy--fly");

    window.setTimeout(function () {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
      if (done) done();
    }, 920);
  }

  /** When new trophy(ies) earned: fly 🏆 from progress goal to count; +1 and pop on each landing. */
  function runTrophyEarnedFlights(gained, troAfter) {
    if (gained <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      updateTrophyCountText(troAfter);
      triggerTrophyValuePop();
      return;
    }
    if (!el.trophyProgressGoal || !el.trophyDisplay) {
      updateTrophyCountText(troAfter);
      triggerTrophyValuePop();
      return;
    }
    var current = troAfter - gained;
    var left = gained;
    function next() {
      spawnSingleFlyingTrophy(function () {
        current += 1;
        updateTrophyCountText(current);
        triggerTrophyValuePop();
        left -= 1;
        if (left > 0) {
          window.setTimeout(next, 150);
        }
      });
    }
    next();
  }

  function updateCheatDisplay() {
    el.cheatCount.textContent = String(cheatCount);
  }

  function updateTriedDisplay() {
    var node = el.triedCount || document.getElementById("tried-count");
    if (node) {
      el.triedCount = node;
      node.textContent = String(totalTried);
    }
  }

  function updatePracticeButtons() {
    if (el.btnCheat) {
      el.btnCheat.hidden = answered;
      el.btnCheat.disabled = answered;
    }
  }

  function formatSecondsShort(sec) {
    if (!Number.isFinite(sec) || sec < 0) {
      sec = 0;
    }
    if (sec < 60) {
      var t = sec >= 10 ? sec.toFixed(0) : sec.toFixed(1);
      return t + "s";
    }
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function clearQuestionTimerTick() {
    if (questionTimerIntervalId !== null) {
      window.clearInterval(questionTimerIntervalId);
      questionTimerIntervalId = null;
    }
  }

  function updateQuestionTimerDisplay() {
    if (!el.questionTimer) return;
    var ms;
    if (answered) {
      ms = questionFrozenElapsedMs;
    } else if (!questionTimerStarted) {
      ms = 0;
    } else {
      ms = performance.now() - questionStartedAtMs;
    }
    el.questionTimer.textContent = formatSecondsShort(ms / 1000);
  }

  function freezeQuestionTimer() {
    if (!questionTimerStarted) {
      questionFrozenElapsedMs = 0;
    } else {
      questionFrozenElapsedMs = performance.now() - questionStartedAtMs;
    }
    clearQuestionTimerTick();
    updateQuestionTimerDisplay();
  }

  /**
   * Question 1 of each set: stay at 0.0s until the first digit (keyboard / on-screen keyboard).
   * Questions 2–10: start counting as soon as the question is shown.
   */
  function armQuestionTimer() {
    clearQuestionTimerTick();
    questionFrozenElapsedMs = 0;
    if (slotInSet === 1) {
      questionTimerStarted = false;
      questionStartedAtMs = 0;
    } else {
      questionTimerStarted = true;
      questionStartedAtMs = performance.now();
      questionTimerIntervalId = window.setInterval(updateQuestionTimerDisplay, 100);
    }
    updateQuestionTimerDisplay();
  }

  function maybeStartQuestionTimerFromInput() {
    if (answered || questionTimerStarted) return;
    if (!el.answerInput || el.answerInput.disabled || el.answerInput.readOnly) {
      return;
    }
    if (!/\d/.test(String(el.answerInput.value))) return;
    questionTimerStarted = true;
    questionStartedAtMs = performance.now();
    updateQuestionTimerDisplay();
    questionTimerIntervalId = window.setInterval(updateQuestionTimerDisplay, 100);
  }

  function updateSetAvgTimeDisplay() {
    if (!el.setAvgRightTime) return;
    if (setCorrectDurationsMs.length === 0) {
      el.setAvgRightTime.textContent = "—";
      return;
    }
    var sum = 0;
    for (var i = 0; i < setCorrectDurationsMs.length; i++) {
      sum += setCorrectDurationsMs[i];
    }
    var avgSec = sum / setCorrectDurationsMs.length / 1000;
    el.setAvgRightTime.textContent = formatSecondsShort(avgSec);
  }

  function updateSetDisplay() {
    el.setProgress.textContent = slotInSet + "/" + QUESTIONS_PER_SET;
    if (setTotal === 0) {
      el.setAccuracy.textContent = "—";
    } else {
      const pct = Math.round((100 * setCorrect) / setTotal);
      el.setAccuracy.textContent = `${pct}%`;
    }
    if (el.setProgressFill && el.setProgressBar) {
      var fillPct = Math.min(100, (setTotal / QUESTIONS_PER_SET) * 100);
      el.setProgressFill.style.width = fillPct + "%";
      el.setProgressBar.setAttribute("aria-valuemax", String(QUESTIONS_PER_SET));
      el.setProgressBar.setAttribute("aria-valuenow", String(setTotal));
      el.setProgressBar.setAttribute(
        "aria-valuetext",
        setTotal + " of " + QUESTIONS_PER_SET + " questions done in this set"
      );
      el.setProgressFill.classList.toggle(
        "set-progress-fill--has",
        setTotal > 0
      );
    }
    updateSetAvgTimeDisplay();
  }

  function triggerScorePop() {
    el.totalScore.classList.remove("pop");
    void el.totalScore.offsetWidth;
    el.totalScore.classList.add("pop");
  }

  function playSuccessBurst() {
    el.successBurst.classList.add("active");
    el.successBurst.setAttribute("aria-hidden", "false");
    window.setTimeout(function () {
      el.successBurst.classList.remove("active");
      el.successBurst.setAttribute("aria-hidden", "true");
    }, 650);
  }

  function maybeCelebrateTrophy(scoreBefore, scoreAfter) {
    const before = trophyCountFromScore(scoreBefore);
    const after = trophyCountFromScore(scoreAfter);
    const gained = after - before;
    if (gained <= 0) return;

    if (trophyToastTimer) {
      window.clearTimeout(trophyToastTimer);
      trophyToastTimer = null;
    }

    el.trophyToast.hidden = false;
    el.trophyToast.textContent =
      gained === 1
        ? "🏆 +1 🎉  You got a trophy!"
        : `🏆 +${gained} 🎉  You got ${gained} trophies!`;
    el.trophyToast.classList.add("show");
    window.setTimeout(playSoundTada, 200);

    trophyToastTimer = window.setTimeout(function () {
      el.trophyToast.classList.remove("show");
      trophyToastTimer = window.setTimeout(function () {
        el.trophyToast.hidden = true;
      }, 350);
    }, 2800);
  }

  function setFeedback(good, message) {
    el.feedback.textContent = message;
    el.feedback.className = "feedback-area" + (good ? " good" : " try");
  }

  function clearFeedback() {
    el.feedback.textContent = "";
    el.feedback.className = "feedback-area";
  }

  function clearCheatRevealUi() {
    cheatAwaitingContinue = false;
    el.answerInput.readOnly = false;
    el.answerInput.classList.remove("answer-input--cheat-reveal");
  }

  /** After answering or cheating: either open set summary or load next question */
  function advanceAfterAttempt() {
    clearCheatRevealUi();
    wrongAttemptsOnQuestion = 0;
    if (setTotal >= QUESTIONS_PER_SET) {
      if (el.setSummary.hidden) {
        openSetSummary();
      }
      return;
    }

    slotInSet += 1;
    answered = false;
    clearFeedback();
    el.answerInput.disabled = false;
    el.answerInput.value = "";
    updatePracticeButtons();
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateSetDisplay();
    el.answerInput.focus();
  }

  function submitAnswer() {
    if (answered || waitingAutoAdvance) {
      return;
    }

    const raw = el.answerInput.value.trim();
    if (raw === "") {
      setFeedback(false, "Type a number 🙂");
      return;
    }

    if (raw === "0410") {
      startNumberRain();
      el.answerInput.value = "";
      clearFeedback();
      el.answerInput.focus();
      return;
    }

    if (raw === "1218") {
      startPartyEmojiRain();
      el.answerInput.value = "";
      clearFeedback();
      el.answerInput.focus();
      return;
    }

    const val = parseInt(raw, 10);
    if (Number.isNaN(val)) {
      setFeedback(false, "Try a number 🙂");
      return;
    }

    totalTried += 1;
    updateTriedDisplay();

    const ok = val === currentAnswer;
    recordPairAttempt(currentA, currentB, ok);

    if (ok) {
      freezeQuestionTimer();
      setCorrectDurationsMs.push(questionFrozenElapsedMs);
      wrongAttemptsOnQuestion = 0;
      setCorrect += 1;
      setTotal += 1;
      answered = true;
      updatePracticeButtons();

      const pts = pointsForQuestion(currentA, currentB);
      const scoreBefore = totalScore;
      totalScore += pts;
      const troBefore = trophyCountFromScore(scoreBefore);
      const troAfter = trophyCountFromScore(totalScore);
      const troGained = troAfter - troBefore;
      updateScoreDisplay({ deferTrophyCount: troGained > 0 });
      if (troGained > 0) {
        runTrophyEarnedFlights(troGained, troAfter);
      }
      savePracticeState();
      maybeCelebrateTrophy(scoreBefore, totalScore);
      playSoundCorrect();
      triggerScorePop();
      animateQuestionPointsFlairEarned(pts);
      playSuccessBurst();
      playEquationYay();
      clearFeedback();
      showCelebration("Good job! ⭐ 🎉");

      updateSetDisplay();
      el.answerInput.disabled = true;
      waitingAutoAdvance = true;

      window.setTimeout(function () {
        waitingAutoAdvance = false;
        advanceAfterAttempt();
      }, 1100);
      return;
    }

    wrongAttemptsOnQuestion += 1;

    if (wrongAttemptsOnQuestion >= MAX_WRONG_BEFORE_ANSWER) {
      freezeQuestionTimer();
      setTotal += 1;
      answered = true;
      updatePracticeButtons();
      playSoundWrong();
      el.equation.textContent = `${currentA} × ${currentB} = ${currentAnswer}`;
      setFeedback(false, `Answer: ${currentAnswer} 🙂`);
      updateSetDisplay();
      el.answerInput.disabled = true;
      waitingAutoAdvance = true;

      window.setTimeout(function () {
        waitingAutoAdvance = false;
        advanceAfterAttempt();
      }, 2000);
      savePracticeState();
      return;
    }

    playSoundWrong();
    setFeedback(
      false,
      wrongAttemptsOnQuestion === 1 ? "Nice try 🙂 Try again!" : "One more try! 💪"
    );
    el.answerInput.value = "";
    el.answerInput.focus();
    updatePracticeButtons();
    savePracticeState();
  }

  /**
   * Cheat: show answer in the field (peek font), no points; +1 cheat; counts as one try.
   * Does not advance until 🔎 (or Enter).
   */
  function useCheat() {
    if (answered || waitingAutoAdvance || cheatAwaitingContinue) {
      return;
    }

    cheatCount += 1;
    updateCheatDisplay();
    savePracticeState();

    wrongAttemptsOnQuestion = 0;
    answered = true;
    cheatAwaitingContinue = true;
    freezeQuestionTimer();
    setTotal += 1;
    setFeedback(false, "Tap 🔎 for next 🙂");
    updateSetDisplay();

    el.answerInput.disabled = false;
    el.answerInput.readOnly = true;
    el.answerInput.value = String(currentAnswer);
    el.answerInput.classList.add("answer-input--cheat-reveal");
    updatePracticeButtons();

    el.answerInput.focus();
  }

  function openSetSummary() {
    var lines =
      "You got " + setCorrect + "/" + QUESTIONS_PER_SET + "!";
    if (setCorrect > 0 && setCorrectDurationsMs.length > 0) {
      var sum = 0;
      for (var i = 0; i < setCorrectDurationsMs.length; i++) {
        sum += setCorrectDurationsMs[i];
      }
      var avgSec = sum / setCorrectDurationsMs.length / 1000;
      lines +=
        " Average time when you got it right: " +
        formatSecondsShort(avgSec) +
        ".";
    }
    el.setSummaryText.textContent = lines;
    el.setSummary.hidden = false;
    el.setSummaryContinue.focus();
  }

  function closeSetSummaryAndContinue() {
    el.setSummary.hidden = true;
    clearCheatRevealUi();
    slotInSet = 1;
    setCorrect = 0;
    setTotal = 0;
    setCorrectDurationsMs = [];
    wrongAttemptsOnQuestion = 0;
    answered = false;
    clearFeedback();
    el.answerInput.disabled = false;
    el.answerInput.value = "";
    updatePracticeButtons();
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateSetDisplay();
    el.answerInput.focus();
  }

  function nextQuestion() {
    if (!answered || waitingAutoAdvance) {
      return;
    }

    if (cheatAwaitingContinue) {
      advanceAfterAttempt();
      return;
    }

    if (setTotal >= QUESTIONS_PER_SET) {
      if (el.setSummary.hidden) {
        openSetSummary();
      }
      return;
    }

    wrongAttemptsOnQuestion = 0;
    slotInSet += 1;
    answered = false;
    clearCheatRevealUi();
    clearFeedback();
    el.answerInput.disabled = false;
    el.answerInput.value = "";
    updatePracticeButtons();
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateSetDisplay();
    el.answerInput.focus();
  }

  function renderTableChips() {
    el.tableChips.innerHTML = "";
    const active = getActiveTables();
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-chip";
      btn.textContent = n + "×";
      btn.setAttribute("aria-pressed", active.has(n) ? "true" : "false");
      btn.addEventListener("click", function () {
        const next = new Set(selectedTables.size === 0 ? [1] : selectedTables);
        if (next.has(n)) {
          next.delete(n);
        } else {
          next.add(n);
        }
        if (next.size === 0) {
          next.add(1);
        }
        selectedTables = next;
        renderTableChips();
        if (!answered) {
          pickRandomQuestion();
          renderEquation();
          armQuestionTimer();
        }
      });
      el.tableChips.appendChild(btn);
    }
  }

  /**
   * Ladder: row j is exactly one line — 1×j=…  2×j=…  …  j×j=… (same order as printed 九九表).
   */
  function renderFullTable() {
    el.fullTable.innerHTML = "";
    for (let j = 1; j <= 9; j++) {
      const row = document.createElement("div");
      row.className = "table-row";
      for (let i = 1; i <= j; i++) {
        const item = document.createElement("div");
        item.className = "table-cell" + (showTableChinese ? "" : " no-cn");
        const prod = i * j;
        const cn = getChineseReading(i, j);
        const eq = document.createElement("span");
        eq.className = "eq";
        eq.textContent = i + "×" + j + "=" + prod;
        item.appendChild(eq);
        item.appendChild(buildCorrectnessBar(i, j));
        if (cn) {
          const line = document.createElement("span");
          line.className = "cn";
          line.textContent = cn;
          item.appendChild(line);
        }
        row.appendChild(item);
      }
      el.fullTable.appendChild(row);
    }
  }

  function updateChineseTableButton() {
    el.btnChineseTable.textContent = showTableChinese ? "Hide Chinese" : "Show Chinese";
    el.btnChineseTable.setAttribute("aria-expanded", String(showTableChinese));
  }

  function init() {
    initTheme();
    loadCellStats();
    loadPracticeState();
    renderTableChips();
    renderFullTable();
    updateChineseTableButton();
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateScoreDisplay();
    updateCheatDisplay();
    updateTriedDisplay();
    updateSetDisplay();
    updatePracticeButtons();

    if (el.btnCheat) {
      el.btnCheat.addEventListener("click", useCheat);
    }

    initAnswerCheckButton();

    /* Typing beep for hardware / mobile soft keyboard. */
    el.answerInput.addEventListener("input", function () {
      if (el.answerInput.disabled || el.answerInput.readOnly) return;
      playSoundType();
      maybeStartQuestionTimerFromInput();
    });

    (function bindAudioUnlockOnce() {
      var unlocked = false;
      function once() {
        if (unlocked) return;
        unlocked = true;
        unlockGameAudio();
        document.body.removeEventListener("pointerdown", once);
        document.body.removeEventListener("keydown", once);
      }
      document.body.addEventListener("pointerdown", once, { passive: true });
      document.body.addEventListener("keydown", once, { passive: true });
    })();

    el.answerInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (cheatAwaitingContinue) {
          advanceAfterAttempt();
          return;
        }
        if (!answered) {
          submitAnswer();
        } else if (!waitingAutoAdvance) {
          nextQuestion();
        }
      }
    });

    el.btnChineseTable.addEventListener("click", function () {
      showTableChinese = !showTableChinese;
      updateChineseTableButton();
      renderFullTable();
    });

    el.btnAllTables.addEventListener("click", function () {
      selectedTables = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      renderTableChips();
      if (!answered) {
        pickRandomQuestion();
        renderEquation();
        armQuestionTimer();
      }
    });

    el.btnClearTables.addEventListener("click", function () {
      selectedTables = new Set([1]);
      renderTableChips();
      if (!answered) {
        pickRandomQuestion();
        renderEquation();
        armQuestionTimer();
      }
    });

    el.btnToggleTable.addEventListener("click", function () {
      const open = el.fullTableWrap.hidden;
      el.fullTableWrap.hidden = !open;
      el.btnToggleTable.textContent = open ? "📊 Hide Table" : "📊 Show Table";
      el.btnToggleTable.setAttribute("aria-expanded", String(open));
      if (open) {
        renderFullTable();
      }
    });

    if (el.btnClearHistory) {
      el.btnClearHistory.addEventListener("click", function () {
        if (
          window.confirm(
            "Clear all saved progress? This removes ladder bars, score, tried count, and cheat count in this browser."
          )
        ) {
          clearStoredCellHistory();
        }
      });
    }

    el.setSummaryContinue.addEventListener("click", closeSetSummaryAndContinue);

    window.addEventListener("beforeunload", savePracticeState);
    el.answerInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
