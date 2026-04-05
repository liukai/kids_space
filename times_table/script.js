/**
 * Times Fun — 九九乘法表 practice (plain JS, no build)
 *
 * - Scoring: points from the smaller factor (2×9 & 9×2 both use 2); flair + flying 🎉
 * - Trophies: trophyCountFromScore(), compact strip atop practice panel; flying 🏆 to count + pop, maybeCelebrateTrophy()
 * - Set-of-10: strip below answer (Set bar + timer + avg + Right %); 10 dots; 10/10 idle — 🔄 New set; tap dots to review
 * - Table filter: getActiveTables() may be empty; Clear → no tables, practice disabled + hint
 * - Ladder table + bars: renderFullTable(), cellStats (localStorage), showTableChinese, Clear history
 * - Cheat: tiny corner control; fills answer in a peek font, no auto-advance — 🔎 or Enter continues
 * - Tried: totalTried — each Check, timeout, or cheat counts once
 * - Practice totals: localStorage mathPracticeState (score / cheat / tried survive reload)
 * - Wrong: no retries — show answer and auto-advance. 30s per question without finishing → same as wrong (time’s up).
 * - Correct: full equation + peek-style answer field (green), green set-dot; short pause then next.
 * - Secrets (answer + Check, no score): 0410 → number rain; 1218 → party emoji rain + floor bounce.
 * - Check button: under the answer; pointerdown prevents blur when tapping 🔎 on touch devices.
 * - Optional on-screen keypad (toggle; hidden by default; preference in localStorage).
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

  const PRACTICE_MODE_KEY = "mathPracticeMode";
  const CELL_STATS_KEY = "mathCellStats";
  const CELL_STATS_ADD_KEY = "mathCellStatsAdd";
  /** multiply | add */
  let practiceMode = "multiply";
  var multiplyCellStats = {};
  var addCellStats = {};
  /** Points at the active mode’s pair stats (see syncCellStatsRef). */
  var cellStats = multiplyCellStats;

  function syncCellStatsRef() {
    cellStats = practiceMode === "add" ? addCellStats : multiplyCellStats;
  }

  function loadPracticeModeFromStorage() {
    try {
      var v = localStorage.getItem(PRACTICE_MODE_KEY);
      if (v === "add" || v === "multiply") {
        practiceMode = v;
      }
    } catch (err) {
      /* ignore */
    }
  }

  function savePracticeMode() {
    try {
      localStorage.setItem(PRACTICE_MODE_KEY, practiceMode);
    } catch (err) {
      /* ignore */
    }
  }

  function isAddMode() {
    return practiceMode === "add";
  }

  function opSymbol() {
    return isAddMode() ? "+" : "×";
  }

  function computeAnswer(a, b) {
    return isAddMode() ? a + b : a * b;
  }

  function formatEquationFull(a, b, ans) {
    return a + " " + opSymbol() + " " + b + " = " + ans;
  }

  function loadCellStats() {
    multiplyCellStats = {};
    addCellStats = {};
    try {
      const raw = localStorage.getItem(CELL_STATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        multiplyCellStats =
          typeof parsed === "object" && parsed !== null ? parsed : {};
      }
    } catch (err) {
      multiplyCellStats = {};
    }
    try {
      const raw = localStorage.getItem(CELL_STATS_ADD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        addCellStats =
          typeof parsed === "object" && parsed !== null ? parsed : {};
      }
    } catch (err) {
      addCellStats = {};
    }
    syncCellStatsRef();
  }

  function saveCellStats() {
    try {
      localStorage.setItem(CELL_STATS_KEY, JSON.stringify(multiplyCellStats));
      localStorage.setItem(CELL_STATS_ADD_KEY, JSON.stringify(addCellStats));
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
      localStorage.removeItem(CELL_STATS_ADD_KEY);
      localStorage.removeItem(PRACTICE_STATE_KEY);
    } catch (err) {
      /* ignore */
    }
    multiplyCellStats = {};
    addCellStats = {};
    syncCellStatsRef();
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
    const sym = opSymbol();
    const total = st.r + st.w;
    if (total === 0) {
      return `${i}${sym}${j}: no tries yet`;
    }
    return `${i}${sym}${j}: ${st.r} right, ${st.w} wrong`;
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

  /** Points: multiply — smaller factor tier; add — sum tier. */
  function pointsForQuestion(a, b) {
    if (isAddMode()) {
      const s = a + b;
      if (s <= 6) return 1;
      if (s <= 10) return 2;
      if (s <= 14) return 3;
      return 4;
    }
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
    tableFilterWarn: document.getElementById("table-filter-warn"),
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
    btnNewSet: document.getElementById("btn-new-set"),
    btnSetSummary: document.getElementById("btn-set-summary"),
    successBurst: document.getElementById("success-burst"),
    numpad: document.getElementById("numpad"),
    btnToggleKeypad: document.getElementById("btn-toggle-keypad"),
    numpadBackspace: document.getElementById("numpad-backspace"),
  };

  const THEME_KEY = "mathGameTheme";
  const THEMES = ["classic", "retro", "unicorn"];
  /** "1" = keypad visible (optional; default hidden). */
  const KEYPAD_VISIBLE_KEY = "mathGameKeypadVisible";

  let totalScore = 0;
  let cheatCount = 0;
  /** Every valid Check press this session (includes wrong retries). */
  let totalTried = 0;
  let currentA = 1;
  let currentB = 1;
  let currentAnswer = 1;
  let answered = false;
  /** Chinese lines only on the ladder table */
  let showTableChinese = false;

  /** Saved score, cheat, tried — survives reload (browser localStorage, not HTTP cookies). */
  const PRACTICE_STATE_KEY = "mathPracticeState";

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

  function setKeypadVisible(show) {
    if (!el.numpad || !el.btnToggleKeypad) return;
    if (show) {
      el.numpad.removeAttribute("hidden");
    } else {
      el.numpad.setAttribute("hidden", "");
    }
    el.btnToggleKeypad.setAttribute("aria-expanded", show ? "true" : "false");
    el.btnToggleKeypad.textContent = "\u2328\ufe0f";
    el.btnToggleKeypad.setAttribute(
      "aria-label",
      show ? "Hide number keypad" : "Show number keypad"
    );
    el.btnToggleKeypad.setAttribute("title", show ? "Hide keypad" : "Show keypad");
    try {
      localStorage.setItem(KEYPAD_VISIBLE_KEY, show ? "1" : "0");
    } catch (err) {
      /* ignore */
    }
    if (show && el.answerInput && !el.answerInput.disabled) {
      window.requestAnimationFrame(function () {
        el.answerInput.focus();
      });
    }
  }

  function appendNumpadDigit(ch) {
    if (!el.answerInput || el.answerInput.disabled || el.answerInput.readOnly) {
      return;
    }
    var v = String(el.answerInput.value).replace(/\D/g, "");
    if (v.length >= 3) {
      return;
    }
    el.answerInput.value = v + ch;
    playSoundType();
    maybeStartQuestionTimerFromInput();
    el.answerInput.focus();
  }

  function numpadBackspace() {
    if (!el.answerInput || el.answerInput.disabled || el.answerInput.readOnly) {
      return;
    }
    var v = String(el.answerInput.value);
    el.answerInput.value = v.slice(0, Math.max(0, v.length - 1));
    playSoundType();
    el.answerInput.focus();
  }

  function initKeypad() {
    if (!el.numpad || !el.btnToggleKeypad) return;

    var savedOpen = false;
    try {
      savedOpen = localStorage.getItem(KEYPAD_VISIBLE_KEY) === "1";
    } catch (err) {
      /* ignore */
    }
    setKeypadVisible(savedOpen);

    el.btnToggleKeypad.addEventListener("click", function () {
      var open = el.numpad.hasAttribute("hidden");
      setKeypadVisible(open);
    });

    function bindPadButton(btn) {
      btn.addEventListener(
        "pointerdown",
        function (e) {
          e.preventDefault();
        },
        true
      );
    }

    document.querySelectorAll(".numpad-key[data-digit]").forEach(function (btn) {
      bindPadButton(btn);
      btn.addEventListener("click", function () {
        appendNumpadDigit(btn.getAttribute("data-digit") || "");
      });
    });

    if (el.numpadBackspace) {
      bindPadButton(el.numpadBackspace);
      el.numpadBackspace.addEventListener("click", numpadBackspace);
    }
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
  /** Wall-clock limit per question; on fire → treat as wrong and reveal answer. */
  let questionDeadlineTimeoutId = null;
  const QUESTION_TIME_LIMIT_MS = 30000;

  let trophyToastTimer = null;
  let celebrationToastTimer = null;
  /** True while waiting to auto-advance (correct or wrong-answer reveal). */
  let waitingAutoAdvance = false;
  /** After cheat: answer shown; 🔎 or Enter advances (no auto timer). */
  let cheatAwaitingContinue = false;

  /** Per finished question this set: null = not yet; ok = correct; warn = peek/cheat only; bad = miss. */
  var setQuestionMarks = new Array(QUESTIONS_PER_SET).fill(null);
  /** Same indices: { a, b } for each finished question (for dot review after set ends). */
  var setQuestionPairs = new Array(QUESTIONS_PER_SET).fill(null);

  function clearSetQuestionMarks() {
    setQuestionMarks = new Array(QUESTIONS_PER_SET).fill(null);
    setQuestionPairs = new Array(QUESTIONS_PER_SET).fill(null);
  }

  function isSetCompleteIdle() {
    return (
      setTotal >= QUESTIONS_PER_SET &&
      !waitingAutoAdvance &&
      !cheatAwaitingContinue
    );
  }

  /**
   * After 10/10, tap a dot to show that multiplication again (full answer in the equation line).
   * @param {number} slotIndex 0..9
   */
  function showReviewForSetSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= QUESTIONS_PER_SET) {
      return;
    }
    if (!isSetCompleteIdle()) {
      return;
    }
    var pair = setQuestionPairs[slotIndex];
    if (!pair) {
      return;
    }
    var prod = computeAnswer(pair.a, pair.b);
    el.equation.textContent = formatEquationFull(pair.a, pair.b, prod);
    if (el.questionPoints) {
      el.questionPoints.textContent = "";
      el.questionPoints.classList.remove("question-points-flair--earned");
      el.questionPoints.removeAttribute("aria-label");
    }
    setFeedback(
      true,
      "Question " +
        (slotIndex + 1) +
        ": " +
        formatEquationFull(pair.a, pair.b, prod)
    );
  }

  /**
   * @param {{ fail?: boolean, cheat?: boolean }} o
   */
  function recordSetQuestionOutcome(o) {
    var idx = setTotal - 1;
    if (idx < 0 || idx >= QUESTIONS_PER_SET) {
      return;
    }
    if (o.fail) {
      setQuestionMarks[idx] = "bad";
    } else if (o.cheat) {
      setQuestionMarks[idx] = "warn";
    } else {
      setQuestionMarks[idx] = "ok";
    }
    setQuestionPairs[idx] = { a: currentA, b: currentB };
  }

  function renderSetQuestionMarkers() {
    var row = document.getElementById("set-slot-markers");
    if (!row) {
      return;
    }
    row.innerHTML = "";
    var idleDone = isSetCompleteIdle();
    for (var i = 0; i < QUESTIONS_PER_SET; i++) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "set-slot-dot";
      var pair = setQuestionPairs[i];
      var canReview = idleDone && pair != null;
      dot.disabled = !canReview;
      var st = setQuestionMarks[i];
      if (st === "bad") {
        dot.classList.add("set-slot-dot--bad");
        dot.title = canReview
          ? "Show again: question " + (i + 1)
          : "Missed (answer shown)";
      } else if (st === "warn") {
        dot.classList.add("set-slot-dot--warn");
        dot.title = canReview
          ? "Show again: question " + (i + 1)
          : "Peek 🙈";
      } else if (st === "ok") {
        dot.classList.add("set-slot-dot--ok");
        dot.title = canReview
          ? "Show again: question " + (i + 1)
          : "Nice — quick and clean";
      } else {
        dot.classList.add("set-slot-dot--todo");
        dot.title = "Question " + (i + 1) + " not done yet";
      }
      if (pair) {
        dot.setAttribute(
          "aria-label",
          canReview
            ? "Show question " +
                (i + 1) +
                " again: " +
                pair.a +
                " " +
                opSymbol() +
                " " +
                pair.b
            : "Question " + (i + 1) + " done"
        );
      } else {
        dot.setAttribute("aria-label", "Question " + (i + 1) + " not done yet");
      }
      dot.dataset.slotIndex = String(i);
      dot.addEventListener("click", function (ev) {
        var t = ev.currentTarget;
        var idx = parseInt(t.getAttribute("data-slot-index") || "", 10);
        if (!Number.isFinite(idx)) {
          return;
        }
        showReviewForSetSlot(idx);
      });
      row.appendChild(dot);
    }
  }

  function updateNewSetButton() {
    if (!el.btnNewSet) {
      return;
    }
    el.btnNewSet.disabled = selectedTables.size === 0;
  }

  function updateSetSummaryButton() {
    if (!el.btnSetSummary) {
      return;
    }
    el.btnSetSummary.hidden = !isSetCompleteIdle();
  }

  function resetCurrentSet() {
    if (el.setSummary) {
      el.setSummary.hidden = true;
    }
    waitingAutoAdvance = false;
    cheatAwaitingContinue = false;
    clearCorrectAnswerHighlight();
    clearQuestionDeadline();
    slotInSet = 1;
    setCorrect = 0;
    setTotal = 0;
    setCorrectDurationsMs = [];
    clearSetQuestionMarks();
    answered = false;
    clearCheatRevealUi();
    clearFeedback();
    clearQuestionTimerTick();
    questionTimerStarted = false;
    questionFrozenElapsedMs = 0;
    updateQuestionTimerDisplay();
    el.answerInput.value = "";
    updatePracticeButtons();
    if (selectedTables.size === 0) {
      syncTableSelectionPracticeUI();
      updateSetDisplay();
      return;
    }
    el.answerInput.disabled = false;
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateSetDisplay();
    el.answerInput.focus();
  }

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

  /** Selected tables for practice; may be empty (no questions until user picks at least one). */
  function getActiveTables() {
    return selectedTables;
  }

  /** No tables → disable answer path, show hints (filter strip + feedback). */
  function syncTableSelectionPracticeUI() {
    if (selectedTables.size === 0) {
      clearQuestionTimerTick();
      questionTimerStarted = false;
      questionFrozenElapsedMs = 0;
      updateQuestionTimerDisplay();
      answered = false;
      waitingAutoAdvance = false;
      cheatAwaitingContinue = false;
      clearQuestionDeadline();
      clearCheatRevealUi();
      clearCorrectAnswerHighlight();
      if (el.answerInput) {
        el.answerInput.disabled = true;
        el.answerInput.value = "";
        el.answerInput.readOnly = false;
        el.answerInput.classList.remove("answer-input--cheat-reveal");
      }
      if (el.btnAnswerCheck) {
        el.btnAnswerCheck.disabled = true;
      }
      if (el.btnToggleKeypad) {
        el.btnToggleKeypad.disabled = true;
      }
      if (el.numpad) {
        el.numpad.setAttribute("hidden", "");
        if (el.btnToggleKeypad) {
          el.btnToggleKeypad.setAttribute("aria-expanded", "false");
        }
      }
      renderEquation();
      setFeedback(false, "Pick at least one number above 🙂");
      if (el.tableFilterWarn) {
        el.tableFilterWarn.hidden = false;
        el.tableFilterWarn.textContent = isAddMode()
          ? "Choose at least one digit (1–9), or tap 🔢 All."
          : "Choose at least one number (1×–9×), or tap 🔢 All.";
      }
      updatePracticeButtons();
      updateSetDisplay();
      return;
    }

    if (el.tableFilterWarn) {
      el.tableFilterWarn.hidden = true;
      el.tableFilterWarn.textContent = "";
    }
    if (el.btnAnswerCheck) {
      el.btnAnswerCheck.disabled = false;
    }
    if (el.btnToggleKeypad) {
      el.btnToggleKeypad.disabled = false;
    }
    updatePracticeButtons();
    if (el.answerInput) {
      el.answerInput.disabled = answered;
    }
    updateSetDisplay();
  }

  function buildQuestionPool() {
    const tables = getActiveTables();
    const pool = [];
    if (tables.size === 0) {
      return pool;
    }
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
    if (pool.length === 0) {
      currentA = 0;
      currentB = 0;
      currentAnswer = 0;
      return;
    }
    const pair = pool[Math.floor(Math.random() * pool.length)];
    currentA = pair[0];
    currentB = pair[1];
    currentAnswer = computeAnswer(currentA, currentB);
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
    if (selectedTables.size === 0) {
      el.equation.textContent = "— " + opSymbol() + " — = ?";
      if (el.questionPoints) {
        el.questionPoints.textContent = "";
        el.questionPoints.classList.remove("question-points-flair--earned");
        el.questionPoints.removeAttribute("aria-label");
      }
      return;
    }
    el.equation.textContent =
      currentA + " " + opSymbol() + " " + currentB + " = ?";
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
      var noTables = selectedTables.size === 0;
      el.btnCheat.hidden = answered || noTables;
      el.btnCheat.disabled = answered || noTables;
    }
    if (el.btnAnswerCheck) {
      if (cheatAwaitingContinue) {
        el.btnAnswerCheck.setAttribute("aria-label", "Next question");
        el.btnAnswerCheck.setAttribute("title", "Next question");
      } else {
        el.btnAnswerCheck.setAttribute("aria-label", "Check answer");
        el.btnAnswerCheck.setAttribute("title", "Check answer");
      }
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
    armQuestionDeadline();
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

  function clearQuestionDeadline() {
    if (questionDeadlineTimeoutId !== null) {
      window.clearTimeout(questionDeadlineTimeoutId);
      questionDeadlineTimeoutId = null;
    }
  }

  function armQuestionDeadline() {
    clearQuestionDeadline();
    if (selectedTables.size === 0) return;
    if (answered || waitingAutoAdvance || cheatAwaitingContinue) return;
    questionDeadlineTimeoutId = window.setTimeout(
      onQuestionTimeExpired,
      QUESTION_TIME_LIMIT_MS
    );
  }

  function onQuestionTimeExpired() {
    questionDeadlineTimeoutId = null;
    if (answered || waitingAutoAdvance || cheatAwaitingContinue) return;
    if (selectedTables.size === 0) return;

    var elapsed = questionTimerStarted
      ? performance.now() - questionStartedAtMs
      : QUESTION_TIME_LIMIT_MS;
    questionFrozenElapsedMs = elapsed;
    questionTimerStarted = false;
    clearQuestionTimerTick();
    updateQuestionTimerDisplay();

    totalTried += 1;
    updateTriedDisplay();
    recordPairAttempt(currentA, currentB, false);
    applyWrongRevealAndScheduleAdvance(
      "Time's up! " + formatEquationFull(currentA, currentB, currentAnswer) + " 🙂"
    );
  }

  function applyWrongRevealAndScheduleAdvance(feedbackMsg) {
    clearQuestionDeadline();
    clearQuestionTimerTick();
    questionTimerStarted = false;
    setTotal += 1;
    recordSetQuestionOutcome({ fail: true });
    answered = true;
    updateQuestionTimerDisplay();
    updatePracticeButtons();
    playSoundWrong();
    el.equation.textContent = formatEquationFull(currentA, currentB, currentAnswer);
    el.answerInput.value = String(currentAnswer);
    el.answerInput.readOnly = true;
    el.answerInput.classList.add("answer-input--cheat-reveal");
    el.answerInput.classList.remove("answer-input--correct");
    el.answerInput.disabled = true;
    setFeedback(false, feedbackMsg);
    updateSetDisplay();
    waitingAutoAdvance = true;
    window.setTimeout(function () {
      waitingAutoAdvance = false;
      advanceAfterAttempt();
    }, 2000);
    savePracticeState();
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
    renderSetQuestionMarkers();
    updateNewSetButton();
    updateSetSummaryButton();
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

    var plusEl = document.getElementById("trophy-toast-plus");
    var cheerEl = document.getElementById("trophy-toast-cheer");
    if (plusEl) {
      plusEl.textContent = gained === 1 ? "+1" : "+" + gained;
    }
    if (cheerEl) {
      cheerEl.textContent =
        gained === 1
          ? "You got a trophy!"
          : "You got " + gained + " trophies!";
    }
    el.trophyToast.setAttribute(
      "aria-label",
      gained === 1
        ? "Trophy earned. Plus one."
        : gained + " trophies earned."
    );

    el.trophyToast.hidden = false;
    el.trophyToast.classList.remove("show");
    void el.trophyToast.offsetWidth;
    el.trophyToast.classList.add("show");
    window.setTimeout(playSoundTada, 200);

    trophyToastTimer = window.setTimeout(function () {
      el.trophyToast.classList.remove("show");
      trophyToastTimer = window.setTimeout(function () {
        el.trophyToast.hidden = true;
      }, 380);
    }, 3200);
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

  function clearCorrectAnswerHighlight() {
    if (el.answerInput) {
      el.answerInput.classList.remove("answer-input--correct");
    }
    if (el.equation) {
      el.equation.classList.remove("equation--answer-pop");
    }
  }

  /** After answering or cheating: load next question, or idle at 10/10 (no auto summary / new set). */
  function advanceAfterAttempt() {
    clearQuestionDeadline();
    clearCheatRevealUi();
    clearCorrectAnswerHighlight();
    if (setTotal >= QUESTIONS_PER_SET) {
      clearQuestionTimerTick();
      questionTimerStarted = false;
      questionFrozenElapsedMs = 0;
      updateQuestionTimerDisplay();
      answered = true;
      el.answerInput.disabled = true;
      el.answerInput.value = "";
      el.answerInput.readOnly = false;
      el.answerInput.classList.remove("answer-input--cheat-reveal");
      var msg =
        "Set done! You got " + setCorrect + "/" + QUESTIONS_PER_SET + ".";
      if (setCorrect > 0 && setCorrectDurationsMs.length > 0) {
        var sum = 0;
        for (var ai = 0; ai < setCorrectDurationsMs.length; ai++) {
          sum += setCorrectDurationsMs[ai];
        }
        var avgSec = sum / setCorrectDurationsMs.length / 1000;
        msg +=
          " Avg when right: " + formatSecondsShort(avgSec) + ".";
      }
      msg += " Tap a dot to see a question again, or 🔄 New set.";
      setFeedback(true, msg);
      updatePracticeButtons();
      updateSetDisplay();
      return;
    }

    slotInSet += 1;
    answered = false;
    clearFeedback();
    el.answerInput.value = "";
    updatePracticeButtons();
    if (selectedTables.size === 0) {
      syncTableSelectionPracticeUI();
      updateSetDisplay();
      return;
    }
    el.answerInput.disabled = false;
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
    if (selectedTables.size === 0) {
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
      clearQuestionDeadline();
      freezeQuestionTimer();
      setCorrectDurationsMs.push(questionFrozenElapsedMs);
      setCorrect += 1;
      setTotal += 1;
      recordSetQuestionOutcome({ fail: false, cheat: false });
      el.equation.textContent = formatEquationFull(currentA, currentB, currentAnswer);
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
      el.answerInput.value = String(currentAnswer);
      el.answerInput.readOnly = true;
      el.answerInput.classList.add("answer-input--cheat-reveal");
      el.answerInput.classList.add("answer-input--correct");
      el.answerInput.disabled = true;
      waitingAutoAdvance = true;

      window.setTimeout(function () {
        waitingAutoAdvance = false;
        advanceAfterAttempt();
      }, 1100);
      return;
    }

    freezeQuestionTimer();
    applyWrongRevealAndScheduleAdvance("Answer: " + currentAnswer + " 🙂");
    return;
  }

  /**
   * Cheat: show answer in the field (peek font), no points; +1 cheat; counts as one try.
   * Does not advance until 🔎 (or Enter).
   */
  function useCheat() {
    if (answered || waitingAutoAdvance || cheatAwaitingContinue) {
      return;
    }
    if (selectedTables.size === 0) {
      return;
    }

    clearQuestionDeadline();
    cheatCount += 1;
    updateCheatDisplay();
    savePracticeState();

    answered = true;
    cheatAwaitingContinue = true;
    freezeQuestionTimer();
    setTotal += 1;
    recordSetQuestionOutcome({ cheat: true });
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
    lines += " Tap 🔄 New set for another round.";
    el.setSummaryText.textContent = lines;
    el.setSummary.hidden = false;
    updateNewSetButton();
    el.setSummaryContinue.focus();
  }

  function closeSetSummaryDialog() {
    el.setSummary.hidden = true;
    updateNewSetButton();
    updateSetSummaryButton();
  }

  function nextQuestion() {
    if (!answered || waitingAutoAdvance) {
      return;
    }

    clearQuestionDeadline();

    if (cheatAwaitingContinue) {
      advanceAfterAttempt();
      return;
    }

    if (setTotal >= QUESTIONS_PER_SET) {
      return;
    }

    slotInSet += 1;
    answered = false;
    clearCheatRevealUi();
    clearFeedback();
    el.answerInput.value = "";
    updatePracticeButtons();
    if (selectedTables.size === 0) {
      syncTableSelectionPracticeUI();
      updateSetDisplay();
      return;
    }
    el.answerInput.disabled = false;
    pickRandomQuestion();
    renderEquation();
    armQuestionTimer();
    updateSetDisplay();
    el.answerInput.focus();
  }

  function renderTableChips() {
    el.tableChips.innerHTML = "";
    const chipSuffix = isAddMode() ? "+" : "×";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-chip";
      btn.textContent = n + chipSuffix;
      btn.setAttribute("aria-pressed", selectedTables.has(n) ? "true" : "false");
      btn.addEventListener("click", function () {
        const next = new Set(selectedTables);
        if (next.has(n)) {
          next.delete(n);
        } else {
          next.add(n);
        }
        selectedTables = next;
        renderTableChips();
        if (selectedTables.size > 0) {
          clearFeedback();
        }
        syncTableSelectionPracticeUI();
        if (selectedTables.size > 0 && !answered) {
          pickRandomQuestion();
          renderEquation();
          armQuestionTimer();
          el.answerInput.focus();
        }
      });
      el.tableChips.appendChild(btn);
    }
  }

  /**
   * Ladder: times mode — 九九 triangle; add mode — same layout with i+j sums.
   */
  function renderFullTable() {
    el.fullTable.innerHTML = "";
    var sym = opSymbol();
    for (let j = 1; j <= 9; j++) {
      const row = document.createElement("div");
      row.className = "table-row";
      for (let i = 1; i <= j; i++) {
        const item = document.createElement("div");
        item.className =
          "table-cell" +
          (showTableChinese && !isAddMode() ? "" : " no-cn");
        const result = computeAnswer(i, j);
        const eq = document.createElement("span");
        eq.className = "eq";
        eq.textContent = i + sym + j + "=" + result;
        item.appendChild(eq);
        item.appendChild(buildCorrectnessBar(i, j));
        if (!isAddMode()) {
          const cn = getChineseReading(i, j);
          if (cn) {
            const line = document.createElement("span");
            line.className = "cn";
            line.textContent = cn;
            item.appendChild(line);
          }
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

  function refreshTableToggleLabel() {
    if (!el.btnToggleTable || !el.fullTableWrap) return;
    if (el.fullTableWrap.hidden) {
      el.btnToggleTable.textContent = isAddMode()
        ? "📊 Show addition chart"
        : "📊 Show Table";
    } else {
      el.btnToggleTable.textContent = isAddMode()
        ? "📊 Hide chart"
        : "📊 Hide Table";
    }
  }

  function updateAnswerInputMax() {
    if (!el.answerInput) return;
    el.answerInput.max = isAddMode() ? "18" : "81";
  }

  function updateFilterPanelForMode() {
    var heading = document.getElementById("filter-heading");
    var hint = document.getElementById("filter-hint");
    if (heading) {
      heading.textContent = isAddMode() ? "Pick numbers" : "Pick tables";
    }
    if (hint) {
      hint.textContent = isAddMode()
        ? "Practice sums that use at least one of these digits (1–9 + 1–9)."
        : "Choose which numbers to use in facts (either factor).";
    }
    if (el.btnAllTables) {
      el.btnAllTables.setAttribute(
        "aria-label",
        isAddMode()
          ? "Select all digits 1 through 9 for addition"
          : "Select all tables (1× through 9×)"
      );
    }
    if (el.tableChips) {
      el.tableChips.setAttribute(
        "aria-label",
        isAddMode()
          ? "Digits to include in addition practice"
          : "Numbers to include in multiplication practice"
      );
    }
  }

  function updateTablePanelForMode() {
    if (el.btnChineseTable) {
      el.btnChineseTable.hidden = isAddMode();
    }
    refreshTableToggleLabel();
  }

  function applyPracticeModeUI() {
    document.querySelectorAll(".btn-practice-mode").forEach(function (btn) {
      var m = btn.getAttribute("data-practice-mode");
      btn.setAttribute("aria-pressed", m === practiceMode ? "true" : "false");
    });
    savePracticeMode();
    syncCellStatsRef();
    updateFilterPanelForMode();
    updateTablePanelForMode();
    updateAnswerInputMax();
    renderTableChips();
    if (el.fullTableWrap && !el.fullTableWrap.hidden) {
      renderFullTable();
    }
    updateChineseTableButton();
  }

  function setPracticeMode(next) {
    if (next !== "multiply" && next !== "add") return;
    if (next === practiceMode) return;
    if (next === "add") {
      showTableChinese = false;
    }
    practiceMode = next;
    applyPracticeModeUI();
    resetCurrentSet();
  }

  function init() {
    initTheme();
    loadPracticeModeFromStorage();
    loadCellStats();
    loadPracticeState();
    applyPracticeModeUI();
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
    initKeypad();

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
      clearFeedback();
      syncTableSelectionPracticeUI();
      if (!answered) {
        pickRandomQuestion();
        renderEquation();
        armQuestionTimer();
        el.answerInput.focus();
      }
    });

    el.btnClearTables.addEventListener("click", function () {
      selectedTables = new Set();
      renderTableChips();
      syncTableSelectionPracticeUI();
    });

    el.btnToggleTable.addEventListener("click", function () {
      const open = el.fullTableWrap.hidden;
      el.fullTableWrap.hidden = !open;
      refreshTableToggleLabel();
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

    el.setSummaryContinue.addEventListener("click", closeSetSummaryDialog);

    document.querySelectorAll(".btn-practice-mode").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = btn.getAttribute("data-practice-mode");
        if (m === "multiply" || m === "add") {
          setPracticeMode(m);
        }
      });
    });

    if (el.btnSetSummary) {
      el.btnSetSummary.addEventListener("click", function () {
        if (!isSetCompleteIdle()) {
          return;
        }
        openSetSummary();
      });
    }

    if (el.btnNewSet) {
      el.btnNewSet.addEventListener("click", function () {
        resetCurrentSet();
      });
    }

    window.addEventListener("beforeunload", savePracticeState);
    if (selectedTables.size > 0) {
      el.answerInput.focus();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
