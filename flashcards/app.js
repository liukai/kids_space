/**
 * Word flashcards — just see (word + listen) or quiz (inline blank) · prefs in cookie + localStorage
 */

(function () {
  "use strict";

  var WORDS_URL = "words.json";
  var EASY_DIFFICULTY_MAX = 2;
  var COOKIE_PREFS = "flashcards_prefs_v1";
  var LS_PREFS_FALLBACK = "flashcards_prefs_v1";
  var LS_WORD_STATS = "flashcardQuizWordStats";
  var LS_WORD_QUIZ_DETAIL = "flashcardQuizWordDetail";
  var LS_POINTS = "flashcardQuizPoints";
  var LS_STREAK = "flashcardQuizStreak_v1";
  var LS_FAVORITES = "flashcardFavorites_v1";
  var TROPHY_EVERY = 20;
  /** Quiz / type-all: fixed queue of this many cards when “Start 10” is used. */
  var SET_LEN = 10;

  /** Quiz points per correct answer = word difficulty from JSON (min 1). */
  function quizPointsForItem(item) {
    if (!item) return EASY_DIFFICULTY_MAX;
    var d = item.difficulty;
    if (typeof d === "number" && !isNaN(d) && d > 0) return Math.round(d);
    return EASY_DIFFICULTY_MAX;
  }

  function normalizeWordList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (row) {
        var o = row && typeof row === "object" ? row : {};
        var word = String(o.word != null ? o.word : "")
          .trim()
          .toLowerCase();
        return {
          word: word,
          emoji: String(o.emoji != null ? o.emoji : ""),
          chinese: String(o.chinese != null ? o.chinese : ""),
          type: String(o.type != null ? o.type : ""),
          wordType: String(o.wordType != null ? o.wordType : ""),
          gradeLevel: String(o.gradeLevel != null ? o.gradeLevel : ""),
          difficulty:
            typeof o.difficulty === "number" && !isNaN(o.difficulty)
              ? o.difficulty
              : EASY_DIFFICULTY_MAX,
        };
      })
      .filter(function (w) {
        return w.word.length > 0;
      });
  }

  function wordEntryKey(it) {
    return [
      it.word,
      it.difficulty,
      it.type,
      it.wordType,
      it.gradeLevel,
      it.chinese,
      it.emoji,
    ].join("|");
  }

  function dedupeWordList(items) {
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var key = wordEntryKey(it);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(it);
    }
    return out;
  }

  /** Unique { value: type slug, label: wordType } sorted by label. */
  function wordTypeOptionsFromItems(items) {
    var byType = {};
    var i;
    var k;
    for (i = 0; i < items.length; i++) {
      var w = items[i];
      var t = w.type != null ? String(w.type).trim() : "";
      if (!t) continue;
      if (!byType[t]) {
        byType[t] = w.wordType ? String(w.wordType) : t;
      }
    }
    var pairs = [];
    for (k in byType) {
      if (Object.prototype.hasOwnProperty.call(byType, k)) {
        pairs.push({ value: k, label: byType[k] });
      }
    }
    pairs.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    return pairs;
  }

  function uniqueSortedDifficulties(items) {
    var s = {};
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var d = items[i].difficulty;
      if (!s[d]) {
        s[d] = true;
        list.push(d);
      }
    }
    list.sort(function (a, b) {
      return a - b;
    });
    return list;
  }

  function filterByMaxDifficulty(items, maxCap) {
    return items.filter(function (w) {
      return w.difficulty <= maxCap;
    });
  }

  function isTypingMode() {
    return studyMode === "quiz" || studyMode === "typeall";
  }

  /** Main card meta line (quiz rate shown separately as a small pill). */
  function describeCardMetaLine(item) {
    if (!item) return "";
    var bits = [];
    if (item.wordType) bits.push(item.wordType);
    bits.push("Lv " + item.difficulty);
    if (studyMode === "quiz") {
      bits.push(
        quizGapChoiceMode ? "gap · pick letter" : "gap · type letter"
      );
    } else if (studyMode === "typeall") {
      bits.push("type the whole word");
    } else {
      bits.push("see mode");
    }
    if (item.chinese) bits.push(item.chinese);
    return bits.join(" · ");
  }

  /** Word popup meta line (quiz rate in pill). */
  function describeWordPeekMetaLine(item) {
    if (!item) return "";
    var bits = [];
    if (item.wordType) bits.push(item.wordType);
    bits.push("Lv " + item.difficulty);
    if (item.chinese) bits.push(item.chinese);
    return bits.join(" · ");
  }

  function randomMissingIndex(word) {
    if (!word.length) return 0;
    return Math.floor(Math.random() * word.length);
  }

  function shufflePickDifferent(pool, previous) {
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    var next = pool[Math.floor(Math.random() * pool.length)];
    var tries = 0;
    while (next === previous && tries < 12) {
      next = pool[Math.floor(Math.random() * pool.length)];
      tries++;
    }
    return next;
  }

  function shuffleInPlace(arr) {
    var i;
    var j;
    var t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Fill SET_LEN slots by cycling a shuffled pool (fair mix when deck is small). */
  function buildSetQueue(pool) {
    var out = [];
    if (!pool.length) return out;
    var bag = [];
    var k = 0;
    while (out.length < SET_LEN) {
      if (k >= bag.length) {
        bag = pool.slice();
        shuffleInPlace(bag);
        k = 0;
      }
      out.push(bag[k]);
      k++;
    }
    return out;
  }

  /**
   * Same strategy as typing_practice/js/app.js — only real English voices, avoid
   * quirky default voices that stay silent; optional voice URI from typing app prefs.
   */
  var LS_TYPING_EN_VOICE = "typingPracticeEnVoiceURI";

  /** Chrome often won’t speak until the user has interacted with the page; auto-speak timers fire too early. */
  var speechUserEverActivated = false;
  var speechActivationWired = false;
  /** { kind: 'word' | 'letters', text: string } — replay after first tap/key. */
  var pendingSpeech = null;

  function listEnglishVoices() {
    if (!window.speechSynthesis) return [];
    try {
      var voices = speechSynthesis.getVoices() || [];
      var out = [];
      for (var i = 0; i < voices.length; i++) {
        var lang = String(voices[i].lang || "")
          .toLowerCase()
          .replace(/_/g, "-");
        var base = lang.split("-")[0];
        if (base === "en") out.push(voices[i]);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function voiceNameLower(v) {
    return String(v.name || "").toLowerCase();
  }

  function pickAutoEnglishVoice() {
    var list = listEnglishVoices();
    if (!list.length) return null;
    var avoid = ["albert", "bad ", "whisper", "zarvox"];
    var filtered = [];
    var i;
    var j;
    for (i = 0; i < list.length; i++) {
      var nm = voiceNameLower(list[i]);
      var skip = false;
      for (j = 0; j < avoid.length; j++) {
        if (nm.indexOf(avoid[j]) !== -1) {
          skip = true;
          break;
        }
      }
      if (!skip) filtered.push(list[i]);
    }
    var pool0 = filtered.length ? filtered : list;
    var us = [];
    for (i = 0; i < pool0.length; i++) {
      var l = String(pool0[i].lang || "")
        .toLowerCase()
        .replace(/_/g, "-");
      if (l.indexOf("en-us") === 0 || l === "en_us") us.push(pool0[i]);
    }
    var pool = us.length ? us : pool0;
    var localPrefer = [];
    for (i = 0; i < pool.length; i++) {
      if (pool[i].localService !== false) localPrefer.push(pool[i]);
    }
    if (localPrefer.length) pool = localPrefer;
    var keys = [
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
    for (j = 0; j < keys.length; j++) {
      var key = keys[j];
      for (i = 0; i < pool.length; i++) {
        if (voiceNameLower(pool[i]).indexOf(key) !== -1) return pool[i];
      }
    }
    return pool[0];
  }

  function resolveEnglishVoice() {
    try {
      var voices = speechSynthesis.getVoices() || [];
      var saved = localStorage.getItem(LS_TYPING_EN_VOICE);
      if (saved && saved !== "__auto__") {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].voiceURI === saved) return voices[i];
        }
      }
    } catch (e) {}
    return pickAutoEnglishVoice();
  }

  /** Browsers load voices async — typing app also repopulates on voiceschanged. */
  function initSpeechSynthesis() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    function prime() {
      try {
        speechSynthesis.getVoices();
      } catch (e) {}
    }
    prime();
    if (typeof speechSynthesis.addEventListener === "function") {
      speechSynthesis.addEventListener("voiceschanged", prime);
    } else {
      speechSynthesis.onvoiceschanged = prime;
    }
  }

  /**
   * Chrome often returns an empty voice list on the first getVoices() call; speaking then
   * can do nothing. Waits for voiceschanged (with a timeout) then runs fn — same idea as
   * typing_practice voice pickers.
   */
  function runWhenSpeechVoicesReady(fn) {
    if (!window.speechSynthesis || typeof fn !== "function") return;
    try {
      speechSynthesis.getVoices();
    } catch (e) {}
    var list = speechSynthesis.getVoices() || [];
    if (list.length > 0) {
      fn();
      return;
    }
    var done = false;
    var tMax = window.setTimeout(function () {
      finish();
    }, 2800);
    function finish() {
      if (done) return;
      done = true;
      try {
        window.clearTimeout(tMax);
      } catch (e2) {}
      try {
        speechSynthesis.removeEventListener("voiceschanged", onVc);
      } catch (e3) {}
      fn();
    }
    function onVc() {
      var again = speechSynthesis.getVoices() || [];
      if (again.length > 0) finish();
    }
    try {
      speechSynthesis.addEventListener("voiceschanged", onVc);
    } catch (e4) {
      window.setTimeout(fn, 0);
    }
  }

  function wireSpeechUserActivationOnce() {
    if (speechActivationWired) return;
    speechActivationWired = true;
    function onFirstInteraction() {
      if (speechUserEverActivated) return;
      speechUserEverActivated = true;
      document.removeEventListener("pointerdown", onFirstInteraction, true);
      document.removeEventListener("keydown", onFirstInteractionDrill, true);
      try {
        speechSynthesis.getVoices();
      } catch (e) {}
      if (pendingSpeech && window.speechSynthesis) {
        var p = pendingSpeech;
        pendingSpeech = null;
        if (p.kind === "letters") speakWordLetters(p.text, true);
        else speakWord(p.text, true);
      }
    }
    function onFirstInteractionDrill(e) {
      var ign =
        e &&
        (e.metaKey ||
          e.ctrlKey ||
          e.altKey ||
          (e.key && e.key.length > 1 && e.key !== " "));
      if (ign) return;
      onFirstInteraction();
    }
    document.addEventListener("pointerdown", onFirstInteraction, {
      capture: true,
      passive: true,
    });
    document.addEventListener("keydown", onFirstInteractionDrill, {
      capture: true,
      passive: true,
    });
  }

  /** Match typing_practice: set explicit en voice when available (Chrome is reliable with this). */
  function applyEnglishVoice(u) {
    if (!u) return;
    var v = resolveEnglishVoice();
    if (v) {
      try {
        u.voice = v;
        u.lang = String(v.lang || "en-US").replace(/_/g, "-");
      } catch (e) {
        u.lang = "en-US";
      }
    } else {
      u.lang = "en-US";
    }
  }

  /** Slightly after cancel() so Chrome/Edge don’t drop the utterance. */
  var SPEAK_AFTER_CANCEL_MS = 120;

  function speakWord(text, userInitiated) {
    if (!text || !window.speechSynthesis) return;
    userInitiated = userInitiated === true;
    wireSpeechUserActivationOnce();
    if (userInitiated) {
      pendingSpeech = null;
    } else if (!speechUserEverActivated) {
      pendingSpeech = { kind: "word", text: text };
    }
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
    } catch (e) {}
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }
    } catch (e1) {}
    runWhenSpeechVoicesReady(function () {
      window.setTimeout(function () {
        try {
          var u = new SpeechSynthesisUtterance(text);
          applyEnglishVoice(u);
          u.rate = 0.9;
          u.volume = 1;
          u.pitch = 1;
          u.onerror = function () {
            try {
              var u2 = new SpeechSynthesisUtterance(text);
              u2.lang = "en-US";
              u2.rate = 0.9;
              u2.volume = 1;
              u2.pitch = 1;
              speechSynthesis.speak(u2);
            } catch (e3) {}
          };
          speechSynthesis.speak(u);
        } catch (e2) {}
      }, SPEAK_AFTER_CANCEL_MS);
    });
  }

  /** Letter-by-letter (after peek/cheat only — not on normal quiz hear). */
  function speakWordLetters(word, userInitiated) {
    if (!word || !window.speechSynthesis) return;
    userInitiated = userInitiated === true;
    wireSpeechUserActivationOnce();
    if (userInitiated) {
      pendingSpeech = null;
    } else if (!speechUserEverActivated) {
      pendingSpeech = { kind: "letters", text: word };
    }
    var spaced = word.toLowerCase().split("").join(" ");
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
    } catch (e) {}
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }
    } catch (e1) {}
    runWhenSpeechVoicesReady(function () {
      window.setTimeout(function () {
        try {
          var u = new SpeechSynthesisUtterance(spaced);
          applyEnglishVoice(u);
          u.rate = 0.78;
          u.volume = 1;
          u.pitch = 1;
          u.onerror = function () {
            try {
              var u2 = new SpeechSynthesisUtterance(spaced);
              u2.lang = "en-US";
              u2.rate = 0.78;
              u2.volume = 1;
              u2.pitch = 1;
              speechSynthesis.speak(u2);
            } catch (e3) {}
          };
          speechSynthesis.speak(u);
        } catch (e2) {}
      }, SPEAK_AFTER_CANCEL_MS);
    });
  }

  function isHttpProto() {
    var p = location.protocol;
    return p === "http:" || p === "https:";
  }

  function savePrefs(prefsObj) {
    var str = JSON.stringify(prefsObj);
    try {
      localStorage.setItem(LS_PREFS_FALLBACK, str);
    } catch (e) {}
    if (isHttpProto()) {
      var enc = encodeURIComponent(str);
      document.cookie =
        COOKIE_PREFS +
        "=" +
        enc +
        ";path=/;max-age=" +
        365 * 86400 +
        ";SameSite=Lax";
    }
  }

  function loadPrefs() {
    if (isHttpProto()) {
      var all = document.cookie.split("; ");
      for (var i = 0; i < all.length; i++) {
        var ix = all[i].indexOf("=");
        if (ix === -1) continue;
        var name = all[i].slice(0, ix);
        if (name === COOKIE_PREFS) {
          try {
            return JSON.parse(
              decodeURIComponent(all[i].slice(ix + 1))
            );
          } catch (e) {}
        }
      }
    }
    try {
      var raw = localStorage.getItem(LS_PREFS_FALLBACK);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function loadWordStats() {
    try {
      return JSON.parse(localStorage.getItem(LS_WORD_STATS) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveWordStats(obj) {
    try {
      localStorage.setItem(LS_WORD_STATS, JSON.stringify(obj));
    } catch (e) {}
  }

  function loadQuizDetail() {
    try {
      return JSON.parse(localStorage.getItem(LS_WORD_QUIZ_DETAIL) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveQuizDetail(obj) {
    try {
      localStorage.setItem(LS_WORD_QUIZ_DETAIL, JSON.stringify(obj));
    } catch (e) {}
  }

  function ensureQuizEntry(d, w) {
    if (!d[w]) d[w] = { quizzed: 0, right: 0, wrong: 0 };
    return d[w];
  }

  /** Merge legacy right-only counts into quizzed/right/wrong. */
  function migrateQuizDetailFromLegacy() {
    var d = loadQuizDetail();
    var legacy = loadWordStats();
    var k;
    var changed = false;
    for (k in legacy) {
      if (!Object.prototype.hasOwnProperty.call(legacy, k)) continue;
      var n = legacy[k] | 0;
      if (n <= 0) continue;
      var e = ensureQuizEntry(d, k);
      if (e.right < n) {
        e.right = n;
        e.quizzed = Math.max(e.quizzed, n);
        changed = true;
      }
    }
    if (changed) saveQuizDetail(d);
  }

  function bumpQuizzed(w) {
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    e.quizzed++;
    saveQuizDetail(d);
  }

  function bumpWrong(w) {
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    e.wrong++;
    saveQuizDetail(d);
    quizStreak = 0;
    saveStreak(0);
    if (setModeActive) setHadWrongOnCard = true;
    updateScoreUi();
    maybeRefreshCardQuizPill(w);
  }

  function bumpWordCorrect(w) {
    var st = loadWordStats();
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    e.right++;
    st[w] = (st[w] || 0) + 1;
    saveQuizDetail(d);
    saveWordStats(st);
    maybeRefreshCardQuizPill(w);
    return e.right;
  }

  function getQuizEntry(w) {
    var d = loadQuizDetail();
    return d[w] || { quizzed: 0, right: 0, wrong: 0 };
  }

  function quizTryTotals(word) {
    var en = getQuizEntry(word);
    var right = en.right | 0;
    var wrong = en.wrong | 0;
    return { right: right, wrong: wrong, total: right + wrong };
  }

  function quizCorrectPercent(right, total) {
    if (total < 1) return null;
    return Math.round((100 * right) / total);
  }

  /** @returns {string} CSS tone: word-rate--none | full | high | low */
  function quizRateToneClass(pct, total) {
    if (total < 1) return "word-rate--none";
    if (pct >= 100) return "word-rate--full";
    if (pct > 70) return "word-rate--high";
    return "word-rate--low";
  }

  function formatQuizRateLabel(right, total) {
    if (total < 1) return "\u2014 (0/0)";
    var pct = Math.round((100 * right) / total);
    return pct + "% (" + right + "/" + total + ")";
  }

  /**
   * @param {HTMLElement} el
   * @param {string} word
   * @param {string} baseClasses e.g. "word-rate-pill word-rate-pill--by-word"
   */
  function setWordRatePillForWord(el, word, baseClasses) {
    if (!el) return;
    var t = quizTryTotals(word);
    var pct = quizCorrectPercent(t.right, t.total);
    var tone = quizRateToneClass(pct != null ? pct : 0, t.total);
    el.textContent = formatQuizRateLabel(t.right, t.total);
    el.className = (baseClasses || "word-rate-pill") + " " + tone;
    el.setAttribute("aria-label", "Quiz on this word: " + el.textContent);
  }

  function findWordItemByText(word) {
    var lc = String(word || "")
      .trim()
      .toLowerCase();
    if (!lc) return null;
    var i;
    for (i = 0; i < allWords.length; i++) {
      if (allWords[i].word === lc) return allWords[i];
    }
    return {
      word: lc,
      emoji: "",
      chinese: "",
      type: "",
      wordType: "",
      gradeLevel: "",
      difficulty: EASY_DIFFICULTY_MAX,
    };
  }

  function findWordItemByEntryKey(entryKey) {
    var i;
    for (i = 0; i < allWords.length; i++) {
      if (wordEntryKey(allWords[i]) === entryKey) return allWords[i];
    }
    return null;
  }

  var favoriteSet = {};

  function loadFavoritesIntoMemory() {
    favoriteSet = {};
    try {
      var raw = localStorage.getItem(LS_FAVORITES);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      for (var i = 0; i < arr.length; i++) {
        if (typeof arr[i] === "string" && arr[i]) favoriteSet[arr[i]] = true;
      }
    } catch (e) {}
  }

  function persistFavorites() {
    try {
      var keys = [];
      for (var k in favoriteSet) {
        if (!Object.prototype.hasOwnProperty.call(favoriteSet, k)) continue;
        keys.push(k);
      }
      keys.sort();
      localStorage.setItem(LS_FAVORITES, JSON.stringify(keys));
    } catch (e) {}
  }

  function refreshFavoritePanel() {
    var listEl = document.getElementById("favorites-list");
    var countEl = document.getElementById("favorites-count");
    var emptyEl = document.getElementById("favorites-empty");
    if (!listEl || !countEl) return;

    var rows = [];
    for (var i = 0; i < allWords.length; i++) {
      var item = allWords[i];
      if (favoriteSet[wordEntryKey(item)]) rows.push(item);
    }
    rows.sort(function (a, b) {
      return a.word.localeCompare(b.word);
    });

    countEl.textContent = String(rows.length);
    listEl.textContent = "";
    if (emptyEl) emptyEl.hidden = rows.length > 0;

    for (var j = 0; j < rows.length; j++) {
      var w = rows[j];
      var li = document.createElement("li");
      li.className = "saved-list__item saved-list__item--action";
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.dataset.entryKey = wordEntryKey(w);
      var title = document.createElement("p");
      title.className = "saved-list__word";
      title.textContent = w.word;
      var meta = document.createElement("p");
      meta.className = "saved-list__lvl";
      meta.textContent = "Lv " + w.difficulty;
      var rate = document.createElement("span");
      setWordRatePillForWord(
        rate,
        w.word,
        "word-rate-pill word-rate-pill--saved"
      );
      li.appendChild(title);
      li.appendChild(meta);
      li.appendChild(rate);
      listEl.appendChild(li);
    }
  }

  var REVIEW_BLOCKS = 5;

  function refreshReviewPanel() {
    var listEl = document.getElementById("review-list");
    var countEl = document.getElementById("review-count");
    var emptyEl = document.getElementById("review-empty");
    if (!listEl || !countEl) return;

    var detail = loadQuizDetail();
    var rows = [];
    var w;
    for (w in detail) {
      if (!Object.prototype.hasOwnProperty.call(detail, w)) continue;
      var e = detail[w];
      if (!e || (e.quizzed | 0) < 1) continue;
      rows.push({
        word: w,
        quizzed: e.quizzed | 0,
        right: e.right | 0,
        wrong: e.wrong | 0,
      });
    }
    function wrongShare(row) {
      var att = row.right + row.wrong;
      if (att < 1) return -1;
      return row.wrong / att;
    }
    rows.sort(function (a, b) {
      var sb = wrongShare(b);
      var sa = wrongShare(a);
      if (sb !== sa) return sb - sa;
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      return a.word.localeCompare(b.word);
    });

    countEl.textContent = String(rows.length);
    listEl.textContent = "";
    if (emptyEl) emptyEl.hidden = rows.length > 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var li = document.createElement("li");
      li.className = "progress-grid__row progress-grid__row--action";
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.dataset.word = r.word;

      var attempts = r.right + r.wrong;
      var pctGreen = 0;
      if (attempts > 0) {
        pctGreen = Math.round((100 * r.right) / attempts);
      }
      var filled =
        attempts > 0
          ? Math.min(
              REVIEW_BLOCKS,
              Math.round((r.right / attempts) * REVIEW_BLOCKS)
            )
          : 0;

      li.setAttribute(
        "title",
        r.word +
          " · " +
          pctGreen +
          "% of tries right · rounds " +
          r.quizzed +
          " · right " +
          r.right +
          " · wrong " +
          r.wrong
      );

      var wEl = document.createElement("p");
      wEl.className = "progress-row__word";
      wEl.textContent = r.word;

      var bar = document.createElement("div");
      bar.className = "progress-row__bar";
      bar.setAttribute("role", "img");
      bar.setAttribute(
        "aria-label",
        r.word +
          ": " +
          pctGreen +
          " percent of tries right; " +
          r.quizzed +
          " rounds, " +
          r.right +
          " right, " +
          r.wrong +
          " wrong"
      );

      var bi;
      for (bi = 0; bi < REVIEW_BLOCKS; bi++) {
        var sq = document.createElement("span");
        sq.className = "score-block";
        if (bi < filled) sq.classList.add("score-block--on");
        bar.appendChild(sq);
      }

      var pctEl = document.createElement("p");
      var rateTone = quizRateToneClass(pctGreen, attempts);
      pctEl.className = "progress-row__pct " + rateTone;
      if (attempts < 1) {
        pctEl.classList.add("progress-row__pct--empty");
        pctEl.textContent = formatQuizRateLabel(0, 0);
      } else {
        pctEl.textContent =
          pctGreen + "% (" + r.right + "/" + attempts + ")";
      }

      li.appendChild(wEl);
      li.appendChild(bar);
      li.appendChild(pctEl);
      listEl.appendChild(li);
    }
  }

  function loadPoints() {
    try {
      var n = parseInt(localStorage.getItem(LS_POINTS) || "0", 10);
      return isNaN(n) ? 0 : n;
    } catch (e) {
      return 0;
    }
  }

  function savePoints(n) {
    try {
      localStorage.setItem(LS_POINTS, String(n));
    } catch (e) {}
  }

  function loadStreak() {
    try {
      var n = parseInt(localStorage.getItem(LS_STREAK) || "0", 10);
      return isNaN(n) || n < 0 ? 0 : n;
    } catch (e) {
      return 0;
    }
  }

  function saveStreak(n) {
    try {
      localStorage.setItem(LS_STREAK, String(n));
    } catch (e) {}
  }

  function clearQuizHistory() {
    var msg =
      "Clear all quiz scores, trophies progress, streak, and per-word bars? Saved words and study settings stay.";
    if (!window.confirm(msg)) {
      return;
    }
    try {
      localStorage.removeItem(LS_WORD_STATS);
      localStorage.removeItem(LS_WORD_QUIZ_DETAIL);
      localStorage.removeItem(LS_POINTS);
      localStorage.removeItem(LS_STREAK);
    } catch (e) {}
    totalPoints = 0;
    quizStreak = 0;
    updateScoreUi();
    refreshReviewPanel();
    abortActiveSet();
    if (current) applyCardMetaForItem(current);
    setFeedback("Quiz history cleared.", "muted");
  }

  var QUIZ_FOCUS_DELAY_MS = 1150;
  /** How long to show “+points” / celebration before auto-advancing (so it isn’t a sub-second flash). */
  var QUIZ_SUCCESS_HOLD_GAP_MS = 2200;
  var QUIZ_SUCCESS_HOLD_TYPEALL_MS = 3000;
  var QUIZ_SUCCESS_HOLD_PEEK_MS = 1800;
  /** Pending auto-speak timeout — must clear so we never speak twice (e.g. Next before delay fires). */
  var pronounceAfterCardTimer = null;
  var quizAdvanceTimer = null;

  function clearQuizAdvanceTimer() {
    if (quizAdvanceTimer !== null) {
      window.clearTimeout(quizAdvanceTimer);
      quizAdvanceTimer = null;
    }
  }

  function pronounceAfterCard(fromUserTap) {
    if (!current) return;
    if (pronounceAfterCardTimer !== null) {
      window.clearTimeout(pronounceAfterCardTimer);
      pronounceAfterCardTimer = null;
    }
    if (studyMode === "quiz" || studyMode === "typeall") {
      if (fromUserTap) speakWord(current.word, true);
      else {
        pronounceAfterCardTimer = window.setTimeout(function () {
          pronounceAfterCardTimer = null;
          if (current && isTypingMode()) speakWord(current.word, false);
        }, 140);
      }
      return;
    }
    if (fromUserTap) speakWord(current.word, true);
    else {
      pronounceAfterCardTimer = window.setTimeout(function () {
        pronounceAfterCardTimer = null;
        if (current) speakWord(current.word, false);
      }, 100);
    }
  }

  var allWords = [];
  var pool = [];
  var current = null;
  var maxDifficultyCap = Infinity;
  var deckScope = "all";
  var wordTypeScope = "all";
  var cardCount = 0;
  var studyMode = "see";
  /** Quiz only: tap three letter buttons (optional 1/2/3 keys) instead of typing the gap. */
  var quizGapChoiceMode = false;
  var missingIndex = 0;
  var cheatUsed = false;
  var quizAttemptCountedForCard = false;
  /** Gap quiz: last wrong letter we already counted (avoids double count on Enter). Cleared when box emptied. */
  var quizGapLastWrongCharRecorded = null;
  var totalPoints = 0;
  var quizStreak = 0;
  var advancingQuiz = false;

  var setModeActive = false;
  var setQueue = [];
  var setQueueIndex = 0;
  var setRows = [];
  var setHadWrongOnCard = false;

  var elSetBar = document.getElementById("set-bar");
  var elBtnStartSet = document.getElementById("btn-start-set");
  var elSetProgress = document.getElementById("set-bar-progress");
  var elSetModal = document.getElementById("set-modal");
  var elSetModalSummary = document.getElementById("set-modal-summary");
  var elSetModalList = document.getElementById("set-modal-list");
  var elSetModalClose = document.getElementById("set-modal-close");
  var elSetModalBackdrop = document.getElementById("set-modal-backdrop");
  var elKbdShortcutsModal = document.getElementById("kbd-shortcuts-modal");
  var elKbdShortcutsBackdrop = document.getElementById(
    "kbd-shortcuts-modal-backdrop"
  );
  var elKbdShortcutsClose = document.getElementById("kbd-shortcuts-close");
  var elKbdShortcutsList = document.getElementById("kbd-shortcuts-list");
  var elKbdShortcutsFootnote = document.getElementById(
    "kbd-shortcuts-footnote"
  );
  var elWordPeekModal = document.getElementById("word-peek-modal");
  var elWordPeekBackdrop = document.getElementById("word-peek-modal-backdrop");
  var elWordPeekClose = document.getElementById("word-peek-close");
  var elWordPeekFavorite = document.getElementById("word-peek-favorite");
  var elWordPeekSpeak = document.getElementById("word-peek-speak");
  var elWordPeekEmoji = document.getElementById("word-peek-emoji");
  var elWordPeekWord = document.getElementById("word-peek-word");
  var elWordPeekMetaLine = document.getElementById("word-peek-meta-line");
  var elWordPeekMetaRate = document.getElementById("word-peek-meta-rate");
  var wordPeekItem = null;

  function kbdShortcutsAppendPlus(keysEl) {
    var plus = document.createElement("span");
    plus.className = "kbd-shortcuts-modal__plus";
    plus.textContent = "+";
    keysEl.appendChild(plus);
  }

  function kbdShortcutsAppendKeyRow(keysEl, parts) {
    var i;
    for (i = 0; i < parts.length; i++) {
      if (i > 0) kbdShortcutsAppendPlus(keysEl);
      var k = document.createElement("kbd");
      k.className = "kbd-chip";
      k.textContent = parts[i];
      keysEl.appendChild(k);
    }
  }

  function appendKbdShortcutsRow(listEl, keyParts, desc) {
    var li = document.createElement("li");
    li.className = "kbd-shortcuts-modal__item";
    var keysWrap = document.createElement("div");
    keysWrap.className = "kbd-shortcuts-modal__keys";
    kbdShortcutsAppendKeyRow(keysWrap, keyParts);
    var p = document.createElement("p");
    p.className = "kbd-shortcuts-modal__desc";
    p.textContent = desc;
    li.appendChild(keysWrap);
    li.appendChild(p);
    listEl.appendChild(li);
  }

  function fillKbdShortcutsModalOnce() {
    if (!elKbdShortcutsList || elKbdShortcutsList.dataset.filled) return;
    elKbdShortcutsList.dataset.filled = "1";
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Shift", "?"],
      "Show or hide this list (Shift + the key that types “?”)."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Esc"],
      "Close this list when it is open."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Enter"],
      "See mode: next card. Quiz / Type word: submit (or move focus to the letter box if it is empty)."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["1", "2", "3"],
      "Quiz with Pick letter on: choose the matching big button."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["A–Z"],
      "Same Pick-letter mode: type the missing letter when focus is not in a different text field."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Ctrl", "S"],
      "Save or unsave this word (star)."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Ctrl", "T"],
      "Hear the word (speaker). If a new browser tab opens, use the speaker button."
    );
    appendKbdShortcutsRow(
      elKbdShortcutsList,
      ["Ctrl", "P"],
      "Peek, when the Peek button shows. If the print dialog opens, use Peek on screen."
    );
    if (elKbdShortcutsFootnote) {
      elKbdShortcutsFootnote.textContent =
        "These use the Control (Ctrl) key — same key on Windows, Mac, and Linux.";
    }
  }

  function isKbdShortcutsModalOpen() {
    return elKbdShortcutsModal && !elKbdShortcutsModal.hidden;
  }

  function openKbdShortcutsModal() {
    if (!elKbdShortcutsModal) return;
    closeWordPeekModal();
    elKbdShortcutsModal.hidden = false;
    if (elKbdShortcutsClose) elKbdShortcutsClose.focus();
  }

  function closeKbdShortcutsModal() {
    if (elKbdShortcutsModal) elKbdShortcutsModal.hidden = true;
  }

  function toggleKbdShortcutsModal() {
    if (isKbdShortcutsModalOpen()) closeKbdShortcutsModal();
    else openKbdShortcutsModal();
  }

  function isWordPeekModalOpen() {
    return elWordPeekModal && !elWordPeekModal.hidden;
  }

  function updateWordPeekFavoriteButton() {
    if (!elWordPeekFavorite) return;
    if (!wordPeekItem) {
      elWordPeekFavorite.disabled = true;
      return;
    }
    elWordPeekFavorite.disabled = false;
    var onF = !!favoriteSet[wordEntryKey(wordPeekItem)];
    elWordPeekFavorite.classList.toggle("flashcard__tool--on", onF);
    elWordPeekFavorite.textContent = onF ? "\u2B50" : "\u2606";
    elWordPeekFavorite.setAttribute("aria-pressed", onF ? "true" : "false");
    elWordPeekFavorite.setAttribute(
      "aria-label",
      onF ? "Remove from saved words" : "Save word"
    );
  }

  function closeWordPeekModal() {
    wordPeekItem = null;
    if (elWordPeekModal) elWordPeekModal.hidden = true;
    if (elWordPeekFavorite) elWordPeekFavorite.disabled = true;
  }

  function openWordPeekModal(item) {
    if (!item || !elWordPeekModal) return;
    closeKbdShortcutsModal();
    wordPeekItem = item;
    if (elWordPeekEmoji) elWordPeekEmoji.textContent = item.emoji || "";
    if (elWordPeekWord) elWordPeekWord.textContent = item.word || "";
    if (elWordPeekMetaLine)
      elWordPeekMetaLine.textContent = describeWordPeekMetaLine(item);
    if (elWordPeekMetaRate)
      setWordRatePillForWord(
        elWordPeekMetaRate,
        item.word,
        "word-rate-pill word-rate-pill--peek"
      );
    elWordPeekModal.hidden = false;
    updateWordPeekFavoriteButton();
    if (elWordPeekSpeak) elWordPeekSpeak.disabled = false;
    if (elWordPeekClose) elWordPeekClose.focus();
  }

  function abortActiveSet() {
    if (!setModeActive) {
      updateSetBar();
      return;
    }
    setModeActive = false;
    setQueue = [];
    setQueueIndex = 0;
    setRows = [];
    setHadWrongOnCard = false;
    updateSetBar();
  }

  function updateSetBar() {
    if (!elSetBar) return;
    if (!isTypingMode()) {
      elSetBar.hidden = true;
      return;
    }
    elSetBar.hidden = false;
    if (elBtnStartSet) {
      elBtnStartSet.hidden = setModeActive;
      elBtnStartSet.disabled = pool.length < 1;
    }
    if (elSetProgress) {
      if (!setModeActive) {
        elSetProgress.textContent =
          "10-word set: scores still count · tap Start when you’re ready.";
      } else {
        elSetProgress.textContent =
          "Card " +
          (setQueueIndex + 1) +
          " / " +
          SET_LEN +
          " · Next skips this card.";
      }
    }
  }

  function openSetSummaryModal(rows) {
    if (!elSetModal || !elSetModalSummary || !elSetModalList) return;
    var correct = 0;
    var firstTry = 0;
    var points = 0;
    var skipped = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind === "correct") {
        correct++;
        if (r.firstTry) firstTry++;
        points += r.points | 0;
      } else if (r.kind === "skip") skipped++;
    }
    elSetModalSummary.textContent =
      "First try (no peek, no miss): " +
      firstTry +
      " / " +
      SET_LEN +
      " · Solved: " +
      correct +
      " · Points this set: " +
      points +
      (skipped ? " · Skipped: " + skipped : "") +
      ".";
    elSetModalList.textContent = "";
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var li = document.createElement("li");
      li.className = "set-modal__item";
      var label = document.createElement("span");
      label.className = "set-modal__word";
      label.textContent = row.word || "—";
      var tag = document.createElement("span");
      tag.className = "set-modal__tag";
      if (row.kind === "skip") {
        tag.textContent = "skipped";
        tag.classList.add("set-modal__tag--skip");
      } else if (row.peek) {
        tag.textContent = "peek";
        tag.classList.add("set-modal__tag--peek");
      } else if (row.firstTry) {
        tag.textContent = "first try!";
        tag.classList.add("set-modal__tag--great");
      } else {
        tag.textContent = "got it";
        tag.classList.add("set-modal__tag--ok");
      }
      li.appendChild(label);
      li.appendChild(tag);
      elSetModalList.appendChild(li);
    }
    closeKbdShortcutsModal();
    closeWordPeekModal();
    elSetModal.hidden = false;
  }

  function closeSetSummaryModal() {
    if (elSetModal) elSetModal.hidden = true;
  }

  function startSetOfTen() {
    if (!isTypingMode()) return;
    rebuildPool();
    if (pool.length < 1) return;
    setQueue = buildSetQueue(pool);
    if (!setQueue.length) return;
    setQueueIndex = 0;
    setRows = [];
    setModeActive = true;
    setHadWrongOnCard = false;
    advancingQuiz = false;
    current = setQueue[0];
    prepareRound();
    renderCard(true);
    updateSetBar();
  }

  function scheduleQuizAdvanceAfterCorrect(isTypeAll) {
    var delay = cheatUsed
      ? QUIZ_SUCCESS_HOLD_PEEK_MS
      : isTypeAll
        ? QUIZ_SUCCESS_HOLD_TYPEALL_MS
        : QUIZ_SUCCESS_HOLD_GAP_MS;
    clearQuizAdvanceTimer();
    advancingQuiz = true;
    hideSpellChoicesUi();
    quizAdvanceTimer = window.setTimeout(function () {
      quizAdvanceTimer = null;
      if (!setModeActive) {
        advanceToNewCard(true);
        return;
      }
      var pts = 0;
      if (!cheatUsed) {
        pts = isTypeAll
          ? quizPointsForItem(current) * 2
          : quizPointsForItem(current);
      }
      advanceToNewCard(true, {
        kind: "correct",
        word: current.word,
        firstTry: !setHadWrongOnCard && !cheatUsed,
        points: pts,
        peek: cheatUsed,
      });
    }, delay);
  }

  var elCard = document.getElementById("card");
  var elEmoji = document.getElementById("card-emoji");
  var elEnglish = document.getElementById("card-english");
  var elCardWordRow = document.getElementById("card-word-row");
  var elQuizWordRow = document.getElementById("quiz-word-row");
  var elMeta = document.getElementById("card-meta");
  var elMetaLine = document.getElementById("card-meta-line");
  var elMetaRate = document.getElementById("card-meta-rate");
  var elDeckHint = document.getElementById("deck-hint");
  var elPointsVal = document.getElementById("points-val");
  var elStreakVal = document.getElementById("streak-val");
  var elTrophyVal = document.getElementById("trophy-val");
  var elTrophyToNext = document.getElementById("trophy-to-next");
  var elTrophyBar = document.getElementById("trophy-bar");
  var elTrophyBarFill = document.getElementById("trophy-bar-fill");
  var elDifficulty = document.getElementById("difficulty-filter");
  var elWordType = document.getElementById("word-type-filter");
  var elDeckScope = document.getElementById("deck-scope");
  var elStudyMode = document.getElementById("study-mode");
  var elQuizGapChoiceField = document.getElementById("quiz-gap-choice-field");
  var elQuizGapChoiceToggle = document.getElementById("quiz-gap-choice-mode");
  var elFavorite = document.getElementById("btn-favorite");
  var elSpeak = document.getElementById("btn-speak");
  var elNext = document.getElementById("btn-next");
  var elCheat = document.getElementById("btn-cheat");
  var elLoadError = document.getElementById("load-error");

  function applyCardMetaForItem(item) {
    if (!elMetaLine || !elMetaRate) return;
    if (!item) {
      elMetaLine.textContent = "";
      elMetaRate.textContent = "";
      elMetaRate.className =
        "word-rate-pill word-rate-pill--by-word word-rate--none";
      elMetaRate.removeAttribute("aria-label");
      return;
    }
    elMetaLine.textContent = describeCardMetaLine(item);
    setWordRatePillForWord(
      elMetaRate,
      item.word,
      "word-rate-pill word-rate-pill--by-word"
    );
  }

  function maybeRefreshCardQuizPill(w) {
    if (!current || current.word !== w) return;
    applyCardMetaForItem(current);
  }

  function appendCardMetaRateBesideWord() {
    if (!elMetaRate) return;
    if (!current) return;
    if (studyMode === "see" && elCardWordRow) {
      elCardWordRow.appendChild(elMetaRate);
    } else if (
      (studyMode === "quiz" || studyMode === "typeall") &&
      elQuizWordRow
    ) {
      elQuizWordRow.appendChild(elMetaRate);
    }
  }

  var elSpellZone = document.getElementById("spell-zone");
  var elSpellInline = document.getElementById("spell-inline");
  var elSpellInput = document.getElementById("spell-input");
  var elSpellChoiceWrap = document.getElementById("spell-choice-wrap");
  var elSpellChoiceHint = document.getElementById("spell-choice-hint");
  var elSpellChoiceRow = document.getElementById("spell-choice-row");
  var elFeedback = document.getElementById("feedback");
  var elChineseAside = document.getElementById("chinese-aside");

  function ensureSpellChoiceWrapLast() {
    if (elSpellZone && elSpellChoiceWrap)
      elSpellZone.appendChild(elSpellChoiceWrap);
  }

  function syncQuizGapInputForChoiceMode() {
    if (!elSpellInput) return;
    var choicesOn =
      elSpellChoiceWrap &&
      !elSpellChoiceWrap.hidden &&
      quizGapChoiceMode &&
      studyMode === "quiz" &&
      current &&
      !cheatUsed &&
      !advancingQuiz;
    if (choicesOn) {
      elSpellInput.readOnly = false;
      elSpellInput.setAttribute("inputmode", "text");
      elSpellInput.classList.add("spell-input-inline--gap-choose");
      elSpellInput.tabIndex = 0;
    } else {
      elSpellInput.readOnly = false;
      elSpellInput.setAttribute("inputmode", "text");
      elSpellInput.classList.remove("spell-input-inline--gap-choose");
      if (studyMode === "quiz") elSpellInput.tabIndex = 0;
    }
  }

  function hideSpellChoicesUi() {
    document.documentElement.classList.remove("use-spell-choices");
    if (elSpellChoiceWrap) elSpellChoiceWrap.hidden = true;
    if (elSpellChoiceRow) elSpellChoiceRow.replaceChildren();
    if (elSpellChoiceHint) elSpellChoiceHint.textContent = "";
    syncQuizGapInputForChoiceMode();
  }

  function syncQuizGapSwitchAria() {
    if (!elQuizGapChoiceToggle) return;
    elQuizGapChoiceToggle.setAttribute(
      "aria-checked",
      elQuizGapChoiceToggle.checked ? "true" : "false"
    );
  }

  function updateQuizGapChoiceField() {
    if (elQuizGapChoiceField)
      elQuizGapChoiceField.hidden = studyMode !== "quiz";
    if (elQuizGapChoiceToggle)
      elQuizGapChoiceToggle.checked = quizGapChoiceMode;
    syncQuizGapSwitchAria();
  }

  function onQuizGapChoiceModeChange() {
    if (!elQuizGapChoiceToggle) return;
    quizGapChoiceMode = !!elQuizGapChoiceToggle.checked;
    syncQuizGapSwitchAria();
    persistSelections();
    if (studyMode === "quiz" && current) {
      renderSpellChoices();
      applyCardMetaForItem(current);
      appendCardMetaRateBesideWord();
      if (quizGapChoiceMode && elSpellChoiceRow && elSpellChoiceRow.firstElementChild) {
        window.setTimeout(function () {
          elSpellChoiceRow.firstElementChild.focus();
        }, 0);
      } else if (elSpellInput) {
        window.setTimeout(function () {
          elSpellInput.tabIndex = 0;
          elSpellInput.focus();
        }, 0);
      }
    }
  }

  /** Five Latin vowels; y is treated as a consonant for decoys (see confusion map). */
  var VOWELS_FOR_DECOYS = "aeiou";

  function isVowelForDecoy(c) {
    return VOWELS_FOR_DECOYS.indexOf(c) !== -1;
  }

  /**
   * Letters early readers often confuse (shape or sound). Only single a–z.
   * @type {Record<string, string[]>}
   */
  var CONSONANT_CONFUSION = {
    b: ["d", "p"],
    c: ["k", "s"],
    d: ["b", "p"],
    f: ["v", "t"],
    g: ["j", "k"],
    h: ["n", "m"],
    j: ["g", "y"],
    k: ["c", "g"],
    l: ["r", "t"],
    m: ["n", "w"],
    n: ["m", "h"],
    p: ["b", "d"],
    q: ["p", "g", "d"],
    r: ["l", "w"],
    s: ["z", "c"],
    t: ["d", "f"],
    v: ["f", "b"],
    w: ["m", "v", "y"],
    x: ["s", "z"],
    y: ["j", "w"],
    z: ["s", "x"],
  };

  function pickQuizWrongLetters(correct) {
    var alpha = "abcdefghijklmnopqrstuvwxyz";
    var wrong = [];
    var i;
    var ch;
    if (isVowelForDecoy(correct)) {
      var vowPool = [];
      for (i = 0; i < VOWELS_FOR_DECOYS.length; i++) {
        ch = VOWELS_FOR_DECOYS[i];
        if (ch !== correct) vowPool.push(ch);
      }
      shuffleInPlace(vowPool);
      wrong.push(vowPool[0], vowPool[1]);
      return wrong;
    }
    var confList = CONSONANT_CONFUSION[correct] || [];
    var confPick = [];
    for (i = 0; i < confList.length; i++) {
      ch = confList[i];
      if (ch === correct) continue;
      if (isVowelForDecoy(ch)) continue;
      if (confPick.indexOf(ch) === -1) confPick.push(ch);
    }
    shuffleInPlace(confPick);
    for (i = 0; i < confPick.length && wrong.length < 2; i++) {
      wrong.push(confPick[i]);
    }
    var consPool = [];
    for (i = 0; i < alpha.length; i++) {
      ch = alpha[i];
      if (ch === correct || isVowelForDecoy(ch)) continue;
      if (wrong.indexOf(ch) !== -1) continue;
      consPool.push(ch);
    }
    shuffleInPlace(consPool);
    for (i = 0; i < consPool.length && wrong.length < 2; i++) {
      wrong.push(consPool[i]);
    }
    var guard = 0;
    while (wrong.length < 2 && guard < 30) {
      guard++;
      ch = alpha[guard % 26];
      if (ch === correct || isVowelForDecoy(ch) || wrong.indexOf(ch) !== -1)
        continue;
      wrong.push(ch);
    }
    return wrong;
  }

  function renderSpellChoices() {
    ensureSpellChoiceWrapLast();
    if (
      !elSpellChoiceWrap ||
      !elSpellChoiceRow ||
      !current ||
      advancingQuiz ||
      cheatUsed ||
      studyMode !== "quiz" ||
      !quizGapChoiceMode
    ) {
      hideSpellChoicesUi();
      return;
    }
    if (elSpellChoiceHint)
      elSpellChoiceHint.textContent =
        "Tap a choice, press 1–3, or type the missing letter on the keyboard";
    var need = current.word.charAt(missingIndex);
    var wrong = pickQuizWrongLetters(need);
    var opts = shuffleInPlace([need, wrong[0], wrong[1]]);
    elSpellChoiceRow.replaceChildren();
    var qi;
    for (qi = 0; qi < opts.length; qi++) {
      (function (letter, keyNum) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "spell-choice-btn";
        var numEl = document.createElement("span");
        numEl.className = "spell-choice-btn__num";
        numEl.textContent = String(keyNum);
        var colonEl = document.createElement("span");
        colonEl.className = "spell-choice-btn__colon";
        colonEl.textContent = ":";
        var letterEl = document.createElement("span");
        letterEl.className = "spell-choice-btn__letter";
        letterEl.textContent = letter;
        btn.appendChild(numEl);
        btn.appendChild(colonEl);
        btn.appendChild(letterEl);
        btn.setAttribute(
          "aria-label",
          "Choice " + keyNum + ": letter " + letter + ". Press " + keyNum + " on the keyboard or tap."
        );
        btn.addEventListener("click", function (ev) {
          if (ev) ev.preventDefault();
          if (!elSpellInput || advancingQuiz || cheatUsed) return;
          elSpellInput.value = letter;
          onSpellInputLive();
        });
        elSpellChoiceRow.appendChild(btn);
      })(opts[qi], qi + 1);
    }
    elSpellChoiceWrap.hidden = false;
    document.documentElement.classList.add("use-spell-choices");
    syncQuizGapInputForChoiceMode();
  }

  function trophyCount() {
    return Math.floor(totalPoints / TROPHY_EVERY);
  }

  function updateScoreUi() {
    if (elPointsVal) elPointsVal.textContent = String(totalPoints);
    if (elStreakVal) elStreakVal.textContent = String(quizStreak);
    var trophies = trophyCount();
    var intoSegment = totalPoints % TROPHY_EVERY;
    var pctIntoNext = (intoSegment / TROPHY_EVERY) * 100;
    if (elTrophyVal) elTrophyVal.textContent = String(trophies);
    if (elTrophyToNext) {
      elTrophyToNext.textContent =
        intoSegment + " / " + TROPHY_EVERY + " pts to next trophy";
    }
    if (elTrophyBarFill) {
      elTrophyBarFill.style.width = pctIntoNext + "%";
    }
    if (elTrophyBar) {
      elTrophyBar.setAttribute("aria-valuenow", String(intoSegment));
      elTrophyBar.setAttribute("aria-valuemax", String(TROPHY_EVERY));
    }
  }

  function setFeedback(text, kind) {
    if (!elFeedback) return;
    elFeedback.replaceChildren();
    elFeedback.textContent = text || "";
    elFeedback.classList.remove(
      "feedback--ok",
      "feedback--bad",
      "feedback--trophy",
      "feedback--muted",
      "flashcard__feedback--has-score",
      "flashcard__feedback--double-celebrate"
    );
    if (kind === "ok") elFeedback.classList.add("feedback--ok");
    if (kind === "bad") elFeedback.classList.add("feedback--bad");
    if (kind === "trophy") elFeedback.classList.add("feedback--trophy");
    if (kind === "muted") elFeedback.classList.add("feedback--muted");
  }

  /** Big highlighted +N points (retro score pop). */
  function setPointsGain(points) {
    if (!elFeedback) return;
    elFeedback.replaceChildren();
    elFeedback.classList.remove(
      "feedback--ok",
      "feedback--bad",
      "feedback--trophy",
      "feedback--muted",
      "flashcard__feedback--double-celebrate"
    );
    elFeedback.classList.add("feedback--ok", "flashcard__feedback--has-score");
    var span = document.createElement("span");
    span.className = "feedback__score-pop";
    span.textContent = "+" + points + " points";
    elFeedback.appendChild(span);
  }

  /**
   * Type-all mode: same base as quiz (original points) × 2. Loud celebration.
   * Pass basePoints from quizPointsForItem (awards base*2 to score).
   */
  function setPointsGainDouble(basePoints) {
    if (!elFeedback) return;
    var base =
      typeof basePoints === "number" && !isNaN(basePoints) && basePoints > 0
        ? Math.round(basePoints)
        : EASY_DIFFICULTY_MAX;
    var total = base * 2;
    elFeedback.replaceChildren();
    elFeedback.classList.remove(
      "feedback--bad",
      "feedback--trophy",
      "feedback--muted"
    );
    elFeedback.classList.add(
      "feedback--ok",
      "flashcard__feedback--has-score",
      "flashcard__feedback--double-celebrate"
    );
    var wrap = document.createElement("div");
    wrap.className = "feedback__double-celebrate";
    var mega = document.createElement("p");
    mega.className = "feedback__double-celebrate__mega";
    mega.textContent = "+" + total + " POINTS!";
    var banner = document.createElement("p");
    banner.className = "feedback__double-celebrate__banner";
    banner.textContent = "ORIGINAL POINTS × 2!";
    var math = document.createElement("p");
    math.className = "feedback__double-celebrate__math";
    math.textContent =
      "Original " + base + " points × 2 = " + total + " points!";
    var cheer = document.createElement("p");
    cheer.className = "feedback__double-celebrate__cheer";
    cheer.textContent = "You spelled every letter — awesome!";
    wrap.appendChild(mega);
    wrap.appendChild(banner);
    wrap.appendChild(math);
    wrap.appendChild(cheer);
    elFeedback.appendChild(wrap);
  }

  function clearSpellInputVisual() {
    if (!elSpellInput) return;
    elSpellInput.classList.remove(
      "spell-input-inline--ok",
      "spell-input-inline--bad"
    );
  }

  /** Big green “you did it” UI on the card. */
  function showAnswerCelebrate() {
    if (elCard) elCard.classList.add("flashcard--answer-ok");
  }

  function clearAnswerCelebrate() {
    if (elCard)
      elCard.classList.remove(
        "flashcard--answer-ok",
        "flashcard--pac-chomp",
        "flashcard--ghost-bump"
      );
  }

  function onSpellInputLiveTypeAll() {
    if (!current || advancingQuiz) return;
    var word = current.word;
    var n = word.length;
    var v = String(elSpellInput.value || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    elSpellInput.value = v;
    clearSpellInputVisual();
    if (v !== word) {
      if (elCard) elCard.classList.remove("flashcard--answer-ok");
    }
    if (cheatUsed) {
      elSpellInput.classList.add("spell-input-inline--ok");
      if (v === word && v.length > 0) {
        if (elCard) elCard.classList.add("flashcard--answer-ok");
      }
      setFeedback("Peek showed the word — press Next (no points).", "muted");
      return;
    }
    if (!v) {
      setFeedback("", null);
      return;
    }
    if (v === word) {
      trySubmitTypeAll();
      return;
    }
    if (word.indexOf(v) === 0) {
      setFeedback("", null);
      return;
    }
    if (v.length >= n) {
      elSpellInput.classList.add("spell-input-inline--bad");
      flashCardWrong();
      setFeedback("Not quite — try again or tap Peek.", "bad");
      return;
    }
    flashCardWrong();
    setFeedback("Oops — check your letters. Little letters a–z only.", "bad");
  }

  /** Instant feedback while typing (quiz blank or type-all). */
  function onSpellInputLive() {
    if (!current || advancingQuiz) return;
    if (studyMode === "typeall") {
      onSpellInputLiveTypeAll();
      return;
    }
    if (studyMode !== "quiz") return;
    var v = String(elSpellInput.value || "")
      .toLowerCase()
      .slice(0, 1);
    elSpellInput.value = v;
    clearSpellInputVisual();
    var need = current.word.charAt(missingIndex);

    if (!v) {
      if (elCard) elCard.classList.remove("flashcard--answer-ok");
      quizGapLastWrongCharRecorded = null;
      setFeedback(
        quizGapChoiceMode
          ? "Tap a choice, press 1–3, or type the missing letter."
          : "Type one letter in the box.",
        "muted"
      );
      return;
    }

    if (cheatUsed) {
      elSpellInput.classList.add("spell-input-inline--ok");
      showAnswerCelebrate();
      if (v === need) {
        window.setTimeout(function () {
          trySubmitSpell();
        }, 0);
      } else {
        setFeedback("Press Next (no points after Peek).", "muted");
      }
      return;
    }

    if (v === need) {
      window.setTimeout(function () {
        trySubmitSpell();
      }, 0);
      return;
    }

    if (elCard) elCard.classList.remove("flashcard--answer-ok");
    elSpellInput.classList.add("spell-input-inline--bad");
    if (quizGapLastWrongCharRecorded !== v) {
      if (!quizAttemptCountedForCard) {
        quizAttemptCountedForCard = true;
        bumpQuizzed(current.word);
      }
      bumpWrong(current.word);
      quizGapLastWrongCharRecorded = v;
      refreshReviewPanel();
      flashCardWrong();
    }
    setFeedback("Not that letter—try again.", "bad");
  }

  function announceTrophy(level) {
    setFeedback("New trophy unlocked (x" + level + ")", "trophy");
    speakWord("You earned a trophy! Awesome!", true);
  }

  /** Short arcade SFX (Web Audio). Unlocks after first tap/key like speech. */
  var sfxAudioCtx = null;
  function getSfxContext() {
    try {
      if (!sfxAudioCtx) {
        sfxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sfxAudioCtx.state === "suspended") {
        sfxAudioCtx.resume().catch(function () {});
      }
    } catch (e) {
      return null;
    }
    return sfxAudioCtx;
  }

  function wireSfxUnlockOnce() {
    function wake() {
      getSfxContext();
    }
    document.addEventListener("pointerdown", wake, { once: true, capture: true });
    document.addEventListener("keydown", wake, { once: true, capture: true });
  }

  function playSfxOneBlip(freq, delayMs, durSec, volume) {
    var ctx = getSfxContext();
    if (!ctx) return;
    var t0 = ctx.currentTime + delayMs / 1000;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(volume, t0);
    g.gain.exponentialRampToValueAtTime(0.008, t0 + durSec);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + durSec + 0.02);
  }

  /** Pac “waka” when the word / gap is cleared. */
  function playSfxPacChomp(isPeek) {
    var n = isPeek ? 2 : 4;
    var vol = isPeek ? 0.042 : 0.082;
    var stepMs = isPeek ? 95 : 102;
    var i;
    for (i = 0; i < n; i++) {
      playSfxOneBlip(780 + (i % 3) * 95, i * stepMs, 0.055, vol);
    }
  }

  /** Low buzz when answer is wrong. */
  function playSfxWrong() {
    var ctx = getSfxContext();
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(108, t);
    o.frequency.linearRampToValueAtTime(62, t + 0.17);
    g.gain.setValueAtTime(0.068, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.24);
  }

  function runPacChompVisual() {
    if (!elCard) return;
    elCard.classList.remove("flashcard--pac-chomp");
    elCard.offsetWidth;
    elCard.classList.add("flashcard--pac-chomp");
    window.setTimeout(function () {
      if (elCard) elCard.classList.remove("flashcard--pac-chomp");
    }, 1280);
  }

  function flashCardWrong() {
    playSfxWrong();
    if (!elCard) return;
    elCard.classList.remove("flashcard--ghost-bump");
    elCard.offsetWidth;
    elCard.classList.add("flashcard--ghost-bump");
    flashCardShake();
    window.setTimeout(function () {
      if (elCard) elCard.classList.remove("flashcard--ghost-bump");
    }, 620);
  }

  function awardQuizPoints(delta) {
    var add =
      typeof delta === "number" && !isNaN(delta) && delta > 0
        ? Math.round(delta)
        : EASY_DIFFICULTY_MAX;
    var beforeT = trophyCount();
    totalPoints += add;
    savePoints(totalPoints);
    updateScoreUi();
    var afterT = trophyCount();
    if (afterT > beforeT) announceTrophy(afterT);
  }

  function flashCardShake() {
    if (!elCard) return;
    elCard.classList.remove("flashcard--shake");
    elCard.offsetWidth;
    elCard.classList.add("flashcard--shake");
    window.setTimeout(function () {
      elCard.classList.remove("flashcard--shake");
    }, 480);
  }

  function flashCardOk() {
    if (!elCard) return;
    elCard.classList.remove("flashcard--ok-pulse");
    elCard.offsetWidth;
    elCard.classList.add("flashcard--ok-pulse");
    window.setTimeout(function () {
      elCard.classList.remove("flashcard--ok-pulse");
    }, 480);
  }

  function setCardEnabled(on) {
    if (!elCard) return;
    elCard.classList.toggle("disabled-soft", !on);
    if (elSpeak) {
      elSpeak.disabled = !on;
    }
    if (elNext) elNext.disabled = !on;
    if (elSpellInput) elSpellInput.disabled = !on || !isTypingMode();
    if (elCheat) elCheat.disabled = !on || !isTypingMode();
  }

  function setupTypeAllUi(word) {
    if (!elSpellZone || !elSpellInput) return;
    cheatUsed = false;
    clearSpellInputVisual();
    if (elQuizWordRow && elQuizWordRow.parentNode !== elSpellZone) {
      elSpellZone.insertBefore(elQuizWordRow, elSpellZone.firstChild);
    }
    if (elSpellInline) {
      elSpellInline.hidden = true;
      elSpellInline.textContent = "";
      if (elQuizWordRow) elQuizWordRow.appendChild(elSpellInline);
    }
    elSpellInput.classList.add("spell-input-full");
    var n = word.length;
    elSpellInput.maxLength = n;
    elSpellInput.value = "";
    elSpellInput.setAttribute("aria-label", "Type the whole word");
    if (elQuizWordRow) elQuizWordRow.appendChild(elSpellInput);
    appendCardMetaRateBesideWord();
    ensureSpellChoiceWrapLast();
  }

  function rebuildSpellLine(word, missingIndex) {
    if (!elSpellZone || !elSpellInline || !elSpellInput) return;
    if (elQuizWordRow && elQuizWordRow.parentNode !== elSpellZone) {
      elSpellZone.insertBefore(elQuizWordRow, elSpellZone.firstChild);
    }
    if (elQuizWordRow) elQuizWordRow.appendChild(elSpellInline);
    if (elSpellInline) elSpellInline.hidden = false;
    elSpellInput.classList.remove("spell-input-full");
    elSpellInput.maxLength = 1;
    elSpellInline.textContent = "";
    cheatUsed = false;
    clearSpellInputVisual();
    for (var i = 0; i < word.length; i++) {
      if (i === missingIndex) {
        elSpellInput.value = "";
        elSpellInline.appendChild(elSpellInput);
      } else {
        var sp = document.createElement("span");
        sp.className = "spell-char";
        sp.textContent = word[i];
        elSpellInline.appendChild(sp);
      }
    }
    appendCardMetaRateBesideWord();
    ensureSpellChoiceWrapLast();
  }

  function prepareRound() {
    clearQuizAdvanceTimer();
    advancingQuiz = false;
    cheatUsed = false;
    quizAttemptCountedForCard = false;
    quizGapLastWrongCharRecorded = null;
    setHadWrongOnCard = false;
    if (studyMode === "quiz" && current) {
      missingIndex = randomMissingIndex(current.word);
    }
  }

  function trySubmitTypeAll() {
    if (advancingQuiz) return;
    if (studyMode !== "typeall" || !current) return;
    var word = current.word;
    var typed = String(elSpellInput.value || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    if (typed.length < word.length) {
      setFeedback("", null);
      return;
    }
    if (!quizAttemptCountedForCard) {
      quizAttemptCountedForCard = true;
      bumpQuizzed(current.word);
    }
    if (typed !== word) {
      bumpWrong(current.word);
      refreshReviewPanel();
      flashCardWrong();
      onSpellInputLiveTypeAll();
      elSpellInput.select();
      return;
    }
    quizStreak++;
    saveStreak(quizStreak);
    if (!cheatUsed) {
      bumpWordCorrect(current.word);
      refreshReviewPanel();
      var basePts = quizPointsForItem(current);
      awardQuizPoints(basePts * 2);
      setPointsGainDouble(basePts);
    } else {
      updateScoreUi();
      setFeedback("", null);
    }
    playSfxPacChomp(cheatUsed);
    runPacChompVisual();
    showAnswerCelebrate();
    flashCardOk();
    scheduleQuizAdvanceAfterCorrect(true);
  }

  function updateFavoriteButton() {
    if (!elFavorite) return;
    if (!current) {
      elFavorite.disabled = true;
      elFavorite.classList.remove("flashcard__tool--on");
      elFavorite.textContent = "\u2606";
      elFavorite.setAttribute("aria-pressed", "false");
      elFavorite.setAttribute("aria-label", "Save word");
      return;
    }
    elFavorite.disabled = false;
    var onF = !!favoriteSet[wordEntryKey(current)];
    elFavorite.classList.toggle("flashcard__tool--on", onF);
    elFavorite.textContent = onF ? "\u2B50" : "\u2606";
    elFavorite.setAttribute("aria-pressed", onF ? "true" : "false");
    elFavorite.setAttribute(
      "aria-label",
      onF ? "Remove from saved words" : "Save word"
    );
  }

  function renderCard(fromUserTap) {
    if (!current) {
      applyPoolHint();
      setCardEnabled(false);
      updateFavoriteButton();
      if (elEmoji) elEmoji.textContent = "";
      if (elEnglish) {
        elEnglish.textContent = "";
        elEnglish.hidden = true;
      }
      if (elChineseAside) elChineseAside.textContent = "";
      applyCardMetaForItem(null);
      if (elSpellZone) elSpellZone.hidden = true;
      if (elCardWordRow) elCardWordRow.hidden = true;
      hideSpellChoicesUi();
      if (elCheat) elCheat.hidden = true;
      setFeedback("", null);
      updateSetBar();
      return;
    }

    setCardEnabled(true);
    clearAnswerCelebrate();
    if (elEmoji) elEmoji.textContent = current.emoji || "";
    if (elChineseAside) elChineseAside.textContent = "";

    applyCardMetaForItem(current);

    if (studyMode === "see") {
      if (elEnglish) {
        elEnglish.textContent = current.word;
        elEnglish.hidden = false;
      }
      if (elSpellZone) elSpellZone.hidden = true;
      if (elCheat) elCheat.hidden = true;
      if (elSpellInput) elSpellInput.tabIndex = -1;
      if (elSpeak) {
        elSpeak.hidden = false;
        elSpeak.disabled = false;
      }
      hideSpellChoicesUi();
      setFeedback("", null);
      pronounceAfterCard(!!fromUserTap);
    } else if (studyMode === "typeall") {
      hideSpellChoicesUi();
      if (elEnglish) elEnglish.hidden = true;
      if (elSpellZone) elSpellZone.hidden = false;
      if (elCheat) {
        elCheat.hidden = false;
        elCheat.textContent = "Peek";
        elCheat.setAttribute(
          "aria-label",
          "Peek fills in the whole word and spells it for you"
        );
      }
      if (elSpeak) {
        elSpeak.hidden = false;
        elSpeak.disabled = false;
      }
      setupTypeAllUi(current.word);
      if (elSpellInput) elSpellInput.tabIndex = 0;
      setFeedback("", null);
      pronounceAfterCard(!!fromUserTap);
      window.setTimeout(function () {
        if (studyMode === "typeall" && current && elSpellInput) {
          elSpellInput.focus();
        }
      }, QUIZ_FOCUS_DELAY_MS);
    } else {
      if (elEnglish) elEnglish.hidden = true;
      if (elSpellZone) elSpellZone.hidden = false;
      if (elCheat) {
        elCheat.hidden = false;
        elCheat.textContent = "Peek";
        elCheat.setAttribute(
          "aria-label",
          "Peek shows the letter and spells the word"
        );
      }
      if (elSpeak) {
        elSpeak.hidden = false;
        elSpeak.disabled = false;
      }
      rebuildSpellLine(current.word, missingIndex);
      if (elSpellInput) elSpellInput.tabIndex = 0;
      setFeedback(
        "Listen, then fill the gap (+" +
          quizPointsForItem(current) +
          " points).",
        "muted"
      );
      pronounceAfterCard(!!fromUserTap);
      window.setTimeout(function () {
        if (studyMode !== "quiz" || !current) return;
        if (
          quizGapChoiceMode &&
          elSpellChoiceRow &&
          elSpellChoiceRow.firstElementChild
        )
          elSpellChoiceRow.firstElementChild.focus();
        else if (elSpellInput) elSpellInput.focus();
      }, QUIZ_FOCUS_DELAY_MS);
      renderSpellChoices();
    }
    updateQuizGapChoiceField();
    updateFavoriteButton();
    updateSetBar();
    if (elCardWordRow) {
      elCardWordRow.hidden = studyMode !== "see";
    }
    appendCardMetaRateBesideWord();
  }

  function advanceToNewCard(fromUserTap, setTurnOutcome) {
    clearQuizAdvanceTimer();
    advancingQuiz = false;
    if (setModeActive) {
      var outcome =
        arguments.length >= 2 && setTurnOutcome != null
          ? setTurnOutcome
          : {
              kind: "skip",
              word: current ? current.word : "—",
            };
      setRows.push(outcome);
      setQueueIndex += 1;
      if (setQueueIndex >= SET_LEN) {
        openSetSummaryModal(setRows.slice());
        abortActiveSet();
        if (!pool.length) {
          current = null;
          advancingQuiz = false;
          prepareRound();
          renderCard(!!fromUserTap);
          return;
        }
        current = shufflePickDifferent(pool, null);
        advancingQuiz = false;
        cardCount++;
        prepareRound();
        renderCard(!!fromUserTap);
        return;
      }
      current = setQueue[setQueueIndex];
      advancingQuiz = false;
      cardCount++;
      prepareRound();
      renderCard(!!fromUserTap);
      return;
    }

    if (!pool.length) return;
    advancingQuiz = false;
    cardCount++;
    current = shufflePickDifferent(pool, current);
    prepareRound();
    renderCard(!!fromUserTap);
  }

  function rebuildPool() {
    if (!allWords.length) {
      pool = [];
      return;
    }
    pool =
      maxDifficultyCap === Infinity
        ? allWords.slice()
        : filterByMaxDifficulty(allWords, maxDifficultyCap);
    if (wordTypeScope !== "all") {
      pool = pool.filter(function (w) {
        return w.type === wordTypeScope;
      });
    }
    if (deckScope === "favorites") {
      pool = pool.filter(function (w) {
        return favoriteSet[wordEntryKey(w)];
      });
    }
  }

  function applyPoolHint() {
    if (!elDeckHint) return;
    var tail =
      maxDifficultyCap === Infinity
        ? "All levels"
        : "Up to level " + maxDifficultyCap;
    var scopeNote = deckScope === "favorites" ? " · Saved deck" : "";
    var typeNote = wordTypeScope !== "all" ? " · One word type" : "";
    if (!pool.length) {
      elDeckHint.textContent =
        "No words match. Try All types, All levels, or All words deck.";
      if (deckScope === "favorites") {
        elDeckHint.textContent +=
          " Save stars on words you want, or widen type/level.";
      }
      return;
    }
    elDeckHint.textContent =
      String(pool.length) + " words · " + tail + scopeNote + typeNote;
  }

  function fillDifficultySelect(levels) {
    if (!elDifficulty) return;
    while (elDifficulty.firstChild) elDifficulty.removeChild(elDifficulty.firstChild);
    for (var i = 0; i < levels.length; i++) {
      var n = levels[i];
      var opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = "Up to " + n;
      elDifficulty.appendChild(opt);
    }
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All levels";
    elDifficulty.appendChild(allOpt);
  }

  function fillWordTypeSelect(options) {
    if (!elWordType) return;
    while (elWordType.firstChild) elWordType.removeChild(elWordType.firstChild);
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All types";
    elWordType.appendChild(allOpt);
    var i;
    for (i = 0; i < options.length; i++) {
      var o = options[i];
      var opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      elWordType.appendChild(opt);
    }
  }

  function parseDifficultyValue(raw) {
    if (raw === "all") return Infinity;
    var n = Number(raw);
    return isNaN(n) ? Infinity : n;
  }

  function persistSelections() {
    savePrefs({
      mode: studyMode,
      level: elDifficulty ? elDifficulty.value : "all",
      deck: deckScope,
      wordType: wordTypeScope,
      quizGapChoice: quizGapChoiceMode,
    });
  }

  function onDifficultyChange() {
    if (!elDifficulty) return;
    abortActiveSet();
    maxDifficultyCap = parseDifficultyValue(elDifficulty.value);
    persistSelections();
    cardCount = 1;
    rebuildPool();
    applyPoolHint();
    current = shufflePickDifferent(pool, current);
    prepareRound();
    renderCard(false);
  }

  function onDeckScopeChange() {
    if (!elDeckScope) return;
    abortActiveSet();
    deckScope = elDeckScope.value === "favorites" ? "favorites" : "all";
    persistSelections();
    cardCount = 1;
    rebuildPool();
    applyPoolHint();
    current = shufflePickDifferent(pool, null);
    prepareRound();
    renderCard(false);
  }

  function onWordTypeChange() {
    if (!elWordType) return;
    abortActiveSet();
    wordTypeScope = elWordType.value || "all";
    persistSelections();
    cardCount = 1;
    rebuildPool();
    applyPoolHint();
    current = shufflePickDifferent(pool, null);
    prepareRound();
    renderCard(false);
  }

  function onStudyModeChange() {
    if (!elStudyMode) return;
    abortActiveSet();
    var v = elStudyMode.value;
    if (v === "quiz") studyMode = "quiz";
    else if (v === "typeall") studyMode = "typeall";
    else studyMode = "see";
    persistSelections();
    cardCount = 1;
    prepareRound();
    renderCard(false);
  }

  function toggleFavoriteKey(k) {
    var wasOn = !!favoriteSet[k];
    if (wasOn) delete favoriteSet[k];
    else favoriteSet[k] = true;
    persistFavorites();
    updateFavoriteButton();
    refreshFavoritePanel();
    if (isWordPeekModalOpen()) updateWordPeekFavoriteButton();
    if (deckScope === "favorites") {
      rebuildPool();
      applyPoolHint();
      if (!pool.length) {
        current = null;
      } else if (wasOn && current && wordEntryKey(current) === k) {
        current = shufflePickDifferent(pool, null);
        prepareRound();
      }
      renderCard(true);
    }
    updateSetBar();
  }

  function onFavoriteTap(e) {
    if (e) e.preventDefault();
    if (setModeActive) abortActiveSet();
    if (!current) return;
    toggleFavoriteKey(wordEntryKey(current));
  }

  function onWordPeekFavoriteTap(e) {
    if (e) e.preventDefault();
    if (!wordPeekItem) return;
    if (setModeActive) abortActiveSet();
    toggleFavoriteKey(wordEntryKey(wordPeekItem));
  }

  function onWordPeekSpeak(e) {
    if (e) e.preventDefault();
    if (!wordPeekItem) return;
    speakWord(wordPeekItem.word, true);
  }

  function onHearWord(e) {
    if (e) e.preventDefault();
    if (!current) return;
    speakWord(current.word, true);
  }

  function onNextCard(e) {
    if (e) e.preventDefault();
    if (setModeActive && isTypingMode()) {
      advanceToNewCard(true);
      return;
    }
    if (!pool.length) return;
    advanceToNewCard(true);
  }

  function onCheat(e) {
    if (e) e.preventDefault();
    if (!isTypingMode() || !current) return;
    cheatUsed = true;
    if (studyMode === "quiz") {
      var letter = current.word.charAt(missingIndex);
      elSpellInput.value = letter;
      onSpellInputLive();
      speakWordLetters(current.word, true);
    } else {
      elSpellInput.value = current.word;
      onSpellInputLiveTypeAll();
      speakWordLetters(current.word, true);
    }
    elSpellInput.focus();
    renderSpellChoices();
  }

  function trySubmitSpell() {
    if (advancingQuiz) return;
    if (studyMode !== "quiz" || !current) return;
    var letter = String(elSpellInput.value || "")
      .trim()
      .toLowerCase()
      .charAt(0);
    if (!letter) {
      setFeedback(
        quizGapChoiceMode
          ? "Choose a letter — tap, press 1–3, or type it on the keyboard."
          : "Fill the gap before Next.",
        "muted"
      );
      return;
    }
    if (!quizAttemptCountedForCard) {
      quizAttemptCountedForCard = true;
      bumpQuizzed(current.word);
    }
    if (letter !== current.word.charAt(missingIndex)) {
      if (quizGapLastWrongCharRecorded !== letter) {
        bumpWrong(current.word);
        quizGapLastWrongCharRecorded = letter;
      }
      refreshReviewPanel();
      flashCardWrong();
      onSpellInputLive();
      elSpellInput.select();
      return;
    }
    quizStreak++;
    saveStreak(quizStreak);
    if (!cheatUsed) {
      bumpWordCorrect(current.word);
      refreshReviewPanel();
      var pts = quizPointsForItem(current);
      awardQuizPoints(pts);
      setPointsGain(pts);
    } else {
      updateScoreUi();
      setFeedback("", null);
    }
    playSfxPacChomp(cheatUsed);
    runPacChompVisual();
    showAnswerCelebrate();
    flashCardOk();
    scheduleQuizAdvanceAfterCorrect(false);
  }

  function onSpellKeydown(e) {
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (studyMode === "typeall") trySubmitTypeAll();
    else trySubmitSpell();
  }

  function onGlobalKeydown(e) {
    if (elLoadError && elLoadError.hidden === false) return;
    var tag = (e.target && e.target.tagName) || "";

    var shiftQuestion =
      e.key === "?" ||
      (e.key === "/" && e.shiftKey) ||
      (e.code === "Slash" && e.shiftKey);

    if (shiftQuestion) {
      if (tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      toggleKbdShortcutsModal();
      return;
    }

    if (isKbdShortcutsModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeKbdShortcutsModal();
      }
      return;
    }

    if (isWordPeekModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWordPeekModal();
        return;
      }
      var modPeek =
        e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (modPeek && wordPeekItem) {
        var sk = String(e.key || "").toLowerCase();
        if (sk === "s") {
          if (tag === "TEXTAREA") return;
          e.preventDefault();
          onWordPeekFavoriteTap(null);
          return;
        }
        if (sk === "t") {
          if (tag === "TEXTAREA") return;
          e.preventDefault();
          onWordPeekSpeak(null);
          return;
        }
      }
      return;
    }

    var mod = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (mod) {
      var shortKey = String(e.key || "").toLowerCase();
      if (shortKey === "s" || shortKey === "t" || shortKey === "p") {
        if (tag === "TEXTAREA") return;
        if (shortKey === "s") {
          if (!current) return;
          e.preventDefault();
          onFavoriteTap(null);
          return;
        }
        if (shortKey === "t") {
          if (!current || !elSpeak || elSpeak.disabled) return;
          e.preventDefault();
          onHearWord(null);
          return;
        }
        if (shortKey === "p") {
          if (!current || !elCheat || elCheat.hidden || elCheat.disabled) {
            return;
          }
          e.preventDefault();
          onCheat(null);
          return;
        }
      }
    }

    if (!current) return;

    if (
      studyMode === "quiz" &&
      quizGapChoiceMode &&
      !cheatUsed &&
      !advancingQuiz &&
      elSpellChoiceWrap &&
      !elSpellChoiceWrap.hidden &&
      elSpellChoiceRow &&
      elSpellChoiceRow.children.length >= 3 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      var digit = e.key;
      if (digit === "1" || digit === "2" || digit === "3") {
        if (tag === "SELECT" || tag === "TEXTAREA") return;
        if (tag === "INPUT" && e.target !== elSpellInput) return;
        var idx = digit.charCodeAt(0) - 49;
        var btn = elSpellChoiceRow.children[idx];
        if (btn) {
          e.preventDefault();
          btn.click();
        }
        return;
      }
      var letterKey = e.key;
      if (
        letterKey &&
        letterKey.length === 1 &&
        /[a-zA-Z]/.test(letterKey)
      ) {
        if (tag === "SELECT" || tag === "TEXTAREA") return;
        if (tag === "INPUT") return;
        var lk = letterKey.toLowerCase();
        e.preventDefault();
        elSpellInput.value = lk;
        onSpellInputLive();
        return;
      }
    }

    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tag === "SELECT" || tag === "TEXTAREA") return;
    if (studyMode === "see") {
      if (tag === "INPUT") return;
      e.preventDefault();
      advanceToNewCard(true);
      return;
    }
    if (studyMode === "quiz") {
      if (tag === "INPUT" && e.target === elSpellInput) return;
      var ch = String(elSpellInput.value || "").trim();
      if (!ch) {
        e.preventDefault();
        if (
          quizGapChoiceMode &&
          elSpellChoiceRow &&
          elSpellChoiceRow.firstElementChild
        )
          elSpellChoiceRow.firstElementChild.focus();
        else if (elSpellInput) elSpellInput.focus();
        return;
      }
      e.preventDefault();
      trySubmitSpell();
      return;
    }
    if (studyMode === "typeall") {
      if (tag === "INPUT" && e.target === elSpellInput) return;
      var typed = String(elSpellInput.value || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (typed.length < current.word.length) {
        e.preventDefault();
        elSpellInput.focus();
        return;
      }
      e.preventDefault();
      trySubmitTypeAll();
    }
  }

  function showLoadError(msg) {
    elLoadError.hidden = false;
    elLoadError.textContent = msg;
    if (elCard) elCard.hidden = true;
    elDeckHint.textContent = "";
  }

  function loadWordData() {
    if (
      typeof window.__FLASHCARD_WORDS__ !== "undefined" &&
      Array.isArray(window.__FLASHCARD_WORDS__)
    ) {
      return Promise.resolve(window.__FLASHCARD_WORDS__);
    }
    return fetch(WORDS_URL, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Could not load " + WORDS_URL);
      return res.json();
    });
  }

  function wireWordPeekListHandlersOnce() {
    var favList = document.getElementById("favorites-list");
    if (favList && !favList.dataset.peekBound) {
      favList.dataset.peekBound = "1";
      favList.addEventListener("click", function (e) {
        var li = e.target && e.target.closest(".saved-list__item");
        if (!li || !li.dataset.entryKey) return;
        var item = findWordItemByEntryKey(li.dataset.entryKey);
        if (!item) {
          var w0 = li.dataset.entryKey.split("|")[0];
          if (w0) item = findWordItemByText(w0);
        }
        if (item) openWordPeekModal(item);
      });
      favList.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var li = e.target && e.target.closest(".saved-list__item");
        if (!li || !li.dataset.entryKey) return;
        if (e.key === " ") e.preventDefault();
        var item = findWordItemByEntryKey(li.dataset.entryKey);
        if (!item) {
          var w1 = li.dataset.entryKey.split("|")[0];
          if (w1) item = findWordItemByText(w1);
        }
        if (item) openWordPeekModal(item);
      });
    }
    var revList = document.getElementById("review-list");
    if (revList && !revList.dataset.peekBound) {
      revList.dataset.peekBound = "1";
      revList.addEventListener("click", function (e) {
        var li = e.target && e.target.closest(".progress-grid__row");
        if (!li || li.dataset.word == null || li.dataset.word === "") return;
        openWordPeekModal(findWordItemByText(li.dataset.word));
      });
      revList.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var li = e.target && e.target.closest(".progress-grid__row");
        if (!li || li.dataset.word == null || li.dataset.word === "") return;
        if (e.key === " ") e.preventDefault();
        openWordPeekModal(findWordItemByText(li.dataset.word));
      });
    }
  }

  function bind() {
    initSpeechSynthesis();
    wireSpeechUserActivationOnce();
    wireSfxUnlockOnce();

    fillKbdShortcutsModalOnce();
    if (elKbdShortcutsClose) {
      elKbdShortcutsClose.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        closeKbdShortcutsModal();
      });
    }
    if (elKbdShortcutsBackdrop) {
      elKbdShortcutsBackdrop.addEventListener("click", closeKbdShortcutsModal);
    }

    if (elWordPeekClose) {
      elWordPeekClose.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        closeWordPeekModal();
      });
    }
    if (elWordPeekBackdrop) {
      elWordPeekBackdrop.addEventListener("click", closeWordPeekModal);
    }
    if (elWordPeekFavorite) {
      elWordPeekFavorite.addEventListener("click", onWordPeekFavoriteTap);
    }
    if (elWordPeekSpeak) {
      elWordPeekSpeak.addEventListener("click", onWordPeekSpeak);
    }
    wireWordPeekListHandlersOnce();

    if (elDifficulty) {
      elDifficulty.addEventListener("change", onDifficultyChange);
    }
    if (elDeckScope) {
      elDeckScope.addEventListener("change", onDeckScopeChange);
    }
    if (elWordType) {
      elWordType.addEventListener("change", onWordTypeChange);
    }
    if (elStudyMode) {
      elStudyMode.addEventListener("change", onStudyModeChange);
    }
    if (elQuizGapChoiceToggle) {
      elQuizGapChoiceToggle.addEventListener("change", onQuizGapChoiceModeChange);
    }
    if (elFavorite) elFavorite.addEventListener("click", onFavoriteTap);
    var btnClearHistory = document.getElementById("btn-clear-history");
    if (btnClearHistory) {
      btnClearHistory.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        clearQuizHistory();
      });
    }
    if (elSpeak) elSpeak.addEventListener("click", onHearWord);
    if (elNext) elNext.addEventListener("click", onNextCard);
    if (elBtnStartSet) {
      elBtnStartSet.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        startSetOfTen();
      });
    }
    if (elSetModalClose) {
      elSetModalClose.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        closeSetSummaryModal();
      });
    }
    if (elSetModalBackdrop) {
      elSetModalBackdrop.addEventListener("click", closeSetSummaryModal);
    }
    if (elCheat) elCheat.addEventListener("click", onCheat);
    if (elSpellInput) {
      elSpellInput.addEventListener("keydown", onSpellKeydown);
      elSpellInput.addEventListener("input", function () {
        if (studyMode === "typeall") {
          var va = String(elSpellInput.value || "")
            .toLowerCase()
            .replace(/[^a-z]/g, "");
          elSpellInput.value = va;
          onSpellInputLive();
          return;
        }
        var vIn = String(elSpellInput.value || "").toLowerCase();
        elSpellInput.value = vIn.slice(0, 1);
        onSpellInputLive();
      });
      elSpellInput.addEventListener("keyup", function () {
        if (studyMode !== "quiz" || cheatUsed || advancingQuiz || !current) return;
        var vk = String(elSpellInput.value || "")
          .toLowerCase()
          .slice(0, 1);
        if (!vk || vk !== current.word.charAt(missingIndex)) return;
        window.setTimeout(function () {
          trySubmitSpell();
        }, 0);
      });
    }
    document.addEventListener("keydown", onGlobalKeydown);

    var btnReview = document.getElementById("btn-review-toggle");
    var bodyReview = document.getElementById("review-body");
    if (btnReview && bodyReview) {
      btnReview.addEventListener("click", function () {
        var open = bodyReview.hidden;
        bodyReview.hidden = !open;
        btnReview.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) refreshReviewPanel();
      });
    }

    var btnFavPanel = document.getElementById("btn-favorites-toggle");
    var bodyFavPanel = document.getElementById("favorites-body");
    if (btnFavPanel && bodyFavPanel) {
      btnFavPanel.addEventListener("click", function () {
        var open = bodyFavPanel.hidden;
        bodyFavPanel.hidden = !open;
        btnFavPanel.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) refreshFavoritePanel();
      });
    }
  }

  function init() {
    loadFavoritesIntoMemory();
    bind();
    totalPoints = loadPoints();
    quizStreak = loadStreak();
    updateScoreUi();

    loadWordData()
      .then(function (data) {
        allWords = dedupeWordList(normalizeWordList(data));
        if (!allWords.length) {
          showLoadError("no words in list.");
          return;
        }
        migrateQuizDetailFromLegacy();
        var levels = uniqueSortedDifficulties(allWords);
        fillDifficultySelect(levels);
        var typeOpts = wordTypeOptionsFromItems(allWords);
        fillWordTypeSelect(typeOpts);

        var prefs = loadPrefs();
        if (prefs && prefs.level) {
          if (prefs.level === "all") {
            maxDifficultyCap = Infinity;
            elDifficulty.value = "all";
          } else if (levels.indexOf(Number(prefs.level)) !== -1) {
            maxDifficultyCap = Number(prefs.level);
            elDifficulty.value = prefs.level;
          } else {
            maxDifficultyCap = Infinity;
            elDifficulty.value = "all";
          }
        } else {
          maxDifficultyCap = Infinity;
          elDifficulty.value = "all";
        }

        if (prefs && prefs.mode === "quiz") {
          studyMode = "quiz";
          elStudyMode.value = "quiz";
        } else if (prefs && prefs.mode === "typeall") {
          studyMode = "typeall";
          elStudyMode.value = "typeall";
        } else {
          studyMode = "see";
          elStudyMode.value = "see";
        }

        if (prefs && prefs.deck === "favorites" && elDeckScope) {
          deckScope = "favorites";
          elDeckScope.value = "favorites";
        } else {
          deckScope = "all";
          if (elDeckScope) elDeckScope.value = "all";
        }

        wordTypeScope = "all";
        if (prefs && prefs.wordType && prefs.wordType !== "all" && elWordType) {
          var wi;
          var foundType = false;
          for (wi = 0; wi < typeOpts.length; wi++) {
            if (typeOpts[wi].value === prefs.wordType) {
              foundType = true;
              break;
            }
          }
          if (foundType) {
            wordTypeScope = prefs.wordType;
            elWordType.value = prefs.wordType;
          }
        }

        if (prefs && prefs.quizGapChoice === true) {
          quizGapChoiceMode = true;
          if (elQuizGapChoiceToggle) elQuizGapChoiceToggle.checked = true;
          syncQuizGapSwitchAria();
        }

        rebuildPool();
        applyPoolHint();
        cardCount = 1;
        current = shufflePickDifferent(pool, null);
        prepareRound();
        renderCard(false);
        refreshReviewPanel();
        refreshFavoritePanel();
      })
      .catch(function (err) {
        var hint = (err && err.message) || String(err);
        if (
          hint.indexOf("fetch") !== -1 ||
          hint.indexOf("Failed to fetch") !== -1
        ) {
          hint += " · use words-embed.js or a local server.";
        }
        showLoadError(hint);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
