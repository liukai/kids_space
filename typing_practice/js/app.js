/**
 * Typing practice — main application (UI, typing loop, speech, stats).
 * Loads js/config.js first, then data/words.json (or window.TYPING_PRACTICE_PRELOADED_WORDS when bundled).
 */
(function () {
  const cfg = window.TYPING_PRACTICE_CONFIG;
  if (!cfg || !cfg.storage || !cfg.paths) {
    console.error("typing_practice: Load js/config.js before js/app.js (missing TYPING_PRACTICE_CONFIG).");
    return;
  }

  const LS_STATS = cfg.storage.statsKey;
  const LS_ZH_VOICE = cfg.storage.zhVoiceKey;
  const LS_EN_VOICE = cfg.storage.enVoiceKey;
  const LS_TTS_MASTER =
    cfg.storage.ttsMasterKey || "typingPracticeTtsMaster";
  const LS_TTS_EN = cfg.storage.ttsEnKey || "typingPracticeTtsEn";
  const LS_TTS_ZH = cfg.storage.ttsZhKey || "typingPracticeTtsZh";
  const LS_KEY_SOUNDS =
    cfg.storage.keySoundsKey || "typingPracticeKeySounds";
  const LS_KB_ROWS = cfg.storage.kbRowsKey || "typingPracticeKbRows";

  /** @type {{ w: string, zh: string, kind: string, e: string, level?: string, difficulty?: number }[]} */
  let wordBank = [];

  /** Cached Sets from cfg.inference (filled in boot). */
  let _infCvcHarder = /** @type {Set<string>} */ (new Set());
  let _infSight2 = /** @type {Set<string>} */ (new Set());
  let _infSight3 = /** @type {Set<string>} */ (new Set());

  function buildInferenceCaches() {
    const inf = cfg.inference;
    _infCvcHarder = new Set(inf.cvcHarderWords || []);
    _infSight2 = new Set(
      String(inf.sightTier2Words || "")
        .split(/\s+/)
        .filter(Boolean)
    );
    _infSight3 = new Set(
      String(inf.sightTier3Words || "")
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  function clampDifficulty(d) {
    const lo = cfg.difficulty.min;
    const hi = cfg.difficulty.max;
    const n = Math.round(Number(d));
    if (Number.isNaN(n) || n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  /** Used if JSON entry has no `difficulty` (see config.inference). */
  function inferDifficulty(e) {
    const k = e.kind;
    const raw = e.w.toLowerCase().replace(/[.,]/g, "").trim();
    const wc = raw.split(/\s+/).filter(Boolean).length;
    if (k === "cvc") {
      if (_infCvcHarder.has(raw)) return 3;
      return 2;
    }
    if (k === "phrase") {
      const maxW = cfg.inference.phraseShortMaxWords;
      const maxC = cfg.inference.phraseShortMaxChars;
      if (wc <= 3 && e.w.length < maxC) return 4;
      if (wc <= maxW) return 4;
      return 5;
    }
    if (k === "sight") {
      if (_infSight2.has(raw)) return 2;
      if (_infSight3.has(raw)) return 3;
      return 3;
    }
    const L = e.w.length;
    if (L <= 4) return 3;
    if (L <= 7) return 4;
    return 5;
  }

  function difficultyForEntry(entry) {
    if (!entry) return cfg.difficulty.min;
    if (entry.difficulty != null) return clampDifficulty(entry.difficulty);
    return clampDifficulty(inferDifficulty(entry));
  }

  function finalizeWordDifficulties() {
    for (let i = 0; i < wordBank.length; i++) {
      const e = wordBank[i];
      if (e.difficulty == null) e.difficulty = inferDifficulty(e);
      else e.difficulty = clampDifficulty(e.difficulty);
    }
  }

  /** Normalize & filter rows from JSON. */
  function normalizeWordBank(raw) {
    const kinds = new Set(cfg.wordSchema.allowedKinds || []);
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      if (!row || typeof row !== "object") continue;
      const w = row.w;
      const zh = row.zh;
      const kind = row.kind;
      const e = row.e;
      if (typeof w !== "string" || typeof zh !== "string" || typeof kind !== "string" || typeof e !== "string")
        continue;
      if (!kinds.has(kind)) {
        console.warn("typing_practice: skip unknown kind", kind, w);
        continue;
      }
      const o = { w, zh, kind, e };
      if (row.level != null && row.level !== "") o.level = String(row.level);
      if (row.difficulty != null && row.difficulty !== "") {
        const d = Number(row.difficulty);
        if (!Number.isNaN(d)) o.difficulty = d;
      }
      out.push(o);
    }
    return out;
  }

  async function loadWordBankAsync() {
    /* file:// cannot fetch sibling JSON in most browsers — js/words-data.js sets this */
    if (typeof TYPING_PRACTICE_PRELOADED_WORDS !== "undefined")
      return normalizeWordBank(TYPING_PRACTICE_PRELOADED_WORDS);
    try {
      const url = new URL(cfg.paths.wordsJson, window.location.href);
      const res = await fetch(url.href);
      if (!res.ok) throw new Error("words.json: HTTP " + res.status);
      const data = await res.json();
      return normalizeWordBank(data);
    } catch (err) {
      console.error(
        "typing_practice: could not load words (fetch failed). For opening index.html directly, run: python3 tools/sync_words_to_js.py and keep js/words-data.js in index.html.",
        err
      );
      throw err;
    }
  }

  /** Large type banner (emoji + short label) for kids. */
  const KIND_TYPE_BANNER = {
    cvc: { emoji: "🐸", label: "Sound-out word" },
    sight: { emoji: "❤️", label: "Sight word" },
    simple: { emoji: "📖", label: "Vocab word" },
    phrase: { emoji: "📝", label: "Sentence" },
  };

  function wordTypeBannerHTML(kind) {
    const t = KIND_TYPE_BANNER[kind];
    if (!t) return "";
    return (
      '<div class="word-type-banner" role="status">' +
      '<span class="word-type-hero" aria-hidden="true">' +
      t.emoji +
      "</span>" +
      '<span class="word-type-title">' +
      t.label +
      "</span>" +
      "</div>"
    );
  }

  function wordTypeBannerLetterHTML() {
    return (
      '<div class="word-type-banner word-type-banner--letter" role="status">' +
      '<span class="word-type-hero" aria-hidden="true">🔤</span>' +
      '<span class="word-type-title">Letter</span>' +
      "</div>"
    );
  }

  function wordTypeBannerQuizHTML() {
    return (
      '<div class="word-type-banner word-type-banner--quiz" role="status">' +
      '<span class="word-type-hero" aria-hidden="true">🎲</span>' +
      '<span class="word-type-title">Quiz</span>' +
      "</div>"
    );
  }

  /** Filled ★ = reached level, ☆ = not yet (1…dmax). */
  function buildLevelStars(dv, dmax, sizeClass) {
    const sc = sizeClass ? " " + sizeClass : "";
    let html = "";
    for (let i = 1; i <= dmax; i++) {
      const on = i <= dv;
      html +=
        '<span class="diff-star' +
        sc +
        (on ? " lit" : "") +
        '" title="' +
        (on ? "Star " + i + " of " + dmax + " (active)" : "Star " + i + " of " + dmax) +
        '">' +
        (on ? "★" : "☆") +
        "</span>";
    }
    return html;
  }

  function difficultyMeterHTML(d, opts) {
    const o = opts || {};
    const dv = clampDifficulty(d);
    const levels = cfg.difficultyLevels;
    const meta = levels[dv - 1];
    const quizMix = o.quizMix;
    const compact = o.compact;
    const dmax = cfg.difficulty.max;
    if (quizMix) {
      if (compact) {
        return (
          wordTypeBannerQuizHTML() +
          '<div class="diff-compact diff-compact--quiz" role="status">' +
          '<span class="diff-star-row diff-star-row--inline" aria-hidden="true">' +
          buildLevelStars(5, dmax, " diff-star--sm") +
          "</span>" +
          '<span class="diff-compact-denom">All levels ①–⑤</span>' +
          "</div>"
        );
      }
      return (
        '<div class="diff-star-row" aria-hidden="true">' +
        buildLevelStars(5, dmax, "") +
        "</div>" +
        '<div class="diff-fun-title"><span class="diff-big-emoji" aria-hidden="true">🎲</span>Mixed quiz</div>' +
        '<div class="diff-fun-sub">①–⑤ all in one go</div>'
      );
    }
    if (compact && o.letter) {
      const starsSm = buildLevelStars(dv, dmax, " diff-star--sm");
      const easy = levels[0];
      const easyTxt = easy ? easy.emoji + " " + easy.label : "① Easy";
      return (
        wordTypeBannerLetterHTML() +
        '<div class="diff-compact diff-compact--letter" role="status">' +
        '<span class="diff-star-row diff-star-row--inline" aria-hidden="true">' +
        starsSm +
        "</span>" +
        '<span class="diff-compact-main">' +
        easyTxt +
        "</span>" +
        "</div>"
      );
    }
    if (compact && meta && o.kind && KIND_TYPE_BANNER[o.kind]) {
      const starsSm = buildLevelStars(dv, dmax, " diff-star--sm");
      return (
        wordTypeBannerHTML(o.kind) +
        '<div class="diff-compact diff-compact--word" role="status">' +
        '<span class="diff-star-row diff-star-row--inline" aria-hidden="true">' +
        starsSm +
        "</span>" +
        '<span class="diff-compact-main">' +
        meta.emoji +
        " " +
        meta.label +
        "</span>" +
        '<span class="diff-compact-denom">' +
        dv +
        "/" +
        dmax +
        "</span>" +
        "</div>"
      );
    }
    const starsFull = buildLevelStars(dv, dmax, "");
    if (!meta) {
      return '<div class="diff-star-row" aria-hidden="true">' + starsFull + "</div>";
    }
    return (
      '<div class="diff-star-row" aria-hidden="true">' +
      starsFull +
      "</div>" +
      '<div class="diff-fun-title"><span class="diff-big-emoji" aria-hidden="true">' +
      meta.emoji +
      "</span>" +
      meta.label +
      "</div>" +
      '<div class="diff-fun-sub">' +
      meta.sub +
      " · <strong>" +
      dv +
      "</strong>/" +
      dmax +
      "</div>"
    );
  }

  function setDifficultyDisplay(mode, entry) {
    const el = document.getElementById("wordDifficultyFun");
    if (!el) return;
    el.classList.remove("diff-wrap-compact");
    if (mode === "quiz") {
      el.classList.add("diff-quiz-mix", "diff-wrap-compact");
      el.setAttribute("aria-label", "Difficulty: quiz mix, all levels");
      el.innerHTML = difficultyMeterHTML(cfg.difficulty.max, {
        quizMix: true,
        compact: true,
      });
      return;
    }
    el.classList.remove("diff-quiz-mix");
    if (mode === "letter") {
      const d = 1;
      el.classList.add("diff-wrap-compact");
      el.setAttribute(
        "aria-label",
        "Difficulty 1 of " + cfg.difficulty.max + ", letter warm-up"
      );
      el.innerHTML = difficultyMeterHTML(d, { compact: true, letter: true });
      return;
    }
    if (entry) {
      const d = difficultyForEntry(entry);
      const dl = cfg.difficultyLevels[d - 1];
      const edu =
        entry.level ||
        (cfg.eduHintsByKind && cfg.eduHintsByKind[entry.kind]) ||
        "";
      el.classList.add("diff-wrap-compact");
      el.setAttribute(
        "aria-label",
        (dl && dl.label ? dl.label + ". " : "") +
          (edu ? edu + " " : "") +
          "Level " +
          d +
          " of " +
          cfg.difficulty.max
      );
      el.innerHTML = difficultyMeterHTML(d, {
        compact: true,
        kind: entry.kind,
      });
      return;
    }
    el.innerHTML = "";
    el.removeAttribute("aria-label");
  }

  /** Emoji hint for letter mode (lowercase a–z) */
  const LETTER_EMOJI = {
    a: "🍎", b: "🐝", c: "🐱", d: "🐶", e: "🥚", f: "🌸", g: "🐸", h: "🏠", i: "🍦",
    j: "🤹", k: "🪁", l: "🦁", m: "🌙", n: "🪺", o: "🍊", p: "🍕", q: "👸",
    r: "🌈", s: "⭐", t: "🌮", u: "☂️", v: "🎻", w: "🌊", x: "❌", y: "🪀", z: "🦓",
  };

  const ROW_TOP = new Set("qwertyuiop".split(""));
  const ROW_HOME = new Set("asdfghjkl;".split(""));
  const ROW_BOT = new Set("zxcvbnm,.".split(""));
  const VOWELS = new Set(["a", "e", "i", "o", "u"]);

  /** Comma & period sit after M on the bottom row — need bottom row on. */
  const BOTTOM_ROW_PUNCT = new Set([",", "."]);

  /** Strip comma/period for typing when bottom row is off (same row as Z–M). */
  function phraseTypingText(s) {
    return s.replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  }

  /** Text the learner actually types for this bank entry (respects row toggles). */
  function entryTypingText(entry) {
    if (!entry) return "";
    if (entry.kind === "phrase" && !chkBot.checked)
      return phraseTypingText(entry.w);
    return entry.w;
  }

  /** Fragment used when stitching quiz paragraphs from the word bank. */
  function bankEntryToQuizFragment(e) {
    if (!chkBot.checked) return phraseTypingText(e.w);
    return e.w;
  }

  function entryCharFitsRows(c, allowed) {
    if (c === " ") return true;
    if (BOTTOM_ROW_PUNCT.has(c)) return chkBot.checked;
    if (c === ";") return chkHome.checked;
    return allowed.has(c);
  }

  function practiceKeyAllowed(ch, allowed) {
    if (ch === "\n") return isQuizMode();
    if (ch === " ") return isSentenceMode() || isQuizMode();
    if (BOTTOM_ROW_PUNCT.has(ch))
      return chkBot.checked && (isSentenceMode() || isQuizMode());
    if (ch === ";")
      return chkHome.checked && (isSentenceMode() || isQuizMode());
    return allowed.has(ch);
  }

  /** @param {KeyboardEvent} e */
  function eventToPracticeChar(e) {
    if (e.key === "Enter" && isQuizMode()) return "\n";
    if (e.key === " ") return " ";
    if (e.key === ",") return ",";
    if (e.key === ".") return ".";
    if (e.key === ";") return ";";
    if (e.key.length !== 1) return null;
    const ch = e.key.toLowerCase();
    if (ch >= "a" && ch <= "z") return ch;
    return null;
  }

  function defaultStats() {
    return {
      wordsCvc: 0,
      wordsSight: 0,
      wordsSimple: 0,
      wordsPhrase: 0,
      /** Sum of word tokens inside every finished sentence (Sentence mode). */
      phraseWordsTyped: 0,
      /** Word tokens finished in Quiz mode (same as ⭐ steps from quiz words). */
      wordsQuiz: 0,
      lettersDone: 0,
      quizBestWpm: 0,
      quizLastWpm: 0,
      quizParagraphsDone: 0,
      trophyBronze: 0,
      trophySilver: 0,
      trophyGold: 0,
      trophyPoints: 0,
    };
  }

  function loadStats() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_STATS) || "{}");
      let wordsCvc = Math.max(0, Number(o.wordsCvc) || 0);
      let wordsSight = Math.max(0, Number(o.wordsSight) || 0);
      let wordsSimple = Math.max(0, Number(o.wordsSimple) || 0);
      let wordsPhrase = Math.max(0, Number(o.wordsPhrase) || 0);
      const lettersDone = Math.max(0, Number(o.lettersDone) || 0);
      const phraseWordsTyped = Math.max(0, Number(o.phraseWordsTyped) || 0);
      const wordsQuiz = Math.max(0, Number(o.wordsQuiz) || 0);
      if (
        wordsCvc + wordsSight + wordsSimple + wordsPhrase === 0 &&
        o.wordsDone > 0
      ) {
        wordsSimple = Math.max(0, Number(o.wordsDone) || 0);
      }
      return {
        wordsCvc,
        wordsSight,
        wordsSimple,
        wordsPhrase,
        phraseWordsTyped,
        wordsQuiz,
        lettersDone,
        quizBestWpm: Math.max(0, Number(o.quizBestWpm) || 0),
        quizLastWpm: Math.max(0, Number(o.quizLastWpm) || 0),
        quizParagraphsDone: Math.max(0, Number(o.quizParagraphsDone) || 0),
        trophyBronze: Math.min(
          cfg.trophies.mergeSteps - 1,
          Math.max(0, Number(o.trophyBronze) || 0)
        ),
        trophySilver: Math.min(
          cfg.trophies.mergeSteps - 1,
          Math.max(0, Number(o.trophySilver) || 0)
        ),
        trophyGold: Math.max(0, Number(o.trophyGold) || 0),
        trophyPoints: Math.max(0, Number(o.trophyPoints) || 0),
      };
    } catch {
      return defaultStats();
    }
  }

  /** Finishes in Word/Sentence: CVC + sight + vocab + sentence lines (1 per line, not word count). */
  function practiceFinishesTotal() {
    return (
      stats.wordsCvc +
      stats.wordsSight +
      stats.wordsSimple +
      stats.wordsPhrase
    );
  }

  /** Actual word tokens from Word + Sentence (each CVC/sight/vocab +1; sentences add every word). */
  function wordsPracticeWordCount() {
    return (
      stats.wordsCvc +
      stats.wordsSight +
      stats.wordsSimple +
      (stats.phraseWordsTyped | 0)
    );
  }

  /** @deprecated use wordsPracticeWordCount or practiceFinishesTotal */
  function wordsTypedTotal() {
    return wordsPracticeWordCount();
  }

  function saveStats() {
    localStorage.setItem(LS_STATS, JSON.stringify(stats));
  }

  let stats = loadStats();

  const chkTop = document.getElementById("chkTop");
  const chkHome = document.getElementById("chkHome");
  const chkBot = document.getElementById("chkBot");
  const rowWarn = document.getElementById("rowWarn");
  const modeWord = document.getElementById("modeWord");
  const modeLetter = document.getElementById("modeLetter");
  const modeSentence = document.getElementById("modeSentence");
  const modeQuiz = document.getElementById("modeQuiz");
  const wordDisplay = document.getElementById("wordDisplay");
  const statWordsTotalEl = document.getElementById("statWordsTotal");
  const statCvcEl = document.getElementById("statCvc");
  const statSightEl = document.getElementById("statSight");
  const statSimpleEl = document.getElementById("statSimple");
  const statPhraseEl = document.getElementById("statPhrase");
  const statLettersEl = document.getElementById("statLetters");
  const statQuizWordsEl = document.getElementById("statQuizWords");
  const statFinishesEl = document.getElementById("statFinishes");
  const btnClearStats = document.getElementById("btnClearStats");
  const roundInfoEl = document.getElementById("roundInfo");
  const wordBadgeRow = document.getElementById("wordBadgeRow");
  const wordLevelLineEl = document.getElementById("wordLevelLine");
  const wordEmojiEl = document.getElementById("wordEmoji");
  const zhLine = document.getElementById("zhLine");
  const chkReadIntro = document.getElementById("chkReadIntro");
  const chkTtsMaster = document.getElementById("chkTtsMaster");
  const chkTtsEn = document.getElementById("chkTtsEn");
  const chkTtsZh = document.getElementById("chkTtsZh");
  const chkKeySounds = document.getElementById("chkKeySounds");
  const wordStageEl = document.getElementById("wordStage");
  const hiddenInput = document.getElementById("hiddenInput");
  const flash = document.getElementById("flash");
  const btnSpeak = document.getElementById("btnSpeak");
  const btnNext = document.getElementById("btnNext");

  let queue = [];
  let wi = 0;
  /** Increments each new word/line in Word or Sentence mode (for “Word n” label). */
  let practiceRoundIndex = 0;
  let pos = 0;
  let letterTarget = "a";
  /** @type {string} */
  let quizParagraph = "";
  let quizTimerStart = null;
  let quizCompleting = false;
  /** Word-start indices we already spoke for this paragraph (quiz). */
  const quizSpokenWordStarts = new Set();
  let quizWordSpeakTimer = 0;

  let trophyToastHideTimer = 0;

  function loadBoolPref(key, defaultVal) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return defaultVal;
      return v === "1" || v === "true";
    } catch (_) {
      return defaultVal;
    }
  }

  function saveBoolPref(key, val) {
    try {
      localStorage.setItem(key, val ? "1" : "0");
    } catch (_) {}
  }

  function initSoundPrefControls() {
    if (chkTtsMaster) chkTtsMaster.checked = loadBoolPref(LS_TTS_MASTER, true);
    if (chkTtsEn) chkTtsEn.checked = loadBoolPref(LS_TTS_EN, true);
    if (chkTtsZh) chkTtsZh.checked = loadBoolPref(LS_TTS_ZH, false);
    if (chkKeySounds) chkKeySounds.checked = loadBoolPref(LS_KEY_SOUNDS, true);
    function wire(el, key) {
      if (!el) return;
      el.addEventListener("change", () => {
        saveBoolPref(key, el.checked);
        if (key === LS_TTS_MASTER && !el.checked && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      });
    }
    wire(chkTtsMaster, LS_TTS_MASTER);
    wire(chkTtsEn, LS_TTS_EN);
    wire(chkTtsZh, LS_TTS_ZH);
    wire(chkKeySounds, LS_KEY_SOUNDS);
  }

  function loadKbRowsPrefs() {
    if (!chkTop || !chkHome || !chkBot) return;
    try {
      const raw = localStorage.getItem(LS_KB_ROWS);
      if (raw == null || raw === "") return;
      const o = JSON.parse(raw);
      if (typeof o.top === "boolean") chkTop.checked = o.top;
      if (typeof o.home === "boolean") chkHome.checked = o.home;
      if (typeof o.bot === "boolean") chkBot.checked = o.bot;
    } catch (_) {}
  }

  function saveKbRowsPrefs() {
    if (!chkTop || !chkHome || !chkBot) return;
    try {
      localStorage.setItem(
        LS_KB_ROWS,
        JSON.stringify({
          top: chkTop.checked,
          home: chkHome.checked,
          bot: chkBot.checked,
        })
      );
    } catch (_) {}
  }

  function ttsMasterOn() {
    return !!(chkTtsMaster && chkTtsMaster.checked);
  }

  function ttsEnglishOn() {
    return ttsMasterOn() && !!(chkTtsEn && chkTtsEn.checked);
  }

  function ttsChineseOn() {
    return ttsMasterOn() && !!(chkTtsZh && chkTtsZh.checked);
  }

  function keySoundsOn() {
    return !!(chkKeySounds && chkKeySounds.checked);
  }

  /** Pin toast just above the green typing panel, centered on it. */
  function syncTrophyToastPlacement() {
    const root = document.getElementById("trophyToast");
    const shell = document.querySelector(".crt-surface-wrap");
    if (!root || root.hidden || !shell) return;
    const r = shell.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const gap = 10;
    const vv = window.visualViewport;
    const insetTop =
      (vv ? vv.offsetTop : 0) + (parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0);
    const minY = insetTop + 8;
    const anchorY = Math.max(minY, r.top - gap);
    root.style.left = `${r.left + r.width / 2}px`;
    root.style.top = `${anchorY}px`;
    root.style.transform = "translate(-50%, -100%)";
  }

  let trophyToastLayoutBound = false;
  function bindTrophyToastLayoutListeners() {
    if (trophyToastLayoutBound) return;
    trophyToastLayoutBound = true;
    const flash = document.getElementById("flash");
    if (flash) {
      flash.addEventListener("scroll", syncTrophyToastPlacement, { passive: true });
    }
    const ts = document.querySelector(".typing-stage");
    if (ts) {
      ts.addEventListener("scroll", syncTrophyToastPlacement, { passive: true });
    }
    window.addEventListener("resize", syncTrophyToastPlacement);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncTrophyToastPlacement);
      window.visualViewport.addEventListener("scroll", syncTrophyToastPlacement);
    }
  }

  const TROPHY_TOAST_SIZE_CLASSES = [
    "trophy-toast--sz-regular",
    "trophy-toast--sz-gold",
    "trophy-toast--sz-gold-plus",
    "trophy-toast--sz-trophy",
  ];

  function stripTrophyToastSizes(root) {
    root.classList.remove(...TROPHY_TOAST_SIZE_CLASSES);
  }

  function hideTrophyToast() {
    const root = document.getElementById("trophyToast");
    if (!root || root.hidden) return;
    root.classList.add("trophy-toast--leaving");
    window.clearTimeout(trophyToastHideTimer);
    trophyToastHideTimer = window.setTimeout(() => {
      root.hidden = true;
      root.classList.remove("trophy-toast--leaving");
      stripTrophyToastSizes(root);
      root.style.removeProperty("left");
      root.style.removeProperty("top");
      root.style.removeProperty("transform");
    }, 320);
  }

  /** Merge rewards: no toast for bronze merge; 🥇 gold size for silver merge; 🥇 + slightly bigger for mega trophy. */
  function showTrophyAchievementToast(kind) {
    if (kind === "trophy-merge-bronze") {
      return;
    }
    const root = document.getElementById("trophyToast");
    const emojiEl = document.getElementById("trophyToastEmoji");
    const textEl = document.getElementById("trophyToastText");
    if (!root || !emojiEl || !textEl) return;
    const map = {
      "trophy-merge-silver": {
        emoji: "🥇",
        sizeClass: "trophy-toast--sz-gold",
        ms: 3600,
      },
      "trophy-merge-gold": {
        emoji: "🥇",
        sizeClass: "trophy-toast--sz-gold-plus",
        ms: 3600,
      },
    };
    const m = map[kind] || {
      emoji: "⭐",
      sizeClass: "trophy-toast--sz-regular",
      ms: 2600,
    };
    window.clearTimeout(trophyToastHideTimer);
    root.classList.remove("trophy-toast--leaving");
    stripTrophyToastSizes(root);
    root.classList.add(m.sizeClass);
    emojiEl.textContent = m.emoji;
    textEl.textContent = "+1";
    root.hidden = false;
    bindTrophyToastLayoutListeners();
    requestAnimationFrame(() => {
      syncTrophyToastPlacement();
      requestAnimationFrame(syncTrophyToastPlacement);
    });
    if (kind === "trophy-merge-gold") playMegaTrophyCelebrationSound();
    trophyToastHideTimer = window.setTimeout(() => hideTrophyToast(), m.ms);
  }

  function runTypingCompleteCelebration() {
    const stage = wordStageEl || document.getElementById("wordStage");
    if (!stage) return;
    stage.classList.remove("typing-complete-flash");
    void stage.offsetWidth;
    stage.classList.add("typing-complete-flash");
    window.setTimeout(() => stage.classList.remove("typing-complete-flash"), 720);
  }

  /** Merge toasts only (🥈/🥇/🏆). No 🥉 +1 toast or fly — bronze steps update the panel only. */
  function queueTrophyPresentation(mergeKinds, _medalSteps) {
    const startDelay = 90;
    window.setTimeout(() => {
      if (!mergeKinds.length) {
        return;
      }
      let d = 220;
      for (let i = 0; i < mergeKinds.length; i++) {
        const kind = mergeKinds[i];
        window.setTimeout(() => {
          triggerTrophyMergeFx(kind);
          showTrophyAchievementToast(kind);
        }, d);
        d += 640;
      }
    }, startDelay);
  }

  function ensureTypingFocus() {
    requestAnimationFrame(() => {
      try {
        hiddenInput.focus({ preventScroll: true });
      } catch (_) {
        hiddenInput.focus();
      }
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function setWordLevelLine(text) {
    if (wordLevelLineEl) wordLevelLineEl.textContent = text ? text : "";
  }

  function getAllowedSet() {
    const s = new Set();
    if (chkTop.checked) for (const c of ROW_TOP) s.add(c);
    if (chkHome.checked) for (const c of ROW_HOME) s.add(c);
    if (chkBot.checked) for (const c of ROW_BOT) s.add(c);
    return s;
  }

  function allowedHasVowel(set) {
    for (const v of VOWELS) if (set.has(v)) return true;
    return false;
  }

  function filterWords(allowed) {
    let list = wordBank.filter((entry) =>
      [...entryTypingText(entry)].every((c) => entryCharFitsRows(c, allowed))
    );
    if (isSentenceMode()) {
      list = list.filter((e) => e.kind === "phrase");
    } else if (isWordMode()) {
      list = list.filter((e) => e.kind !== "phrase");
    }
    return list;
  }

  /** @param {unknown[]} arr */
  function randomPickFrom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickWeightedPracticeEntry(filtered) {
    if (!filtered || filtered.length === 0) return null;
    const p5 = filtered.filter((e) => difficultyForEntry(e) === cfg.difficulty.max);
    const p4 = filtered.filter(
      (e) => difficultyForEntry(e) === cfg.difficulty.max - 1
    );
    const r = Math.random();
    const pp = cfg.practicePick;
    if (r < pp.difficulty5MaxR && p5.length) return randomPickFrom(p5);
    if (r < pp.difficulty4MaxR && p4.length) return randomPickFrom(p4);
    return randomPickFrom(filtered);
  }

  function currentEntry() {
    if (isLetterMode() || isQuizMode()) return null;
    return queue[wi] || null;
  }

  function isWordMode() {
    return modeWord.checked;
  }

  function isSentenceMode() {
    return modeSentence.checked;
  }

  function isQuizMode() {
    return modeQuiz.checked;
  }

  /** Typing words or sentences (not letter drill). */
  function isTypingWords() {
    return isWordMode() || isSentenceMode();
  }

  function countWordsInText(s) {
    return s.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * ~30-word passage from word-bank tokens (words + phrases), respecting row filter.
   */
  function buildQuizParagraph(allowed) {
    const targetWords = cfg.quiz.targetWordCount;
    let pool = shuffle(
      wordBank.filter((e) =>
        [...bankEntryToQuizFragment(e)].every((c) => entryCharFitsRows(c, allowed))
      )
    );
    if (pool.length === 0) pool = shuffle(wordBank.slice());
    const chunks = [];
    for (let i = 0; i < 500; i++) {
      const e = pool[i % pool.length];
      if (chunks.length) chunks.push(" ");
      chunks.push(bankEntryToQuizFragment(e));
      if (countWordsInText(chunks.join("").trim()) >= targetWords) break;
    }
    let text = chunks.join("").trim();
    let guard = 0;
    while (countWordsInText(text) < targetWords && guard < 200) {
      guard++;
      text += " " + bankEntryToQuizFragment(pool[guard % pool.length]);
    }
    return insertQuizLineBreaksEveryNWords(
      text.trim(),
      cfg.quiz.lineBreakEveryNWords
    );
  }

  /** After every N words, insert a newline (typed as Enter ↵ in quiz). */
  function insertQuizLineBreaksEveryNWords(text, n) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "";
    const parts = [];
    for (let i = 0; i < words.length; i++) {
      if (i > 0) {
        const prev = parts[parts.length - 1];
        if (prev !== "\n") parts.push(" ");
      }
      parts.push(words[i]);
      if ((i + 1) % n === 0 && i + 1 < words.length) parts.push("\n");
    }
    return parts.join("");
  }

  function updateQuizHud() {
    const hud = document.getElementById("quizHud");
    const live = document.getElementById("quizWpmLive");
    const prog = document.getElementById("quizWordProg");
    const tot = document.getElementById("quizWordTotal");
    if (!hud || !live || !prog || !tot) return;
    if (!isQuizMode()) return;
    const totalW = countWordsInText(quizParagraph);
    tot.textContent = String(totalW);
    const slice = quizParagraph.slice(0, pos);
    const doneW = countWordsInText(slice);
    prog.textContent = String(Math.min(doneW, totalW));
    if (!quizTimerStart || pos === 0) {
      live.textContent = "—";
      return;
    }
    const elapsedMin = (Date.now() - quizTimerStart) / 60000;
    if (elapsedMin < 0.01) {
      live.textContent = "—";
      return;
    }
    live.textContent = String(Math.round(doneW / elapsedMin));
  }

  /** All practice items for current mode (ignores row filter). */
  function fullPoolForMode() {
    if (isSentenceMode()) return wordBank.filter((e) => e.kind === "phrase");
    if (isWordMode()) return wordBank.filter((e) => e.kind !== "phrase");
    return wordBank.slice();
  }

  function randomLetterFrom(allowedArr) {
    return allowedArr[Math.floor(Math.random() * allowedArr.length)];
  }

  function isLetterMode() {
    return modeLetter.checked;
  }

  let lastGentleNudgeAt = 0;
  let gentleNudgeHideTimer = 0;

  function clearGentleNudge() {
    const el = document.getElementById("gentleNudge");
    if (!el) return;
    clearTimeout(gentleNudgeHideTimer);
    el.classList.remove("visible");
    el.textContent = "";
  }

  function gentleMistypeReminder() {
    const now = Date.now();
    if (now - lastGentleNudgeAt < 1600) return;
    lastGentleNudgeAt = now;
    const el = document.getElementById("gentleNudge");
    if (!el) return;
    const msgs = ["✨", "💪", "🌟", "👍", "🙂"];
    el.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    el.classList.add("visible");
    clearTimeout(gentleNudgeHideTimer);
    gentleNudgeHideTimer = window.setTimeout(() => {
      el.classList.remove("visible");
    }, 2600);
  }

  function renderKidStats() {
    const pWords = wordsPracticeWordCount();
    const qWords = stats.wordsQuiz | 0;
    if (statWordsTotalEl) statWordsTotalEl.textContent = String(pWords);
    if (statQuizWordsEl) statQuizWordsEl.textContent = String(qWords);
    if (statFinishesEl)
      statFinishesEl.textContent = String(practiceFinishesTotal());
    statCvcEl.textContent = String(stats.wordsCvc);
    statSightEl.textContent = String(stats.wordsSight);
    statSimpleEl.textContent = String(stats.wordsSimple);
    statPhraseEl.textContent = String(stats.wordsPhrase);
    statLettersEl.textContent = String(stats.lettersDone);
    const b = document.getElementById("statQuizBest");
    const l = document.getElementById("statQuizLast");
    const c = document.getElementById("statQuizCount");
    if (b && l && c) {
      b.textContent =
        stats.quizBestWpm > 0 ? String(stats.quizBestWpm) : "—";
      l.textContent =
        stats.quizLastWpm > 0 ? String(stats.quizLastWpm) : "—";
      c.textContent = String(stats.quizParagraphsDone || 0);
    }
    renderTrophyPanel();
  }

  /**
   * Bar = fine-grained progress toward the **next big 🏆**: every ⭐ / ladder step counts.
   * Same pacing as the three rows (🥉×ms→🥈, 🥈×ms→🥇, 🥇×gfm→🏆) → cycle = ms×ms×gfm steps.
   */
  function computeMegaCycleProgress() {
    const ms = Math.max(1, cfg.trophies.mergeSteps | 0);
    const gfm = Math.max(1, cfg.trophies.goldForMega | 0);
    const cycleLen = ms * ms * gfm;
    const tp = Math.max(0, stats.trophyPoints | 0);
    const pos = cycleLen > 0 ? tp % cycleLen : 0;
    const fill = cycleLen > 0 ? (100 * pos) / cycleLen : 0;
    const b = Math.min(ms - 1, Math.max(0, stats.trophyBronze | 0));
    const s = Math.min(ms - 1, Math.max(0, stats.trophySilver | 0));
    const towardG = Math.max(0, stats.trophyGold | 0) % gfm;
    return {
      fill,
      label: `→🏆 ${pos}/${cycleLen} · 🥉${b} 🥈${s} 🥇${towardG}`,
      title: `Every ⭐ step: ${ms}🥉→🥈, ${ms}🥈→🥇, ${gfm}🥇→🏆 (${cycleLen} steps per big trophy). Rows: 🥉${b}/${ms} 🥈${s}/${ms} 🥇${towardG}/${gfm}.`,
      aria: `${pos} of ${cycleLen} steps toward the next mega trophy. Bronze ${b} of ${ms}, silver ${s} of ${ms}, gold ${towardG} of ${gfm}.`,
    };
  }

  function renderTrophyPanel() {
    const pe = document.getElementById("trophyPointsEl");
    const bd = document.getElementById("trophyBronzeDots");
    const sd = document.getElementById("trophySilverDots");
    const goldDots = document.getElementById("trophyGoldDots");
    const megaCountEl = document.getElementById("trophyMegaCountEl");
    const goldRow = document.getElementById("trophyRowGold");
    const nextLabel = document.getElementById("trophyNextLabel");
    const nextFill = document.getElementById("trophyNextFill");
    const nextTrack = document.getElementById("trophyNextTrack");
    if (!pe || !bd || !sd) return;
    const gold = stats.trophyGold | 0;
    const gfm = cfg.trophies.goldForMega;
    const megaTotal = Math.floor(gold / gfm);
    const towardNext = gold % gfm;

    pe.textContent = String(stats.trophyPoints | 0);

    if (nextLabel && nextFill && nextTrack) {
      const np = computeMegaCycleProgress();
      nextLabel.textContent = np.label;
      if (np.title) nextTrack.title = np.title;
      const pct = Math.max(0, Math.min(100, Math.round(np.fill)));
      nextFill.style.width = pct + "%";
      nextTrack.setAttribute("aria-valuenow", String(pct));
      nextTrack.setAttribute("aria-valuemax", "100");
      nextTrack.setAttribute("aria-label", np.aria || np.label);
    }

    if (megaCountEl) megaCountEl.textContent = String(megaTotal);

    if (goldDots) {
      goldDots.innerHTML = "";
      for (let i = 0; i < gfm; i++) {
        const d = document.createElement("span");
        d.className =
          "trophy-dot" + (i < towardNext ? " filled-g" : "");
        goldDots.appendChild(d);
      }
    }

    if (goldRow) {
      goldRow.title =
        "🥇 " +
        towardNext +
        "/" +
        gfm +
        " toward next 🏆 · lifetime gold medals: " +
        gold;
    }

    bd.innerHTML = "";
    sd.innerHTML = "";
    const ms = cfg.trophies.mergeSteps;
    const b = Math.min(ms - 1, Math.max(0, stats.trophyBronze | 0));
    const s = Math.min(ms - 1, Math.max(0, stats.trophySilver | 0));
    for (let i = 0; i < ms; i++) {
      const d = document.createElement("span");
      d.className = "trophy-dot" + (i < b ? " filled-b" : "");
      bd.appendChild(d);
    }
    for (let i = 0; i < ms; i++) {
      const d = document.createElement("span");
      d.className = "trophy-dot" + (i < s ? " filled-s" : "");
      sd.appendChild(d);
    }
  }

  /** One “word typed” → +1 bronze step (3🥉→🥈, 3🥈→🥇). Returns { mega } if 🏆 milestone (every 3 🥇). */
  function applyOneBronzeMedalToStats() {
    stats.trophyPoints = (stats.trophyPoints | 0) + 1;
    let b = stats.trophyBronze | 0;
    let s = stats.trophySilver | 0;
    let g = stats.trophyGold | 0;
    const gBefore = g;
    const ms = cfg.trophies.mergeSteps;
    b++;
    if (b >= ms) {
      b = 0;
      s++;
    }
    if (s >= ms) {
      s = 0;
      g++;
    }
    stats.trophyBronze = b;
    stats.trophySilver = s;
    stats.trophyGold = g;
    const mega = g > gBefore && g > 0 && g % cfg.trophies.goldForMega === 0;
    return { mega };
  }

  function triggerTrophyMergeFx(kind) {
    const panel = document.getElementById("trophyPanel");
    if (!panel) return;
    panel.classList.remove(
      "trophy-merge-bronze",
      "trophy-merge-silver",
      "trophy-merge-gold"
    );
    void panel.offsetWidth;
    panel.classList.add(kind);
    window.setTimeout(() => panel.classList.remove(kind), 580);
  }

  /** True if the key just typed was the last character of a quiz “word” (token). */
  function quizJustCompletedAWord(s, indexJustTyped) {
    if (indexJustTyped < 0 || indexJustTyped >= s.length) return false;
    const c = s[indexJustTyped];
    if (c === " " || c === "\n") return false;
    const next = s[indexJustTyped + 1];
    return next === undefined || next === " " || next === "\n";
  }

  /**
   * Each completed word → bronze steps (+ ladder). Level 4 & 5 bank entries → 2× steps (e.g. 1 word = 2🥉).
   * Quiz / no entry → never doubled.
   * @param {{ quizLive?: boolean }} [opts] — quiz: update dots/bar every word; pop-up toasts only on merges (not bronze +1).
   */
  function awardWordTrophies(wordCount, entryForDifficulty, opts) {
    const quizLive = opts && opts.quizLive === true;
    let n = Math.max(0, wordCount | 0);
    if (n <= 0) return;
    if (
      entryForDifficulty &&
      difficultyForEntry(entryForDifficulty) >= 4
    ) {
      n *= 2;
    }
    const mergeKinds = [];
    for (let i = 0; i < n; i++) {
      const prevB = stats.trophyBronze | 0;
      const prevG = stats.trophyGold | 0;
      const { mega } = applyOneBronzeMedalToStats();
      if (prevB === cfg.trophies.mergeSteps - 1) {
        mergeKinds.push("trophy-merge-bronze");
      }
      const newG = stats.trophyGold | 0;
      if (newG > prevG) {
        mergeKinds.push(mega ? "trophy-merge-gold" : "trophy-merge-silver");
      }
    }
    saveStats();
    renderTrophyPanel();
    if (quizLive) {
      if (mergeKinds.length) queueTrophyPresentation(mergeKinds, 1);
      return;
    }
    queueTrophyPresentation(mergeKinds, n);
  }

  function clearAllStats() {
    if (
      !confirm(
        "Clear your whole scoreboard? (You can always type more words later!)"
      )
    )
      return;
    stats = defaultStats();
    saveStats();
    renderKidStats();
    renderTrophyPanel();
  }

  function listChineseVoices() {
    if (!window.speechSynthesis) return [];
    try {
      return (speechSynthesis.getVoices() || []).filter((v) => {
        const lang = (v.lang || "").toLowerCase().replace("_", "-");
        return lang.startsWith("zh") || lang.startsWith("cmn");
      });
    } catch {
      return [];
    }
  }

  /** Pick a usually-clearer 中文 voice (varies by Mac / Windows / Chrome). */
  function pickAutoChineseVoice() {
    const list = listChineseVoices();
    if (!list.length) return null;
    const nm = (v) => (v.name || "").toLowerCase();
    const preferCN = list.filter((v) => {
      const l = (v.lang || "").toLowerCase();
      return (
        l.startsWith("zh-cn") ||
        l.includes("cmn-cn") ||
        nm(v).includes("mandarin") ||
        nm(v).includes("大陆")
      );
    });
    const pool = preferCN.length ? preferCN : list;
    const keys = [
      "xiaoxiao",
      "xiaoyi",
      "yunxi",
      "google",
      "premium",
      "natural",
      "meijia",
      "ting",
      "sinji",
      "hanhan",
      "yaoyao",
      "kangkang",
    ];
    for (const k of keys) {
      const hit = pool.find((v) => nm(v).includes(k));
      if (hit) return hit;
    }
    return pool[0];
  }

  /** Higher = better for kids’ clarity / typical device quality (dropdown order). */
  function chineseVoiceRecommendationScore(v) {
    let s = 0;
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const n = (v.name || "").toLowerCase();
    const mainland =
      lang.startsWith("zh-cn") ||
      lang.includes("cmn-cn") ||
      n.includes("mandarin") ||
      n.includes("大陆");
    if (mainland) s += 85;
    else if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk")) s += 42;
    else if (lang.startsWith("zh")) s += 38;
    else if (lang.startsWith("cmn")) s += 48;
    if (v.localService === true) s += 6;
    const bumps = [
      ["xiaoxiao", 58],
      ["xiaoyi", 52],
      ["yunxi", 50],
      ["google", 48],
      ["neural", 46],
      ["premium", 44],
      ["natural", 40],
      ["enhanced", 36],
      ["meijia", 45],
      ["ting", 44],
      ["sinji", 42],
      ["hanhan", 40],
      ["yaoyao", 39],
      ["kangkang", 38],
    ];
    for (const [k, sc] of bumps) {
      if (n.includes(k)) s += sc;
    }
    return s;
  }

  function sortChineseVoicesByRecommendation(list) {
    return list.slice().sort((a, b) => {
      const da = chineseVoiceRecommendationScore(a);
      const db = chineseVoiceRecommendationScore(b);
      if (db !== da) return db - da;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  function getChosenChineseVoice() {
    const sel = document.getElementById("selZhVoice");
    const voices = speechSynthesis.getVoices() || [];
    const saved = localStorage.getItem(LS_ZH_VOICE);
    if (sel && sel.value && sel.value !== "__auto__") {
      const v = voices.find((x) => x.voiceURI === sel.value);
      if (v) return v;
    }
    if (saved && saved !== "__auto__") {
      const v = voices.find((x) => x.voiceURI === saved);
      if (v) return v;
    }
    return pickAutoChineseVoice();
  }

  function attachChineseVoiceToUtterance(u) {
    const v = getChosenChineseVoice();
    if (v) {
      u.voice = v;
      const l = (v.lang || "zh-CN").replace("_", "-");
      u.lang = l;
    } else {
      u.lang = "zh-CN";
    }
  }

  function listEnglishVoices() {
    if (!window.speechSynthesis) return [];
    try {
      return (speechSynthesis.getVoices() || []).filter((v) => {
        const lang = (v.lang || "").toLowerCase().replace("_", "-");
        const base = lang.split("-")[0];
        return base === "en";
      });
    } catch {
      return [];
    }
  }

  function pickAutoEnglishVoice() {
    const list = listEnglishVoices();
    if (!list.length) return null;
    const nm = (v) => (v.name || "").toLowerCase();
    const avoid = ["albert", "bad ", "whisper", "zarvox"];
    const filtered = list.filter((v) => !avoid.some((a) => nm(v).includes(a)));
    const pool0 = filtered.length ? filtered : list;
    const us = pool0.filter((v) => {
      const l = (v.lang || "").toLowerCase().replace("_", "-");
      return l.startsWith("en-us") || l === "en_us";
    });
    const pool = us.length ? us : pool0;
    const keys = [
      "samantha",
      "aaron",
      "nora",
      "google us english",
      "google uk english",
      "premium",
      "natural",
      "enhanced",
      "neural",
      "zoe",
      "flo",
      "allison",
      "ava",
      "jenny",
      "michelle",
      "serena",
      "daniel",
      "oliver",
      "arthur",
      "karen",
      "moira",
      "martha",
      "tessa",
      "veena",
      "tom",
      "fred",
    ];
    for (const k of keys) {
      const hit = pool.find((v) => nm(v).includes(k));
      if (hit) return hit;
    }
    return pool[0];
  }

  /** Higher = clearer / more natural on typical devices (dropdown order). */
  function englishVoiceRecommendationScore(v) {
    let s = 0;
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const n = (v.name || "").toLowerCase();
    const avoid = ["albert", "bad ", "whisper", "zarvox"];
    if (avoid.some((a) => n.includes(a))) s -= 220;
    if (lang.startsWith("en-us") || lang === "en_us") s += 82;
    else if (lang.startsWith("en-gb")) s += 56;
    else if (
      lang.startsWith("en-au") ||
      lang.startsWith("en-in") ||
      lang.startsWith("en-nz") ||
      lang.startsWith("en-ie")
    )
      s += 48;
    else if (lang.startsWith("en")) s += 28;
    if (v.localService === true) s += 6;
    const bumps = [
      ["neural", 48],
      ["premium", 45],
      ["natural", 40],
      ["enhanced", 36],
      ["google us english", 52],
      ["google uk english", 42],
      ["samantha", 50],
      ["aaron", 46],
      ["nora", 44],
      ["zoe", 40],
      ["flo", 38],
      ["allison", 38],
      ["ava", 36],
      ["jenny", 36],
      ["michelle", 35],
      ["serena", 34],
      ["daniel", 34],
      ["oliver", 33],
      ["arthur", 32],
      ["karen", 32],
      ["moira", 30],
      ["martha", 30],
      ["tessa", 30],
      ["veena", 28],
      ["tom", 26],
      ["fred", 24],
    ];
    for (const [k, sc] of bumps) {
      if (n.includes(k)) s += sc;
    }
    if (n.includes("google") && !n.includes("translate")) s += 8;
    return s;
  }

  function sortEnglishVoicesByRecommendation(list) {
    return list.slice().sort((a, b) => {
      const da = englishVoiceRecommendationScore(a);
      const db = englishVoiceRecommendationScore(b);
      if (db !== da) return db - da;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  function getChosenEnglishVoice() {
    const sel = document.getElementById("selEnVoice");
    const voices = speechSynthesis.getVoices() || [];
    const saved = localStorage.getItem(LS_EN_VOICE);
    if (sel && sel.value && sel.value !== "__auto__") {
      const v = voices.find((x) => x.voiceURI === sel.value);
      if (v) return v;
    }
    if (saved && saved !== "__auto__") {
      const v = voices.find((x) => x.voiceURI === saved);
      if (v) return v;
    }
    return pickAutoEnglishVoice();
  }

  function attachEnglishVoiceToUtterance(u) {
    const v = getChosenEnglishVoice();
    if (v) {
      u.voice = v;
      const l = (v.lang || "en-US").replace("_", "-");
      u.lang = l;
    } else {
      u.lang = "en-US";
    }
  }

  /** Short preview after picking English voice (dropdown already updated). */
  function speakEnglishVoiceSample() {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    window.setTimeout(() => {
      const u = new SpeechSynthesisUtterance(
        "Hello! This is your English voice for typing practice."
      );
      u.rate = 0.78;
      u.pitch = 1.0;
      attachEnglishVoiceToUtterance(u);
      speechSynthesis.speak(u);
    }, 50);
  }

  /** Short preview after picking 中文 voice. */
  function speakChineseVoiceSample() {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    window.setTimeout(() => {
      const u = new SpeechSynthesisUtterance("你好，这是中文朗读的声音。");
      u.rate = 0.8;
      u.pitch = 1.0;
      attachChineseVoiceToUtterance(u);
      speechSynthesis.speak(u);
    }, 50);
  }

  function populateEnglishVoiceSelect() {
    const sel = document.getElementById("selEnVoice");
    if (!sel) return;
    const saved = localStorage.getItem(LS_EN_VOICE) || "__auto__";
    const en = sortEnglishVoicesByRecommendation(listEnglishVoices());
    sel.innerHTML = "";
    const optAuto = document.createElement("option");
    optAuto.value = "__auto__";
    optAuto.textContent =
      en.length === 0
        ? "English Auto (no voices yet — reload)"
        : "English Auto (best match on device)";
    sel.appendChild(optAuto);
    en.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = (v.name || "Voice") + " — " + (v.lang || "");
      sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === saved)
      ? saved
      : "__auto__";
  }

  function populateChineseVoiceSelect() {
    const sel = document.getElementById("selZhVoice");
    if (!sel) return;
    const saved = localStorage.getItem(LS_ZH_VOICE) || "__auto__";
    const zh = sortChineseVoicesByRecommendation(listChineseVoices());
    sel.innerHTML = "";
    const optAuto = document.createElement("option");
    optAuto.value = "__auto__";
    optAuto.textContent =
      zh.length === 0
        ? "中文 Auto (no 中文 voices yet — reload page)"
        : "中文 Auto (pick best on this device)";
    sel.appendChild(optAuto);
    zh.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = (v.name || "Voice") + " — " + (v.lang || "");
      sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === saved)
      ? saved
      : "__auto__";
  }

  function initChineseVoiceUI() {
    populateChineseVoiceSelect();
    const sel = document.getElementById("selZhVoice");
    if (sel && !sel.dataset.wired) {
      sel.dataset.wired = "1";
      sel.addEventListener("change", () => {
        localStorage.setItem(LS_ZH_VOICE, sel.value);
        speakChineseVoiceSample();
      });
    }
  }

  function initEnglishVoiceUI() {
    populateEnglishVoiceSelect();
    const sel = document.getElementById("selEnVoice");
    if (sel && !sel.dataset.wired) {
      sel.dataset.wired = "1";
      sel.addEventListener("change", () => {
        localStorage.setItem(LS_EN_VOICE, sel.value);
        speakEnglishVoiceSample();
      });
    }
  }

  function initAllVoicePickers() {
    initEnglishVoiceUI();
    initChineseVoiceUI();
  }

  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.addEventListener("voiceschanged", () => {
      populateEnglishVoiceSelect();
      populateChineseVoiceSelect();
      const savedEn = localStorage.getItem(LS_EN_VOICE) || "__auto__";
      const selEn = document.getElementById("selEnVoice");
      if (selEn && [...selEn.options].some((o) => o.value === savedEn)) {
        selEn.value = savedEn;
      }
      const saved = localStorage.getItem(LS_ZH_VOICE) || "__auto__";
      const sel = document.getElementById("selZhVoice");
      if (sel && [...sel.options].some((o) => o.value === saved)) {
        sel.value = saved;
      }
    });
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    if (!ttsEnglishOn()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = isLetterMode() ? 0.72 : 0.78;
    u.pitch = 1.0;
    attachEnglishVoiceToUtterance(u);
    window.speechSynthesis.speak(u);
  }

  /**
   * @param {{ text: string, lang?: string, rate?: number }[]} parts
   */
  function speakChain(parts) {
    if (!window.speechSynthesis || !parts.length) return;
    if (!ttsMasterOn()) return;
    const filtered = parts.filter((p) => {
      const lang = (p.lang || "en-US").toLowerCase();
      if (lang.startsWith("zh")) return ttsChineseOn();
      if (lang.startsWith("en")) return ttsEnglishOn();
      return ttsEnglishOn();
    });
    if (!filtered.length) return;
    speechSynthesis.cancel();
    let i = 0;
    function run() {
      if (i >= filtered.length) return;
      const p = filtered[i++];
      const u = new SpeechSynthesisUtterance(p.text);
      const lang = p.lang || "en-US";
      u.lang = lang;
      u.rate = p.rate != null ? p.rate : 0.8;
      u.pitch = 1.0;
      if (lang.toLowerCase().startsWith("zh")) {
        attachChineseVoiceToUtterance(u);
        u.rate = Math.min(u.rate, 0.82);
        u.pitch = 1.0;
      } else if (lang.toLowerCase().startsWith("en")) {
        attachEnglishVoiceToUtterance(u);
        u.rate = Math.min(u.rate, 0.82);
        u.pitch = 1.0;
      }
      u.onend = run;
      u.onerror = run;
      speechSynthesis.speak(u);
    }
    run();
  }

  /** @param {boolean} [forceReplay] — true from Speak button (ignore checkbox) */
  function speakIntroForCurrent(forceReplay) {
    if (isQuizMode()) return;
    if (!forceReplay && !chkReadIntro.checked) return;
    if (!ttsMasterOn()) return;
    if (isLetterMode()) {
      speakChain([
        { text: letterTarget, lang: "en-US", rate: 0.72 },
        { text: "键盘上的英语字母。", lang: "zh-CN", rate: 0.8 },
      ]);
      return;
    }
    const ent = currentEntry();
    if (!ent) return;
    speakChain([
      { text: ent.w, lang: "en-US", rate: 0.78 },
      { text: ent.zh, lang: "zh-CN", rate: 0.8 },
    ]);
  }

  function scheduleSpeakIntro() {
    setTimeout(() => {
      if (isQuizMode()) return;
      if (!chkReadIntro.checked) return;
      if (!ttsMasterOn()) return;
      speakIntroForCurrent();
    }, 180);
  }

  /** Index of the first character of the “word” (space-separated token) at pos. */
  function quizWordStartAt(s, pos) {
    if (pos >= s.length) return s.length;
    if (s[pos] === " " || s[pos] === "\n") return pos;
    let i = pos;
    while (i > 0 && s[i - 1] !== " " && s[i - 1] !== "\n") i--;
    return i;
  }

  /** Map raw quiz token to English TTS (comma / period / semicolon / Enter; not “space”). */
  function quizSpeakPhraseForToken(raw) {
    if (raw === ",") return "comma";
    if (raw === ".") return "period";
    if (raw === ";") return "semicolon";
    const tail = raw.match(/^(.+)([.,;])$/);
    if (tail && tail[1].length >= 1) {
      const names = { ",": "comma", ".": "period", ";": "semicolon" };
      const p = names[tail[2]];
      if (p) return tail[1] + " " + p;
    }
    return raw;
  }

  /** @returns {{ speakAs: string, skipSpeech?: boolean } | null} */
  function quizTokenForSpeech(s, wordStart) {
    if (wordStart >= s.length) return null;
    if (s[wordStart] === "\n") return { speakAs: "Enter" };
    if (s[wordStart] === " ") return { speakAs: "", skipSpeech: true };
    let j = wordStart;
    while (j < s.length && s[j] !== " " && s[j] !== "\n") j++;
    const raw = s.slice(wordStart, j);
    return { speakAs: quizSpeakPhraseForToken(raw) };
  }

  function quizClearSpokenIfBackedUp(newPos) {
    for (const ws of [...quizSpokenWordStarts]) {
      if (newPos <= ws) quizSpokenWordStarts.delete(ws);
    }
  }

  function maybeSpeakCurrentQuizWord() {
    if (!isQuizMode() || !quizParagraph || quizCompleting) return;
    if (!chkReadIntro.checked || !window.speechSynthesis) return;
    if (!ttsEnglishOn()) return;
    const ws = quizWordStartAt(quizParagraph, pos);
    if (ws !== pos) return;
    if (quizSpokenWordStarts.has(ws)) return;
    const tok = quizTokenForSpeech(quizParagraph, ws);
    if (!tok) return;
    quizSpokenWordStarts.add(ws);
    if (tok.skipSpeech) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tok.speakAs);
    u.rate = 0.78;
    u.pitch = 1.0;
    attachEnglishVoiceToUtterance(u);
    speechSynthesis.speak(u);
  }

  function scheduleSpeakCurrentQuizWord() {
    if (!isQuizMode() || !quizParagraph || quizCompleting) return;
    if (!chkReadIntro.checked) return;
    if (!ttsEnglishOn()) return;
    const ws = quizWordStartAt(quizParagraph, pos);
    if (ws !== pos) return;
    clearTimeout(quizWordSpeakTimer);
    const delay = pos === 0 ? 300 : 140;
    quizWordSpeakTimer = window.setTimeout(() => {
      maybeSpeakCurrentQuizWord();
    }, delay);
  }

  /** Hear button: always replay the exact token at the cursor (English). */
  function speakCurrentQuizWordForce() {
    if (!isQuizMode() || !quizParagraph) return;
    if (!window.speechSynthesis) return;
    if (!ttsEnglishOn()) return;
    const ws = quizWordStartAt(quizParagraph, pos);
    const tok = quizTokenForSpeech(quizParagraph, ws);
    if (!tok || tok.skipSpeech || !tok.speakAs) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tok.speakAs);
    u.rate = 0.78;
    u.pitch = 1.0;
    attachEnglishVoiceToUtterance(u);
    speechSynthesis.speak(u);
  }

  function currentWord() {
    if (isLetterMode()) return letterTarget;
    if (isQuizMode()) return quizParagraph;
    return entryTypingText(queue[wi]);
  }

  /**
   * Finger colors (touch-typing zones) — bright borders on simple key caps.
   * L: pinky / ring / middle / index · R: index / middle / ring / pinky · thumbs: gray
   */
  const KEY_BORDER = {
    q: "#e91e63",
    a: "#e91e63",
    z: "#e91e63",
    w: "#ff6f00",
    s: "#ff6f00",
    x: "#ff6f00",
    e: "#fbc02d",
    d: "#fbc02d",
    c: "#fbc02d",
    r: "#2e7d32",
    t: "#2e7d32",
    f: "#2e7d32",
    g: "#2e7d32",
    v: "#2e7d32",
    b: "#2e7d32",
    y: "#00838f",
    u: "#00838f",
    h: "#00838f",
    j: "#00838f",
    n: "#00838f",
    m: "#00838f",
    i: "#1565c0",
    k: "#1565c0",
    ",": "#1565c0",
    o: "#6a1b9a",
    l: "#6a1b9a",
    ".": "#6a1b9a",
    p: "#ad1457",
    ";": "#ad1457",
    " ": "#546e7a",
    "\n": "#546e7a",
  };

  /** Light key-cap wash matching the finger border color (next-key highlight). */
  function fingerHighlightBackground(borderHex) {
    const raw = String(borderHex).replace(/^#/, "");
    if (raw.length !== 6) return "";
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) return "";
    const br = 232;
    const bg = 229;
    const bb = 222;
    const t = 0.4;
    const R = Math.round(br + (r - br) * t);
    const G = Math.round(bg + (g - bg) * t);
    const B = Math.round(bb + (b - bb) * t);
    return `rgb(${R}, ${G}, ${B})`;
  }

  const keyboardEl = document.getElementById("keyboard");
  /** @type {Record<string, HTMLButtonElement>} */
  const keyEls = {};

  function buildKeyboard() {
    if (!keyboardEl) return;
    keyboardEl.innerHTML = "";
    for (const k of Object.keys(keyEls)) delete keyEls[k];

    function appendLetterKey(rowEl, ch) {
      const k = document.createElement("button");
      k.type = "button";
      k.className = "key";
      k.disabled = true;
      k.tabIndex = -1;
      k.style.borderColor = KEY_BORDER[ch] || "#6d6258";
      k.textContent = ch;
      keyEls[ch] = k;
      rowEl.appendChild(k);
    }

    const top = document.createElement("div");
    top.className = "kb-row kb-row-top";
    for (const ch of "qwertyuiop") appendLetterKey(top, ch);
    keyboardEl.appendChild(top);

    const home = document.createElement("div");
    home.className = "kb-row kb-row-home";
    for (const ch of "asdfghjkl;") appendLetterKey(home, ch);
    const ent = document.createElement("button");
    ent.type = "button";
    ent.className = "key key-enter";
    ent.disabled = true;
    ent.tabIndex = -1;
    ent.style.borderColor = KEY_BORDER["\n"] || "#4a4858";
    ent.textContent = "⏎";
    ent.setAttribute("aria-label", "Enter");
    keyEls["\n"] = ent;
    home.appendChild(ent);
    keyboardEl.appendChild(home);

    const bot = document.createElement("div");
    bot.className = "kb-row kb-row-bot";
    for (const ch of "zxcvbnm,.") appendLetterKey(bot, ch);
    keyboardEl.appendChild(bot);

    const base = document.createElement("div");
    base.className = "kb-row kb-row-base";
    const sp = document.createElement("button");
    sp.type = "button";
    sp.className = "key key-space";
    sp.disabled = true;
    sp.tabIndex = -1;
    sp.style.borderColor = KEY_BORDER[" "] || "#5c5650";
    sp.textContent = "␣";
    sp.setAttribute("aria-label", "Space");
    keyEls[" "] = sp;
    base.appendChild(sp);
    keyboardEl.appendChild(base);
  }

  function updateKeyOpacity() {
    const allowed = getAllowedSet();
    for (const ch of Object.keys(keyEls)) {
      const el = keyEls[ch];
      if (!el) continue;
      const ok = practiceKeyAllowed(ch, allowed);
      el.style.opacity = ok ? "1" : "0.32";
      el.style.filter = ok ? "" : "brightness(0.78)";
    }
  }

  function updateKeyHighlights() {
    for (const ch of Object.keys(keyEls)) {
      const el = keyEls[ch];
      el.classList.remove("next", "wrong");
      el.style.borderColor = KEY_BORDER[ch] || "#6d6258";
      el.style.background = "";
    }
    const w = currentWord();
    if (w == null || pos >= w.length) return;
    const next = w[pos];
    const targetEl = keyEls[next];
    if (!targetEl) return;
    const accent = KEY_BORDER[next] || "#78909c";
    targetEl.classList.add("next");
    targetEl.style.borderColor = accent;
    targetEl.style.background = fingerHighlightBackground(accent);
  }

  function validateRows() {
    const set = getAllowedSet();
    if (set.size === 0) {
      rowWarn.classList.add("show");
      rowWarn.textContent = "Turn a row on.";
      return false;
    }
    rowWarn.classList.remove("show");
    if ((isTypingWords() || isQuizMode()) && !allowedHasVowel(set)) {
      rowWarn.classList.add("show");
      rowWarn.textContent = "Need vowels — Home or Top, or Letter mode.";
      return false;
    }
    return true;
  }

  function rebuildQueue() {
    clearGentleNudge();
    quizCompleting = false;
    document.getElementById("quizDoneBanner")?.classList.remove("show");
    if (!validateRows()) return;
    const allowed = getAllowedSet();
    const arr = [...allowed];
    if (isQuizMode()) {
      quizParagraph = buildQuizParagraph(allowed);
      quizTimerStart = null;
      quizSpokenWordStarts.clear();
      clearTimeout(quizWordSpeakTimer);
      pos = 0;
      wi = 0;
      queue = [];
      document.getElementById("quizDoneBanner")?.classList.remove("show");
    } else if (isLetterMode()) {
      letterTarget = randomLetterFrom(arr);
      pos = 0;
      wi = 0;
      queue = [];
    } else {
      practiceRoundIndex = 0;
      let filtered = filterWords(allowed);
      if (filtered.length === 0) {
        filtered = fullPoolForMode().slice();
        if (filtered.length > 0) {
          rowWarn.classList.add("show");
          rowWarn.textContent = "Showing all words for this mode.";
        }
      }
      const first = pickWeightedPracticeEntry(filtered);
      queue = first ? [first] : [];
      wi = 0;
      pos = 0;
    }
    hiddenInput.value = "";
    renderWord();
    saveStats();
    if (!wordBank.length) {
      rowWarn.classList.add("show");
      rowWarn.textContent = "No words — check words.json / console.";
    }
    if (!isQuizMode()) scheduleSpeakIntro();
    ensureTypingFocus();
  }

  /** Show “2× 🥉!” when this bank item awards double trophy steps (level 4–5). */
  function updateTrophy2xBadge() {
    const el = document.getElementById("trophy2xBadge");
    if (!el) return;
    if (isQuizMode() || isLetterMode()) {
      el.hidden = true;
      el.removeAttribute("aria-label");
      el.textContent = "";
      el.removeAttribute("title");
      return;
    }
    const ent = currentEntry();
    if (!ent || difficultyForEntry(ent) < 4) {
      el.hidden = true;
      el.removeAttribute("aria-label");
      el.textContent = "";
      el.removeAttribute("title");
      return;
    }
    el.hidden = false;
    el.textContent = "2× 🥉!";
    el.title = "Level 4–5 · double 🥉 trophy steps when you finish!";
    el.setAttribute(
      "aria-label",
      "Double trophies: this is a harder word — you earn two bronze steps per word when you finish."
    );
  }

  function renderWord() {
    flash.classList.toggle("quiz-active", isQuizMode());
    const quizHud = document.getElementById("quizHud");
    const quizFooter = document.getElementById("quizStatsFooter");
    if (quizHud) quizHud.style.display = isQuizMode() ? "block" : "none";
    if (quizFooter) quizFooter.style.display = isQuizMode() ? "block" : "none";

    const readIntroTextEl = document.getElementById("readIntroText");
    if (isQuizMode()) {
      if (readIntroTextEl) {
        const botOn = chkBot.checked;
        const homeOn = chkHome.checked;
        if (botOn && homeOn) readIntroTextEl.textContent = "🔊 Quiz · hear , . ; ⏎";
        else if (!botOn && homeOn)
          readIntroTextEl.textContent = "🔊 Quiz · need Bottom for , .";
        else if (botOn && !homeOn)
          readIntroTextEl.textContent = "🔊 Quiz · need Home for ;";
        else readIntroTextEl.textContent = "🔊 Quiz · need Home + Bottom";
      }
      btnSpeak.textContent = "🔊 This bit";
      wordDisplay.classList.remove("letter-mode", "phrase-mode");
      wordDisplay.classList.add("quiz-paragraph");
      wordBadgeRow.innerHTML = "";
      setDifficultyDisplay("quiz", null);
      setWordLevelLine("");
      zhLine.textContent = "";
      wordEmojiEl.textContent = "📚";
      const wq = quizParagraph;
      wordDisplay.innerHTML = "";
      for (let i = 0; i < wq.length; i++) {
        const char = wq[i];
        const span = document.createElement("span");
        if (char === " ") {
          span.className = "space-char";
          if (i < pos) span.classList.add("done");
          else if (i === pos) span.classList.add("current");
          else span.classList.add("todo");
          span.textContent = " ";
          span.title = "␣ Space bar";
          wordDisplay.appendChild(span);
        } else if (char === "\n") {
          span.className = "enter-char";
          if (i < pos) span.classList.add("done");
          else if (i === pos) span.classList.add("current");
          else span.classList.add("todo");
          span.textContent = "↵";
          span.title = "⏎ Enter — new line";
          wordDisplay.appendChild(span);
          const br = document.createElement("br");
          br.className = "quiz-line-break";
          br.setAttribute("aria-hidden", "true");
          wordDisplay.appendChild(br);
        } else {
          span.textContent = char;
          if (i < pos) span.className = "done";
          else if (i === pos) span.className = "current";
          else span.className = "todo";
          wordDisplay.appendChild(span);
        }
      }
      roundInfoEl.textContent =
        "🎲 " + countWordsInText(quizParagraph) + " words";
      renderKidStats();
      updateQuizHud();
      updateTrophy2xBadge();
      updateKeyOpacity();
      updateKeyHighlights();
      scheduleSpeakCurrentQuizWord();
      return;
    }

    if (readIntroTextEl) {
      readIntroTextEl.textContent = "🔊 Hear word";
    }
    btnSpeak.textContent = "🔊 Again";

    const letterMode = isLetterMode();
    wordDisplay.classList.remove("quiz-paragraph");
    wordDisplay.classList.toggle("letter-mode", letterMode);
    const entEarly = currentEntry();
    const isPhrase = entEarly && entEarly.kind === "phrase";
    wordDisplay.classList.toggle("phrase-mode", !letterMode && isPhrase);

    const w = currentWord();
    wordDisplay.innerHTML = "";
    if (letterMode) {
      wordBadgeRow.innerHTML = "";
      setDifficultyDisplay("letter", null);
      setWordLevelLine("");
      zhLine.textContent = "键盘字母";
      wordEmojiEl.textContent = LETTER_EMOJI[w] || "🔤";
      const span = document.createElement("span");
      span.textContent = w;
      span.className = pos >= w.length ? "done" : "current";
      wordDisplay.appendChild(span);
    } else {
      const ent = currentEntry();
      wordBadgeRow.innerHTML = "";
      if (ent) {
        setDifficultyDisplay("word", ent);
        setWordLevelLine(ent.level ? String(ent.level).trim() : "");
        zhLine.textContent = ent.zh != null ? String(ent.zh) : "";
        wordEmojiEl.textContent = ent.e || "✨";
      } else {
        setDifficultyDisplay("word", null);
        setWordLevelLine("");
        zhLine.textContent = "";
        wordEmojiEl.textContent = "✨";
      }
      for (let i = 0; i < w.length; i++) {
        const char = w[i];
        const span = document.createElement("span");
        if (char === " ") {
          span.className = "space-char";
          if (i < pos) span.classList.add("done");
          else if (i === pos) span.classList.add("current");
          else span.classList.add("todo");
          span.textContent = " ";
          span.title = "␣ Space";
          wordDisplay.appendChild(span);
        } else if (char === "\n") {
          span.className = "enter-char";
          if (i < pos) span.classList.add("done");
          else if (i === pos) span.classList.add("current");
          else span.classList.add("todo");
          span.textContent = "↵";
          span.title = "⏎ Enter";
          wordDisplay.appendChild(span);
          const br = document.createElement("br");
          br.className = "quiz-line-break";
          br.setAttribute("aria-hidden", "true");
          wordDisplay.appendChild(br);
        } else {
          span.textContent = char;
          if (i < pos) span.className = "done";
          else if (i === pos) span.className = "current";
          else span.className = "todo";
          wordDisplay.appendChild(span);
        }
      }
    }
    roundInfoEl.textContent = letterMode
      ? "🔤 Letter"
      : isSentenceMode()
        ? "📝 Line " + (practiceRoundIndex + 1)
        : "📖 Word " + (practiceRoundIndex + 1);
    renderKidStats();
    updateTrophy2xBadge();
    updateKeyOpacity();
    updateKeyHighlights();
    scrollTypingCurrentIntoView();
  }

  /** Keep the active character visible inside scrollable word areas (quiz / long lines). */
  function scrollTypingCurrentIntoView() {
    requestAnimationFrame(() => {
      const cur = wordDisplay.querySelector("span.current");
      if (!cur) return;
      try {
        cur.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      } catch (_) {
        cur.scrollIntoView();
      }
    });
  }

  /** @type {AudioContext | null} */
  let typingAudioCtx = null;

  function ensureTypingAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!typingAudioCtx) typingAudioCtx = new AC();
    if (typingAudioCtx.state === "suspended")
      typingAudioCtx.resume().catch(() => {});
    return typingAudioCtx;
  }

  /** Correct key: crisp **clack** — bright short noise + tiny high tick (no low thud). */
  function playTypingCorrectSound() {
    if (!keySoundsOn()) return;
    try {
      const ctx = ensureTypingAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const sr = ctx.sampleRate;
      const nMain = Math.max(1, Math.floor(sr * 0.024));
      const buf = ctx.createBuffer(1, nMain, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < nMain; i++) {
        const env = Math.pow(1 - i / nMain, 3.4);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const main = ctx.createBufferSource();
      main.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(3600, t);
      bp.Q.setValueAtTime(2.6, t);
      const gMain = ctx.createGain();
      gMain.gain.setValueAtTime(0.48, t);
      gMain.gain.exponentialRampToValueAtTime(0.0008, t + 0.02);
      main.connect(bp);
      bp.connect(gMain);

      const nTick = Math.max(1, Math.floor(sr * 0.006));
      const bufT = ctx.createBuffer(1, nTick, sr);
      const dt = bufT.getChannelData(0);
      for (let i = 0; i < nTick; i++) {
        dt[i] = (Math.random() * 2 - 1) * (1 - i / nTick);
      }
      const tick = ctx.createBufferSource();
      tick.buffer = bufT;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(6500, t);
      const gTick = ctx.createGain();
      gTick.gain.setValueAtTime(0.26, t);
      gTick.gain.exponentialRampToValueAtTime(0.0008, t + 0.008);
      tick.connect(hp);
      hp.connect(gTick);

      gMain.connect(ctx.destination);
      gTick.connect(ctx.destination);
      main.start(t);
      main.stop(t + 0.028);
      tick.start(t);
      tick.stop(t + 0.01);
    } catch (_) {}
  }

  /** Mild soft tone when the key doesn’t match. */
  function playTypingWrongSound() {
    if (!keySoundsOn()) return;
    try {
      const ctx = ensureTypingAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch (_) {}
  }

  /** Mega 🏆 merge: ascending fanfare + shimmer — longer than key SFX, respects key sounds. */
  function playMegaTrophyCelebrationSound() {
    if (!keySoundsOn()) return;
    try {
      const ctx = ensureTypingAudioContext();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const arp = [
        { f: 392.0, at: 0.0, dur: 0.26 },
        { f: 523.25, at: 0.12, dur: 0.28 },
        { f: 659.25, at: 0.24, dur: 0.3 },
        { f: 783.99, at: 0.36, dur: 0.32 },
        { f: 1046.5, at: 0.52, dur: 0.42 },
      ];
      for (const n of arp) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        const s = t0 + n.at;
        const e = s + n.dur;
        osc.frequency.setValueAtTime(n.f, s);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.1, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, e);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(s);
        osc.stop(e + 0.03);
      }
      const shine = [
        { f: 1318.51, at: 0.82 },
        { f: 1567.98, at: 0.9 },
        { f: 1760.0, at: 0.98 },
      ];
      for (const n of shine) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        const s = t0 + n.at;
        const e = s + 0.62;
        osc.frequency.setValueAtTime(n.f, s);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.055, s + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0008, e);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(s);
        osc.stop(e + 0.02);
      }
    } catch (_) {}
  }

  function flashWrongKey(ch) {
    playTypingWrongSound();
    if (ch != null && keyEls[ch]) {
      const el = keyEls[ch];
      el.classList.remove("next");
      el.classList.add("wrong");
      window.setTimeout(() => el.classList.remove("wrong"), 450);
    }
    gentleMistypeReminder();
  }

  function onWrongKey() {
    /* kept for skip / wrong key hooks */
  }

  function onCompleteQuiz() {
    if (quizCompleting) return;
    quizCompleting = true;
    const words = countWordsInText(quizParagraph);
    let wpm = 0;
    if (quizTimerStart != null) {
      const elapsedMin = Math.max(
        (Date.now() - quizTimerStart) / 60000,
        1 / 120
      );
      wpm = Math.round(words / elapsedMin);
    }
    runTypingCompleteCelebration();
    /* Trophies already applied each quiz word in real time */
    stats.quizLastWpm = wpm;
    if (wpm > 0) {
      stats.quizBestWpm = Math.max(stats.quizBestWpm || 0, wpm);
    }
    stats.quizParagraphsDone = (stats.quizParagraphsDone || 0) + 1;
    saveStats();
    renderKidStats();
    const ban = document.getElementById("quizDoneBanner");
    if (ban) {
      ban.textContent =
        wpm > 0
          ? "🎉 Done! 🏃 ~" + wpm + " wpm · 📚 " + words + " words"
          : "🎉 Done all " + words + " words!";
      ban.classList.add("show");
    }
    window.setTimeout(() => {
      ban?.classList.remove("show");
      quizCompleting = false;
      nextWordOrLetter();
    }, 2800);
  }

  function nextWordOrLetter() {
    clearGentleNudge();
    if (isQuizMode()) {
      if (!validateRows()) return;
      const allowed = getAllowedSet();
      quizParagraph = buildQuizParagraph(allowed);
      quizTimerStart = null;
      quizCompleting = false;
      quizSpokenWordStarts.clear();
      clearTimeout(quizWordSpeakTimer);
      pos = 0;
      hiddenInput.value = "";
      document.getElementById("quizDoneBanner")?.classList.remove("show");
      renderWord();
      ensureTypingFocus();
      return;
    }
    const allowed = getAllowedSet();
    const arr = [...allowed];
    if (isLetterMode()) {
      letterTarget = randomLetterFrom(arr);
      pos = 0;
    } else {
      practiceRoundIndex++;
      wi = 0;
      pos = 0;
      let filtered = filterWords(getAllowedSet());
      if (filtered.length === 0) filtered = shuffle(fullPoolForMode());
      const next = pickWeightedPracticeEntry(filtered);
      queue = next ? [next] : [];
    }
    hiddenInput.value = "";
    renderWord();
    scheduleSpeakIntro();
    ensureTypingFocus();
  }

  function onCompleteWord() {
    const entry = queue[wi];
    const typed = entry ? entryTypingText(entry) : "";
    const speakText = entry ? entry.w : "";
    if (entry) {
      if (entry.kind === "cvc") stats.wordsCvc++;
      else if (entry.kind === "sight") stats.wordsSight++;
      else if (entry.kind === "phrase") {
        stats.wordsPhrase++;
        stats.phraseWordsTyped =
          (stats.phraseWordsTyped | 0) + countWordsInText(typed);
      } else stats.wordsSimple++;
    }
    const wordSteps =
      entry && entry.kind === "phrase" ? countWordsInText(typed) : 1;
    runTypingCompleteCelebration();
    awardWordTrophies(wordSteps, entry);
    speak(speakText);
    saveStats();
    renderKidStats();
    setTimeout(nextWordOrLetter, 650);
  }

  function onCompleteLetter() {
    stats.lettersDone++;
    runTypingCompleteCelebration();
    awardWordTrophies(1, null);
    speak(letterTarget);
    saveStats();
    renderKidStats();
    setTimeout(nextWordOrLetter, 450);
  }

  function handleKey(e) {
    if (!validateRows()) return;
    if (isQuizMode() && quizCompleting) return;
    const w = currentWord();
    if (!w) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      if (!isLetterMode() && pos > 0) {
        pos--;
        if (isQuizMode()) {
          if (pos === 0) quizTimerStart = null;
          quizClearSpokenIfBackedUp(pos);
        }
      }
      renderWord();
      return;
    }

    if (isLetterMode()) {
      if (e.key.length !== 1) return;
      const ch = e.key.toLowerCase();
      if (ch < "a" || ch > "z") {
        if (e.key === " " || e.key === "," || e.key === ".") e.preventDefault();
        return;
      }
      const allowed = getAllowedSet();
      if (!allowed.has(ch)) {
        e.preventDefault();
        flashWrongKey(ch);
        onWrongKey();
        return;
      }
      if (ch === letterTarget) {
        e.preventDefault();
        playTypingCorrectSound();
        pos = 1;
        renderWord();
        onCompleteLetter();
      } else {
        e.preventDefault();
        flashWrongKey(ch);
        onWrongKey();
      }
      return;
    }

    const ch = eventToPracticeChar(e);
    if (ch === null) return;

    const allowed = getAllowedSet();
    if (!practiceKeyAllowed(ch, allowed)) {
      e.preventDefault();
      flashWrongKey(ch);
      onWrongKey();
      return;
    }

    if (pos >= w.length) return;
    const expect = w[pos];
    if (ch === expect) {
      e.preventDefault();
      playTypingCorrectSound();
      if (isQuizMode() && quizTimerStart === null) quizTimerStart = Date.now();
      const typedAt = pos;
      pos++;
      if (
        isQuizMode() &&
        quizJustCompletedAWord(quizParagraph, typedAt)
      ) {
        stats.wordsQuiz = (stats.wordsQuiz | 0) + 1;
        awardWordTrophies(1, null, { quizLive: true });
      }
      renderWord();
      if (pos >= w.length) {
        if (isQuizMode()) onCompleteQuiz();
        else onCompleteWord();
      }
    } else {
      e.preventDefault();
      flashWrongKey(ch);
      onWrongKey();
    }
  }

  function onKbRowsChange() {
    saveKbRowsPrefs();
    rebuildQueue();
  }
  chkTop.addEventListener("change", onKbRowsChange);
  chkHome.addEventListener("change", onKbRowsChange);
  chkBot.addEventListener("change", onKbRowsChange);
  modeWord.addEventListener("change", rebuildQueue);
  modeLetter.addEventListener("change", rebuildQueue);
  modeSentence.addEventListener("change", rebuildQueue);
  modeQuiz.addEventListener("change", rebuildQueue);
  chkReadIntro.addEventListener("change", () => {
    if (!chkReadIntro.checked) return;
    if (isQuizMode()) scheduleSpeakCurrentQuizWord();
    else scheduleSpeakIntro();
  });

  /**
   * Single-file HTML: inlines css, config.js, data/words.json (as PRELOADED), app.js.
   */
  async function buildStandaloneTypingHtml() {
    const root = new URL(".", window.location.href);
    const loadText = (path) =>
      fetch(new URL(path, root)).then((r) => {
        if (!r.ok) throw new Error(path + ": HTTP " + r.status);
        return r.text();
      });
    const [css, configScript, wordsJson, appScript, faviconSvg] = await Promise.all([
      loadText("css/app.css"),
      loadText("js/config.js"),
      loadText("data/words.json"),
      loadText("js/app.js"),
      loadText("favicon.svg").catch(() => ""),
    ]);

    const htmlEl = document.documentElement.cloneNode(true);
    const head = htmlEl.querySelector("head");
    const body = htmlEl.querySelector("body");
    if (!head || !body) throw new Error("Missing head/body");

    if (faviconSvg) {
      head.querySelectorAll('link[rel="icon"]').forEach((n) =>
        n.setAttribute(
          "href",
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(faviconSvg.trim())
        )
      );
    }

    head.querySelectorAll('link[rel="stylesheet"][href*="css/app.css"]').forEach((n) =>
      n.remove()
    );
    const styleEl = document.createElement("style");
    styleEl.textContent = "\n" + css + "\n";
    head.appendChild(styleEl);

    body.querySelectorAll("script[src]").forEach((n) => n.remove());

    const cfgEl = document.createElement("script");
    cfgEl.textContent = "\n" + configScript + "\n";
    body.appendChild(cfgEl);

    const dataEl = document.createElement("script");
    dataEl.textContent =
      "\nwindow.TYPING_PRACTICE_PRELOADED_WORDS = " + wordsJson.trim() + ";\n";
    body.appendChild(dataEl);

    const appEl = document.createElement("script");
    appEl.textContent = "\n" + appScript + "\n";
    body.appendChild(appEl);

    return "<!DOCTYPE html>\n" + htmlEl.outerHTML;
  }

  document.getElementById("btnDownloadPage")?.addEventListener("click", async () => {
    try {
      const html = await buildStandaloneTypingHtml();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "typing-practice.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(
        "Could not bundle CSS/JS into one file (fetch blocked?). Zip the whole typing_practice folder instead, or use File → Save Page As."
      );
    }
  });

  async function boot() {
    buildInferenceCaches();
    try {
      wordBank = await loadWordBankAsync();
    } catch (err) {
      console.error("typing_practice: could not load words", err);
      wordBank = [];
    }
    finalizeWordDifficulties();
    stats = loadStats();
    buildKeyboard();
    renderKidStats();
    renderTrophyPanel();
    initAllVoicePickers();
    window.setTimeout(initAllVoicePickers, 350);
    window.setTimeout(initAllVoicePickers, 1100);
    initSoundPrefControls();
    loadKbRowsPrefs();
    rebuildQueue();
    bindTrophyToastLayoutListeners();
  }

  boot().catch((e) => console.error(e));

  flash.addEventListener("click", (e) => {
    const t = e.target;
    if (t instanceof Element) {
      if (t.closest(".read-toggle")) return;
      if (t.closest(".sound-toggles")) return;
      if (t.closest("button")) return;
    }
    ensureTypingFocus();
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest("#configPanel") ||
        t.closest("#statsPanel") ||
        t.closest(".sound-toggles")
      )
        return;
      if (t.closest(".app-topbar")) return;
      if (t.closest("button")) return;
      if (t.closest(".read-toggle")) return;
      ensureTypingFocus();
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ensureTypingFocus();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const ae = document.activeElement;
      if (ae === hiddenInput) return;
      if (ae instanceof HTMLButtonElement) return;
      if (ae && ae instanceof Element) {
        if (
          ae.closest("#configPanel") ||
          ae.closest("#statsPanel") ||
          ae.closest(".read-toggle") ||
          ae.closest(".sound-toggles") ||
          ae.closest(".app-topbar")
        )
          return;
      }
      if (isLetterMode()) {
        if (e.key.length !== 1) return;
        const ch = e.key.toLowerCase();
        if (ch < "a" || ch > "z") return;
      } else if (eventToPracticeChar(e) === null) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      hiddenInput.focus({ preventScroll: true });
      handleKey(e);
    },
    true
  );

  hiddenInput.addEventListener("keydown", handleKey);
  hiddenInput.addEventListener("input", (e) => {
    e.target.value = "";
  });

  btnSpeak.addEventListener("click", () => {
    if (isQuizMode()) {
      speakCurrentQuizWordForce();
      ensureTypingFocus();
      return;
    }
    speakIntroForCurrent(true);
    ensureTypingFocus();
  });

  btnNext.addEventListener("click", () => {
    if (!validateRows()) return;
    onWrongKey();
    nextWordOrLetter();
  });

  btnClearStats.addEventListener("click", () => clearAllStats());
})();
