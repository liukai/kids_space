/**
 * Word flashcards — just see (word + listen) or quiz (inline blank) · prefs in cookie + localStorage
 */

(function () {
  "use strict";

  var EASY_DIFFICULTY_MAX = 2;
  var COOKIE_PREFS = "flashcards_prefs_v1";
  var LS_PREFS_FALLBACK = "flashcards_prefs_v1";
  var LS_WORD_STATS = "flashcardQuizWordStats";
  var LS_WORD_QUIZ_DETAIL = "flashcardQuizWordDetail";
  var LS_POINTS = "flashcardQuizPoints";
  var LS_STREAK = "flashcardQuizStreak_v1";
  var LS_FAVORITES = "flashcardFavorites_v1";
  var TROPHY_EVERY = 20;
  /** Sun grid: 5 columns × 3 rows; refill + mascot rotate after this many trail steps. */
  var QUIZ_CYCLE_COLS = 5;
  var QUIZ_CYCLE_ROWS = 3;
  var QUIZ_CYCLE_LEN = QUIZ_CYCLE_COLS * QUIZ_CYCLE_ROWS;
  /** Default MC trail roster (mirrors assets/set-maze/trail-mascots.json). */
  var DEFAULT_TRAIL_HERO_MINERALS = [
    { src: "assets/wiki/coal.png" },
    { src: "assets/wiki/iron.png" },
    { src: "assets/wiki/gold.png" },
    { src: "assets/wiki/diamond.png" },
    { src: "assets/wiki/emerald.png" },
    { src: "assets/wiki/lapis.png" },
  ];
  var DEFAULT_TRAIL_MASCOTS = [
    {
      name: "Villager",
      kind: "hero",
      src: "assets/wiki/villager.png",
    },
    {
      name: "Wolf",
      kind: "hero",
      src: "assets/wiki/wolf.png",
    },
    {
      name: "Creeper",
      kind: "villain",
      src: "assets/wiki/creeper.png",
      loot: [
        { src: "assets/wiki/tnt.png" },
        { src: "assets/wiki/redstone.png" },
      ],
    },
    {
      name: "Zombie",
      kind: "villain",
      src: "assets/wiki/zombie.png",
      loot: [{ emoji: "\uD83C\uDF56" }, { emoji: "\uD83E\uDD55" }],
    },
  ];
  var trailMascots = DEFAULT_TRAIL_MASCOTS.slice();
  var trailHeroMinerals = DEFAULT_TRAIL_HERO_MINERALS.slice();
  /** Per-cell trail treats for the current mascot lap (minerals or villain loot). */
  var trailPelletPlan = [];
  /** Advances each time QUIZ_CYCLE_LEN trail steps complete (full strip), then cycles this list. */
  var eatTrailMascotIndex = 0;
  /** Filled trail: clean correct ✔️ vs peek or skip ⭕. */
  var MAZE_MARK_OK = "\u2714\uFE0F";
  var MAZE_MARK_CIRCLE = "\u2B55\uFE0F";
  /** Trail mascot scale: 0.5 → 2.0 from ✔ count on the 5×3 grid (⭕ don’t add growth). */
  var CHOMPER_SCALE_MIN = 0.5;
  var CHOMPER_SCALE_MAX = 2;
  var SET_PELLET_GLYPH_FALLBACK = "\u2600\uFE0F";

  function normalizeTrailLootItem(o) {
    if (!o || typeof o !== "object") return null;
    var src = String(o.src != null ? o.src : "").trim();
    var emoji = String(o.emoji != null ? o.emoji : "").trim();
    if (src) return { src: src };
    if (emoji) return { emoji: emoji };
    return null;
  }

  function normalizeTrailMascot(entry) {
    if (typeof entry === "string") {
      return { src: entry, kind: "hero", loot: [], name: "" };
    }
    if (!entry || typeof entry !== "object") {
      return { src: "", kind: "hero", loot: [], name: "" };
    }
    var loot = [];
    var i;
    if (Array.isArray(entry.loot)) {
      for (i = 0; i < entry.loot.length; i++) {
        var li = normalizeTrailLootItem(entry.loot[i]);
        if (li) loot.push(li);
      }
    }
    return {
      src: String(entry.src != null ? entry.src : "").trim(),
      kind: entry.kind === "villain" ? "villain" : "hero",
      loot: loot,
      name: String(entry.name != null ? entry.name : "").trim(),
    };
  }

  function currentTrailMascot() {
    var list = trailMascots.length ? trailMascots : DEFAULT_TRAIL_MASCOTS;
    return list[eatTrailMascotIndex % list.length] || DEFAULT_TRAIL_MASCOTS[0];
  }

  function currentTrailMascotRel() {
    return currentTrailMascot().src || "";
  }

  function trailMascotIsVillain() {
    return currentTrailMascot().kind === "villain";
  }

  function trailMascotImageAbsUrl() {
    var rel = currentTrailMascotRel();
    if (!rel) return "";
    if (/^https?:\/\//i.test(rel)) return rel;
    if (typeof URL === "undefined" || !document.baseURI) return rel;
    try {
      return new URL(rel, document.baseURI).href;
    } catch (err) {
      return rel;
    }
  }

  function rebuildTrailPelletPlan() {
    var m = currentTrailMascot();
    var plan = [];
    var i;
    if (m.kind === "villain" && m.loot && m.loot.length) {
      for (i = 0; i < QUIZ_CYCLE_LEN; i++) {
        plan.push(m.loot[i % m.loot.length]);
      }
    } else {
      var pool =
        trailHeroMinerals.length > 0
          ? trailHeroMinerals.slice()
          : DEFAULT_TRAIL_HERO_MINERALS.slice();
      shuffleInPlace(pool);
      for (i = 0; i < QUIZ_CYCLE_LEN; i++) {
        plan.push(pool[i % pool.length]);
      }
    }
    trailPelletPlan = plan;
  }

  function loadTrailMascotManifest() {
    if (typeof fetch === "undefined") return Promise.resolve();
    var u;
    try {
      u = new URL("assets/set-maze/trail-mascots.json", document.baseURI).href;
    } catch (e1) {
      return Promise.resolve();
    }
    return fetch(u)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return;
        if (data.heroMinerals && data.heroMinerals.length) {
          var minerals = [];
          var mi;
          for (mi = 0; mi < data.heroMinerals.length; mi++) {
            var mineral = normalizeTrailLootItem(data.heroMinerals[mi]);
            if (mineral) minerals.push(mineral);
          }
          if (minerals.length) trailHeroMinerals = minerals;
        }
        if (!data.mascots || !data.mascots.length) return;
        var out = [];
        var i;
        for (i = 0; i < data.mascots.length; i++) {
          var m = normalizeTrailMascot(data.mascots[i]);
          if (m.src) out.push(m);
        }
        if (out.length) trailMascots = out;
      })
      .catch(function () {});
  }

  /** Quiz points per correct answer = word difficulty from JSON (min 1). */
  function quizPointsForItem(item) {
    if (!item) return EASY_DIFFICULTY_MAX;
    var d = item.difficulty;
    if (typeof d === "number" && !isNaN(d) && d > 0) return Math.round(d);
    return EASY_DIFFICULTY_MAX;
  }

  /** Match progress / favorites rows to the deck entry (first match by orthography). */
  function findWordItem(word) {
    if (!word || !allWords || !allWords.length) return null;
    var i;
    for (i = 0; i < allWords.length; i++) {
      if (allWords[i].word === word) return allWords[i];
    }
    return null;
  }

  function formatQuizPointsLabel(item) {
    var n = quizPointsForItem(item);
    return n === 1 ? "1 pt" : String(n) + " pts";
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
          ipa: String(o.ipa != null ? o.ipa : ""),
          respelling: String(o.respelling != null ? o.respelling : ""),
          type: String(o.type != null ? o.type : ""),
          wordType: String(o.wordType != null ? o.wordType : ""),
          gradeLevel: String(o.gradeLevel != null ? o.gradeLevel : ""),
          mcWikiPage: String(o.mcWikiPage != null ? o.mcWikiPage : ""),
          mcBlurb: String(o.mcBlurb != null ? o.mcBlurb : ""),
          mcKidsBlurb: String(o.mcKidsBlurb != null ? o.mcKidsBlurb : ""),
          mcImageUrl: String(o.mcImageUrl != null ? o.mcImageUrl : ""),
          mcStats: normalizeMcStatsField(o.mcStats),
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

  /** Unique { value: "type|wordType", label: wordType } so phonics splits Blend vs Digraph. */
  function wordTypeOptionsFromItems(items) {
    var seen = {};
    var pairs = [];
    var i;
    for (i = 0; i < items.length; i++) {
      var w = items[i];
      var t = w.type != null ? String(w.type).trim() : "";
      if (!t) continue;
      var wt = w.wordType ? String(w.wordType).trim() : t;
      var key = t + "|" + wt;
      if (seen[key]) continue;
      seen[key] = true;
      pairs.push({ value: key, label: wt });
    }
    pairs.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    return pairs;
  }

  function typeSlugFromWordTypeOptionValue(val) {
    var s = String(val || "");
    var bar = s.indexOf("|");
    if (bar === -1) return s;
    return s.slice(0, bar);
  }

  /**
   * Order for “up to Gr X” (reading level). Labels match words-embed `gradeLevel`.
   */
  var GRADE_ORDER_LIST = [
    "K",
    "K-1",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
  ];

  function gradeRank(g) {
    var s = String(g != null ? g : "").trim();
    if (!s) return -1;
    var idx = GRADE_ORDER_LIST.indexOf(s);
    if (idx !== -1) return idx;
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      var s2 = String(n);
      idx = GRADE_ORDER_LIST.indexOf(s2);
      if (idx !== -1) return idx;
      return 80 + n;
    }
    return 400;
  }

  function gradesPresentSorted(items) {
    var seen = {};
    var i;
    for (i = 0; i < items.length; i++) {
      var gv = String(items[i].gradeLevel != null ? items[i].gradeLevel : "").trim();
      if (gv) seen[gv] = true;
    }
    var list = [];
    var k;
    for (k in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, k)) list.push(k);
    }
    list.sort(function (a, b) {
      return gradeRank(a) - gradeRank(b);
    });
    return list;
  }

  function filterByGradeCap(items, cap) {
    if (cap === "all") return items.slice();
    var maxR = gradeRank(cap);
    return items.filter(function (w) {
      return gradeRank(w.gradeLevel) <= maxR;
    });
  }

  function isMinecraftWord(w) {
    return String(w.type) === "minecraft";
  }

  var MC_WIKI_BASE = "https://minecraft.wiki/w/";

  function minecraftWikiUrl(pageTitle) {
    var t = String(pageTitle != null ? pageTitle : "").trim();
    if (!t) return "";
    return MC_WIKI_BASE + t.replace(/ /g, "_");
  }

  function shouldShowMcEncyclopedia(item) {
    return (
      !!item &&
      isMinecraftWord(item) &&
      (mcBlurbText(item).length > 0 || !!mcStatsForItem(item))
    );
  }

  function isMcModeActive() {
    return minecraftScope === "include" || minecraftScope === "only";
  }

  var MC_STAT_CATEGORY_LABELS = {
    block: "\uD83E\uDDF1 Block",
    resource: "\uD83D\uDC8E Resource",
    tool: "\uD83D\uDEE0\uFE0F Tool",
    armor: "\uD83D\uDEE1\uFE0F Armor",
    friendly: "\uD83D\uDC9A Friendly mob",
    monster: "\uD83D\uDC7E Monster",
    boss: "\uD83D\uDC80 Boss",
    place: "\uD83D\uDDFA\uFE0F Place",
    tip: "\uD83D\uDCA1 Game tip",
  };

  var MC_STAT_RARITY_LABELS = {
    common: "\u26AA Common",
    uncommon: "\uD83D\uDD35 Uncommon",
    rare: "\uD83D\uDFE3 Rare",
    very_rare: "\uD83C\uDF1F Super Rare",
    unique: "\u2728 Super Super Rare",
  };

  var MC_STAT_VALUE_LABELS = {
    handy: "\uD83D\uDC4D Pick up \u2014 ok stuff",
    useful: "\u2B50 Pick up \u2014 good stuff",
    valuable: "\uD83D\uDC8E Pick up \u2014 great stuff",
    treasure: "\uD83D\uDC51 Pick up \u2014 best stuff",
  };

  var MC_STAT_DANGER_LABELS = {
    safe: "\uD83D\uDE0A Safe",
    careful: "\u26A0\uFE0F Be careful",
    dangerous: "\uD83D\uDD25 Dangerous",
    very_dangerous: "\uD83D\uDCA5 Very dangerous",
    boss: "\uD83D\uDC79 Boss fight",
  };

  /** Drop leading emoji so TTS reads clean words only. */
  function mcStatSpeechLabel(displayLabel) {
    return String(displayLabel != null ? displayLabel : "")
      .replace(
        /^[\u{1F300}-\u{1FAFF}\u{1F1E0}-\u{1F1FF}\u2600-\u27BF\uFE0F\u200D]+\s*/u,
        ""
      )
      .trim();
  }

  function normalizeMcStatsField(raw) {
    if (!raw || typeof raw !== "object") return null;
    var cat = String(raw.category != null ? raw.category : "").trim();
    var rar = String(raw.rarity != null ? raw.rarity : "").trim();
    if (!cat || !MC_STAT_CATEGORY_LABELS[cat] || !rar || !MC_STAT_RARITY_LABELS[rar]) {
      return null;
    }
    var out = { category: cat, rarity: rar };
    var val = String(raw.value != null ? raw.value : "").trim();
    if (val && MC_STAT_VALUE_LABELS[val]) out.value = val;
    var dng = String(raw.danger != null ? raw.danger : "").trim();
    if (dng && MC_STAT_DANGER_LABELS[dng]) out.danger = dng;
    return out;
  }

  function mcStatsForItem(item) {
    return item && item.mcStats ? item.mcStats : null;
  }

  function mcStatPillClass(kind, value) {
    if (kind === "category") return "mc-stat-pill mc-stat-pill--category";
    if (kind === "rarity") {
      return "mc-stat-pill mc-stat-pill--rarity-" + value;
    }
    if (kind === "value") {
      return (
        "mc-stat-pill mc-stat-pill--value" +
        (value === "treasure" ? " mc-stat-pill--value-treasure" : "")
      );
    }
    if (kind === "danger") {
      return "mc-stat-pill mc-stat-pill--danger-" + value;
    }
    return "mc-stat-pill";
  }

  function mcStatPillsForItem(item) {
    var stats = mcStatsForItem(item);
    if (!stats) return [];
    var pills = [];
    pills.push({
      kind: "category",
      label: MC_STAT_CATEGORY_LABELS[stats.category],
      value: stats.category,
    });
    pills.push({
      kind: "rarity",
      label: MC_STAT_RARITY_LABELS[stats.rarity],
      value: stats.rarity,
    });
    if (stats.value) {
      pills.push({
        kind: "value",
        label: MC_STAT_VALUE_LABELS[stats.value],
        value: stats.value,
      });
    }
    if (stats.danger) {
      pills.push({
        kind: "danger",
        label: MC_STAT_DANGER_LABELS[stats.danger],
        value: stats.danger,
      });
    }
    return pills;
  }

  function mcStatsSpeechText(item) {
    if (!isMcModeActive()) return "";
    var pills = mcStatPillsForItem(item);
    if (!pills.length) return "";
    var parts = [];
    var i;
    for (i = 0; i < pills.length; i++) {
      parts.push(mcStatSpeechLabel(pills[i].label));
    }
    return parts.join(". ") + ".";
  }

  function renderMcStatsUi(item, elStats) {
    if (!elStats) return;
    elStats.replaceChildren();
    if (!isMcModeActive() || !item) {
      elStats.hidden = true;
      return;
    }
    var pills = mcStatPillsForItem(item);
    if (!pills.length) {
      elStats.hidden = true;
      return;
    }
    var i;
    for (i = 0; i < pills.length; i++) {
      var p = pills[i];
      var span = document.createElement("span");
      span.className = mcStatPillClass(p.kind, p.value);
      span.textContent = p.label;
      elStats.appendChild(span);
    }
    elStats.hidden = false;
  }

  /** Active MC description: simple (4–10) or full, depending on toggle. */
  function mcBlurbText(item) {
    if (!item) return "";
    var full = String(item.mcBlurb != null ? item.mcBlurb : "").trim();
    var kids = String(item.mcKidsBlurb != null ? item.mcKidsBlurb : "").trim();
    if (showMcKidsBlurbs) return kids || full;
    return full || kids;
  }

  function mcBlurbSpeechText(item) {
    if (!isMcModeActive() || !shouldShowMcEncyclopedia(item)) return "";
    return mcBlurbText(item);
  }

  function applyMcEncyclopediaUi(item, elWrap, elStats, elBlurb, elWiki) {
    if (!elWrap) return;
    if (!shouldShowMcEncyclopedia(item)) {
      elWrap.hidden = true;
      renderMcStatsUi(null, elStats);
      if (elBlurb) elBlurb.textContent = "";
      if (elWiki) {
        elWiki.removeAttribute("href");
        elWiki.hidden = true;
      }
      return;
    }
    elWrap.hidden = false;
    renderMcStatsUi(item, elStats);
    if (elBlurb) elBlurb.textContent = mcBlurbText(item);
    if (elWiki) {
      var page = String(item.mcWikiPage != null ? item.mcWikiPage : "").trim();
      var url = minecraftWikiUrl(page);
      if (url) {
        elWiki.href = url;
        elWiki.textContent = "Minecraft Wiki \u2197";
        elWiki.hidden = false;
        elWiki.setAttribute(
          "aria-label",
          "Open Minecraft Wiki in a new tab"
        );
      } else {
        elWiki.removeAttribute("href");
        elWiki.hidden = true;
      }
    }
  }

  var DEFAULT_ART_GALLERY = [
    {
      id: "overworld-village-love",
      src: "assets/art-gallery/overworld-village-love.png",
      title: "Big overworld village",
      caption:
        "Steve, Alex, villagers, and friends in a sunny world. Love to Matt & Francis! — Kai",
      artist: "Kai",
    },
    {
      id: "overworld-village-friends",
      src: "assets/art-gallery/overworld-village-friends.png",
      title: "Village with friends",
      caption:
        "A cozy village with a castle, river, and lots of animals. Love to Matt & Francis! — Kai",
      artist: "Kai",
    },
    {
      id: "village-battle-day",
      src: "assets/art-gallery/village-battle-day.png",
      title: "Village battle day",
      caption:
        "Steve fights zombies and a creeper while the sun burns the undead.",
      artist: "Kai",
    },
    {
      id: "battle-planner-sketch",
      src: "assets/art-gallery/battle-planner-sketch.png",
      title: "Battle in the planner",
      caption: "Heroes vs zombies and creepers — drawn in a weekly planner.",
      artist: "Kai",
    },
    {
      id: "heroes-vs-mobs",
      src: "assets/art-gallery/heroes-vs-mobs.png",
      title: "Heroes vs mobs",
      caption:
        "Steve and a friend take on a burning zombie and a defeated creeper.",
      artist: "Kai",
    },
    {
      id: "night-battle-fail",
      src: "assets/art-gallery/night-battle-fail.png",
      title: "Night battle",
      caption: "The mobs win this round under the moon — humans failed…",
      artist: "Kai",
    },
  ];
  var artGalleryPieces = DEFAULT_ART_GALLERY.slice();
  var artGalleryCurrentId = null;
  /** Shuffled ids — each piece shown once per cycle before the deck reshuffles. */
  var artGalleryDeckIds = [];
  var artGalleryDeckIdx = 0;

  function artGalleryPieceById(id) {
    var i;
    for (i = 0; i < artGalleryPieces.length; i++) {
      if (artGalleryPieces[i].id === id) return artGalleryPieces[i];
    }
    return null;
  }

  function resetArtGalleryDeck() {
    artGalleryDeckIds = [];
    var i;
    for (i = 0; i < artGalleryPieces.length; i++) {
      artGalleryDeckIds.push(artGalleryPieces[i].id);
    }
    shuffleInPlace(artGalleryDeckIds);
    artGalleryDeckIdx = 0;
    if (
      artGalleryCurrentId &&
      artGalleryDeckIds.length > 1 &&
      artGalleryDeckIds[0] === artGalleryCurrentId
    ) {
      var j = 1 + Math.floor(Math.random() * (artGalleryDeckIds.length - 1));
      var t = artGalleryDeckIds[0];
      artGalleryDeckIds[0] = artGalleryDeckIds[j];
      artGalleryDeckIds[j] = t;
    }
  }

  /** Next piece in shuffled deck; reshuffles after every piece has been shown. */
  function pickNextArtGalleryPiece() {
    if (!artGalleryPieces.length) return null;
    if (
      !artGalleryDeckIds.length ||
      artGalleryDeckIdx >= artGalleryDeckIds.length
    ) {
      resetArtGalleryDeck();
    }
    var id = artGalleryDeckIds[artGalleryDeckIdx];
    artGalleryDeckIdx++;
    var piece = artGalleryPieceById(id);
    if (!piece) {
      resetArtGalleryDeck();
      if (!artGalleryDeckIds.length) return artGalleryPieces[0] || null;
      id = artGalleryDeckIds[artGalleryDeckIdx++];
      piece = artGalleryPieceById(id);
    }
    return piece || artGalleryPieces[0] || null;
  }

  function normalizeArtGalleryPiece(entry) {
    if (!entry || typeof entry !== "object") return null;
    var id = String(entry.id != null ? entry.id : "").trim();
    var src = String(entry.src != null ? entry.src : "").trim();
    var title = String(entry.title != null ? entry.title : "").trim();
    if (!id || !src || !title) return null;
    return {
      id: id,
      src: src,
      title: title,
      caption: String(entry.caption != null ? entry.caption : "").trim(),
      artist: String(entry.artist != null ? entry.artist : "").trim(),
    };
  }

  function artGalleryImageUrl(src) {
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    try {
      return new URL(src, document.baseURI).href;
    } catch (e1) {
      return src;
    }
  }

  function loadArtGallery() {
    artGalleryPieces = DEFAULT_ART_GALLERY.slice();
    resetArtGalleryDeck();
    if (typeof fetch === "undefined") return Promise.resolve();
    var u;
    try {
      u = new URL("assets/art-gallery/gallery.json", document.baseURI).href;
    } catch (e2) {
      return Promise.resolve();
    }
    return fetch(u)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.pieces)) return;
        var out = [];
        var i;
        for (i = 0; i < data.pieces.length; i++) {
          var p = normalizeArtGalleryPiece(data.pieces[i]);
          if (p) out.push(p);
        }
        if (out.length) artGalleryPieces = out;
        resetArtGalleryDeck();
      })
      .catch(function () {});
  }

  function syncArtGalleryFieldVisibility() {
    if (!elMcArtGalleryField) return;
    elMcArtGalleryField.hidden =
      !isMcModeActive() || !artGalleryPieces.length;
  }

  function isArtGalleryModalOpen() {
    return elArtGalleryModal && !elArtGalleryModal.hidden;
  }

  function renderArtGalleryPiece(piece) {
    if (!piece) return;
    artGalleryCurrentId = piece.id;
    if (elArtGalleryTitle) elArtGalleryTitle.textContent = piece.title;
    if (elArtGalleryCaption) {
      elArtGalleryCaption.textContent = piece.caption || "";
      elArtGalleryCaption.hidden = !piece.caption;
    }
    if (elArtGalleryMeta) {
      var meta = piece.artist ? "Art by " + piece.artist : "";
      elArtGalleryMeta.textContent = meta;
      elArtGalleryMeta.hidden = !meta;
    }
    if (elArtGalleryImg) {
      elArtGalleryImg.src = artGalleryImageUrl(piece.src);
      elArtGalleryImg.alt =
        piece.title + (piece.caption ? ". " + piece.caption : "");
    }
  }

  function openArtGalleryPiece(piece) {
    if (!piece || !elArtGalleryModal) return;
    renderArtGalleryPiece(piece);
    elArtGalleryModal.hidden = false;
    if (elArtGalleryClose) elArtGalleryClose.focus();
  }

  function openArtGalleryRandom() {
    var piece = pickNextArtGalleryPiece();
    if (piece) openArtGalleryPiece(piece);
  }

  function closeArtGalleryModal() {
    artGalleryCurrentId = null;
    if (elArtGalleryModal) elArtGalleryModal.hidden = true;
    if (elArtGalleryImg) {
      elArtGalleryImg.removeAttribute("src");
      elArtGalleryImg.alt = "";
    }
  }

  function minecraftWordsFrom(items) {
    return items.filter(isMinecraftWord);
  }

  function mergeWordPoolsDedupe(primary, extra) {
    var seen = Object.create(null);
    var out = [];
    var i;
    var k;
    for (i = 0; i < primary.length; i++) {
      k = wordEntryKey(primary[i]);
      if (seen[k]) continue;
      seen[k] = true;
      out.push(primary[i]);
    }
    for (i = 0; i < extra.length; i++) {
      k = wordEntryKey(extra[i]);
      if (seen[k]) continue;
      seen[k] = true;
      out.push(extra[i]);
    }
    return out;
  }

  function wordMatchesTypeScope(w, scope) {
    if (scope === "all") return true;
    var bar = scope.indexOf("|");
    if (bar !== -1) {
      return (
        w.type === scope.slice(0, bar) &&
        String(w.wordType) === scope.slice(bar + 1)
      );
    }
    return w.type === scope;
  }

  function filterPoolByWordType(items, scope, keepMinecraft) {
    if (scope === "all") return items.slice();
    return items.filter(function (w) {
      if (keepMinecraft && isMinecraftWord(w)) return true;
      return wordMatchesTypeScope(w, scope);
    });
  }

  function isTypingMode() {
    return studyMode === "quiz" || studyMode === "typeall";
  }

  /** Emoji for word category (`type` slug in JSON). */
  function wordCategoryEmoji(typeSlug) {
    var m = {
      cvc: "\ud83d\udd24",
      phonics: "\ud83d\udd0a",
      sight: "\u2764\ufe0f",
      advanced: "\ud83c\udf93",
      basic: "\ud83d\udce6",
      minecraft: "\u26cf\ufe0f",
      "basic-food": "\ud83c\udf4e",
      "basic-things": "\ud83d\udce6",
      "basic-nature": "\ud83c\udf3f",
      "basic-school": "\ud83c\udfeb",
      "basic-people": "\ud83d\udc65",
      "basic-verbs": "\ud83c\udfc3",
    };
    var k = String(typeSlug || "")
      .trim()
      .toLowerCase();
    return m[k] || "\ud83d\udcda";
  }

  /** Human-readable type name; falls back to title-casing the `type` slug. */
  function formatWordTypeLabel(item) {
    var wt = String(item.wordType != null ? item.wordType : "").trim();
    if (wt) return wt;
    var slug = String(item.type != null ? item.type : "").trim().toLowerCase();
    if (!slug) return "";
    var parts = slug.split("-");
    var i;
    var out = [];
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      out.push(p.charAt(0).toUpperCase() + p.slice(1));
    }
    return out.join(" ");
  }

  /**
   * One subtitle line: emoji + type · reading grade · Chinese (no quiz-mode prose).
   */
  function buildCardMetaSubtitle(item) {
    if (!item) return "";
    var bits = [];
    var label = formatWordTypeLabel(item);
    var em = wordCategoryEmoji(String(item.type != null ? item.type : "").trim());
    bits.push(label ? em + " " + label : em);
    var gl = String(item.gradeLevel != null ? item.gradeLevel : "").trim();
    if (gl) bits.push("Gr " + gl);
    bits.push(formatQuizPointsLabel(item));
    if (item.chinese) bits.push(item.chinese);
    return bits.join(" \u00b7 ");
  }

  /** Main card meta line (quiz rate shown separately as a small pill). */
  function describeCardMetaLine(item) {
    return buildCardMetaSubtitle(item);
  }

  /** Word popup meta line (quiz rate in pill). */
  function describeWordPeekMetaLine(item) {
    return buildCardMetaSubtitle(item);
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

  /** Each page load: random mascot order + random starting mascot (not a fixed sequence). */
  function randomTrailMascotsForSession() {
    var n = trailMascots.length;
    if (n < 2) {
      eatTrailMascotIndex = 0;
      rebuildTrailPelletPlan();
      return;
    }
    shuffleInPlace(trailMascots);
    eatTrailMascotIndex = Math.floor(Math.random() * n);
    rebuildTrailPelletPlan();
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
        else if (p.kind === "segments")
          speakTexts(p.segments, true, p.onAllDone);
        else if (p.kind === "item")
          speakCardItem(p.item, true, p.onAllDone);
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
  /** Gap between chained utterances (word then MC blurb). */
  var SPEAK_CHAIN_GAP_MS = 90;
  /** Suppresses stale delayed speaks when auto-speak + user tap both queue TTS. */
  var speakScheduleSeq = 0;

  function normalizeSpeakSegments(segments) {
    var parts = [];
    var i;
    if (typeof segments === "string") {
      var one = String(segments).trim();
      if (one) parts.push({ text: one, rate: 0.9 });
      return parts;
    }
    if (!Array.isArray(segments)) return parts;
    for (i = 0; i < segments.length; i++) {
      var s = segments[i];
      if (typeof s === "string") {
        var t = String(s).trim();
        if (t) parts.push({ text: t, rate: 0.9 });
      } else if (s && s.text) {
        var tx = String(s.text).trim();
        if (tx) {
          parts.push({
            text: tx,
            rate: typeof s.rate === "number" && !isNaN(s.rate) ? s.rate : 0.9,
          });
        }
      }
    }
    return parts;
  }

  function queueSpeechUtterance(text, rate, ticket, onDone) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      applyEnglishVoice(u);
      u.rate = rate;
      u.volume = 1;
      u.pitch = 1;
      u.onend = function () {
        if (onDone) onDone();
      };
      u.onerror = function () {
        try {
          if (ticket !== speakScheduleSeq) return;
          var u2 = new SpeechSynthesisUtterance(text);
          u2.lang = "en-US";
          u2.rate = rate;
          u2.volume = 1;
          u2.pitch = 1;
          u2.onend = function () {
            if (onDone) onDone();
          };
          speechSynthesis.speak(u2);
        } catch (e3) {
          if (onDone) onDone();
        }
      };
      speechSynthesis.speak(u);
    } catch (e2) {
      if (onDone) onDone();
    }
  }

  function speakTexts(segments, userInitiated, onAllDone) {
    if (!window.speechSynthesis) {
      if (onAllDone) onAllDone();
      return;
    }
    var parts = normalizeSpeakSegments(segments);
    if (!parts.length) {
      if (onAllDone) onAllDone();
      return;
    }
    userInitiated = userInitiated === true;
    wireSpeechUserActivationOnce();
    if (userInitiated) {
      pendingSpeech = null;
    } else if (!speechUserEverActivated) {
      pendingSpeech = { kind: "segments", segments: parts, onAllDone: onAllDone };
      return;
    }
    var ticket = ++speakScheduleSeq;
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
    } catch (e) {}
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }
    } catch (e1) {}
    function speakPartAt(idx) {
      if (ticket !== speakScheduleSeq) return;
      if (idx >= parts.length) {
        if (onAllDone) onAllDone();
        return;
      }
      var part = parts[idx];
      var delay = idx === 0 ? SPEAK_AFTER_CANCEL_MS : SPEAK_CHAIN_GAP_MS;
      runWhenSpeechVoicesReady(function () {
        window.setTimeout(function () {
          if (ticket !== speakScheduleSeq) return;
          queueSpeechUtterance(part.text, part.rate, ticket, function () {
            speakPartAt(idx + 1);
          });
        }, delay);
      });
    }
    speakPartAt(0);
  }

  function speakWord(text, userInitiated) {
    if (!text) return;
    speakTexts([{ text: text, rate: 0.9 }], userInitiated);
  }

  /** Word; MC stats + description blurb only in See mode. */
  function speakCardItem(item, userInitiated, onAllDone) {
    if (!item || !item.word) {
      if (onAllDone) onAllDone();
      return;
    }
    var segments = [{ text: item.word, rate: 0.9 }];
    if (studyMode === "see") {
      var statsLine = mcStatsSpeechText(item);
      if (statsLine) segments.push({ text: statsLine, rate: 0.88 });
      var blurb = mcBlurbSpeechText(item);
      if (blurb) segments.push({ text: blurb, rate: 0.88 });
    }
    speakTexts(segments, userInitiated, onAllDone);
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
    var ticket = ++speakScheduleSeq;
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
        if (ticket !== speakScheduleSeq) return;
        try {
          var u = new SpeechSynthesisUtterance(spaced);
          applyEnglishVoice(u);
          u.rate = 0.78;
          u.volume = 1;
          u.pitch = 1;
          u.onerror = function () {
            try {
              if (ticket !== speakScheduleSeq) return;
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
    if (!d[w]) {
      d[w] = {
        quizzed: 0,
        right: 0,
        wrong: 0,
        gapSessions: 0,
        typeAllSessions: 0,
        seen: 0,
      };
    } else {
      var x = d[w];
      if (x.gapSessions == null) x.gapSessions = 0;
      if (x.typeAllSessions == null) x.typeAllSessions = 0;
      if (x.seen == null) x.seen = 0;
    }
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

  /**
   * First counted attempt on a quiz card (gap or type-full). sessionKind: "gap" | "typeall".
   */
  function bumpQuizzed(w, sessionKind) {
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    e.quizzed++;
    if (sessionKind === "typeall") {
      e.typeAllSessions = (e.typeAllSessions | 0) + 1;
    } else {
      e.gapSessions = (e.gapSessions | 0) + 1;
    }
    saveQuizDetail(d);
    updateCoverageStatsUi();
  }

  function bumpSeen(w) {
    if (!w) return;
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    if (e.seen | 0) return;
    e.seen = 1;
    saveQuizDetail(d);
    updateCoverageStatsUi();
  }

  /** Distinct words in the current list with See / gap quiz / type-all activity. */
  function countWordCoverage() {
    var inList = {};
    var i;
    if (allWords && allWords.length) {
      for (i = 0; i < allWords.length; i++) {
        inList[allWords[i].word] = true;
      }
    }
    var d = loadQuizDetail();
    var seen = 0;
    var gap = 0;
    var typeAll = 0;
    var rightSum = 0;
    var wrongSum = 0;
    var k;
    for (k in d) {
      if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
      if (allWords && allWords.length && !inList[k]) continue;
      var e = d[k];
      if (!e) continue;
      if (e.seen | 0) seen++;
      if ((e.gapSessions | 0) > 0) gap++;
      if ((e.typeAllSessions | 0) > 0) typeAll++;
      rightSum += e.right | 0;
      wrongSum += e.wrong | 0;
    }
    return {
      seen: seen,
      gapQuiz: gap,
      typeAll: typeAll,
      rightSum: rightSum,
      wrongSum: wrongSum,
    };
  }

  function coverageAppendSegment(el, withSep, value, numClass, labelAfter) {
    if (withSep) el.appendChild(document.createTextNode(" \u00b7 "));
    var strong = document.createElement("strong");
    strong.className = "coverage-num coverage-num--" + numClass;
    strong.textContent = String(value);
    el.appendChild(strong);
    el.appendChild(document.createTextNode(" " + labelAfter));
  }

  function updateCoverageStatsUi() {
    var el = document.getElementById("coverage-stats");
    if (!el) return;
    var total = allWords && allWords.length ? allWords.length : 0;
    if (total < 1) {
      el.replaceChildren();
      el.removeAttribute("aria-label");
      return;
    }
    var c = countWordCoverage();
    el.replaceChildren();
    coverageAppendSegment(el, false, c.seen, "seen", "seen");
    coverageAppendSegment(el, true, c.gapQuiz, "quiz", "quiz");
    coverageAppendSegment(el, true, c.typeAll, "typed", "typed");
    coverageAppendSegment(el, true, c.rightSum, "right", "right");
    coverageAppendSegment(el, true, c.wrongSum, "wrong", "wrong");
    coverageAppendSegment(el, true, total, "flashed", "flashed");
    el.setAttribute(
      "aria-label",
      "Seen: " +
        c.seen +
        " words. Gap quiz: " +
        c.gapQuiz +
        ". Type full word: " +
        c.typeAll +
        ". Correct tries: " +
        c.rightSum +
        ". Wrong tries: " +
        c.wrongSum +
        ". Cards in deck: " +
        total
    );
  }

  function bumpWrong(w) {
    var d = loadQuizDetail();
    var e = ensureQuizEntry(d, w);
    e.wrong++;
    saveQuizDetail(d);
    quizStreak = 0;
    saveStreak(0);
    if (isTypingMode()) {
      cycleHadWrongOnCard = true;
      quizCycleBombCount++;
      pulseCycleMazeForBomb();
      updateQuizCycleUi();
      playCycleSunMissAnimation();
    }
    updateScoreUi();
    maybeRefreshCardQuizPill(w);
    updateCoverageStatsUi();
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
    updateCoverageStatsUi();
    return e.right;
  }

  function getQuizEntry(w) {
    var d = loadQuizDetail();
    var e = d[w];
    if (!e) {
      return {
        quizzed: 0,
        right: 0,
        wrong: 0,
        gapSessions: 0,
        typeAllSessions: 0,
        seen: 0,
      };
    }
    return {
      quizzed: e.quizzed | 0,
      right: e.right | 0,
      wrong: e.wrong | 0,
      gapSessions: e.gapSessions != null ? e.gapSessions | 0 : 0,
      typeAllSessions: e.typeAllSessions != null ? e.typeAllSessions | 0 : 0,
      seen: e.seen != null ? e.seen | 0 : 0,
    };
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
      ipa: "",
      respelling: "",
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
      meta.textContent =
        (w.gradeLevel ? "Gr " + String(w.gradeLevel).trim() : "Gr —") +
        " · " +
        formatQuizPointsLabel(w);
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
      var itemForPts = findWordItem(r.word);
      wEl.textContent =
        r.word + (itemForPts ? " · " + formatQuizPointsLabel(itemForPts) : "");

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
      "Clear quiz scores, trophies, streak, per-word progress, and seen / typed counts? Saved words and study settings stay.";
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
    resetQuizCycle();
    if (current) {
      applyCardMetaForItem(current);
      applyPronunciationToCard(current);
    }
    updateCoverageStatsUi();
    setFeedback("Quiz history cleared.", "muted");
  }

  var QUIZ_FOCUS_DELAY_MS = 1150;
  /** How long to show “+points” / celebration before auto-advancing (so it isn’t a sub-second flash). */
  var QUIZ_SUCCESS_HOLD_GAP_MS = 700;
  var QUIZ_SUCCESS_HOLD_TYPEALL_MS = 1100;
  var QUIZ_SUCCESS_HOLD_PEEK_MS = 500;
  /** Pending auto-speak timeout — must clear so we never speak twice (e.g. Next before delay fires). */
  var pronounceAfterCardTimer = null;
  /** After correct: (1) bump trail + UI when sun reaches mascot (2) advance card */
  var quizAdvanceBumpTimer = null;
  var quizAdvanceCardTimer = null;
  /** Match .cycle-maze--nom sun flight (~480ms) + buffer before swapping sun → ✔️ */
  var QUIZ_TRAIL_NOM_MS = 520;
  /** See mode: pause after reading aloud before auto-advance. */
  var SEE_SLIDESHOW_MS = 5000;
  var seeSlideshowEnabled = false;
  var seeSlideshowTimer = null;
  var seeSlideshowSpeechPoll = null;
  var controlPanelOpen = false;

  function syncControlPanelUi() {
    if (elControlPanel) {
      elControlPanel.classList.toggle("control-panel--open", controlPanelOpen);
    }
    if (elControlPanelBody) {
      elControlPanelBody.hidden = !controlPanelOpen;
    }
    if (elControlPanelToggle) {
      elControlPanelToggle.setAttribute(
        "aria-expanded",
        controlPanelOpen ? "true" : "false"
      );
      elControlPanelToggle.setAttribute(
        "aria-label",
        controlPanelOpen
          ? "Study options — hide mode, grade, deck, and display settings"
          : "Study options — show mode, grade, deck, and display settings"
      );
    }
    if (elControlPanelSummary) {
      elControlPanelSummary.textContent = controlPanelOpen
        ? ""
        : controlPanelSummaryText();
      elControlPanelSummary.setAttribute(
        "aria-hidden",
        controlPanelOpen ? "true" : "false"
      );
    }
  }

  function controlPanelSummaryText() {
    var bits = [];
    if (studyMode === "quiz") bits.push("Quiz");
    else if (studyMode === "typeall") bits.push("Type word");
    else bits.push("See");
    if (gradeFilterCap !== "all") bits.push("≤ G" + gradeFilterCap);
    if (deckScope === "favorites") bits.push("Saved");
    if (minecraftScope === "include") bits.push("+ MC");
    else if (minecraftScope === "only") bits.push("MC only");
    if (wordTypeScope !== "all" && elWordType && elWordType.selectedIndex >= 0) {
      var typeLabel = elWordType.options[elWordType.selectedIndex].textContent;
      if (typeLabel) {
        typeLabel = String(typeLabel).replace(/^[^\s]+\s*/, "").trim();
        if (typeLabel && typeLabel !== "All types") bits.push(typeLabel);
      }
    }
    return bits.join(" · ");
  }

  function onControlPanelToggleClick() {
    controlPanelOpen = !controlPanelOpen;
    syncControlPanelUi();
    persistSelections();
  }

  function clearSeeSlideshowTimer() {
    if (seeSlideshowTimer !== null) {
      window.clearTimeout(seeSlideshowTimer);
      seeSlideshowTimer = null;
    }
    if (seeSlideshowSpeechPoll !== null) {
      window.clearTimeout(seeSlideshowSpeechPoll);
      seeSlideshowSpeechPoll = null;
    }
  }

  function seeSlideshowAfterSpeechCallback() {
    return function () {
      if (studyMode === "see" && seeSlideshowEnabled) scheduleSeeSlideshowTick();
    };
  }

  /** Wait for TTS to finish (if any), then start the post-read countdown. */
  function scheduleSeeSlideshowWhenReady() {
    clearSeeSlideshowTimer();
    if (
      !seeSlideshowEnabled ||
      studyMode !== "see" ||
      !current ||
      !pool.length
    ) {
      return;
    }
    function poll() {
      if (
        !seeSlideshowEnabled ||
        studyMode !== "see" ||
        !current ||
        !pool.length
      ) {
        seeSlideshowSpeechPoll = null;
        return;
      }
      if (seeSlideshowPaused()) {
        seeSlideshowSpeechPoll = window.setTimeout(poll, 400);
        return;
      }
      if (
        window.speechSynthesis &&
        (speechSynthesis.speaking || speechSynthesis.pending)
      ) {
        seeSlideshowSpeechPoll = window.setTimeout(poll, 250);
        return;
      }
      seeSlideshowSpeechPoll = null;
      scheduleSeeSlideshowTick();
    }
    poll();
  }

  function seeSlideshowPaused() {
    return (
      isKbdShortcutsModalOpen() ||
      isWordPeekModalOpen() ||
      isArtGalleryModalOpen()
    );
  }

  function syncSeeSlideshowFieldVisibility() {
    if (!elSeeSlideshowField) return;
    elSeeSlideshowField.hidden = studyMode !== "see";
  }

  function scheduleSeeSlideshowTick() {
    clearSeeSlideshowTimer();
    if (
      !seeSlideshowEnabled ||
      studyMode !== "see" ||
      !current ||
      !pool.length
    ) {
      return;
    }
    seeSlideshowTimer = window.setTimeout(function () {
      seeSlideshowTimer = null;
      if (
        !seeSlideshowEnabled ||
        studyMode !== "see" ||
        !pool.length
      ) {
        return;
      }
      if (seeSlideshowPaused()) {
        scheduleSeeSlideshowTick();
        return;
      }
      advanceToNewCard(false);
    }, SEE_SLIDESHOW_MS);
  }

  function onSeeSlideshowToggleChange() {
    if (!elSeeSlideshowToggle) return;
    seeSlideshowEnabled = !!elSeeSlideshowToggle.checked;
    elSeeSlideshowToggle.setAttribute(
      "aria-checked",
      seeSlideshowEnabled ? "true" : "false"
    );
    persistSelections();
    if (seeSlideshowEnabled) scheduleSeeSlideshowWhenReady();
    else clearSeeSlideshowTimer();
  }

  function clearQuizAdvanceTimer() {
    if (quizAdvanceBumpTimer !== null) {
      window.clearTimeout(quizAdvanceBumpTimer);
      quizAdvanceBumpTimer = null;
    }
    if (quizAdvanceCardTimer !== null) {
      window.clearTimeout(quizAdvanceCardTimer);
      quizAdvanceCardTimer = null;
    }
  }

  function pronounceAfterCard(fromUserTap) {
    if (!current) return;
    if (pronounceAfterCardTimer !== null) {
      window.clearTimeout(pronounceAfterCardTimer);
      pronounceAfterCardTimer = null;
    }
    if (studyMode === "quiz" || studyMode === "typeall") {
    if (fromUserTap) speakCardItem(current, true);
    else {
      pronounceAfterCardTimer = window.setTimeout(function () {
        pronounceAfterCardTimer = null;
        if (current && isTypingMode()) speakCardItem(current, false);
      }, 140);
    }
    return;
  }
  var afterSpeech = seeSlideshowAfterSpeechCallback();
  if (fromUserTap) speakCardItem(current, true, afterSpeech);
  else {
    pronounceAfterCardTimer = window.setTimeout(function () {
      pronounceAfterCardTimer = null;
      if (current) speakCardItem(current, false, afterSpeech);
    }, 100);
  }
}

  var allWords = [];
  var pool = [];
  var current = null;
  var gradeFilterCap = "all";
  var deckScope = "all";
  var wordTypeScope = "all";
  /** "off" | "include" (+ MC any grade) | "only" (minecraft deck) */
  var minecraftScope = "off";
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

  /** Eaten suns in the current strip (0 .. QUIZ_CYCLE_LEN-1 while playing). */
  var quizCycleEaten = 0;
  /** Parallel to filled slots: "ok" = ✔️, "soft" = peek / skip ⭕. */
  var quizCycleMarks = [];
  var cycleHadWrongOnCard = false;
  /** Wrong guesses since the last strip refill (Pac “bomb” counter). */
  var quizCycleBombCount = 0;
  var cycleCelebrateTimer = null;
  var cycleSunAnimTimer = null;
  /** Bumped to invalidate pending nom rAF / timeout (e.g. wrong answer after correct). */
  var cycleSunAnimGeneration = 0;
  /** Persisted: show chomper strip in quiz / type word (toggle). */
  var quizCycleMazeEnabled = true;
  /** Persisted: IPA + “Say” respelling on card & word peek (off by default). */
  var showPhoneticMarks = false;
  /** Persisted: picture emoji on card & word peek (on by default). */
  var showWordEmoji = true;
  /** MC mode: short tips for ages 4–10 vs longer descriptions. */
  var showMcKidsBlurbs = true;

  var elCycleMazeOuter = document.getElementById("cycle-maze-outer");
  var elCycleMazeToggle = document.getElementById("cycle-maze-toggle");
  var elCycleMaze = document.getElementById("cycle-maze");
  var elCycleStrip = document.getElementById("cycle-maze-strip");
  var elCycleChomperSlot = document.getElementById("cycle-maze-chomper-slot");
  var elCycleStats = document.getElementById("cycle-maze-stats");
  var elPhoneticMarksToggle = document.getElementById("phonetic-marks-toggle");
  var elWordEmojiToggle = document.getElementById("word-emoji-toggle");
  var elMcKidsBlurbField = document.getElementById("mc-kids-blurb-field");
  var elMcKidsBlurbToggle = document.getElementById("mc-kids-blurb-toggle");
  var elMcArtGalleryField = document.getElementById("mc-art-gallery-field");
  var elBtnMcArtGallery = document.getElementById("btn-mc-art-gallery");
  var elArtGalleryModal = document.getElementById("art-gallery-modal");
  var elArtGalleryBackdrop = document.getElementById("art-gallery-modal-backdrop");
  var elArtGalleryTitle = document.getElementById("art-gallery-title");
  var elArtGalleryCaption = document.getElementById("art-gallery-caption");
  var elArtGalleryMeta = document.getElementById("art-gallery-meta");
  var elArtGalleryImg = document.getElementById("art-gallery-img");
  var elArtGalleryShuffle = document.getElementById("art-gallery-shuffle");
  var elArtGalleryClose = document.getElementById("art-gallery-close");
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
  var elWordPeekMcTip = document.getElementById("word-peek-mc-tip");
  var elWordPeekMcStats = document.getElementById("word-peek-mc-stats");
  var elWordPeekMcBlurb = document.getElementById("word-peek-mc-blurb");
  var elWordPeekMcWiki = document.getElementById("word-peek-mc-wiki");
  var elWordPeekPronunciation = document.getElementById(
    "word-peek-pronunciation"
  );
  var elWordPeekPronIpaSeg = document.getElementById("word-peek-pron-ipa-seg");
  var elWordPeekPronMid = document.getElementById("word-peek-pron-mid");
  var elWordPeekPronRespellSeg = document.getElementById(
    "word-peek-pron-respell-seg"
  );
  var elWordPeekPronIpa = document.getElementById("word-peek-pron-ipa");
  var elWordPeekPronRespell = document.getElementById(
    "word-peek-pron-respell"
  );
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
      ["\u2192"],
      "Skip to the next word anytime (like the Skip button): no points for this card. Easy key for small hands — one tap, no Shift."
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
    applyWordEmojiToEl(elWordPeekEmoji, item);
    if (elWordPeekWord) elWordPeekWord.textContent = item.word || "";
    if (elWordPeekMetaLine)
      elWordPeekMetaLine.textContent = describeWordPeekMetaLine(item);
    if (elWordPeekMetaRate)
      setWordRatePillForWord(
        elWordPeekMetaRate,
        item.word,
        "word-rate-pill word-rate-pill--peek"
      );
    fillPronunciationUi(
      elWordPeekPronunciation,
      elWordPeekPronIpaSeg,
      elWordPeekPronMid,
      elWordPeekPronRespellSeg,
      elWordPeekPronIpa,
      elWordPeekPronRespell,
      item
    );
    applyMcEncyclopediaUi(
      item,
      elWordPeekMcTip,
      elWordPeekMcStats,
      elWordPeekMcBlurb,
      elWordPeekMcWiki
    );
    elWordPeekModal.hidden = false;
    updateWordPeekFavoriteButton();
    if (elWordPeekSpeak) elWordPeekSpeak.disabled = false;
    if (elWordPeekClose) elWordPeekClose.focus();
  }

  function clearCycleSunAnimTimer() {
    if (cycleSunAnimTimer !== null) {
      window.clearTimeout(cycleSunAnimTimer);
      cycleSunAnimTimer = null;
    }
  }

  function bumpCycleSunAnimGeneration() {
    cycleSunAnimGeneration++;
    return cycleSunAnimGeneration;
  }

  function clearCycleMazeSunAnimState() {
    clearCycleSunAnimTimer();
    bumpCycleSunAnimGeneration();
    if (elCycleMaze) {
      elCycleMaze.classList.remove("cycle-maze--nom", "cycle-maze--miss");
      elCycleMaze.style.removeProperty("--cycle-sun-dx");
      elCycleMaze.style.removeProperty("--cycle-sun-dy");
    }
  }

  function resetQuizCycle() {
    quizCycleEaten = 0;
    quizCycleMarks = [];
    cycleHadWrongOnCard = false;
    quizCycleBombCount = 0;
    if (elCycleMaze) {
      elCycleMaze.classList.remove(
        "cycle-maze--celebrate",
        "cycle-maze--bomb-pulse",
        "cycle-maze--chomper-glow"
      );
    }
    clearCycleMazeSunAnimState();
    if (cycleCelebrateTimer !== null) {
      window.clearTimeout(cycleCelebrateTimer);
      cycleCelebrateTimer = null;
    }
    updateQuizCycleUi();
  }

  function pulseCycleMazeForBomb() {
    if (!elCycleMaze || !quizCycleMazeEnabled || elCycleMaze.hidden) return;
    elCycleMaze.classList.remove("cycle-maze--bomb-pulse");
    void elCycleMaze.offsetWidth;
    elCycleMaze.classList.add("cycle-maze--bomb-pulse");
    window.setTimeout(function () {
      if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--bomb-pulse");
    }, 400);
  }

  /** Correct: active sun flies into fixed chomper; chomper pops larger. */
  function pulseCycleMazeForCorrect() {
    if (
      !isTypingMode() ||
      !quizCycleMazeEnabled ||
      !elCycleMaze ||
      elCycleMaze.hidden
    )
      return;
    playCycleSunNomAnimation();
  }

  function playCycleSunNomAnimation() {
    if (!elCycleMaze || !quizCycleMazeEnabled || elCycleMaze.hidden) return;
    if (!isTypingMode()) return;
    var gen = bumpCycleSunAnimGeneration();
    function run() {
      if (!elCycleMaze || elCycleMaze.hidden) return;
      if (gen !== cycleSunAnimGeneration) return;
      elCycleMaze.classList.remove("cycle-maze--miss", "cycle-maze--nom");
      void elCycleMaze.offsetWidth;
      var glyph =
        elCycleStrip &&
        elCycleStrip.querySelector(".set-pellet--current .set-pellet__glyph");
      var chomp =
        elCycleChomperSlot &&
        elCycleChomperSlot.querySelector(".set-bar__chomper");
      if (glyph && chomp) {
        var gr = glyph.getBoundingClientRect();
        var cr = chomp.getBoundingClientRect();
        var dx =
          cr.left + cr.width / 2 - (gr.left + gr.width / 2);
        var dy =
          cr.top + cr.height / 2 - (gr.top + gr.height / 2);
        elCycleMaze.style.setProperty("--cycle-sun-dx", dx + "px");
        elCycleMaze.style.setProperty("--cycle-sun-dy", dy + "px");
      } else {
        elCycleMaze.style.removeProperty("--cycle-sun-dx");
        elCycleMaze.style.removeProperty("--cycle-sun-dy");
      }
      if (gen !== cycleSunAnimGeneration) return;
      elCycleMaze.classList.add("cycle-maze--nom");
      clearCycleSunAnimTimer();
      cycleSunAnimTimer = window.setTimeout(function () {
        cycleSunAnimTimer = null;
        if (gen !== cycleSunAnimGeneration) return;
        if (elCycleMaze) {
          elCycleMaze.classList.remove("cycle-maze--nom");
          elCycleMaze.style.removeProperty("--cycle-sun-dx");
          elCycleMaze.style.removeProperty("--cycle-sun-dy");
        }
      }, 520);
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(run);
    });
  }

  /** Wrong: current sun fades out (chomper does not grow). */
  function playCycleSunMissAnimation() {
    if (!elCycleMaze || !quizCycleMazeEnabled || elCycleMaze.hidden) return;
    if (!isTypingMode()) return;
    var gen = bumpCycleSunAnimGeneration();
    elCycleMaze.classList.remove("cycle-maze--nom");
    elCycleMaze.style.removeProperty("--cycle-sun-dx");
    elCycleMaze.style.removeProperty("--cycle-sun-dy");
    void elCycleMaze.offsetWidth;
    elCycleMaze.classList.add("cycle-maze--miss");
    clearCycleSunAnimTimer();
    cycleSunAnimTimer = window.setTimeout(function () {
      cycleSunAnimTimer = null;
      if (gen !== cycleSunAnimGeneration) return;
      if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--miss");
    }, 400);
  }

  function chomperScaleFromCorrectCount(n) {
    if (n < 0) n = 0;
    if (n > QUIZ_CYCLE_LEN) n = QUIZ_CYCLE_LEN;
    var lo = CHOMPER_SCALE_MIN;
    var hi = CHOMPER_SCALE_MAX;
    var t = n / QUIZ_CYCLE_LEN;
    /* Linear: 0.5 → 2 over full grid (QUIZ_CYCLE_LEN ✔ marks). */
    return lo + (hi - lo) * t;
  }

  function appendTrailPelletGlyph(pellet, cellIndex) {
    var glyph = document.createElement("span");
    glyph.className = "set-pellet__glyph";
    var item =
      trailPelletPlan && trailPelletPlan.length
        ? trailPelletPlan[cellIndex]
        : null;
    if (item && item.src) {
      glyph.classList.add("set-pellet__glyph--img");
      pellet.classList.add("set-pellet--mc-loot");
      var img = document.createElement("img");
      img.className = "set-pellet__loot-img";
      img.src = item.src;
      img.alt = "";
      img.decoding = "async";
      glyph.appendChild(img);
    } else if (item && item.emoji) {
      pellet.classList.add("set-pellet--mc-loot");
      glyph.textContent = item.emoji;
    } else {
      glyph.textContent = SET_PELLET_GLYPH_FALLBACK;
    }
    glyph.setAttribute("aria-hidden", "true");
    pellet.appendChild(glyph);
  }

  /** @param {"ok"|"soft"} kind */
  function appendCycleMarkGlyph(pellet, kind) {
    var glyph = document.createElement("span");
    glyph.className = "set-pellet__glyph";
    glyph.textContent = kind === "soft" ? MAZE_MARK_CIRCLE : MAZE_MARK_OK;
    glyph.setAttribute("aria-hidden", "true");
    pellet.appendChild(glyph);
  }

  function makeChomperFigure(scale) {
    var wrap = document.createElement("span");
    wrap.className = "set-bar__chomper";
    var sc =
      typeof scale === "number" && !isNaN(scale) && scale > 0 ? scale : CHOMPER_SCALE_MIN;
    wrap.style.transform = "scale(" + sc + ")";
    /* transform-origin from CSS (.cycle-maze .set-bar__chomper) so growth reads toward the trail */
    var img = document.createElement("img");
    img.className = "set-bar__chomper-img";
    img.alt = "";
    img.decoding = "async";
    try {
      img.setAttribute("fetchpriority", "high");
    } catch (e1) {}
    img.loading = "eager";
    var pac = document.createElement("span");
    pac.className = "set-bar__chomper-pac";
    pac.setAttribute("aria-hidden", "true");
    function applySpriteState() {
      if (img.naturalWidth > 0) wrap.classList.add("has-sprite");
      else wrap.classList.remove("has-sprite");
    }
    img.onload = applySpriteState;
    img.onerror = function () {
      wrap.classList.remove("has-sprite");
    };
    wrap.appendChild(img);
    wrap.appendChild(pac);
    img.src = trailMascotImageAbsUrl();
    if (img.complete) applySpriteState();
    return wrap;
  }

  /** Clean-correct (✔) marks in the strip — skip/peek (⭕) advance the trail but do not grow the chomper. */
  function quizCycleOkMarkCount() {
    var n = 0;
    var i;
    for (i = 0; i < quizCycleMarks.length; i++) {
      if (quizCycleMarks[i] === "ok") n++;
    }
    return n;
  }

  /** @param {number} okCount 0..QUIZ_CYCLE_LEN from `quizCycleOkMarkCount` or equivalent */
  function makeChomperNode(okCount) {
    var n =
      typeof okCount === "number" && !isNaN(okCount) ? okCount : 0;
    return makeChomperFigure(chomperScaleFromCorrectCount(n));
  }

  function renderQuizCycleStrip() {
    if (!elCycleStrip || !elCycleStats) return;
    if (!isTypingMode()) return;
    elCycleStrip.replaceChildren();
    elCycleStrip.setAttribute("dir", "ltr");
    if (elCycleMaze) {
      elCycleMaze.classList.toggle(
        "cycle-maze--villain-trail",
        trailMascotIsVillain()
      );
      elCycleMaze.classList.toggle(
        "cycle-maze--hero-trail",
        !trailMascotIsVillain()
      );
    }
    if (elCycleChomperSlot) {
      elCycleChomperSlot.replaceChildren();
      var pop = document.createElement("div");
      pop.className = "cycle-maze__chomper-pop";
      pop.appendChild(makeChomperNode(quizCycleOkMarkCount()));
      elCycleChomperSlot.appendChild(pop);
    }
    var i;
    for (i = 0; i < QUIZ_CYCLE_LEN; i++) {
      var cell = document.createElement("div");
      cell.className = "cycle-maze__cell";
      cell.setAttribute("role", "listitem");
      var pellet = document.createElement("span");
      pellet.className = "set-pellet";
      if (i < quizCycleEaten) {
        pellet.classList.add("set-pellet--eaten");
        var mk = quizCycleMarks[i];
        if (mk === "soft") {
          pellet.classList.add("set-pellet--maze-soft");
          appendCycleMarkGlyph(pellet, "soft");
        } else {
          pellet.classList.add("set-pellet--maze-ok");
          appendCycleMarkGlyph(pellet, "ok");
        }
      } else if (i === quizCycleEaten) {
        cell.classList.add("cycle-maze__cell--current");
        pellet.classList.add("set-pellet--current");
        appendTrailPelletGlyph(pellet, i);
        if (cycleHadWrongOnCard) pellet.classList.add("set-pellet--wrong");
      } else {
        pellet.classList.add("set-pellet--todo");
        appendTrailPelletGlyph(pellet, i);
      }
      cell.appendChild(pellet);
      elCycleStrip.appendChild(cell);
    }
    var mascot = currentTrailMascot();
    var mascotLabel = mascot.name || (mascot.kind === "villain" ? "Mob" : "Hero");
    elCycleStats.textContent =
      mascotLabel +
      " · Trail " +
      quizCycleEaten +
      "/" +
      QUIZ_CYCLE_LEN +
      " · Bombs " +
      quizCycleBombCount;
  }

  function updateQuizCycleUi() {
    if (!elCycleMaze || !elCycleMazeOuter) return;
    if (!isTypingMode() || !current) {
      elCycleMazeOuter.hidden = true;
      elCycleMaze.classList.remove(
        "cycle-maze--villain-trail",
        "cycle-maze--hero-trail"
      );
      return;
    }
    elCycleMazeOuter.hidden = false;
    if (elCycleMazeToggle) {
      elCycleMazeToggle.checked = quizCycleMazeEnabled;
      elCycleMazeToggle.setAttribute(
        "aria-checked",
        quizCycleMazeEnabled ? "true" : "false"
      );
    }
    if (!quizCycleMazeEnabled) {
      elCycleMaze.hidden = true;
      elCycleMaze.classList.remove(
        "cycle-maze--villain-trail",
        "cycle-maze--hero-trail"
      );
      return;
    }
    elCycleMaze.hidden = false;
    renderQuizCycleStrip();
  }

  function onCycleMazeToggleChange() {
    if (!elCycleMazeToggle) return;
    quizCycleMazeEnabled = !!elCycleMazeToggle.checked;
    elCycleMazeToggle.setAttribute(
      "aria-checked",
      quizCycleMazeEnabled ? "true" : "false"
    );
    persistSelections();
    updateQuizCycleUi();
  }

  function onPhoneticMarksToggleChange() {
    if (!elPhoneticMarksToggle) return;
    showPhoneticMarks = !!elPhoneticMarksToggle.checked;
    elPhoneticMarksToggle.setAttribute(
      "aria-checked",
      showPhoneticMarks ? "true" : "false"
    );
    persistSelections();
    applyPronunciationToCard(current);
    if (isWordPeekModalOpen() && wordPeekItem) {
      fillPronunciationUi(
        elWordPeekPronunciation,
        elWordPeekPronIpaSeg,
        elWordPeekPronMid,
        elWordPeekPronRespellSeg,
        elWordPeekPronIpa,
        elWordPeekPronRespell,
        wordPeekItem
      );
    }
  }

  function displayWordEmoji(item) {
    if (!showWordEmoji || !item) return "";
    return item.emoji || "";
  }

  var mcWikiThumbCache = Object.create(null);
  var MC_WIKI_IMG_API =
    "https://minecraft.wiki/api.php?action=query&format=json&formatversion=2&prop=pageimages&pithumbsize=128&origin=*&titles=";

  function wikiThumbFromApiPayload(data) {
    var pages = data && data.query && data.query.pages;
    if (!pages) return null;
    if (Array.isArray(pages)) {
      for (var i = 0; i < pages.length; i++) {
        var row = pages[i];
        if (row && row.thumbnail && row.thumbnail.source) {
          return row.thumbnail.source;
        }
      }
      return null;
    }
    var keys = Object.keys(pages);
    for (var j = 0; j < keys.length; j++) {
      var page = pages[keys[j]];
      if (page && page.thumbnail && page.thumbnail.source) {
        return page.thumbnail.source;
      }
    }
    return null;
  }

  function fetchMcWikiThumbJsonp(pageTitle, done) {
    var key = String(pageTitle != null ? pageTitle : "").trim();
    if (!key) {
      done(null);
      return;
    }
    var cb = "mcWikiThumbCb_" + String(Date.now()) + "_" + Math.floor(Math.random() * 1e6);
    var url =
      MC_WIKI_IMG_API +
      encodeURIComponent(key) +
      "&callback=" +
      encodeURIComponent(cb);
    var script = document.createElement("script");
    var finished = false;
    function finish(thumb) {
      if (finished) return;
      finished = true;
      try {
        delete window[cb];
      } catch (e1) {
        window[cb] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
      mcWikiThumbCache[key] = thumb || false;
      done(thumb);
    }
    window[cb] = function (data) {
      finish(wikiThumbFromApiPayload(data));
    };
    script.src = url;
    script.onerror = function () {
      finish(null);
    };
    document.head.appendChild(script);
    window.setTimeout(function () {
      finish(null);
    }, 12000);
  }

  function isMcWikiPictureMode() {
    return (
      showWordEmoji &&
      (minecraftScope === "include" || minecraftScope === "only")
    );
  }

  function shouldUseMcWikiPicture(item) {
    return (
      !!item &&
      isMinecraftWord(item) &&
      isMcWikiPictureMode() &&
      (String(item.mcImageUrl != null ? item.mcImageUrl : "").trim().length >
        0 ||
        String(item.mcWikiPage != null ? item.mcWikiPage : "").trim().length >
          0)
    );
  }

  function clearWordPictureEl(el) {
    if (!el) return;
    el.textContent = "";
    el.classList.remove("flashcard__emoji--wiki");
    var img = el.querySelector("img");
    if (img) img.remove();
  }

  function showMcWikiPictureOnEl(el, item, src, myGen) {
    if (!el || !src) return;
    clearWordPictureEl(el);
    el.hidden = false;
    el.classList.add("flashcard__emoji--wiki");
    var img = document.createElement("img");
    img.className = "flashcard__emoji-img";
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("error", function onImgErr() {
      img.removeEventListener("error", onImgErr);
      if (el._pictureGen !== myGen) return;
      clearWordPictureEl(el);
      var em = item.emoji || "";
      el.textContent = em;
      el.hidden = !em;
    });
    el.appendChild(img);
  }

  function fetchMcWikiThumb(pageTitle, done) {
    var key = String(pageTitle != null ? pageTitle : "").trim();
    if (!key) {
      done(null);
      return;
    }
    if (mcWikiThumbCache[key] === false) {
      done(null);
      return;
    }
    if (typeof mcWikiThumbCache[key] === "string") {
      done(mcWikiThumbCache[key]);
      return;
    }
    var url = MC_WIKI_IMG_API + encodeURIComponent(key);
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("wiki thumb " + res.status);
        return res.json();
      })
      .then(function (data) {
        var thumb = wikiThumbFromApiPayload(data);
        mcWikiThumbCache[key] = thumb || false;
        done(thumb);
      })
      .catch(function () {
        fetchMcWikiThumbJsonp(key, done);
      });
  }

  function applyWordEmojiToEl(el, item) {
    if (!el) return;
    el._pictureGen = (el._pictureGen || 0) + 1;
    var myGen = el._pictureGen;
    clearWordPictureEl(el);

    if (!showWordEmoji || !item) {
      el.hidden = true;
      return;
    }

    if (shouldUseMcWikiPicture(item)) {
      var embedded = String(
        item.mcImageUrl != null ? item.mcImageUrl : ""
      ).trim();
      if (embedded) {
        showMcWikiPictureOnEl(el, item, embedded, myGen);
        return;
      }
      var page = String(item.mcWikiPage != null ? item.mcWikiPage : "").trim();
      el.hidden = false;
      el.classList.add("flashcard__emoji--wiki");
      el.textContent = item.emoji || "";
      fetchMcWikiThumb(page, function (thumbUrl) {
        if (el._pictureGen !== myGen) return;
        if (thumbUrl) {
          showMcWikiPictureOnEl(el, item, thumbUrl, myGen);
          return;
        }
        clearWordPictureEl(el);
        var em = item.emoji || "";
        el.textContent = em;
        el.hidden = !em;
      });
      return;
    }

    var em = displayWordEmoji(item);
    el.textContent = em;
    el.hidden = !em;
  }

  function refreshWordPictures() {
    applyWordEmojiToEl(elEmoji, current);
    if (isWordPeekModalOpen() && wordPeekItem) {
      applyWordEmojiToEl(elWordPeekEmoji, wordPeekItem);
    }
  }

  function onWordEmojiToggleChange() {
    if (!elWordEmojiToggle) return;
    showWordEmoji = !!elWordEmojiToggle.checked;
    elWordEmojiToggle.setAttribute(
      "aria-checked",
      showWordEmoji ? "true" : "false"
    );
    persistSelections();
    refreshWordPictures();
  }

  function syncMcKidsBlurbFieldVisibility() {
    if (!elMcKidsBlurbField) return;
    elMcKidsBlurbField.hidden = !isMcModeActive();
  }

  function refreshMcEncyclopediaUi() {
    if (current) applyCardMetaForItem(current);
    if (isWordPeekModalOpen() && wordPeekItem) {
      applyMcEncyclopediaUi(
        wordPeekItem,
        elWordPeekMcTip,
        elWordPeekMcStats,
        elWordPeekMcBlurb,
        elWordPeekMcWiki
      );
    }
  }

  function onMcKidsBlurbToggleChange() {
    if (!elMcKidsBlurbToggle) return;
    showMcKidsBlurbs = !!elMcKidsBlurbToggle.checked;
    elMcKidsBlurbToggle.setAttribute(
      "aria-checked",
      showMcKidsBlurbs ? "true" : "false"
    );
    persistSelections();
    refreshMcEncyclopediaUi();
  }

  function triggerQuizCycleCelebrate() {
    if (!elCycleMaze || !quizCycleMazeEnabled || elCycleMaze.hidden) return;
    elCycleMaze.classList.remove("cycle-maze--celebrate");
    void elCycleMaze.offsetWidth;
    elCycleMaze.classList.add("cycle-maze--celebrate");
    if (cycleCelebrateTimer !== null) {
      window.clearTimeout(cycleCelebrateTimer);
    }
    cycleCelebrateTimer = window.setTimeout(function () {
      cycleCelebrateTimer = null;
      if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--celebrate");
    }, 780);
  }

  /**
   * Advance trail one slot. mark "ok" = ✔️ (clean correct), "soft" = ⭕ (peek or skip).
   */
  function bumpQuizCycle(mark) {
    if (!isTypingMode()) return;
    quizCycleMarks.push(mark === "soft" ? "soft" : "ok");
    quizCycleEaten++;
    if (quizCycleEaten >= QUIZ_CYCLE_LEN) {
      triggerQuizCycleCelebrate();
      var nm = trailMascots.length;
      if (nm > 1) {
        eatTrailMascotIndex = (eatTrailMascotIndex + 1) % nm;
      } else if (nm === 1) {
        eatTrailMascotIndex = 0;
      }
      rebuildTrailPelletPlan();
      quizCycleEaten = 0;
      quizCycleMarks = [];
      quizCycleBombCount = 0;
      updateQuizCycleUi();
    }
  }

  function maybeBumpQuizCycleOnSkip() {
    if (!isTypingMode() || advancingQuiz) return;
    bumpQuizCycle("soft");
  }

  function scheduleQuizAdvanceAfterCorrect(isTypeAll) {
    var delay = cheatUsed
      ? QUIZ_SUCCESS_HOLD_PEEK_MS
      : isTypeAll
        ? QUIZ_SUCCESS_HOLD_TYPEALL_MS
        : QUIZ_SUCCESS_HOLD_GAP_MS;
    clearQuizAdvanceTimer();
    advancingQuiz = true;
    syncPrimaryActionButton();
    hideSpellChoicesUi();
    quizAdvanceBumpTimer = window.setTimeout(function () {
      quizAdvanceBumpTimer = null;
      if (isTypingMode()) {
        bumpQuizCycle(cheatUsed ? "soft" : "ok");
        updateQuizCycleUi();
      }
      var waitMore = Math.max(0, delay - QUIZ_TRAIL_NOM_MS);
      quizAdvanceCardTimer = window.setTimeout(function () {
        quizAdvanceCardTimer = null;
        advanceToNewCard(true);
      }, waitMore);
    }, QUIZ_TRAIL_NOM_MS);
  }

  var elCard = document.getElementById("card");
  var elEmoji = document.getElementById("card-emoji");
  var elEnglish = document.getElementById("card-english");
  var elCardWordRow = document.getElementById("card-word-row");
  var elQuizWordRow = document.getElementById("quiz-word-row");
  var elMeta = document.getElementById("card-meta");
  var elMetaLine = document.getElementById("card-meta-line");
  var elMetaRate = document.getElementById("card-meta-rate");
  var elCardMcTip = document.getElementById("card-mc-tip");
  var elCardMcStats = document.getElementById("card-mc-stats");
  var elCardMcBlurb = document.getElementById("card-mc-blurb");
  var elCardMcWiki = document.getElementById("card-mc-wiki");
  var elCardPronunciation = document.getElementById("card-pronunciation");
  var elCardPronIpaSeg = document.getElementById("card-pron-ipa-seg");
  var elCardPronMid = document.getElementById("card-pron-mid");
  var elCardPronRespellSeg = document.getElementById("card-pron-respell-seg");
  var elCardPronIpa = document.getElementById("card-pron-ipa");
  var elCardPronRespell = document.getElementById("card-pron-respell");
  var elDeckHint = document.getElementById("deck-hint");
  var elPointsVal = document.getElementById("points-val");
  var elStreakVal = document.getElementById("streak-val");
  var elTrophyVal = document.getElementById("trophy-val");
  var elTrophyToNext = document.getElementById("trophy-to-next");
  var elTrophyBar = document.getElementById("trophy-bar");
  var elTrophyBarFill = document.getElementById("trophy-bar-fill");
  var elGrade = document.getElementById("grade-filter");
  var elWordType = document.getElementById("word-type-filter");
  var elDeckScope = document.getElementById("deck-scope");
  var elMinecraftScope = document.getElementById("minecraft-filter");
  var elStudyMode = document.getElementById("study-mode");
  var elControlPanel = document.getElementById("control-panel");
  var elControlPanelToggle = document.getElementById("btn-control-panel-toggle");
  var elControlPanelBody = document.getElementById("control-panel-body");
  var elControlPanelSummary = document.getElementById("control-panel-summary");
  var elSeeSlideshowField = document.getElementById("see-slideshow-field");
  var elSeeSlideshowToggle = document.getElementById("see-slideshow-toggle");
  var elQuizGapChoiceField = document.getElementById("quiz-gap-choice-field");
  var elQuizGapChoiceToggle = document.getElementById("quiz-gap-choice-mode");
  var elFavorite = document.getElementById("btn-favorite");
  var elSpeak = document.getElementById("btn-speak");
  var elNext = document.getElementById("btn-next");

  /** Primary footer button: “Next” in See / after a correct answer; “Skip” in quiz when you can pass. */
  function syncPrimaryActionButton() {
    if (!elNext) return;
    if (!current) {
      elNext.textContent = "Next";
      elNext.removeAttribute("title");
      elNext.setAttribute("aria-label", "Next");
      return;
    }
    if (advancingQuiz) {
      elNext.textContent = "Next";
      elNext.title = "Right arrow (\u2192)";
      elNext.setAttribute(
        "aria-label",
        "Next word — right arrow — or wait for auto-advance"
      );
      return;
    }
    if (studyMode === "see") {
      elNext.textContent = "Next";
      elNext.title = "Enter or right arrow (\u2192)";
      elNext.setAttribute(
        "aria-label",
        "Next word — Enter or right arrow"
      );
      return;
    }
    if (studyMode === "quiz" || studyMode === "typeall") {
      elNext.textContent = "Skip";
      elNext.title = "Pass — no points (\u2192)";
      elNext.setAttribute(
        "aria-label",
        "Skip this word — no points — right arrow"
      );
      return;
    }
    elNext.textContent = "Next";
    elNext.removeAttribute("title");
    elNext.setAttribute("aria-label", "Next");
  }
  var elCheat = document.getElementById("btn-cheat");
  var elLoadError = document.getElementById("load-error");

  function fillPronunciationUi(
    wrap,
    segIpa,
    mid,
    segResp,
    textIpa,
    textResp,
    item
  ) {
    if (!wrap) return;

    function hidePronunciationUi() {
      wrap.hidden = true;
      wrap.setAttribute("aria-hidden", "true");
      if (segIpa) segIpa.hidden = true;
      if (mid) mid.hidden = true;
      if (segResp) segResp.hidden = true;
      if (textIpa) textIpa.textContent = "";
      if (textResp) textResp.textContent = "";
    }

    if (!item) {
      hidePronunciationUi();
      return;
    }
    if (!showPhoneticMarks) {
      hidePronunciationUi();
      return;
    }
    var ipa = String(item.ipa != null ? item.ipa : "").trim();
    var resp = String(item.respelling != null ? item.respelling : "").trim();
    if (!ipa && !resp) {
      hidePronunciationUi();
      return;
    }
    wrap.hidden = false;
    wrap.removeAttribute("aria-hidden");
    if (segIpa && textIpa) {
      segIpa.hidden = !ipa;
      textIpa.textContent = ipa;
    }
    if (segResp && textResp) {
      segResp.hidden = !resp;
      textResp.textContent = resp;
    }
    if (mid) mid.hidden = !(ipa && resp);
  }

  function applyPronunciationToCard(item) {
    fillPronunciationUi(
      elCardPronunciation,
      elCardPronIpaSeg,
      elCardPronMid,
      elCardPronRespellSeg,
      elCardPronIpa,
      elCardPronRespell,
      item
    );
  }

  function applyCardMetaForItem(item) {
    if (!elMetaLine || !elMetaRate) return;
    if (!item) {
      elMetaLine.textContent = "";
      if (elMeta) elMeta.classList.remove("flashcard__meta--condensed");
      elMetaRate.textContent = "";
      elMetaRate.className =
        "word-rate-pill word-rate-pill--by-word word-rate--none";
      elMetaRate.removeAttribute("aria-label");
      applyMcEncyclopediaUi(null, elCardMcTip, elCardMcStats, elCardMcBlurb, elCardMcWiki);
      return;
    }
    elMetaLine.textContent = describeCardMetaLine(item);
    if (elMeta) elMeta.classList.add("flashcard__meta--condensed");
    setWordRatePillForWord(
      elMetaRate,
      item.word,
      "word-rate-pill word-rate-pill--by-word"
    );
    applyMcEncyclopediaUi(item, elCardMcTip, elCardMcStats, elCardMcBlurb, elCardMcWiki);
  }

  /** Place meta subtitle directly under the word row (see) or the gap line (quiz / type-all). */
  function positionCardMeta() {
    if (!elMeta || !elCard || !current) return;
    var surf = elCard.querySelector(".flashcard__surface");
    if (!surf) return;
    if (studyMode === "see") {
      if (elCardPronunciation && elCardPronunciation.parentNode === surf) {
        surf.insertBefore(elMeta, elCardPronunciation);
      }
    } else if (studyMode === "quiz" || studyMode === "typeall") {
      if (elSpellZone && elQuizWordRow && elQuizWordRow.parentNode === elSpellZone) {
        var next = elQuizWordRow.nextSibling;
        if (next) elSpellZone.insertBefore(elMeta, next);
        else elSpellZone.appendChild(elMeta);
      }
    }
    if (elCardMcTip && elMeta.parentNode) {
      var afterMeta = elMeta.nextSibling;
      if (afterMeta !== elCardMcTip) {
        elMeta.parentNode.insertBefore(elCardMcTip, afterMeta);
      }
    }
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
    if (elSpellChoiceHint) {
      elSpellChoiceHint.textContent = "";
      elSpellChoiceHint.hidden = true;
    }
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
    if (elSpellChoiceHint) {
      elSpellChoiceHint.textContent = "";
      elSpellChoiceHint.hidden = true;
    }
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

  function clearAnswerCelebrate() {
    if (elCard)
      elCard.classList.remove(
        "flashcard--answer-ok",
        "flashcard--pac-chomp",
        "flashcard--ghost-bump"
      );
    if (elCycleMaze)
      elCycleMaze.classList.remove("cycle-maze--chomper-glow");
    clearCycleMazeSunAnimState();
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
      if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--chomper-glow");
    }
    if (cheatUsed) {
      elSpellInput.classList.add("spell-input-inline--ok");
      if (v === word && v.length > 0) pulseCycleMazeForCorrect();
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
      if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--chomper-glow");
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
      pulseCycleMazeForCorrect();
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

    if (elCycleMaze) elCycleMaze.classList.remove("cycle-maze--chomper-glow");
    elSpellInput.classList.add("spell-input-inline--bad");
    if (quizGapLastWrongCharRecorded !== v) {
      if (!quizAttemptCountedForCard) {
        quizAttemptCountedForCard = true;
        bumpQuizzed(current.word, "gap");
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
    cycleHadWrongOnCard = false;
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
      bumpQuizzed(current.word, "typeall");
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
    pulseCycleMazeForCorrect();
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
      applyWordEmojiToEl(elEmoji, null);
      if (elEnglish) {
        elEnglish.textContent = "";
        elEnglish.hidden = true;
      }
      if (elChineseAside) elChineseAside.textContent = "";
      applyCardMetaForItem(null);
      applyPronunciationToCard(null);
      if (elSpellZone) elSpellZone.hidden = true;
      if (elCardWordRow) elCardWordRow.hidden = true;
      hideSpellChoicesUi();
      if (elCheat) elCheat.hidden = true;
      setFeedback("", null);
      updateQuizCycleUi();
      syncPrimaryActionButton();
      clearSeeSlideshowTimer();
      syncSeeSlideshowFieldVisibility();
      return;
    }

    setCardEnabled(true);
    clearAnswerCelebrate();
    applyWordEmojiToEl(elEmoji, current);
    if (elChineseAside) elChineseAside.textContent = "";

    applyCardMetaForItem(current);
    applyPronunciationToCard(current);

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
      bumpSeen(current.word);
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
      setFeedback("", null);
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
    updateQuizCycleUi();
    if (elCardWordRow) {
      elCardWordRow.hidden = studyMode !== "see";
    }
    positionCardMeta();
    appendCardMetaRateBesideWord();
    syncPrimaryActionButton();
    syncSeeSlideshowFieldVisibility();
    if (studyMode !== "see") clearSeeSlideshowTimer();
  }

  function advanceToNewCard(fromUserTap) {
    clearQuizAdvanceTimer();
    clearSeeSlideshowTimer();
    advancingQuiz = false;
    if (!pool.length) return;
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
    var mcAll = minecraftWordsFrom(allWords);
    if (minecraftScope === "only") {
      pool = mcAll.slice();
    } else {
      var base =
        gradeFilterCap === "all"
          ? allWords.slice()
          : filterByGradeCap(allWords, gradeFilterCap);
      if (minecraftScope === "include") {
        var nonMc = base.filter(function (w) {
          return !isMinecraftWord(w);
        });
        pool = mergeWordPoolsDedupe(nonMc, mcAll);
      } else {
        pool = base;
      }
    }
    if (wordTypeScope !== "all") {
      pool = filterPoolByWordType(
        pool,
        wordTypeScope,
        minecraftScope === "include"
      );
    }
    if (deckScope === "favorites") {
      pool = pool.filter(function (w) {
        return favoriteSet[wordEntryKey(w)];
      });
    }
    if (pool.length > 1) {
      shuffleInPlace(pool);
    }
  }

  function applyPoolHint() {
    if (!elDeckHint) return;
    var tail;
    if (minecraftScope === "only") {
      tail = "Minecraft only · any grade";
    } else {
      tail =
        gradeFilterCap === "all"
          ? "All grades"
          : "Up to Gr " + gradeFilterCap;
      if (minecraftScope === "include") {
        tail += " · + MC any grade";
      }
    }
    var scopeNote = deckScope === "favorites" ? " · Saved deck" : "";
    var typeNote = wordTypeScope !== "all" ? " · One word type" : "";
    if (!pool.length) {
      elDeckHint.textContent =
        "No words match. Try All types, All grades, or All words deck.";
      if (deckScope === "favorites") {
        elDeckHint.textContent +=
          " Save stars on words you want, or widen type/grade.";
      }
      if (minecraftScope === "only") {
        elDeckHint.textContent +=
          " Minecraft-only needs saved MC stars if deck is Saved.";
      }
      return;
    }
    elDeckHint.textContent =
      String(pool.length) + " words · " + tail + scopeNote + typeNote;
  }

  function fillGradeSelect(sortedGrades) {
    if (!elGrade) return;
    while (elGrade.firstChild) elGrade.removeChild(elGrade.firstChild);
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "All grades";
    elGrade.appendChild(allOpt);
    var i;
    for (i = 0; i < sortedGrades.length; i++) {
      var g = sortedGrades[i];
      var opt = document.createElement("option");
      opt.value = g;
      opt.textContent = "Up to Gr " + g;
      elGrade.appendChild(opt);
    }
  }

  function fillWordTypeSelect(options) {
    if (!elWordType) return;
    while (elWordType.firstChild) elWordType.removeChild(elWordType.firstChild);
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent =
      "\ud83d\udcda All types";
    elWordType.appendChild(allOpt);
    var i;
    for (i = 0; i < options.length; i++) {
      var o = options[i];
      var opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent =
        wordCategoryEmoji(typeSlugFromWordTypeOptionValue(o.value)) +
        " " +
        o.label;
      elWordType.appendChild(opt);
    }
  }

  function persistSelections() {
    savePrefs({
      mode: studyMode,
      grade: elGrade ? elGrade.value : "all",
      deck: deckScope,
      wordType: wordTypeScope,
      minecraft: minecraftScope,
      quizGapChoice: quizGapChoiceMode,
      showCycleMaze: quizCycleMazeEnabled,
      showPhoneticMarks: showPhoneticMarks,
      showWordEmoji: showWordEmoji,
      mcKidsBlurbs: showMcKidsBlurbs,
      seeSlideshow: seeSlideshowEnabled,
      controlPanelOpen: controlPanelOpen,
    });
    syncControlPanelUi();
  }

  function onGradeChange() {
    if (!elGrade) return;
    resetQuizCycle();
    gradeFilterCap = elGrade.value || "all";
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
    resetQuizCycle();
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
    resetQuizCycle();
    wordTypeScope = elWordType.value || "all";
    persistSelections();
    cardCount = 1;
    rebuildPool();
    applyPoolHint();
    current = shufflePickDifferent(pool, null);
    prepareRound();
    renderCard(false);
  }

  function syncMinecraftBodyTheme() {
    var mcOn =
      minecraftScope === "include" || minecraftScope === "only";
    document.body.classList.toggle("minecraft-theme", mcOn);
    document.body.classList.toggle(
      "minecraft-theme--only",
      minecraftScope === "only"
    );
    syncMcKidsBlurbFieldVisibility();
    syncArtGalleryFieldVisibility();
    refreshWordPictures();
  }

  function onMinecraftScopeChange() {
    if (!elMinecraftScope) return;
    resetQuizCycle();
    var v = elMinecraftScope.value;
    if (v === "include" || v === "only") minecraftScope = v;
    else minecraftScope = "off";
    syncMinecraftBodyTheme();
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
    resetQuizCycle();
    clearSeeSlideshowTimer();
    var v = elStudyMode.value;
    if (v === "quiz") studyMode = "quiz";
    else if (v === "typeall") studyMode = "typeall";
    else studyMode = "see";
    syncSeeSlideshowFieldVisibility();
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
    updateQuizCycleUi();
  }

  function onFavoriteTap(e) {
    if (e) e.preventDefault();
    if (!current) return;
    toggleFavoriteKey(wordEntryKey(current));
  }

  function onWordPeekFavoriteTap(e) {
    if (e) e.preventDefault();
    if (!wordPeekItem) return;
    toggleFavoriteKey(wordEntryKey(wordPeekItem));
  }

  function onWordPeekSpeak(e) {
    if (e) e.preventDefault();
    if (!wordPeekItem) return;
    speakCardItem(wordPeekItem, true);
  }

  function onHearWord(e) {
    if (e) e.preventDefault();
    if (!current) return;
    clearSeeSlideshowTimer();
    speakCardItem(current, true, seeSlideshowAfterSpeechCallback());
  }

  function onNextCard(e) {
    if (e) e.preventDefault();
    if (!pool.length) return;
    maybeBumpQuizCycleOnSkip();
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
      setFeedback("", null);
      return;
    }
    if (!quizAttemptCountedForCard) {
      quizAttemptCountedForCard = true;
      bumpQuizzed(current.word, "gap");
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
    pulseCycleMazeForCorrect();
    scheduleQuizAdvanceAfterCorrect(false);
  }

  function onSpellKeydown(e) {
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (studyMode === "typeall") {
      e.preventDefault();
      trySubmitTypeAll();
      return;
    }
    if (studyMode === "quiz") {
      e.preventDefault();
      trySubmitSpell();
      return;
    }
    /* See mode: do not swallow Enter — global handler advances to next card. */
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

    if (isArtGalleryModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeArtGalleryModal();
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

    if (
      e.key === "ArrowRight" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      if (isKbdShortcutsModalOpen() || isWordPeekModalOpen() || isArtGalleryModalOpen()) return;
      if (elLoadError && elLoadError.hidden === false) return;
      if (!current || !pool.length) return;
      e.preventDefault();
      maybeBumpQuizCycleOnSkip();
      advanceToNewCard(true);
      return;
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
    return Promise.reject(
      new Error(
        "Missing word list — load words-embed.js before app.js (see index.html)."
      )
    );
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

    if (elGrade) {
      elGrade.addEventListener("change", onGradeChange);
    }
    if (elDeckScope) {
      elDeckScope.addEventListener("change", onDeckScopeChange);
    }
    if (elWordType) {
      elWordType.addEventListener("change", onWordTypeChange);
    }
    if (elMinecraftScope) {
      elMinecraftScope.addEventListener("change", onMinecraftScopeChange);
    }
    if (elStudyMode) {
      elStudyMode.addEventListener("change", onStudyModeChange);
    }
    if (elSeeSlideshowToggle) {
      elSeeSlideshowToggle.addEventListener("change", onSeeSlideshowToggleChange);
    }
    if (elQuizGapChoiceToggle) {
      elQuizGapChoiceToggle.addEventListener("change", onQuizGapChoiceModeChange);
    }
    if (elCycleMazeToggle) {
      elCycleMazeToggle.addEventListener("change", onCycleMazeToggleChange);
    }
    if (elPhoneticMarksToggle) {
      elPhoneticMarksToggle.addEventListener(
        "change",
        onPhoneticMarksToggleChange
      );
    }
    if (elWordEmojiToggle) {
      elWordEmojiToggle.addEventListener("change", onWordEmojiToggleChange);
    }
    if (elMcKidsBlurbToggle) {
      elMcKidsBlurbToggle.addEventListener("change", onMcKidsBlurbToggleChange);
    }
    if (elBtnMcArtGallery) {
      elBtnMcArtGallery.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        openArtGalleryRandom();
      });
    }
    if (elArtGalleryClose) {
      elArtGalleryClose.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        closeArtGalleryModal();
      });
    }
    if (elArtGalleryBackdrop) {
      elArtGalleryBackdrop.addEventListener("click", closeArtGalleryModal);
    }
    if (elArtGalleryShuffle) {
      elArtGalleryShuffle.addEventListener("click", function (e) {
        if (e) e.preventDefault();
        openArtGalleryRandom();
      });
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

    if (elControlPanelToggle) {
      elControlPanelToggle.addEventListener("click", onControlPanelToggleClick);
    }

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

    Promise.all([loadWordData(), loadTrailMascotManifest(), loadArtGallery()])
      .then(function (results) {
        var data = results[0];
        syncArtGalleryFieldVisibility();
        allWords = dedupeWordList(normalizeWordList(data));
        if (!allWords.length) {
          showLoadError("no words in list.");
          return;
        }
        randomTrailMascotsForSession();
        migrateQuizDetailFromLegacy();
        var gradeOpts = gradesPresentSorted(allWords);
        fillGradeSelect(gradeOpts);
        var typeOpts = wordTypeOptionsFromItems(allWords);
        fillWordTypeSelect(typeOpts);

        var prefs = loadPrefs();
        gradeFilterCap = "all";
        if (elGrade) elGrade.value = "all";
        if (prefs && prefs.grade) {
          if (
            prefs.grade === "all" ||
            gradeOpts.indexOf(prefs.grade) !== -1
          ) {
            gradeFilterCap = prefs.grade;
            if (elGrade) elGrade.value = prefs.grade;
          }
        } else if (prefs && prefs.level === "all") {
          gradeFilterCap = "all";
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

        minecraftScope = "off";
        if (elMinecraftScope) elMinecraftScope.value = "off";
        if (
          prefs &&
          (prefs.minecraft === "include" || prefs.minecraft === "only")
        ) {
          minecraftScope = prefs.minecraft;
          if (elMinecraftScope) elMinecraftScope.value = prefs.minecraft;
        }
        syncMinecraftBodyTheme();

        if (prefs && prefs.quizGapChoice === true) {
          quizGapChoiceMode = true;
          if (elQuizGapChoiceToggle) elQuizGapChoiceToggle.checked = true;
          syncQuizGapSwitchAria();
        }

        quizCycleMazeEnabled = !(prefs && prefs.showCycleMaze === false);
        if (elCycleMazeToggle) {
          elCycleMazeToggle.checked = quizCycleMazeEnabled;
          elCycleMazeToggle.setAttribute(
            "aria-checked",
            quizCycleMazeEnabled ? "true" : "false"
          );
        }

        showPhoneticMarks = !!(prefs && prefs.showPhoneticMarks === true);
        if (elPhoneticMarksToggle) {
          elPhoneticMarksToggle.checked = showPhoneticMarks;
          elPhoneticMarksToggle.setAttribute(
            "aria-checked",
            showPhoneticMarks ? "true" : "false"
          );
        }

        showWordEmoji = !(prefs && prefs.showWordEmoji === false);
        if (elWordEmojiToggle) {
          elWordEmojiToggle.checked = showWordEmoji;
          elWordEmojiToggle.setAttribute(
            "aria-checked",
            showWordEmoji ? "true" : "false"
          );
        }
        showMcKidsBlurbs = !(prefs && prefs.mcKidsBlurbs === false);
        if (elMcKidsBlurbToggle) {
          elMcKidsBlurbToggle.checked = showMcKidsBlurbs;
          elMcKidsBlurbToggle.setAttribute(
            "aria-checked",
            showMcKidsBlurbs ? "true" : "false"
          );
        }
        syncMcKidsBlurbFieldVisibility();
        syncArtGalleryFieldVisibility();

        seeSlideshowEnabled = !!(prefs && prefs.seeSlideshow === true);
        if (elSeeSlideshowToggle) {
          elSeeSlideshowToggle.checked = seeSlideshowEnabled;
          elSeeSlideshowToggle.setAttribute(
            "aria-checked",
            seeSlideshowEnabled ? "true" : "false"
          );
        }
        syncSeeSlideshowFieldVisibility();

        controlPanelOpen = !!(prefs && prefs.controlPanelOpen === true);
        syncControlPanelUi();

        rebuildPool();
        applyPoolHint();
        cardCount = 1;
        current = shufflePickDifferent(pool, null);
        prepareRound();
        renderCard(false);
        refreshReviewPanel();
        refreshFavoritePanel();
        updateCoverageStatsUi();
      })
      .catch(function (err) {
        var hint = (err && err.message) || String(err);
        if (
          hint.indexOf("fetch") !== -1 ||
          hint.indexOf("Failed to fetch") !== -1
        ) {
          hint += " · open flashcards via index.html with words-embed.js included.";
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
