/**
 * Reward Overworld — Minecraft-themed star board for kids.
 * Data stays in the browser (localStorage primary; small http(s) cookie mirror as fallback).
 */
(function () {
  "use strict";

  var LS_DATA = "reward_overworld_v2";
  var COOKIE_DATA = "reward_overworld_v1";
  var SCHEMA_VERSION = 2;
  var MAX_PEOPLE = 12;
  var MAX_LEDGER = 2000;

  var MC_ITEMS_LIKE = [];
  var MC_ITEMS_COMMON = [];
  var MC_ITEMS_RARE = [];
  var MC_ITEMS_EPIC = [];
  var MC_ITEMS_DISLIKE = [];
  var MC_ITEMS_DISLIKE_MILD = [];
  var MC_ITEMS_DISLIKE_SEVERE = [];

  var DEFAULT_PERSON_ITEMS = {
    like1: "torch",
    like3: "diamond",
    like5: "netherite",
    dislike1: "slime",
    dislike3: "warden",
  };

  var BEHAVIOR_CATEGORY_PAIRS = [];
  var BEHAVIOR_CATEGORIES = [];
  var categoryByIdMap = {};

  var LEGACY_CATEGORY_IDS = {
    kind: "kind_heart",
    listen: "listening_ears",
    try_hard: "brave_tryer",
    responsible: "helping_hands",
    calm: "clean_up_star",
  };

  function rebuildCategoryIndex() {
    categoryByIdMap = {};
    var i;
    for (i = 0; i < BEHAVIOR_CATEGORIES.length; i++) {
      categoryByIdMap[BEHAVIOR_CATEGORIES[i].id] = BEHAVIOR_CATEGORIES[i];
    }
  }

  function normalizeBehaviorSide(side, kind, pairId) {
    if (!side || typeof side !== "object") return null;
    var id = String(side.id || "").trim();
    var label = String(side.label || "").trim();
    if (!id || !label) return null;
    return {
      id: id,
      label: label,
      wikiKey: String(side.wikiKey || id).trim(),
      src: String(side.src || "").trim(),
      kind: kind,
      pairId: pairId,
    };
  }

  function applyBehaviorCategories(data) {
    var pairs = data && Array.isArray(data.pairs) ? data.pairs : [];
    var flat = [];
    var nextPairs = [];
    var i;
    for (i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var pairId = String(pair.id || "pair_" + i).trim();
      var good = normalizeBehaviorSide(pair.good, "good", pairId);
      var bad = normalizeBehaviorSide(pair.bad, "bad", pairId);
      if (!good || !bad) continue;
      nextPairs.push({ id: pairId, good: good, bad: bad });
      flat.push(good);
      flat.push(bad);
    }
    if (!flat.length) return;
    BEHAVIOR_CATEGORY_PAIRS = nextPairs;
    BEHAVIOR_CATEGORIES = flat;
    rebuildCategoryIndex();
    migrateLedgerCategories();
  }

  function loadBehaviorCategories() {
    if (window.REWARD_BEHAVIOR_CATEGORIES) {
      applyBehaviorCategories(window.REWARD_BEHAVIOR_CATEGORIES);
      return Promise.resolve();
    }
    if (typeof fetch === "undefined") return Promise.resolve();
    var u;
    try {
      u = new URL("assets/behavior_categories.json", document.baseURI).href;
    } catch (e) {
      return Promise.resolve();
    }
    return fetch(u)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data) applyBehaviorCategories(data);
      })
      .catch(function () {});
  }

  var ITEM_SETUP_META = {
    like1: {
      label: "+1 reward · Common",
      hint: "Everyday blocks and goodies — pick your favorite!",
      examples: ["dirt", "coal", "torch", "chest"],
      tier: "common",
      field: "like1",
      next: "like3",
    },
    like3: {
      label: "+3 reward · Rare",
      hint: "Shinier finds — iron, gold, diamonds, and more!",
      examples: ["iron", "gold", "diamond", "emerald"],
      tier: "rare",
      field: "like3",
      next: "like5",
    },
    like5: {
      label: "+5 reward · Epic",
      hint: "Legendary loot — the coolest flex items!",
      examples: ["netherite", "beacon", "crystal", "enchantment"],
      tier: "epic",
      field: "like5",
      next: "dislike1",
    },
    dislike1: {
      label: "−1 oops · Yikes!",
      hint: "Gross traps and creep-outs — pick something icky!",
      examples: ["slime", "mushroom", "dispenser", "gravel"],
      tier: "dislike_mild",
      field: "dislike1",
      next: "dislike3",
    },
    dislike3: {
      label: "−3 oops · BIG YIKES",
      hint: "The scariest stuff — lava, TNT, and big boos!",
      examples: ["lava", "tnt", "sculk", "warden"],
      tier: "dislike_severe",
      field: "dislike3",
      next: null,
    },
  };

  var itemById = {};

  var DEFAULT_CHARACTERS = [
    {
      id: "steve",
      name: "Steve",
      kind: "hero",
      src: "assets/sprites/steve.png",
    },
    {
      id: "alex",
      name: "Alex",
      kind: "hero",
      src: "assets/sprites/alex.png",
    },
    {
      id: "villager",
      name: "Villager",
      kind: "hero",
      src: "assets/sprites/villager.png",
    },
    {
      id: "creeper",
      name: "Creeper",
      kind: "villain",
      src: "assets/sprites/creeper.png",
    },
    {
      id: "zombie",
      name: "Zombie",
      kind: "villain",
      src: "assets/sprites/zombie.png",
    },
  ];

  var characters = [];
  var charById = {};

  var state = {
    version: SCHEMA_VERSION,
    people: [],
    ledger: [],
    dayNotes: [],
    settings: {
      filterPersonId: "all",
      weekStartsOn: "monday",
      statsPeriod: "week",
      leaderboardRange: "week",
      selectedDayKey: "",
    },
  };

  var rewardContext = {
    personId: null,
    step: "category",
    pendingCategoryId: null,
    pendingCategoryLabel: null,
    pendingCategoryKind: null,
  };

  var playerModalDraft = {
    mode: "add",
    editPersonId: null,
    characterId: null,
    charKind: "hero",
    setupStep: "profile",
    like1: DEFAULT_PERSON_ITEMS.like1,
    like3: DEFAULT_PERSON_ITEMS.like3,
    like5: DEFAULT_PERSON_ITEMS.like5,
    dislike1: DEFAULT_PERSON_ITEMS.dislike1,
    dislike3: DEFAULT_PERSON_ITEMS.dislike3,
  };

  /* —— DOM —— */
  var elTabHome = document.getElementById("tab-home");
  var elTabDiary = document.getElementById("tab-diary");
  var elTabStats = document.getElementById("tab-stats");
  var elPanelHome = document.getElementById("panel-home");
  var elPanelDiary = document.getElementById("panel-diary");
  var elPanelStats = document.getElementById("panel-stats");
  var elScoreToday = document.getElementById("score-today");
  var elScoreWeek = document.getElementById("score-week");
  var elScoreMonth = document.getElementById("score-month");
  var elStatsToday = document.getElementById("stats-today");
  var elStatsWeek = document.getElementById("stats-week");
  var elStatsMonth = document.getElementById("stats-month");
  var elStatsAll = document.getElementById("stats-all");
  var elPersonFilter = document.getElementById("person-filter");
  var elPeopleGrid = document.getElementById("people-grid");
  var elEmptyPeople = document.getElementById("empty-people");
  var elTrendChart = document.getElementById("trend-chart");
  var elTrendTitle = document.getElementById("trend-title");
  var elBreakdownTitle = document.getElementById("breakdown-title");
  var elPeriodWeek = document.getElementById("period-week");
  var elPeriodMonth = document.getElementById("period-month");
  var elDayDetailTitle = document.getElementById("day-detail-title");
  var elDayDetailScore = document.getElementById("day-detail-score");
  var elDayEventsList = document.getElementById("day-events-list");
  var elDayNoteFormHome = document.getElementById("day-note-form-home");
  var elDayNoteInputHome = document.getElementById("day-note-input-home");
  var elDayNotesListHome = document.getElementById("day-notes-list-home");
  var elDayNotesEmptyHome = document.getElementById("day-notes-empty-home");
  var elDayNoteFormStats = document.getElementById("day-note-form-stats");
  var elDayNoteInputStats = document.getElementById("day-note-input-stats");
  var elDayNotesListStats = document.getElementById("day-notes-list-stats");
  var elDayNotesEmptyStats = document.getElementById("day-notes-empty-stats");
  var elDayNoteFormDiary = document.getElementById("day-note-form-diary");
  var elDayNoteInputDiary = document.getElementById("day-note-input-diary");
  var elDiaryTimeline = document.getElementById("diary-timeline");
  var elDiaryEmpty = document.getElementById("diary-empty");
  var elDiaryCount = document.getElementById("diary-count");
  var elBtnOpenDiary = document.getElementById("btn-open-diary");
  var elBreakdownList = document.getElementById("breakdown-list");
  var elLeaderboard = document.getElementById("leaderboard");
  var elStatsDiaryFeed = document.getElementById("stats-diary-feed");
  var elStatsDiaryEmpty = document.getElementById("stats-diary-empty");
  var elActivityLog = document.getElementById("activity-log");
  var elEmptyLog = document.getElementById("empty-log");
  var elRewardSheet = document.getElementById("reward-sheet");
  var elRewardBackdrop = document.getElementById("reward-sheet-backdrop");
  var elRewardClose = document.getElementById("reward-sheet-close");
  var elRewardPerson = document.getElementById("reward-sheet-person");
  var elPointAll = document.getElementById("point-picker-all");
  var elRewardStepPoints = document.getElementById("reward-step-points");
  var elRewardStepCategory = document.getElementById("reward-step-category");
  var elRewardPendingSummary = document.getElementById("reward-pending-summary");
  var elCategoryPicker = document.getElementById("category-picker");
  var elRewardStepBack = document.getElementById("reward-step-back");
  var elPersonStatsGrid = document.getElementById("person-stats-grid");
  var elRewardTierHint = document.getElementById("reward-tier-hint");
  var elAddModal = document.getElementById("add-player-modal");
  var elAddBackdrop = document.getElementById("add-player-backdrop");
  var elAddForm = document.getElementById("add-player-form");
  var elAddTitle = document.getElementById("add-player-title");
  var elAddHint = document.getElementById("add-player-hint");
  var elPlayerName = document.getElementById("player-name-input");
  var elItemPickGrid = document.getElementById("item-pick-grid");
  var elItemPickStepLabel = document.getElementById("item-pick-step-label");
  var elItemPickStepHint = document.getElementById("item-pick-step-hint");
  var elItemPickHintExamples = document.getElementById("item-pick-hint-examples");
  var elItemSetupProgress = document.getElementById("item-setup-progress");
  var elProfileSection = document.getElementById("player-profile-section");
  var elItemsWizard = document.getElementById("player-items-wizard");
  var elPlayerSetupNext = document.getElementById("player-setup-next");
  var elItemSetupBack = document.getElementById("item-setup-back");
  var elCharGrid = document.getElementById("char-grid");
  var elCharGridEmpty = document.getElementById("char-grid-empty");
  var elCharTabHero = document.getElementById("char-tab-hero");
  var elCharTabVillain = document.getElementById("char-tab-villain");
  var elAddSave = document.getElementById("add-player-save");
  var elToast = document.getElementById("toast");
  var elImportModal = document.getElementById("import-modal");
  var elImportBackdrop = document.getElementById("import-modal-backdrop");
  var elImportTextarea = document.getElementById("import-textarea");
  var elImportResult = document.getElementById("import-result");
  var elImportCancel = document.getElementById("import-cancel");
  var elImportMerge = document.getElementById("import-merge");
  var elExportModal = document.getElementById("export-modal");
  var elExportBackdrop = document.getElementById("export-modal-backdrop");
  var elExportTextarea = document.getElementById("export-textarea");
  var elExportResult = document.getElementById("export-result");
  var elExportCopy = document.getElementById("export-copy");
  var elExportDownload = document.getElementById("export-download");
  var elExportShare = document.getElementById("export-share");
  var elExportDone = document.getElementById("export-done");
  var elImportFile = document.getElementById("import-file");
  var elImportPickFile = document.getElementById("import-pick-file");
  var exportDraft = { text: "", filename: "" };
  var elCheatFx = document.getElementById("cheat-fx");
  var elCheatHelpModal = document.getElementById("cheat-help-modal");
  var elCheatHelpBackdrop = document.getElementById("cheat-help-backdrop");
  var elCheatHelpClose = document.getElementById("cheat-help-close");
  var elCheatList = document.getElementById("cheat-list");
  var elCheatActions = document.getElementById("cheat-actions");
  var elCheatLaunch = document.getElementById("cheat-launch");

  var CHEAT_DEFS = [
    {
      code: "mine",
      action: "mine",
      label: "⛏️ Mine rain",
      desc: "Shower of minerals and good loot raining from the sky!",
    },
    {
      code: "craft",
      action: "craft",
      label: "⚔️ Craft battle",
      desc: "Two random friends vs mob — they throw blocks until one goes BOOM!",
    },
    {
      code: "?",
      action: "help",
      label: "❓ Cheat list",
      desc: "Show this secret cheat list.",
    },
  ];

  var cheatState = {
    buffer: "",
    lastAt: 0,
    busy: false,
  };

  function isHttpProto() {
    var p = location.protocol;
    return p === "http:" || p === "https:";
  }

  function uid(prefix) {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function wikiFilenamePathSegment(filename) {
    return encodeURIComponent(String(filename).replace(/ /g, "_"));
  }

  function wikiThumbUrlFromFilename(filename, size) {
    var file = String(filename || "").trim();
    if (!file) return "";
    var px = size || 128;
    var seg = wikiFilenamePathSegment(file);
    return "https://minecraft.wiki/images/thumb/" + seg + "/" + px + "px-" + seg;
  }

  function wikiThumbCandidatesFromFilename(filename, size) {
    var file = String(filename || "").trim();
    if (!file) return [];
    var px = size || 128;
    var seg = wikiFilenamePathSegment(file);
    var base = "https://minecraft.wiki/images/thumb/" + seg + "/" + px + "px-";
    var out = [base + seg];
    if (/\.(png|gif|jpe?g)$/i.test(file)) {
      var webpName = file.replace(/\.(png|gif|jpe?g)$/i, ".webp");
      out.push(base + wikiFilenamePathSegment(webpName));
    } else if (/\.webp$/i.test(file)) {
      var pngName = file.replace(/\.webp$/i, ".png");
      out.push(base + wikiFilenamePathSegment(pngName));
    }
    return out;
  }

  function wikiFilePathUrl(filename) {
    return wikiThumbUrlFromFilename(filename, 128);
  }

  function wikiThumbUrlFromSpecialPath(url) {
    var m = String(url || "").match(/Special:FilePath\/([^?#]+)/i);
    if (!m) return "";
    try {
      return wikiThumbUrlFromFilename(decodeURIComponent(m[1]), 128);
    } catch (e) {
      return "";
    }
  }

  function isWebpImageUrl(url) {
    return /\.webp(\?|$)/i.test(String(url || ""));
  }

  function isGifImageUrl(url) {
    return /\.gif(\?|$)/i.test(String(url || ""));
  }

  function sortCandidatesGifFirst(list) {
    var gifs = [];
    var rest = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (isGifImageUrl(list[i])) gifs.push(list[i]);
      else rest.push(list[i]);
    }
    return gifs.concat(rest);
  }

  function imageUrlVariants(url) {
    var u = String(url || "").trim();
    if (!u) return [];
    var out = [];
    var seen = {};
    function add(candidate) {
      var c = String(candidate || "").trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      out.push(c);
    }
    function addWithSwaps(candidate) {
      if (!candidate || !/\/thumb\//i.test(candidate)) {
        add(candidate);
        return;
      }
      if (/\.png(\?|$)/i.test(candidate)) {
        add(swapThumbExtension(candidate, "gif"));
      }
      add(candidate);
      if (!/\.gif(\?|$)/i.test(candidate)) {
        add(swapThumbExtension(candidate, "gif"));
      }
      add(swapThumbExtension(candidate, "webp"));
      if (!/\.png(\?|$)/i.test(candidate)) {
        add(swapThumbExtension(candidate, "png"));
      }
    }
    var thumbFromSpecial = wikiThumbUrlFromSpecialPath(u);
    if (thumbFromSpecial) addWithSwaps(thumbFromSpecial);
    addWithSwaps(u);
    if (isWebpImageUrl(u)) {
      add(u.replace(/\.webp(\?[^#]*)?/i, ".png$1"));
      add(u.replace(/\.webp(\?[^#]*)?/i, ".gif$1"));
    }
    return out;
  }

  function swapThumbExtension(url, ext) {
    var target = String(ext || "png").toLowerCase();
    return String(url || "").replace(
      /(\/[^/?#]+?)\.(webp|png|gif|jpe?g)(\?[^#]*)?(#.*)?$/i,
      function (_all, base, _oldExt, query, hash) {
        return base + "." + target + (query || "") + (hash || "");
      }
    );
  }

  function expandFailedImageUrl(url) {
    var variants = imageUrlVariants(url);
    var i;
    var out = [];
    var seen = {};
    for (i = 0; i < variants.length; i++) {
      if (variants[i] && !seen[variants[i]]) {
        seen[variants[i]] = true;
        out.push(variants[i]);
      }
    }
    return out;
  }

  function resolveWikiThumb(wikiKey) {
    var key = String(wikiKey || "").trim();
    var i;
    var locals;
    if (!key) return "";
    locals = localSpriteCandidates(key);
    for (i = 0; i < locals.length; i++) {
      if (locals[i]) return locals[i];
    }
    if (window.REWARD_WIKI_IMAGES && window.REWARD_WIKI_IMAGES[key]) {
      return window.REWARD_WIKI_IMAGES[key];
    }
    return "";
  }

  function resolveWikiThumbCandidates(wikiKey) {
    var key = String(wikiKey || "").trim();
    var out = [];
    var seen = {};
    var i;
    var locals;
    function add(url) {
      var u = String(url || "").trim();
      if (!u || seen[u]) return;
      seen[u] = true;
      out.push(u);
    }
    locals = localSpriteCandidates(key);
    for (i = 0; i < locals.length; i++) add(locals[i]);
    if (window.REWARD_WIKI_IMAGES && window.REWARD_WIKI_IMAGES[key]) {
      add(window.REWARD_WIKI_IMAGES[key]);
    }
    return sortCandidatesGifFirst(out);
  }

  var mcWikiThumbCache = Object.create(null);
  var mcWikiGifCache = Object.create(null);
  var MC_WIKI_QUERY_API =
    "https://minecraft.wiki/api.php?action=query&format=json&formatversion=2&origin=*&";
  var MC_WIKI_IMG_API =
    MC_WIKI_QUERY_API + "prop=pageimages&pithumbsize=128&titles=";

  function wikiThumbFromApiPayload(data) {
    var pages = data && data.query && data.query.pages;
    var keys;
    var i;
    if (!pages) return null;
    if (Array.isArray(pages)) {
      for (i = 0; i < pages.length; i++) {
        if (pages[i] && pages[i].thumbnail && pages[i].thumbnail.source) {
          return pages[i].thumbnail.source;
        }
      }
      return null;
    }
    keys = Object.keys(pages);
    for (i = 0; i < keys.length; i++) {
      if (
        pages[keys[i]] &&
        pages[keys[i]].thumbnail &&
        pages[keys[i]].thumbnail.source
      ) {
        return pages[keys[i]].thumbnail.source;
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
    if (mcWikiThumbCache[key] === false) {
      done(null);
      return;
    }
    if (typeof mcWikiThumbCache[key] === "string") {
      done(mcWikiThumbCache[key]);
      return;
    }
    var cb =
      "rewardWikiThumbCb_" +
      String(Date.now()) +
      "_" +
      Math.floor(Math.random() * 1e6);
    var url =
      MC_WIKI_IMG_API + encodeURIComponent(key) + "&callback=" + encodeURIComponent(cb);
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

  function scoreWikiGifFilename(name, pageTitle) {
    var n = String(name || "").toLowerCase();
    var p = String(pageTitle || "").toLowerCase().replace(/\s+/g, "");
    if (!/\.gif$/i.test(n)) return -999;
    if (/icon|gui|inventory|screenshot|preview|chunk|render_|pixel|multiplayer|dedicated|disambig|unused|texture sheet/i.test(n)) {
      return -999;
    }
    var score = 0;
    if (p && n.replace(/_/g, "").indexOf(p) >= 0) score += 50;
    String(pageTitle || "")
      .toLowerCase()
      .split(/\s+/)
      .forEach(function (part) {
        if (part && n.indexOf(part) >= 0) score += 15;
      });
    if (/je\d|be\d/i.test(n)) score += 8;
    if (/idle|walk|sniff|ambient|swim/i.test(n)) score += 5;
    score -= n.length * 0.02;
    return score;
  }

  function wikiGifThumbFromImageinfo(data) {
    var pages = data && data.query && data.query.pages;
    var keys;
    var i;
    var info;
    if (!pages) return null;
    if (Array.isArray(pages)) {
      for (i = 0; i < pages.length; i++) {
        info = pages[i] && pages[i].imageinfo && pages[i].imageinfo[0];
        if (info && info.thumburl && /\.gif/i.test(info.thumburl)) {
          return info.thumburl;
        }
      }
      return null;
    }
    keys = Object.keys(pages);
    for (i = 0; i < keys.length; i++) {
      info = pages[keys[i]] && pages[keys[i]].imageinfo && pages[keys[i]].imageinfo[0];
      if (info && info.thumburl && /\.gif/i.test(info.thumburl)) {
        return info.thumburl;
      }
    }
    return null;
  }

  function fetchMcWikiGifJsonp(pageTitle, wikiKey, done) {
    var page = String(pageTitle != null ? pageTitle : "").trim();
    var key = String(wikiKey != null ? wikiKey : page).trim();
    if (!page) {
      done(null);
      return;
    }
    if (mcWikiGifCache[key] === false) {
      done(null);
      return;
    }
    if (typeof mcWikiGifCache[key] === "string") {
      done(mcWikiGifCache[key]);
      return;
    }
    var cbList =
      "rewardWikiGifListCb_" +
      String(Date.now()) +
      "_" +
      Math.floor(Math.random() * 1e6);
    var listUrl =
      MC_WIKI_QUERY_API +
      "prop=images&titles=" +
      encodeURIComponent(page) +
      "&callback=" +
      encodeURIComponent(cbList);
    var listScript = document.createElement("script");
    var finished = false;
    var listTimer;
    var infoTimer;
    function finish(url) {
      if (finished) return;
      finished = true;
      if (listTimer) window.clearTimeout(listTimer);
      if (infoTimer) window.clearTimeout(infoTimer);
      try {
        delete window[cbList];
      } catch (e1) {
        window[cbList] = undefined;
      }
      if (listScript.parentNode) listScript.parentNode.removeChild(listScript);
      mcWikiGifCache[key] = url || false;
      done(url);
    }
    window[cbList] = function (data) {
      var pages = data && data.query && data.query.pages;
      var gifs = [];
      var i;
      var ranked;
      var pick;
      if (!pages || !pages[0] || !pages[0].images) {
        finish(null);
        return;
      }
      for (i = 0; i < pages[0].images.length; i++) {
        var title = String(pages[0].images[i].title || "").replace(/^File:/i, "");
        if (/\.gif$/i.test(title)) gifs.push(title);
      }
      if (!gifs.length) {
        finish(null);
        return;
      }
      ranked = gifs
        .map(function (name) {
          return { name: name, score: scoreWikiGifFilename(name, page) };
        })
        .filter(function (row) {
          return row.score >= 0;
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });
      if (!ranked.length) ranked = gifs.map(function (name) { return { name: name, score: 0 }; });
      pick = ranked[0].name;
      var infoScript = document.createElement("script");
      var cbInfo =
        "rewardWikiGifInfoCb_" +
        String(Date.now()) +
        "_" +
        Math.floor(Math.random() * 1e6);
      window[cbInfo] = function (infoData) {
        try {
          delete window[cbInfo];
        } catch (e2) {
          window[cbInfo] = undefined;
        }
        if (infoScript.parentNode) infoScript.parentNode.removeChild(infoScript);
        finish(wikiGifThumbFromImageinfo(infoData));
      };
      infoScript.onerror = function () {
        try {
          delete window[cbInfo];
        } catch (e3) {
          window[cbInfo] = undefined;
        }
        if (infoScript.parentNode) infoScript.parentNode.removeChild(infoScript);
        finish(null);
      };
      infoScript.src =
        MC_WIKI_QUERY_API +
        "prop=imageinfo&iiprop=url&iiurlwidth=128&titles=" +
        encodeURIComponent("File:" + pick) +
        "&callback=" +
        encodeURIComponent(cbInfo);
      document.head.appendChild(infoScript);
      infoTimer = window.setTimeout(function () {
        try {
          delete window[cbInfo];
        } catch (e4) {
          window[cbInfo] = undefined;
        }
        if (infoScript.parentNode) infoScript.parentNode.removeChild(infoScript);
        finish(null);
      }, 12000);
    };
    listScript.onerror = function () {
      finish(null);
    };
    listScript.src = listUrl;
    document.head.appendChild(listScript);
    listTimer = window.setTimeout(function () {
      finish(null);
    }, 12000);
  }

  function wikiGifKnownForKey(wikiKey) {
    var key = String(wikiKey || "").trim();
    if (!key) return false;
    if (typeof mcWikiGifCache[key] === "string") return true;
    if (window.REWARD_WIKI_GIF_URLS && window.REWARD_WIKI_GIF_URLS[key]) return true;
    if (window.REWARD_WIKI_IMAGES && isGifImageUrl(window.REWARD_WIKI_IMAGES[key])) return true;
    if (window.REWARD_WIKI_GIF_FILES && window.REWARD_WIKI_GIF_FILES[key]) return true;
    if (window.REWARD_EXTRA_WIKI_FILES && /\.gif$/i.test(String(window.REWARD_EXTRA_WIKI_FILES[key] || ""))) {
      return true;
    }
    return false;
  }

  function prefetchAnimatedWikiGifs() {
    var queue = [];
    var seen = {};
    var i;
    var c;
    var arrays;
    var a;
    var item;
    function enqueue(key, page) {
      var k = String(key || "").trim();
      var p = String(page || "").trim();
      if (!k || !p || seen[k] || wikiGifKnownForKey(k)) return;
      seen[k] = true;
      queue.push({ key: k, page: p });
    }
    for (i = 0; i < characters.length; i++) {
      c = characters[i];
      enqueue(c.wikiKey || c.id, c.name);
    }
    arrays = [
      MC_ITEMS_COMMON,
      MC_ITEMS_RARE,
      MC_ITEMS_EPIC,
      MC_ITEMS_DISLIKE_MILD,
      MC_ITEMS_DISLIKE_SEVERE,
    ];
    for (a = 0; a < arrays.length; a++) {
      if (!arrays[a]) continue;
      for (i = 0; i < arrays[a].length; i++) {
        item = arrays[a][i];
        enqueue(item.wikiKey || item.id, item.label);
      }
    }
    var delay = 400;
    for (i = 0; i < queue.length; i++) {
      (function (row) {
        window.setTimeout(function () {
          fetchMcWikiGifJsonp(row.page, row.key, function (url) {
            if (!url) return;
            var j;
            for (j = 0; j < characters.length; j++) {
              if ((characters[j].wikiKey || characters[j].id) === row.key) {
                if (!isGifImageUrl(characters[j].src)) {
                  characters[j].src = url;
                }
              }
            }
          });
        }, delay);
        delay += 350;
      })(queue[i]);
    }
  }

  function mcHeadsSpriteUrl(mhfName, size) {
    var name = String(mhfName || "").trim();
    if (!name) return "";
    return (
      "https://mc-heads.net/avatar/" +
      encodeURIComponent(name) +
      "/" +
      (size || 128) +
      ".png"
    );
  }

  function resolveMhfCandidates(id) {
    var out = [];
    var mhf =
      window.REWARD_CHARACTER_MHF && window.REWARD_CHARACTER_MHF[id];
    if (mhf) out.push(mcHeadsSpriteUrl(mhf, 128));
    return out;
  }

  function localSpriteCandidates(id) {
    var base = "assets/sprites/" + id;
    return [base + ".gif", base + ".png"];
  }

  function isLocalSpritePlaceholder(src, id) {
    var local = String(src || "").trim();
    if (local.indexOf("assets/sprites/") !== 0) return false;
    var base = "assets/sprites/" + id;
    return local === base + ".png" || local === base + ".gif" || local === base + ".webp";
  }

  function spriteSrcCandidates(id, wikiKey, jsonSrc) {
    var candidates = [];
    var seen = {};
    var local = String(jsonSrc || "").trim();
    var key = String(wikiKey || id || "").trim();
    var placeholder = isLocalSpritePlaceholder(local, id);
    var i;

    function push(url) {
      var variants = imageUrlVariants(url);
      var j;
      for (j = 0; j < variants.length; j++) {
        if (!variants[j] || seen[variants[j]]) continue;
        seen[variants[j]] = true;
        candidates.push(variants[j]);
      }
    }

    var wikiList = resolveWikiThumbCandidates(key);
    if (local.indexOf("http://") === 0 || local.indexOf("https://") === 0) {
      push(local);
    }
    for (i = 0; i < wikiList.length; i++) {
      push(wikiList[i]);
    }
    var wiki = wikiList[0] || resolveWikiThumb(key);
    var mhfList = resolveMhfCandidates(id);
    if (local.indexOf("assets/") === 0 && !placeholder) push(local);
    if (wiki && candidates.indexOf(wiki) === -1) push(wiki);
    for (i = 0; i < mhfList.length; i++) {
      push(mhfList[i]);
    }
    if (local.indexOf("assets/") === 0) push(local);
    for (i = 0; i < localSpriteCandidates(id).length; i++) {
      push(localSpriteCandidates(id)[i]);
    }
    if (local && local.indexOf("assets/") !== 0 && local.indexOf("http") !== 0) {
      push(local);
    }
    return sortCandidatesGifFirst(candidates);
  }

  function resolvedSpriteSrc(id, wikiKey, jsonSrc) {
    var candidates = spriteSrcCandidates(id, wikiKey, jsonSrc);
    return candidates[0] || localSpriteCandidates(id)[0];
  }

  function attachSpriteImg(img, id, wikiKey, jsonSrc, wikiPageTitle) {
    var candidates = spriteSrcCandidates(id, wikiKey, jsonSrc);
    var step = 0;
    function markMissing() {
      img.onerror = null;
      img.classList.add("sprite-img--missing");
    }
    img.onerror = function () {
      var failed = img.src || "";
      var extras = expandFailedImageUrl(failed);
      var i;
      for (i = 0; i < extras.length; i++) {
        if (extras[i] && candidates.indexOf(extras[i]) === -1) {
          candidates.push(extras[i]);
        }
      }
      step += 1;
      if (step < candidates.length) {
        img.src = candidates[step];
        return;
      }
      if (!img._wikiGifTried) {
        var gifPage = String(wikiPageTitle || wikiKey || id || "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, function (ch) {
            return ch.toUpperCase();
          });
        if (gifPage) {
          img._wikiGifTried = true;
          fetchMcWikiGifJsonp(gifPage, wikiKey || id, function (gifUrl) {
            if (gifUrl) {
              var gifVariants = imageUrlVariants(gifUrl);
              for (i = 0; i < gifVariants.length; i++) {
                if (gifVariants[i] && candidates.indexOf(gifVariants[i]) === -1) {
                  candidates.push(gifVariants[i]);
                }
              }
              img.src = gifUrl;
            } else if (!img._wikiApiTried) {
              img._wikiApiTried = true;
              fetchMcWikiThumbJsonp(gifPage, function (thumb) {
                if (thumb) {
                  var variants = imageUrlVariants(thumb);
                  for (i = 0; i < variants.length; i++) {
                    if (variants[i] && candidates.indexOf(variants[i]) === -1) {
                      candidates.push(variants[i]);
                    }
                  }
                  img.src = thumb;
                } else {
                  markMissing();
                }
              });
            } else {
              markMissing();
            }
          });
          return;
        }
      }
      markMissing();
    };
    img.src = candidates[0] || "";
  }

  function patchItemSpriteSrc(item) {
    if (!item) return item;
    item.src = resolvedSpriteSrc(item.id, item.wikiKey, item.src);
    return item;
  }

  function patchCharacterSpriteSrc(character) {
    if (!character) return character;
    character.src = resolvedSpriteSrc(
      character.id,
      character.wikiKey || character.id,
      character.src
    );
    return character;
  }

  function normalizeCharacter(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (entry.living === false) return null;
    var id = String(entry.id != null ? entry.id : "").trim();
    var name = String(entry.name != null ? entry.name : "").trim();
    var kind = entry.kind === "villain" ? "villain" : "hero";
    var wikiKey = String(entry.wikiKey != null ? entry.wikiKey : id).trim();
    var src = String(entry.src != null ? entry.src : "").trim();
    if (!id || !name) return null;
    if (!src) src = resolvedSpriteSrc(id, wikiKey, "");
    return patchCharacterSpriteSrc({
      id: id,
      name: name,
      kind: kind,
      wikiKey: wikiKey,
      src: src,
      living: true,
    });
  }

  function normalizeMcItem(entry, tier) {
    if (!entry || typeof entry !== "object") return null;
    var id = String(entry.id != null ? entry.id : "").trim();
    var label = String(entry.label != null ? entry.label : "").trim();
    var wikiKey = String(entry.wikiKey != null ? entry.wikiKey : id).trim();
    var src = String(entry.src != null ? entry.src : "").trim();
    if (!id || !label) return null;
    if (!src) src = resolvedSpriteSrc(id, wikiKey, "");
    return patchItemSpriteSrc({
      id: id,
      label: label,
      src: src,
      wikiKey: wikiKey,
      tier: tier || entry.tier || "common",
    });
  }

  function applyMcItemsList(data) {
    var common = [];
    var rare = [];
    var epic = [];
    var dislikesMild = [];
    var dislikesSevere = [];
    var legacyDislikes = [];
    var likes = [];
    var i;
    if (data && Array.isArray(data.likesCommon)) {
      for (i = 0; i < data.likesCommon.length; i++) {
        var c = normalizeMcItem(data.likesCommon[i], "common");
        if (c) common.push(c);
      }
    }
    if (data && Array.isArray(data.likesRare)) {
      for (i = 0; i < data.likesRare.length; i++) {
        var r = normalizeMcItem(data.likesRare[i], "rare");
        if (r) rare.push(r);
      }
    }
    if (data && Array.isArray(data.likesEpic)) {
      for (i = 0; i < data.likesEpic.length; i++) {
        var e = normalizeMcItem(data.likesEpic[i], "epic");
        if (e) epic.push(e);
      }
    }
    if (data && Array.isArray(data.dislikesMild)) {
      for (i = 0; i < data.dislikesMild.length; i++) {
        var dm = normalizeMcItem(data.dislikesMild[i], "dislike_mild");
        if (dm) dislikesMild.push(dm);
      }
    }
    if (data && Array.isArray(data.dislikesSevere)) {
      for (i = 0; i < data.dislikesSevere.length; i++) {
        var ds = normalizeMcItem(data.dislikesSevere[i], "dislike_severe");
        if (ds) dislikesSevere.push(ds);
      }
    }
    if (data && Array.isArray(data.dislikes)) {
      for (i = 0; i < data.dislikes.length; i++) {
        var d = normalizeMcItem(data.dislikes[i], "dislike");
        if (d) legacyDislikes.push(d);
      }
    }
    if (!dislikesMild.length && !dislikesSevere.length && legacyDislikes.length) {
      var splitAt = Math.ceil(legacyDislikes.length / 2);
      for (i = 0; i < legacyDislikes.length; i++) {
        legacyDislikes[i].tier = i < splitAt ? "dislike_mild" : "dislike_severe";
        if (i < splitAt) dislikesMild.push(legacyDislikes[i]);
        else dislikesSevere.push(legacyDislikes[i]);
      }
    }
    if (!common.length && !rare.length && !epic.length && data && Array.isArray(data.likes)) {
      for (i = 0; i < data.likes.length; i++) {
        var legacy = normalizeMcItem(data.likes[i], "common");
        if (legacy) common.push(legacy);
      }
    }
    if (common.length) MC_ITEMS_COMMON = common;
    if (rare.length) MC_ITEMS_RARE = rare;
    if (epic.length) MC_ITEMS_EPIC = epic;
    if (dislikesMild.length) MC_ITEMS_DISLIKE_MILD = dislikesMild;
    if (dislikesSevere.length) MC_ITEMS_DISLIKE_SEVERE = dislikesSevere;
    MC_ITEMS_DISLIKE = dislikesMild.concat(dislikesSevere);
    likes = common.concat(rare).concat(epic);
    if (likes.length) MC_ITEMS_LIKE = likes;
    rebuildItemIndex();
    migratePeople();
  }

  function loadMcItems() {
    if (window.REWARD_MC_ITEMS) {
      applyMcItemsList(window.REWARD_MC_ITEMS);
      return Promise.resolve();
    }
    if (typeof fetch === "undefined") return Promise.resolve();
    var u;
    try {
      u = new URL("assets/mc_items.json", document.baseURI).href;
    } catch (e) {
      return Promise.resolve();
    }
    return fetch(u)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data) applyMcItemsList(data);
      })
      .catch(function () {});
  }

  function applyCharacterList(list) {
    var out = [];
    var i;
    if (!Array.isArray(list)) list = [];
    for (i = 0; i < list.length; i++) {
      var c = normalizeCharacter(list[i]);
      if (c) out.push(c);
    }
    if (!out.length) out = DEFAULT_CHARACTERS.slice();
    characters = out;
    rebuildCharIndex();
  }

  function firstCharIdForKind(kind) {
    var i;
    for (i = 0; i < characters.length; i++) {
      if (characters[i].kind === kind) return characters[i].id;
    }
    return null;
  }

  function rebuildCharIndex() {
    charById = {};
    var i;
    for (i = 0; i < characters.length; i++) {
      charById[characters[i].id] = characters[i];
    }
  }

  function characterById(id) {
    return charById[id] || null;
  }

  function loadCharacters() {
    if (window.REWARD_CHARACTERS && window.REWARD_CHARACTERS.length) {
      applyCharacterList(window.REWARD_CHARACTERS);
      return Promise.resolve();
    }
    applyCharacterList(DEFAULT_CHARACTERS);
    if (typeof fetch === "undefined") return Promise.resolve();
    var u;
    try {
      u = new URL("assets/characters.json", document.baseURI).href;
    } catch (e) {
      return Promise.resolve();
    }
    return fetch(u)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (data && Array.isArray(data.characters) && data.characters.length) {
          applyCharacterList(data.characters);
        }
      })
      .catch(function () {});
  }

  var COOKIE_MAX_BYTES = 3500;
  var saveStateFailed = false;

  function readCookieStateRaw() {
    if (!isHttpProto()) return null;
    var all = document.cookie.split("; ");
    var i;
    for (i = 0; i < all.length; i++) {
      var ix = all[i].indexOf("=");
      if (ix === -1) continue;
      if (all[i].slice(0, ix) === COOKIE_DATA) {
        try {
          return decodeURIComponent(all[i].slice(ix + 1));
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function readLocalStateRaw() {
    var raw = null;
    try {
      raw = localStorage.getItem(LS_DATA);
    } catch (e) {}
    if (!raw) {
      try {
        raw = localStorage.getItem("reward_overworld_v1");
      } catch (e2) {}
    }
    return raw;
  }

  function stateRawScore(raw) {
    var parsed;
    var ledgerLen;
    if (!raw) return -1;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return -1;
    }
    if (!parsed || !Array.isArray(parsed.people)) return -1;
    ledgerLen = Array.isArray(parsed.ledger)
      ? parsed.ledger.length
      : Array.isArray(parsed.events)
        ? parsed.events.length
        : 0;
    return parsed.people.length * 100000 + ledgerLen + (parsed.savedAt || 0) / 1e15;
  }

  function pickBestStateRaw(localRaw, cookieRaw) {
    if (localRaw && !cookieRaw) return localRaw;
    if (!localRaw && cookieRaw) return cookieRaw;
    if (!localRaw && !cookieRaw) return null;
    return stateRawScore(localRaw) >= stateRawScore(cookieRaw) ? localRaw : cookieRaw;
  }

  function clearStateCookie() {
    if (!isHttpProto()) return;
    try {
      document.cookie =
        COOKIE_DATA + "=;path=/;max-age=0;SameSite=Lax";
    } catch (e) {}
  }

  function saveState() {
    if (state.ledger.length > MAX_LEDGER) {
      state.ledger = state.ledger.slice(-MAX_LEDGER);
    }
    state.version = SCHEMA_VERSION;
    state.savedAt = Date.now();
    var str = JSON.stringify(state);
    var saved = false;
    try {
      localStorage.setItem(LS_DATA, str);
      saved = true;
      saveStateFailed = false;
    } catch (e) {
      saveStateFailed = true;
      warnSaveFailedOnce();
    }
    if (isHttpProto()) {
      if (str.length < COOKIE_MAX_BYTES) {
        try {
          document.cookie =
            COOKIE_DATA +
            "=" +
            encodeURIComponent(str) +
            ";path=/;max-age=" +
            365 * 86400 +
            ";SameSite=Lax";
        } catch (e2) {}
      } else {
        clearStateCookie();
      }
    }
    return saved;
  }

  function warnSaveFailedOnce() {
    if (!saveStateFailed || warnSaveFailedOnce._shown) return;
    warnSaveFailedOnce._shown = true;
    showToast(
      "Could not save in this browser — export a backup now.",
      "oops"
    );
  }

  function loadState() {
    var localRaw = readLocalStateRaw();
    var cookieRaw = readCookieStateRaw();
    var raw = pickBestStateRaw(localRaw, cookieRaw);
    if (!raw) {
      ensureSettingsDefaults();
      return;
    }
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.people)) {
        state.people = parsed.people;
        state.dayNotes = Array.isArray(parsed.dayNotes) ? parsed.dayNotes : [];
        if (parsed.settings) {
          state.settings = parsed.settings;
        }
        if (Array.isArray(parsed.ledger)) {
          state.ledger = parsed.ledger;
        } else if (Array.isArray(parsed.events)) {
          state.ledger = parsed.events;
        } else {
          state.ledger = [];
        }
        migrateToLedger();
      }
    } catch (e3) {}
    ensureSettingsDefaults();
    migratePeople();
    migrateToLedger();
    if (raw === cookieRaw && !localRaw) {
      saveState();
    } else if (localRaw && cookieRaw && raw === localRaw && cookieRaw !== localRaw) {
      saveState();
    }
  }

  function ensureSettingsDefaults() {
    if (!state.dayNotes) state.dayNotes = [];
    if (!state.settings) state.settings = {};
    if (!state.settings.statsPeriod) state.settings.statsPeriod = "week";
    if (!state.settings.leaderboardRange) state.settings.leaderboardRange = "week";
    if (!state.settings.selectedDayKey) {
      state.settings.selectedDayKey = dayKeyFromTs(Date.now());
    }
    if (!state.settings.filterPersonId) state.settings.filterPersonId = "all";
    if (!state.settings.personStatsExpanded) state.settings.personStatsExpanded = {};
  }

  function isPersonStatsExpanded(personId) {
    return !!(
      state.settings.personStatsExpanded &&
      state.settings.personStatsExpanded[personId]
    );
  }

  function setPersonStatsExpanded(personId, open) {
    if (!state.settings.personStatsExpanded) {
      state.settings.personStatsExpanded = {};
    }
    if (open) state.settings.personStatsExpanded[personId] = true;
    else delete state.settings.personStatsExpanded[personId];
    saveState();
  }

  function dayKeyFromTs(ts) {
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return y + "-" + m + "-" + day;
  }

  function startOfDayKey(dayKey) {
    var parts = String(dayKey).split("-");
    if (parts.length !== 3) return startOfDay(Date.now());
    var d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function formatDayKeyLong(dayKey) {
    var ts = startOfDayKey(dayKey);
    var todayKey = dayKeyFromTs(Date.now());
    if (dayKey === todayKey) return "Today";
    var yesterday = dayKeyFromTs(Date.now() - 86400000);
    if (dayKey === yesterday) return "Yesterday";
    return new Date(ts).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function startOfMonth(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(1);
    return x.getTime();
  }

  function statsPeriod() {
    return state.settings.statsPeriod === "month" ? "month" : "week";
  }

  function leaderboardRange() {
    var r = state.settings.leaderboardRange || "week";
    if (r === "today" || r === "week" || r === "month" || r === "all") return r;
    return "week";
  }

  function rangeStartTs(range) {
    var now = Date.now();
    if (range === "today") return startOfDay(now);
    if (range === "week") return startOfWeek(now);
    if (range === "month") return startOfMonth(now);
    return 0;
  }

  function eventsInRange(range, personId) {
    var evs = eventsForFilter(personId);
    var from = rangeStartTs(range);
    if (range === "all") return evs;
    var to = range === "today" ? from + 86400000 : nowTsEnd();
    return evs.filter(function (ev) {
      return ev.ts >= from && ev.ts < to;
    });
  }

  function nowTsEnd() {
    return Date.now() + 1;
  }

  function scoreForRange(range, personId) {
    var evs = personId != null ? state.ledger.filter(function (e) { return e.personId === personId; }) : eventsForFilter();
    var from = rangeStartTs(range);
    if (range === "all") return sumPoints(evs);
    if (range === "today") return sumPointsInRange(evs, from, from + 86400000);
    return sumPointsInRange(evs, from, nowTsEnd());
  }

  function buildItemBreakdown(events) {
    var map = {};
    var i;
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      var id = lootIdFromEntry(ev);
      var label = itemDisplay(id);
      var key = id + "|" + ev.points;
      if (!map[key]) {
        map[key] = {
          id: id,
          label: label,
          points: ev.points,
          count: 0,
          total: 0,
        };
      }
      map[key].count += 1;
      map[key].total += ev.points;
    }
    var out = [];
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
    }
    out.sort(function (a, b) {
      return Math.abs(b.total) - Math.abs(a.total) || b.count - a.count;
    });
    return out;
  }

  function selectedDayKey() {
    return state.settings.selectedDayKey || dayKeyFromTs(Date.now());
  }

  function setSelectedDayKey(dayKey) {
    state.settings.selectedDayKey = dayKey;
    saveState();
    renderDayDetail();
    renderTrendChart();
  }

  function formatNoteTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function notesMatchingFilter() {
    var pid = filterPersonId();
    var out = [];
    var i;
    for (i = 0; i < state.dayNotes.length; i++) {
      var n = state.dayNotes[i];
      if (pid === "all") {
        out.push(n);
      } else if (!n.personId || n.personId === pid) {
        out.push(n);
      }
    }
    out.sort(function (a, b) {
      return b.ts - a.ts;
    });
    return out;
  }

  function groupNotesByDay(notes) {
    var map = {};
    var order = [];
    var i;
    for (i = 0; i < notes.length; i++) {
      var key = notes[i].dayKey;
      if (!map[key]) {
        map[key] = [];
        order.push(key);
      }
      map[key].push(notes[i]);
    }
    order.sort(function (a, b) {
      return startOfDayKey(b) - startOfDayKey(a);
    });
    var groups = [];
    for (i = 0; i < order.length; i++) {
      var dayKey = order[i];
      map[dayKey].sort(function (a, b) {
        return b.ts - a.ts;
      });
      groups.push({ dayKey: dayKey, notes: map[dayKey] });
    }
    return groups;
  }

  function renderDiaryNoteEntry(note, listEl, showPerson) {
    var li = document.createElement("li");
    li.className = "diary-entry";
    var body = document.createElement("div");
    body.className = "diary-entry__body";
    var text = document.createElement("p");
    text.className = "diary-entry__text";
    text.textContent = note.text;
    body.appendChild(text);
    var meta = document.createElement("p");
    meta.className = "diary-entry__meta";
    var metaParts = [formatNoteTime(note.ts)];
    if (showPerson && note.personId) {
      var person = personById(note.personId);
      if (person) metaParts.push(personDisplayLabel(person));
    }
    meta.textContent = metaParts.join(" · ");
    body.appendChild(meta);
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "day-notes-list__remove";
    rm.textContent = "✕";
    rm.setAttribute("aria-label", "Remove diary entry");
    rm.addEventListener("click", function () {
      removeDayNote(note.id);
      renderDayNotesPanels();
      renderStatsDiary();
      renderDiaryTimeline();
      showToast("Diary entry removed.");
    });
    li.appendChild(body);
    li.appendChild(rm);
    listEl.appendChild(li);
  }

  function renderDiaryTimeline() {
    if (!elDiaryTimeline) return;
    elDiaryTimeline.replaceChildren("");
    var notes = notesMatchingFilter();
    var groups = groupNotesByDay(notes);
    var showPerson = filterPersonId() === "all";
    if (elDiaryEmpty) elDiaryEmpty.hidden = groups.length > 0;
    if (elDiaryCount) {
      if (groups.length) {
        elDiaryCount.hidden = false;
        elDiaryCount.textContent =
          notes.length +
          " " +
          (notes.length === 1 ? "entry" : "entries") +
          " across " +
          groups.length +
          " " +
          (groups.length === 1 ? "day" : "days");
      } else {
        elDiaryCount.hidden = true;
      }
    }
    var i;
    for (i = 0; i < groups.length; i++) {
      (function (group) {
        var section = document.createElement("section");
        section.className = "diary-day";
        var head = document.createElement("button");
        head.type = "button";
        head.className = "diary-day__head";
        head.textContent = formatDayKeyLong(group.dayKey);
        head.addEventListener("click", function () {
          setView("stats");
          setSelectedDayKey(group.dayKey);
        });
        section.appendChild(head);
        var list = document.createElement("ul");
        list.className = "diary-day__entries";
        var j;
        for (j = 0; j < group.notes.length; j++) {
          renderDiaryNoteEntry(group.notes[j], list, showPerson);
        }
        section.appendChild(list);
        elDiaryTimeline.appendChild(section);
      })(groups[i]);
    }
  }

  function notesForDay(dayKey) {
    var pid = filterPersonId();
    var out = [];
    var i;
    for (i = 0; i < state.dayNotes.length; i++) {
      var n = state.dayNotes[i];
      if (n.dayKey !== dayKey) continue;
      if (pid === "all") {
        out.push(n);
      } else if (!n.personId || n.personId === pid) {
        out.push(n);
      }
    }
    out.sort(function (a, b) {
      return a.ts - b.ts;
    });
    return out;
  }

  function addDayNote(dayKey, text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) return false;
    var pid = filterPersonId();
    state.dayNotes.push({
      id: uid("note"),
      dayKey: dayKey,
      personId: pid === "all" ? null : pid,
      text: trimmed,
      ts: Date.now(),
    });
    saveState();
    return true;
  }

  function removeDayNote(noteId) {
    state.dayNotes = state.dayNotes.filter(function (n) {
      return n.id !== noteId;
    });
    saveState();
  }

  function renderDayNotesList(listEl, emptyEl, dayKey) {
    if (!listEl) return;
    listEl.replaceChildren();
    var notes = notesForDay(dayKey);
    if (emptyEl) emptyEl.hidden = notes.length > 0;
    var showPerson = filterPersonId() === "all";
    var i;
    for (i = 0; i < notes.length; i++) {
      (function (note) {
        var li = document.createElement("li");
        li.className = "day-notes-list__item";
        var body = document.createElement("div");
        body.className = "day-notes-list__text";
        var text = document.createElement("span");
        text.textContent = note.text;
        body.appendChild(text);
        var meta = document.createElement("div");
        meta.className = "day-notes-list__meta";
        var metaParts = [formatNoteTime(note.ts)];
        if (showPerson && note.personId) {
          var person = personById(note.personId);
          if (person) metaParts.push(personDisplayLabel(person));
        }
        meta.textContent = metaParts.join(" · ");
        body.appendChild(meta);
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "day-notes-list__remove";
        rm.textContent = "✕";
        rm.setAttribute("aria-label", "Remove diary entry");
        rm.addEventListener("click", function () {
          removeDayNote(note.id);
          renderDayNotesPanels();
          showToast("Diary entry removed.");
        });
        li.appendChild(body);
        li.appendChild(rm);
        listEl.appendChild(li);
      })(notes[i]);
    }
  }

  function renderDayNotesPanels() {
    var todayKey = dayKeyFromTs(Date.now());
    renderDayNotesList(elDayNotesListHome, elDayNotesEmptyHome, todayKey);
    renderDayNotesList(
      elDayNotesListStats,
      elDayNotesEmptyStats,
      selectedDayKey()
    );
    renderDiaryTimeline();
    renderStatsDiary();
  }

  function eventsForDay(dayKey) {
    var start = startOfDayKey(dayKey);
    var end = start + 86400000;
    return eventsForFilter().filter(function (ev) {
      return ev.ts >= start && ev.ts < end;
    });
  }

  function renderDayDetail() {
    var dayKey = selectedDayKey();
    if (elDayDetailTitle) {
      elDayDetailTitle.textContent = formatDayKeyLong(dayKey);
    }
    var net = sumPointsInRange(
      eventsForFilter(),
      startOfDayKey(dayKey),
      startOfDayKey(dayKey) + 86400000
    );
    if (elDayDetailScore) {
      elDayDetailScore.textContent = formatScore(net) + " ⭐ this day";
      elDayDetailScore.style.color = net < 0 ? "var(--oops)" : "var(--green)";
    }
    renderDayNotesList(elDayNotesListStats, elDayNotesEmptyStats, dayKey);
    if (!elDayEventsList) return;
    elDayEventsList.replaceChildren();
    var evs = eventsForDay(dayKey).sort(function (a, b) {
      return b.ts - a.ts;
    });
    var i;
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var person = personById(ev.personId);
      var li = document.createElement("li");
      li.className = "day-events-list__item";
      var lbl = document.createElement("span");
      lbl.className = "day-events-list__label event-detail";
      if (person) {
        lbl.appendChild(
          document.createTextNode(personDisplayLabel(person) + " · ")
        );
      }
      appendEventDetail(lbl, ev, { size: 18 });
      var pts = document.createElement("span");
      pts.className =
        ev.points >= 0
          ? "day-events-list__pts--good"
          : "day-events-list__pts--oops";
      pts.textContent = formatScore(ev.points);
      li.appendChild(lbl);
      li.appendChild(pts);
      elDayEventsList.appendChild(li);
    }
    if (!evs.length) {
      var empty = document.createElement("li");
      empty.className = "day-events-list__item";
      empty.textContent = "No stars logged this day.";
      elDayEventsList.appendChild(empty);
    }
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function startOfWeek(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    var day = x.getDay();
    var offset = day === 0 ? 6 : day - 1;
    if (state.settings.weekStartsOn === "sunday") {
      offset = day;
    }
    x.setDate(x.getDate() - offset);
    return x.getTime();
  }

  function filterPersonId() {
    return state.settings.filterPersonId || "all";
  }

  function eventsForFilter(personId) {
    var pid = personId != null ? personId : filterPersonId();
    if (pid === "all") return state.ledger.slice();
    return state.ledger.filter(function (ev) {
      return ev.personId === pid;
    });
  }

  function sumPoints(events) {
    var total = 0;
    var i;
    for (i = 0; i < events.length; i++) {
      total += events[i].points;
    }
    return total;
  }

  function sumPointsInRange(events, fromTs, toTs) {
    var total = 0;
    var i;
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.ts >= fromTs && ev.ts < toTs) total += ev.points;
    }
    return total;
  }

  function formatScore(n) {
    if (n > 0) return "+" + n;
    return String(n);
  }

  function applyScoreEl(el, n) {
    if (!el) return;
    el.textContent = formatScore(n);
    el.classList.toggle("score-strip__val--neg", n < 0);
  }

  function personById(id) {
    var i;
    for (i = 0; i < state.people.length; i++) {
      if (state.people[i].id === id) return state.people[i];
    }
    return null;
  }

  function rebuildItemIndex() {
    itemById = {};
    var i;
    for (i = 0; i < MC_ITEMS_LIKE.length; i++) {
      itemById[MC_ITEMS_LIKE[i].id] = MC_ITEMS_LIKE[i];
    }
    for (i = 0; i < MC_ITEMS_DISLIKE_MILD.length; i++) {
      itemById[MC_ITEMS_DISLIKE_MILD[i].id] = MC_ITEMS_DISLIKE_MILD[i];
    }
    for (i = 0; i < MC_ITEMS_DISLIKE_SEVERE.length; i++) {
      itemById[MC_ITEMS_DISLIKE_SEVERE[i].id] = MC_ITEMS_DISLIKE_SEVERE[i];
    }
  }

  function mcItemById(id) {
    return itemById[id] || null;
  }

  function defaultPersonItems() {
    return {
      like1: DEFAULT_PERSON_ITEMS.like1,
      like3: DEFAULT_PERSON_ITEMS.like3,
      like5: DEFAULT_PERSON_ITEMS.like5,
      dislike1: DEFAULT_PERSON_ITEMS.dislike1,
      dislike3: DEFAULT_PERSON_ITEMS.dislike3,
    };
  }

  function itemsForSetupStep(step) {
    if (step === "like1") return MC_ITEMS_COMMON;
    if (step === "like3") return MC_ITEMS_RARE;
    if (step === "like5") return MC_ITEMS_EPIC;
    if (step === "dislike1") return MC_ITEMS_DISLIKE_MILD;
    if (step === "dislike3") return MC_ITEMS_DISLIKE_SEVERE;
    return [];
  }

  function itemInTierList(id, tier) {
    var list = itemsForSetupStep(
      tier === "common"
        ? "like1"
        : tier === "rare"
          ? "like3"
          : tier === "epic"
            ? "like5"
            : tier === "dislike_mild"
              ? "dislike1"
              : tier === "dislike_severe"
                ? "dislike3"
                : tier === "dislike"
                  ? "dislike1"
                  : ""
    );
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return true;
    }
    if (tier === "dislike") {
      list = itemsForSetupStep("dislike3");
      for (i = 0; i < list.length; i++) {
        if (list[i].id === id) return true;
      }
    }
    return false;
  }

  function personItemsSummary(person) {
    if (!person || !person.items) return "";
    return (
      "+1 " +
      itemDisplay(person.items.like1) +
      " · +3 " +
      itemDisplay(person.items.like3) +
      " · +5 " +
      itemDisplay(person.items.like5) +
      " · −1 " +
      itemDisplay(person.items.dislike1) +
      " · −3 " +
      itemDisplay(person.items.dislike3)
    );
  }

  function itemLabel(id) {
    var item = mcItemById(id);
    return item ? item.label : id || "?";
  }

  function itemDisplay(id) {
    return itemLabel(id);
  }

  function appendCategoryImg(parent, cat, className, size) {
    if (!parent || !cat) return null;
    var img = document.createElement("img");
    img.className = className || "category-chip__img";
    img.alt = cat.label || "";
    img.loading = "lazy";
    img.decoding = "async";
    var px = size || 40;
    img.width = px;
    img.height = px;
    attachSpriteImg(img, cat.id, cat.wikiKey, cat.src || "");
    parent.appendChild(img);
    return img;
  }

  function categoriesForPoints(points) {
    var good = points >= 0;
    return BEHAVIOR_CATEGORIES.filter(function (cat) {
      return good ? cat.kind === "good" : cat.kind === "bad";
    });
  }

  function statsRowForCategory(catId, stats) {
    var i;
    for (i = 0; i < stats.length; i++) {
      if (stats[i].id === catId) return stats[i];
    }
    return {
      id: catId,
      label: "",
      positive: 0,
      negative: 0,
      net: 0,
      count: 0,
    };
  }

  function behaviorCategoryById(id) {
    return categoryByIdMap[id] || null;
  }

  function resolveLegacyCategoryId(id) {
    if (!id) return id;
    if (categoryByIdMap[id]) return id;
    if (LEGACY_CATEGORY_IDS[id]) return LEGACY_CATEGORY_IDS[id];
    return id;
  }

  function categoryDisplay(entry) {
    if (!entry) return "";
    var cat = behaviorCategoryById(resolveLegacyCategoryId(entry.categoryId));
    return cat ? cat.label : "";
  }

  function eventItemAndCategory(entry) {
    var item = itemDisplay(lootIdFromEntry(entry));
    var cat = categoryDisplay(entry);
    return cat ? cat + " · " + item : item;
  }

  function buildCategoryStats(events) {
    var rows = [];
    var i;
    for (i = 0; i < BEHAVIOR_CATEGORIES.length; i++) {
      rows.push({
        id: BEHAVIOR_CATEGORIES[i].id,
        label: BEHAVIOR_CATEGORIES[i].label,
        kind: BEHAVIOR_CATEGORIES[i].kind,
        pairId: BEHAVIOR_CATEGORIES[i].pairId,
        wikiKey: BEHAVIOR_CATEGORIES[i].wikiKey,
        positive: 0,
        negative: 0,
        net: 0,
        count: 0,
      });
    }
    var other = {
      id: "other",
      label: "Other",
      kind: "other",
      positive: 0,
      negative: 0,
      net: 0,
      count: 0,
    };
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      var catId = resolveLegacyCategoryId(ev.categoryId);
      var row = behaviorCategoryById(catId);
      var bucket = row
        ? rows.filter(function (r) {
            return r.id === catId;
          })[0]
        : other;
      if (!bucket) bucket = other;
      bucket.count += 1;
      bucket.net += ev.points;
      if (ev.points >= 0) bucket.positive += ev.points;
      else bucket.negative += ev.points;
    }
    if (other.count) rows.push(other);
    rows.sort(function (a, b) {
      return b.net - a.net || b.positive - a.positive;
    });
    return rows;
  }

  function appendCharacterImg(parent, character, className, size) {
    if (!parent || !character) return null;
    var img = document.createElement("img");
    img.className = className || "";
    img.alt = character.name || "";
    if (size) {
      img.width = size;
      img.height = size;
    }
    attachSpriteImg(img, character.id, character.wikiKey || character.id, character.src, character.name);
    parent.appendChild(img);
    return img;
  }

  function appendMcItemImg(parent, item, className) {
    if (!parent) return;
    var img = document.createElement("img");
    img.className = className || "item-pick__img";
    img.alt = item ? item.label : "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 48;
    img.height = 48;
    if (item) {
      attachSpriteImg(img, item.id, item.wikiKey, item.src);
    }
    parent.appendChild(img);
  }

  function createItemInline(itemOrId, options) {
    options = options || {};
    var item =
      itemOrId && typeof itemOrId === "object"
        ? itemOrId
        : mcItemById(itemOrId);
    var wrap = document.createElement("span");
    wrap.className = options.className || "item-inline";
    var imgSize = options.size || 20;
    if (item) {
      var img = document.createElement("img");
      img.className = options.imgClass || "item-inline__img";
      img.alt = item.label;
      img.width = imgSize;
      img.height = imgSize;
      img.loading = "lazy";
      img.decoding = "async";
      attachSpriteImg(img, item.id, item.wikiKey, item.src);
      wrap.appendChild(img);
      var lbl = document.createElement("span");
      lbl.className = options.labelClass || "item-inline__label";
      lbl.textContent = item.label;
      wrap.appendChild(lbl);
    } else {
      wrap.textContent = String(itemOrId || "?");
    }
    return wrap;
  }

  function appendLootSummarySep(parent) {
    var sep = document.createElement("span");
    sep.className = "loot-summary__sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    parent.appendChild(sep);
  }

  function appendLootTier(parent, prefix, itemId) {
    var tier = document.createElement("span");
    tier.className = "loot-tier";
    if (prefix) {
      var pre = document.createElement("span");
      pre.className = "loot-tier__prefix";
      pre.textContent = prefix;
      tier.appendChild(pre);
    }
    tier.appendChild(createItemInline(itemId, { size: 18 }));
    parent.appendChild(tier);
  }

  function appendPersonLootSummary(parent, person, options) {
    if (!parent || !person) return;
    options = options || {};
    normalizePersonItems(person);
    parent.replaceChildren();
    parent.className = options.className || "loot-summary";
    appendLootTier(parent, "+1 ", person.items.like1);
    appendLootSummarySep(parent);
    appendLootTier(parent, "+3 ", person.items.like3);
    appendLootSummarySep(parent);
    appendLootTier(parent, "+5 ", person.items.like5);
    if (options.includeDislikes !== false) {
      appendLootSummarySep(parent);
      appendLootTier(parent, "−1 ", person.items.dislike1);
      appendLootSummarySep(parent);
      appendLootTier(parent, "−3 ", person.items.dislike3);
    }
  }

  function appendEventDetail(parent, entry, options) {
    if (!parent || !entry) return;
    options = options || {};
    var imgSize = options.size || 20;
    var cat = behaviorCategoryById(resolveLegacyCategoryId(entry.categoryId));
    if (cat) {
      appendCategoryImg(
        parent,
        cat,
        options.categoryImgClass || "event-detail__cat-img",
        imgSize
      );
      var catLbl = document.createElement("span");
      catLbl.className = "event-detail__cat-label";
      catLbl.textContent = cat.label;
      parent.appendChild(catLbl);
      parent.appendChild(document.createTextNode(" · "));
    }
    parent.appendChild(
      createItemInline(lootIdFromEntry(entry), {
        size: imgSize,
        className: "item-inline item-inline--event",
      })
    );
  }

  function renderItemHintExamples(exampleIds) {
    if (!elItemPickHintExamples) return;
    elItemPickHintExamples.replaceChildren("");
    if (!exampleIds || !exampleIds.length) {
      elItemPickHintExamples.hidden = true;
      return;
    }
    elItemPickHintExamples.hidden = false;
    elItemPickHintExamples.setAttribute("aria-hidden", "false");
    var i;
    for (i = 0; i < exampleIds.length; i++) {
      (function (id) {
        var item = mcItemById(id);
        if (!item) return;
        var chip = document.createElement("div");
        chip.className = "item-hint-example";
        appendMcItemImg(chip, item, "item-hint-example__img");
        var lbl = document.createElement("span");
        lbl.className = "item-hint-example__label";
        lbl.textContent = item.label;
        chip.appendChild(lbl);
        elItemPickHintExamples.appendChild(chip);
      })(exampleIds[i]);
    }
  }

  function normalizePersonItems(person) {
    if (!person || typeof person !== "object") return;
    var defaults = defaultPersonItems();
    var items = person.items;
    if (!items || typeof items !== "object") {
      items = {};
    }
    var dislike1 = defaults.dislike1;
    var dislike3 = defaults.dislike3;
    if (items.dislike1 && itemInTierList(items.dislike1, "dislike_mild")) {
      dislike1 = items.dislike1;
    }
    if (items.dislike3 && itemInTierList(items.dislike3, "dislike_severe")) {
      dislike3 = items.dislike3;
    } else if (
      items.dislike1 &&
      itemInTierList(items.dislike1, "dislike_severe")
    ) {
      dislike3 = items.dislike1;
    }
    person.items = {
      like1:
        items.like1 && itemInTierList(items.like1, "common")
          ? items.like1
          : defaults.like1,
      like3:
        items.like3 && itemInTierList(items.like3, "rare")
          ? items.like3
          : defaults.like3,
      like5:
        items.like5 && itemInTierList(items.like5, "epic")
          ? items.like5
          : defaults.like5,
      dislike1: dislike1,
      dislike3: dislike3,
    };
    delete person.rewards;
  }

  function migratePeople() {
    var i;
    for (i = 0; i < state.people.length; i++) {
      normalizePersonItems(state.people[i]);
    }
  }

  function lootIdFromEntry(entry) {
    if (!entry) return "unknown";
    return String(entry.lootId || entry.reasonId || "").trim() || "unknown";
  }

  function normalizeLedgerEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    var id = String(entry.id || "").trim();
    var personId = String(entry.personId || "").trim();
    var points = Number(entry.points);
    if (!id || !personId || !isFinite(points)) return null;
    return {
      id: id,
      type: "score",
      personId: personId,
      ts: Number(entry.ts) || Date.now(),
      points: points,
      categoryId: resolveLegacyCategoryId(String(entry.categoryId || "other").trim()) || "other",
      lootId: lootIdFromEntry(entry),
      note: String(entry.note || "").trim(),
    };
  }

  function migrateToLedger() {
    if (!state.ledger) state.ledger = [];
    var next = [];
    var i;
    for (i = 0; i < state.ledger.length; i++) {
      var norm = normalizeLedgerEntry(state.ledger[i]);
      if (norm) next.push(norm);
    }
    state.ledger = next;
    delete state.events;
    state.version = SCHEMA_VERSION;
    migrateLedgerCategories();
  }

  function migrateLedgerCategories() {
    if (!state.ledger) return;
    var i;
    for (i = 0; i < state.ledger.length; i++) {
      var entry = state.ledger[i];
      if (!entry.categoryId) entry.categoryId = "other";
      else entry.categoryId = resolveLegacyCategoryId(entry.categoryId);
    }
  }

  function personItemForPoints(person, points) {
    if (!person || !person.items) return null;
    if (points === 1) return mcItemById(person.items.like1);
    if (points === 3) return mcItemById(person.items.like3);
    if (points === 5) return mcItemById(person.items.like5);
    if (points === -1) return mcItemById(person.items.dislike1);
    if (points === -3) return mcItemById(person.items.dislike3);
    return null;
  }

  function readPersonItemsFromDraft() {
    return {
      like1: playerModalDraft.like1,
      like3: playerModalDraft.like3,
      like5: playerModalDraft.like5,
      dislike1: playerModalDraft.dislike1,
      dislike3: playerModalDraft.dislike3,
    };
  }

  function fillPlayerModalItems(items) {
    var src = items || defaultPersonItems();
    playerModalDraft.like1 = src.like1 || DEFAULT_PERSON_ITEMS.like1;
    playerModalDraft.like3 = src.like3 || DEFAULT_PERSON_ITEMS.like3;
    playerModalDraft.like5 = src.like5 || DEFAULT_PERSON_ITEMS.like5;
    playerModalDraft.dislike1 = src.dislike1 || DEFAULT_PERSON_ITEMS.dislike1;
    playerModalDraft.dislike3 = src.dislike3 || DEFAULT_PERSON_ITEMS.dislike3;
  }

  function goToSetupStep(step) {
    playerModalDraft.setupStep = step;
    renderPlayerSetupStep();
    syncAddSaveEnabled();
  }

  function renderPlayerSetupStep() {
    var step = playerModalDraft.setupStep;
    var isProfile = step === "profile";
    if (elProfileSection) elProfileSection.hidden = !isProfile;
    if (elItemsWizard) elItemsWizard.hidden = isProfile;
    if (elPlayerSetupNext) {
      elPlayerSetupNext.hidden = !isProfile;
    }
    if (isProfile) {
      renderItemHintExamples([]);
      return;
    }

    var meta = ITEM_SETUP_META[step];
    if (!meta) return;
    if (elItemPickStepLabel) elItemPickStepLabel.textContent = meta.label;
    if (elItemPickStepHint) elItemPickStepHint.textContent = meta.hint;
    renderItemHintExamples(meta.examples || []);

    if (elItemSetupProgress) {
      var dots = elItemSetupProgress.querySelectorAll(".item-setup-progress__dot");
      var i;
      for (i = 0; i < dots.length; i++) {
        var dotStep = dots[i].getAttribute("data-step");
        dots[i].classList.toggle("item-setup-progress__dot--done", isSetupStepDone(dotStep));
        dots[i].classList.toggle(
          "item-setup-progress__dot--active",
          dotStep === step
        );
      }
    }

    if (elItemPickGrid) {
      elItemPickGrid.classList.toggle(
        "item-pick-grid--dislike",
        step === "dislike1" || step === "dislike3"
      );
      renderItemPickGrid(
        elItemPickGrid,
        itemsForSetupStep(step),
        playerModalDraft[meta.field],
        function (id) {
          playerModalDraft[meta.field] = id;
          syncAddSaveEnabled();
          if (meta.next) {
            goToSetupStep(meta.next);
          } else {
            renderPlayerSetupStep();
            showToast("All set — tap Save player!");
          }
        }
      );
    }
  }

  function isSetupStepDone(step) {
    if (step === "like1") return !!playerModalDraft.like1;
    if (step === "like3") return !!playerModalDraft.like3;
    if (step === "like5") return !!playerModalDraft.like5;
    if (step === "dislike1") return !!playerModalDraft.dislike1;
    if (step === "dislike3") return !!playerModalDraft.dislike3;
    return false;
  }

  function setupStepBack() {
    var step = playerModalDraft.setupStep;
    if (step === "like1") goToSetupStep("profile");
    else if (step === "like3") goToSetupStep("like1");
    else if (step === "like5") goToSetupStep("like3");
    else if (step === "dislike1") goToSetupStep("like5");
    else if (step === "dislike3") goToSetupStep("dislike1");
  }

  function beginItemSetupWizard() {
    var name = String(elPlayerName && elPlayerName.value ? elPlayerName.value : "").trim();
    if (!name) {
      showToast("Type a name first.");
      if (elPlayerName) elPlayerName.focus();
      return;
    }
    if (!playerModalDraft.characterId) {
      showToast("Pick a character.");
      return;
    }
    goToSetupStep("like1");
  }

  function renderItemPickGrid(container, list, selectedId, onPick) {
    if (!container) return;
    container.replaceChildren("");
    var i;
    for (i = 0; i < list.length; i++) {
      (function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "item-pick";
        if (item.id === selectedId) btn.classList.add("item-pick--selected");
        appendMcItemImg(btn, item, "item-pick__img");
        var lbl = document.createElement("span");
        lbl.className = "item-pick__label";
        lbl.textContent = item.label;
        btn.appendChild(lbl);
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          onPick(item.id);
        });
        container.appendChild(btn);
      })(list[i]);
    }
  }

  function createPointButton(points, item) {
    var btn = document.createElement("button");
    btn.type = "button";
    var good = points > 0;
    btn.className =
      "point-btn " +
      (good ? "point-btn--good" : "point-btn--oops") +
      (points >= 5
        ? " point-btn--mega"
        : points === 3
          ? " point-btn--rare"
          : points === -3
            ? " point-btn--oops-big"
            : "");
    btn.setAttribute("data-points", String(points));
    btn.appendChild(document.createTextNode(formatScore(points)));
    var span = document.createElement("span");
    if (item) {
      appendMcItemImg(span, item, "point-btn__item-img");
      if (points < 0) {
        var yikes = document.createElement("span");
        yikes.className =
          "point-btn__yikes-tag" +
          (points === -3 ? " point-btn__yikes-tag--big" : "");
        yikes.textContent = points === -3 ? "BIG YIKES" : "Yikes!";
        span.appendChild(yikes);
      }
      var lbl = document.createElement("span");
      lbl.className = "point-btn__item-label";
      lbl.textContent = item.label;
      span.appendChild(lbl);
    } else {
      span.textContent = "?";
    }
    btn.appendChild(span);
    btn.addEventListener("click", function () {
      logStar(points, item ? item.id : "unknown");
    });
    return btn;
  }

  function personDisplayLabel(person) {
    if (!person) return "?";
    var name = person.name;
    var same = 0;
    var index = 0;
    var i;
    for (i = 0; i < state.people.length; i++) {
      if (state.people[i].name === name) {
        same++;
        if (state.people[i].id === person.id) index = same;
      }
    }
    if (same <= 1) return name;
    var ch = characterById(person.characterId);
    if (ch) {
      return name + " · " + ch.name + (index > 1 ? " #" + index : "");
    }
    return name + " #" + index;
  }

  function personHasDuplicateName(person) {
    var i;
    var count = 0;
    for (i = 0; i < state.people.length; i++) {
      if (state.people[i].name === person.name) count++;
    }
    return count > 1;
  }

  function personScore(personId, range) {
    var now = Date.now();
    var evs = state.ledger.filter(function (e) {
      return e.personId === personId;
    });
    if (range === "today") {
      var dayStart = startOfDay(now);
      return sumPointsInRange(evs, dayStart, dayStart + 86400000);
    }
    if (range === "week") {
      return sumPointsInRange(evs, startOfWeek(now), now + 1);
    }
    if (range === "month") {
      return sumPointsInRange(evs, startOfMonth(now), now + 1);
    }
    return sumPoints(evs);
  }

  function renderPersonItemBreakdown(parent, personId, range, title) {
    if (!parent) return;
    var heading = document.createElement("h4");
    heading.className = "person-stat-card__breakdown-title";
    heading.textContent = title;
    parent.appendChild(heading);

    var evs = eventsInRange(range, personId);
    var breakdown = buildItemBreakdown(evs);
    if (!breakdown.length) {
      var none = document.createElement("p");
      none.className = "person-stat-card__breakdown-empty";
      none.textContent = "Nothing logged yet.";
      parent.appendChild(none);
      return;
    }
    var list = document.createElement("ul");
    list.className = "person-stat-card__breakdown";
    var b;
    for (b = 0; b < breakdown.length; b++) {
      (function (row) {
        var li = document.createElement("li");
        li.className = "person-stat-card__breakdown-item";
        var item = mcItemById(row.id);
        if (item) {
          appendMcItemImg(li, item, "person-stat-card__breakdown-img");
        }
        var text = document.createElement("span");
        text.className = "person-stat-card__breakdown-text";
        text.textContent =
          row.label +
          " (" +
          formatScore(row.points) +
          ") × " +
          row.count +
          " = " +
          formatScore(row.total);
        li.appendChild(text);
        list.appendChild(li);
      })(breakdown[b]);
    }
    parent.appendChild(list);
  }

  function renderPersonCategoryInsights(parent, personId, range, rangeLabel) {
    if (!parent) return;
    var evs = eventsInRange(range, personId);
    var block = document.createElement("div");
    block.className = "person-stat-card__categories";

    var subTitle = document.createElement("h4");
    subTitle.className = "person-stat-card__categories-title";
    subTitle.textContent = "Shine & struggle · " + rangeLabel;
    block.appendChild(subTitle);

    if (!evs.length) {
      var empty = document.createElement("p");
      empty.className = "category-insights__empty";
      empty.textContent = "Log stars to see behavior breakdown.";
      block.appendChild(empty);
      parent.appendChild(block);
      return;
    }

    var stats = buildCategoryStats(evs);
    var known = stats.filter(function (s) {
      return s.id !== "other";
    });
    var shine = null;
    var tricky = null;
    var i;
    for (i = 0; i < known.length; i++) {
      if (
        known[i].kind === "good" &&
        known[i].positive > 0 &&
        (!shine || known[i].positive > shine.positive)
      ) {
        shine = known[i];
      }
      if (
        known[i].kind === "bad" &&
        known[i].negative < 0 &&
        (!tricky || known[i].negative < tricky.negative)
      ) {
        tricky = known[i];
      }
    }
    if (shine || tricky) {
      var callouts = document.createElement("div");
      callouts.className = "category-callouts";
      if (shine) {
        var shineEl = document.createElement("p");
        shineEl.className = "category-callout category-callout--shine";
        var shineCat = behaviorCategoryById(shine.id);
        if (shineCat) appendCategoryImg(shineEl, shineCat, "category-callout__img", 24);
        var shineText = document.createElement("span");
        shineText.textContent =
          "Shining: " + shine.label + " (" + formatScore(shine.positive) + ")";
        shineEl.appendChild(shineText);
        callouts.appendChild(shineEl);
      }
      if (tricky) {
        var trickyEl = document.createElement("p");
        trickyEl.className = "category-callout category-callout--tricky";
        var trickyCat = behaviorCategoryById(tricky.id);
        if (trickyCat) appendCategoryImg(trickyEl, trickyCat, "category-callout__img", 24);
        var trickyText = document.createElement("span");
        trickyText.textContent =
          "Tricky: " + tricky.label + " (" + formatScore(tricky.negative) + ")";
        trickyEl.appendChild(trickyText);
        callouts.appendChild(trickyEl);
      }
      block.appendChild(callouts);
    }

    var pairsWrap = document.createElement("div");
    pairsWrap.className = "category-pairs category-pairs--compact";
    for (i = 0; i < BEHAVIOR_CATEGORY_PAIRS.length; i++) {
      (function (pair) {
        var goodRow = statsRowForCategory(pair.good.id, stats);
        var badRow = statsRowForCategory(pair.bad.id, stats);
        var pairEl = document.createElement("div");
        pairEl.className = "category-pair";

        var goodSide = document.createElement("div");
        goodSide.className = "category-pair__side category-pair__side--good";
        appendCategoryImg(goodSide, pair.good, "category-pair__img", 28);
        var goodCopy = document.createElement("div");
        goodCopy.className = "category-pair__copy";
        var goodLabel = document.createElement("span");
        goodLabel.className = "category-pair__label";
        goodLabel.textContent = pair.good.label;
        var goodScore = document.createElement("span");
        goodScore.className = "category-pair__score category-pair__score--pos";
        goodScore.textContent = goodRow.count ? formatScore(goodRow.positive) : "—";
        goodCopy.appendChild(goodLabel);
        goodCopy.appendChild(goodScore);
        goodSide.appendChild(goodCopy);

        var badSide = document.createElement("div");
        badSide.className = "category-pair__side category-pair__side--bad";
        appendCategoryImg(badSide, pair.bad, "category-pair__img", 28);
        var badCopy = document.createElement("div");
        badCopy.className = "category-pair__copy";
        var badLabel = document.createElement("span");
        badLabel.className = "category-pair__label";
        badLabel.textContent = pair.bad.label;
        var badScore = document.createElement("span");
        badScore.className = "category-pair__score category-pair__score--neg";
        badScore.textContent = badRow.count ? formatScore(badRow.negative) : "—";
        badCopy.appendChild(badLabel);
        badCopy.appendChild(badScore);
        badSide.appendChild(badCopy);

        pairEl.appendChild(goodSide);
        pairEl.appendChild(badSide);
        pairsWrap.appendChild(pairEl);
      })(BEHAVIOR_CATEGORY_PAIRS[i]);
    }
    block.appendChild(pairsWrap);
    parent.appendChild(block);
  }

  function renderLeaderboard() {
    if (!elLeaderboard) return;
    elLeaderboard.replaceChildren("");
    var range = leaderboardRange();
    var rows = [];
    var i;
    for (i = 0; i < state.people.length; i++) {
      rows.push({
        person: state.people[i],
        score: scoreForRange(range, state.people[i].id),
      });
    }
    rows.sort(function (a, b) {
      return b.score - a.score || a.person.name.localeCompare(b.person.name);
    });
    if (!rows.length) {
      var empty = document.createElement("li");
      empty.className = "leaderboard__empty";
      empty.textContent = "Add players to see rankings.";
      elLeaderboard.appendChild(empty);
      return;
    }
    for (i = 0; i < rows.length; i++) {
      (function (row, rank) {
        var person = row.person;
        var ch = characterById(person.characterId);
        var li = document.createElement("li");
        li.className = "leaderboard__row";
        if (rank === 1) li.classList.add("leaderboard__row--first");

        var place = document.createElement("span");
        place.className = "leaderboard__rank";
        place.textContent = String(rank);
        li.appendChild(place);

        if (ch) {
          appendCharacterImg(li, ch, "leaderboard__avatar", 40);
        }

        var name = document.createElement("span");
        name.className = "leaderboard__name";
        name.textContent = personDisplayLabel(person);
        li.appendChild(name);

        var pts = document.createElement("span");
        pts.className = "leaderboard__score";
        if (row.score < 0) pts.classList.add("leaderboard__score--neg");
        pts.textContent = formatScore(row.score) + " ⭐";
        li.appendChild(pts);

        elLeaderboard.appendChild(li);
      })(rows[i], i + 1);
    }
  }

  function renderStatsDiary() {
    if (!elStatsDiaryFeed) return;
    elStatsDiaryFeed.replaceChildren("");
    var pid = filterPersonId();
    var notes = state.dayNotes.slice().sort(function (a, b) {
      return b.ts - a.ts;
    });
    if (pid !== "all") {
      notes = notes.filter(function (n) {
        return n.personId === pid || n.personId == null;
      });
    }
    notes = notes.slice(0, 12);
    if (elStatsDiaryEmpty) elStatsDiaryEmpty.hidden = notes.length > 0;
    if (!notes.length) return;
    var list = document.createElement("ul");
    list.className = "stats-diary-feed__list";
    var showPerson = pid === "all";
    var i;
    for (i = 0; i < notes.length; i++) {
      renderDiaryNoteEntry(notes[i], list, showPerson);
    }
    elStatsDiaryFeed.appendChild(list);
  }

  function renderPersonStats() {
    if (!elPersonStatsGrid) return;
    elPersonStatsGrid.replaceChildren("");
    if (!state.people.length) {
      var empty = document.createElement("p");
      empty.className = "person-stats-empty";
      empty.textContent = "Add players to see their scores here.";
      elPersonStatsGrid.appendChild(empty);
      return;
    }
    var filterPid = filterPersonId();
    var i;
    for (i = 0; i < state.people.length; i++) {
      (function (person) {
        if (filterPid !== "all" && person.id !== filterPid) return;

        normalizePersonItems(person);
        var ch = characterById(person.characterId);
        var weekScore = scoreForRange("week", person.id);
        var monthScore = scoreForRange("month", person.id);

        var card = document.createElement("details");
        card.className = "person-stat-card";
        card.open = isPersonStatsExpanded(person.id);
        card.addEventListener("toggle", function () {
          setPersonStatsExpanded(person.id, card.open);
        });

        var summary = document.createElement("summary");
        summary.className = "person-stat-card__summary";

        var chev = document.createElement("span");
        chev.className = "person-stat-card__chev";
        chev.setAttribute("aria-hidden", "true");
        chev.textContent = "▸";
        summary.appendChild(chev);

        if (ch) {
          appendCharacterImg(summary, ch, "person-stat-card__avatar");
        }

        var summaryCopy = document.createElement("div");
        summaryCopy.className = "person-stat-card__summary-copy";
        var name = document.createElement("strong");
        name.textContent = personDisplayLabel(person);
        summaryCopy.appendChild(name);

        var quick = document.createElement("div");
        quick.className = "person-stat-card__summary-scores";
        var weekChip = document.createElement("span");
        weekChip.className =
          "person-stat-card__chip" +
          (weekScore < 0 ? " person-stat-card__chip--neg" : "");
        weekChip.textContent = "Week " + formatScore(weekScore);
        var monthChip = document.createElement("span");
        monthChip.className =
          "person-stat-card__chip" +
          (monthScore < 0 ? " person-stat-card__chip--neg" : "");
        monthChip.textContent = "Month " + formatScore(monthScore);
        quick.appendChild(weekChip);
        quick.appendChild(monthChip);
        summaryCopy.appendChild(quick);
        summary.appendChild(summaryCopy);
        card.appendChild(summary);

        var body = document.createElement("div");
        body.className = "person-stat-card__body";

        var total = scoreForRange("all", person.id);
        var totalEl = document.createElement("p");
        totalEl.className = "person-stat-card__total";
        totalEl.textContent = "All time " + formatScore(total) + " ⭐";
        if (total < 0) totalEl.classList.add("person-stat-card__total--neg");
        body.appendChild(totalEl);

        var grid = document.createElement("dl");
        grid.className = "person-stat-card__scores";
        var ranges = [
          { key: "today", label: "Today" },
          { key: "week", label: "Week" },
          { key: "month", label: "Month" },
          { key: "all", label: "All" },
        ];
        var r;
        for (r = 0; r < ranges.length; r++) {
          var dt = document.createElement("dt");
          dt.textContent = ranges[r].label;
          var dd = document.createElement("dd");
          var val = scoreForRange(ranges[r].key, person.id);
          dd.textContent = formatScore(val);
          if (val < 0) dd.classList.add("person-stat-card__score--neg");
          grid.appendChild(dt);
          grid.appendChild(dd);
        }
        body.appendChild(grid);

        var weekSection = document.createElement("section");
        weekSection.className = "person-stat-card__period";
        renderPersonItemBreakdown(weekSection, person.id, "week", "Loot this week");
        renderPersonCategoryInsights(weekSection, person.id, "week", "this week");
        body.appendChild(weekSection);

        var monthSection = document.createElement("section");
        monthSection.className = "person-stat-card__period";
        renderPersonItemBreakdown(monthSection, person.id, "month", "Loot this month");
        renderPersonCategoryInsights(monthSection, person.id, "month", "this month");
        body.appendChild(monthSection);

        card.appendChild(body);
        elPersonStatsGrid.appendChild(card);
      })(state.people[i]);
    }
  }

  function refreshScores() {
    var evs = eventsForFilter();
    var now = Date.now();
    var dayStart = startOfDay(now);
    var weekStart = startOfWeek(now);
    var monthStart = startOfMonth(now);
    var today = sumPointsInRange(evs, dayStart, dayStart + 86400000);
    var week = sumPointsInRange(evs, weekStart, now + 1);
    var month = sumPointsInRange(evs, monthStart, now + 1);
    var all = sumPoints(evs);
    applyScoreEl(elScoreToday, today);
    applyScoreEl(elScoreWeek, week);
    applyScoreEl(elScoreMonth, month);
    applyScoreEl(elStatsToday, today);
    applyScoreEl(elStatsWeek, week);
    applyScoreEl(elStatsMonth, month);
    applyScoreEl(elStatsAll, all);
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDayLabel(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }

  function hideToast() {
    if (!elToast) return;
    window.clearTimeout(showToast._t);
    elToast.replaceChildren();
    elToast.hidden = true;
    elToast.classList.remove(
      "toast--mega",
      "toast--rare",
      "toast--oops",
      "toast--oops-big"
    );
  }

  function showToast(msg, kind) {
    if (!elToast) return;
    if (
      msg == null ||
      (typeof msg === "string" && !String(msg).trim()) ||
      (msg.nodeType === 1 && !msg.textContent && !msg.childNodes.length)
    ) {
      hideToast();
      return;
    }
    elToast.replaceChildren();
    if (typeof msg === "string") {
      elToast.appendChild(document.createTextNode(msg));
    } else if (msg && msg.nodeType === 1) {
      elToast.appendChild(msg);
    }
    elToast.hidden = false;
    elToast.classList.remove(
      "toast--mega",
      "toast--rare",
      "toast--oops",
      "toast--oops-big"
    );
    if (kind === "mega") elToast.classList.add("toast--mega");
    if (kind === "rare") elToast.classList.add("toast--rare");
    if (kind === "oops") elToast.classList.add("toast--oops");
    if (kind === "oops-big") elToast.classList.add("toast--oops-big");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(hideToast, 2400);
  }

  function showStarToast(person, points, cat, lootId, kind) {
    if (!elToast) return;
    var wrap = document.createDocumentFragment();
    if (person) {
      wrap.appendChild(
        document.createTextNode(personDisplayLabel(person) + ": ")
      );
    }
    wrap.appendChild(document.createTextNode(formatScore(points) + " ⭐ · "));
    if (cat) {
      appendCategoryImg(wrap, cat, "toast__img", 22);
      wrap.appendChild(document.createTextNode(cat.label + " · "));
    }
    wrap.appendChild(
      createItemInline(lootId, {
        size: 22,
        className: "item-inline item-inline--toast",
      })
    );
    showToast(wrap, kind);
  }

  function renderPersonFilter() {
    if (!elPersonFilter) return;
    var val = filterPersonId();
    while (elPersonFilter.firstChild) {
      elPersonFilter.removeChild(elPersonFilter.firstChild);
    }
    var allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = "Everyone";
    elPersonFilter.appendChild(allOpt);
    var i;
    for (i = 0; i < state.people.length; i++) {
      var p = state.people[i];
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = personDisplayLabel(p);
      elPersonFilter.appendChild(opt);
    }
    elPersonFilter.value = val;
    if (elPersonFilter.selectedIndex < 0) elPersonFilter.value = "all";
  }

  function renderPeopleGrid() {
    if (!elPeopleGrid) return;
    elPeopleGrid.replaceChildren();
    var i;
    for (i = 0; i < state.people.length; i++) {
      (function (person) {
        var ch = characterById(person.characterId);
        var card = document.createElement("button");
        card.type = "button";
        card.className =
          "person-card" + (ch && ch.kind === "villain" ? " person-card--villain" : "");
        card.setAttribute("aria-label", "Give stars to " + personDisplayLabel(person));

        if (ch) {
          var avatar = appendCharacterImg(card, ch, "person-card__avatar", 64);
          if (avatar) {
            avatar.width = 64;
            avatar.height = 64;
          }
        }

        var name = document.createElement("p");
        name.className = "person-card__name";
        if (personHasDuplicateName(person)) {
          name.textContent = personDisplayLabel(person);
        } else {
          name.textContent = person.name;
        }
        card.appendChild(name);

        if (ch) {
          var charName = document.createElement("p");
          charName.className = "person-card__char";
          charName.textContent = ch.name;
          card.appendChild(charName);
        }

        normalizePersonItems(person);
        var itemsPreview = document.createElement("p");
        appendPersonLootSummary(itemsPreview, person, {
          className: "person-card__rewards loot-summary loot-summary--card",
          includeDislikes: false,
        });
        card.appendChild(itemsPreview);

        var score = personScore(person.id, "today");
        var scoreEl = document.createElement("span");
        scoreEl.className = "person-card__score";
        if (score < 0) scoreEl.classList.add("person-card__score--neg");
        scoreEl.textContent = "Today " + formatScore(score) + " ⭐";
        card.appendChild(scoreEl);

        var actions = document.createElement("div");
        actions.className = "person-card__actions";

        var edit = document.createElement("span");
        edit.className = "person-card__edit";
        edit.setAttribute("role", "button");
        edit.setAttribute("tabindex", "0");
        edit.textContent = "Edit";
        edit.addEventListener("click", function (e) {
          e.stopPropagation();
          openEditPlayerModal(person.id);
        });
        edit.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openEditPlayerModal(person.id);
          }
        });
        actions.appendChild(edit);

        var del = document.createElement("span");
        del.className = "person-card__delete";
        del.setAttribute("role", "button");
        del.setAttribute("tabindex", "0");
        del.textContent = "Remove";
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          removePerson(person.id);
        });
        del.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            removePerson(person.id);
          }
        });
        actions.appendChild(del);
        card.appendChild(actions);

        card.addEventListener("click", function () {
          openRewardSheet(person.id);
        });

        elPeopleGrid.appendChild(card);
      })(state.people[i]);
    }

    var empty = !state.people.length;
    if (elEmptyPeople) elEmptyPeople.hidden = !empty;
    if (elPeopleGrid) elPeopleGrid.hidden = empty;
  }

  function buildTrendDays(period) {
    var evs = eventsForFilter();
    var now = Date.now();
    var dayMs = 86400000;
    var days = [];
    var maxAbs = 1;
    var d;
    if (period === "month") {
      var monthStart = startOfMonth(now);
      var todayStart = startOfDay(now);
      for (d = monthStart; d <= todayStart; d += dayMs) {
        var net = sumPointsInRange(evs, d, d + dayMs);
        if (Math.abs(net) > maxAbs) maxAbs = Math.abs(net);
        days.push({ start: d, net: net, dayKey: dayKeyFromTs(d) });
      }
    } else {
      for (d = 6; d >= 0; d--) {
        var dayStart = startOfDay(now - d * dayMs);
        var dayEnd = dayStart + dayMs;
        var netW = sumPointsInRange(evs, dayStart, dayEnd);
        if (Math.abs(netW) > maxAbs) maxAbs = Math.abs(netW);
        days.push({ start: dayStart, net: netW, dayKey: dayKeyFromTs(dayStart) });
      }
    }
    return { days: days, maxAbs: maxAbs };
  }

  function renderTrendChart() {
    if (!elTrendChart) return;
    var period = statsPeriod();
    if (elTrendTitle) {
      elTrendTitle.textContent =
        period === "month" ? "This month" : "This week";
    }
    elTrendChart.replaceChildren("");
    elTrendChart.classList.toggle("trend-chart--month", period === "month");
    var built = buildTrendDays(period);
    var days = built.days;
    var maxAbs = built.maxAbs;
    var sel = selectedDayKey();
    var i;
    for (i = 0; i < days.length; i++) {
      (function (day) {
        var wrap = document.createElement("button");
        wrap.type = "button";
        wrap.className = "trend-bar trend-bar--selectable";
        if (day.dayKey === sel) wrap.classList.add("trend-bar--selected");
        wrap.setAttribute("aria-label", formatDayKeyLong(day.dayKey) + " " + formatScore(day.net));

        var val = document.createElement("span");
        val.className = "trend-bar__val";
        val.textContent = formatScore(day.net);
        wrap.appendChild(val);

        var fill = document.createElement("div");
        fill.className = "trend-bar__fill";
        fill.setAttribute("aria-hidden", "true");
        if (day.net === 0) {
          fill.classList.add("trend-bar__fill--zero");
          fill.style.height = "4px";
        } else if (day.net < 0) {
          fill.classList.add("trend-bar__fill--neg");
          fill.style.height =
            Math.round((Math.abs(day.net) / maxAbs) * 100) + "%";
        } else {
          fill.style.height = Math.round((day.net / maxAbs) * 100) + "%";
        }
        wrap.appendChild(fill);

        var label = document.createElement("span");
        label.className = "trend-bar__label";
        if (period === "month") {
          label.textContent = String(new Date(day.start).getDate());
        } else {
          label.textContent = formatDayLabel(day.start);
        }
        wrap.appendChild(label);

        wrap.addEventListener("click", function () {
          setSelectedDayKey(day.dayKey);
        });
        elTrendChart.appendChild(wrap);
      })(days[i]);
    }
  }

  function renderBreakdown() {
    if (!elBreakdownList) return;
    elBreakdownList.replaceChildren();
    var period = statsPeriod();
    var evs = eventsInRange(period === "month" ? "month" : "week");
    if (elBreakdownTitle) {
      elBreakdownTitle.textContent =
        "By item (" + (period === "month" ? "this month" : "this week") + ")";
    }
    var breakdown = buildItemBreakdown(evs);
    if (!breakdown.length) {
      var li = document.createElement("li");
      li.className = "breakdown-list__item";
      li.textContent =
        "Nothing " + (period === "month" ? "this month" : "this week") + " yet.";
      elBreakdownList.appendChild(li);
      return;
    }
    var i;
    for (i = 0; i < breakdown.length; i++) {
      (function (row) {
        var item = document.createElement("li");
        item.className = "breakdown-list__item";
        var left = document.createElement("span");
        left.className = "breakdown-list__label";
        var mc = mcItemById(row.id);
        if (mc) {
          appendMcItemImg(left, mc, "breakdown-list__img");
        }
        var lbl = document.createElement("span");
        lbl.textContent =
          row.label + " (" + formatScore(row.points) + ") × " + row.count;
        left.appendChild(lbl);
        var pts = document.createElement("span");
        pts.className = "breakdown-list__pts";
        if (row.total < 0) pts.classList.add("breakdown-list__pts--neg");
        pts.textContent = formatScore(row.total);
        item.appendChild(left);
        item.appendChild(pts);
        elBreakdownList.appendChild(item);
      })(breakdown[i]);
    }
  }

  function renderActivityLog() {
    if (!elActivityLog) return;
    elActivityLog.replaceChildren();
    var evs = eventsForFilter()
      .slice()
      .sort(function (a, b) {
        return b.ts - a.ts;
      });
    var show = evs.slice(0, 80);
    if (elEmptyLog) elEmptyLog.hidden = show.length > 0;
    var i;
    for (i = 0; i < show.length; i++) {
      var ev = show[i];
      var person = personById(ev.personId);
      var ch = person ? characterById(person.characterId) : null;
      var li = document.createElement("li");
      li.className = "activity-log__item";

      if (ch) {
        appendCharacterImg(li, ch, "activity-log__avatar");
      }

      var mid = document.createElement("div");
      var title = document.createElement("div");
      title.className = "activity-log__title event-detail";
      title.appendChild(
        document.createTextNode(
          (person ? personDisplayLabel(person) : "?") + " · "
        )
      );
      appendEventDetail(title, ev, { size: 20 });
      var meta = document.createElement("div");
      meta.className = "activity-log__meta";
      meta.textContent = formatTime(ev.ts);
      if (ev.note) meta.textContent += " · " + ev.note;
      mid.appendChild(title);
      mid.appendChild(meta);
      li.appendChild(mid);

      var pts = document.createElement("span");
      pts.className =
        "activity-log__pts " +
        (ev.points >= 0 ? "activity-log__pts--good" : "activity-log__pts--oops");
      pts.textContent = formatScore(ev.points);
      li.appendChild(pts);

      elActivityLog.appendChild(li);
    }
  }

  function setLeaderboardRange(range) {
    state.settings.leaderboardRange = range;
    saveState();
    var tabs = document.querySelectorAll(".leaderboard-tabs__btn");
    var i;
    for (i = 0; i < tabs.length; i++) {
      var active = tabs[i].getAttribute("data-range") === range;
      tabs[i].classList.toggle("leaderboard-tabs__btn--active", active);
      tabs[i].setAttribute("aria-selected", active ? "true" : "false");
    }
    renderLeaderboard();
    renderPersonStats();
  }

  function setStatsPeriod(period) {
    state.settings.statsPeriod = period === "month" ? "month" : "week";
    saveState();
    if (elPeriodWeek) {
      elPeriodWeek.classList.toggle("period-tabs__btn--active", period !== "month");
      elPeriodWeek.setAttribute("aria-selected", period !== "month" ? "true" : "false");
    }
    if (elPeriodMonth) {
      elPeriodMonth.classList.toggle("period-tabs__btn--active", period === "month");
      elPeriodMonth.setAttribute("aria-selected", period === "month" ? "true" : "false");
    }
    renderTrendChart();
    renderBreakdown();
  }

  function renderAll() {
    renderPersonFilter();
    renderPeopleGrid();
    refreshScores();
    renderLeaderboard();
    renderPersonStats();
    renderStatsDiary();
    renderDayNotesPanels();
    renderTrendChart();
    renderDayDetail();
    renderBreakdown();
    renderActivityLog();
  }

  function setView(view) {
    var home = view === "home";
    var diary = view === "diary";
    var stats = view === "stats";
    if (elTabHome) {
      elTabHome.classList.toggle("view-tabs__btn--active", home);
      elTabHome.setAttribute("aria-selected", home ? "true" : "false");
    }
    if (elTabDiary) {
      elTabDiary.classList.toggle("view-tabs__btn--active", diary);
      elTabDiary.setAttribute("aria-selected", diary ? "true" : "false");
    }
    if (elTabStats) {
      elTabStats.classList.toggle("view-tabs__btn--active", stats);
      elTabStats.setAttribute("aria-selected", stats ? "true" : "false");
    }
    if (elPanelHome) elPanelHome.hidden = !home;
    if (elPanelDiary) elPanelDiary.hidden = !diary;
    if (elPanelStats) elPanelStats.hidden = !stats;
    if (diary) renderDiaryTimeline();
  }

  function showRewardStep(step) {
    rewardContext.step = step;
    if (elRewardStepCategory) elRewardStepCategory.hidden = step !== "category";
    if (elRewardStepPoints) elRewardStepPoints.hidden = step !== "points";
  }

  function openRewardSheet(personId) {
    var person = personById(personId);
    if (!person || !elRewardSheet) return;
    rewardContext.personId = personId;
    rewardContext.pendingCategoryId = null;
    rewardContext.pendingCategoryLabel = null;
    rewardContext.pendingCategoryKind = null;

    var ch = characterById(person.characterId);
    if (elRewardPerson) {
      elRewardPerson.replaceChildren();
      if (ch) {
        appendCharacterImg(elRewardPerson, ch, "sheet__avatar");
      }
      var copy = document.createElement("div");
      copy.className = "sheet__person-copy";
      var strong = document.createElement("strong");
      strong.textContent = personDisplayLabel(person);
      copy.appendChild(strong);
      if (ch) {
        var sub = document.createElement("span");
        sub.className = "sheet__person-sub";
        sub.textContent = ch.name + (ch.kind === "villain" ? " · mob avatar" : " · hero");
        copy.appendChild(sub);
      }
      normalizePersonItems(person);
      var itemsLine = document.createElement("span");
      appendPersonLootSummary(itemsLine, person, {
        className: "sheet__rewards-line loot-summary loot-summary--sheet",
      });
      copy.appendChild(itemsLine);
      elRewardPerson.appendChild(copy);
    }

    showRewardStep("category");
    renderCategoryPicker();
    elRewardSheet.hidden = false;
  }

  function closeRewardSheet() {
    if (elRewardSheet) elRewardSheet.hidden = true;
    rewardContext.personId = null;
    rewardContext.pendingCategoryId = null;
    rewardContext.pendingCategoryLabel = null;
    rewardContext.pendingCategoryKind = null;
    rewardContext.step = "category";
  }

  function beginPointsPick(cat) {
    rewardContext.pendingCategoryId = cat.id;
    rewardContext.pendingCategoryLabel = cat.label;
    rewardContext.pendingCategoryKind = cat.kind;
    if (elRewardPendingSummary) {
      elRewardPendingSummary.replaceChildren();
      appendCategoryImg(elRewardPendingSummary, cat, "reward-pending-summary__img", 40);
      var txt = document.createElement("span");
      txt.textContent = cat.label;
      elRewardPendingSummary.appendChild(txt);
      elRewardPendingSummary.className =
        "reward-pending-summary" +
        (cat.kind === "bad" ? " reward-pending-summary--oops" : " reward-pending-summary--good");
    }
    if (elRewardTierHint) {
      elRewardTierHint.textContent =
        cat.kind === "bad" ? "How big was the oops?" : "How many stars?";
    }
    renderPointPickers();
    showRewardStep("points");
  }

  function renderCategoryChip(grid, cat) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "category-chip category-chip--" + (cat.kind === "bad" ? "bad" : "good");
    appendCategoryImg(btn, cat, "category-chip__img", 52);
    var lbl = document.createElement("span");
    lbl.className = "category-chip__label";
    lbl.textContent = cat.label;
    btn.appendChild(lbl);
    btn.addEventListener("click", function () {
      beginPointsPick(cat);
    });
    grid.appendChild(btn);
  }

  function renderCategoryGroup(container, title, kind) {
    var section = document.createElement("section");
    section.className =
      "category-group category-group--" + (kind === "bad" ? "bad" : "good");
    var heading = document.createElement("h3");
    heading.className = "category-group__title";
    heading.textContent = title;
    section.appendChild(heading);
    var grid = document.createElement("div");
    grid.className = "category-group__grid";
    grid.setAttribute("role", "group");
    grid.setAttribute(
      "aria-label",
      kind === "bad" ? "Oops categories" : "Good categories"
    );
    section.appendChild(grid);
    container.appendChild(section);
    return grid;
  }

  function renderCategoryPicker() {
    if (!elCategoryPicker) return;
    elCategoryPicker.replaceChildren("");
    elCategoryPicker.className = "category-groups";

    var goodGrid = renderCategoryGroup(elCategoryPicker, "😊 Good things", "good");
    var badGrid = renderCategoryGroup(elCategoryPicker, "😅 Oops — bad things", "bad");

    var i;
    for (i = 0; i < BEHAVIOR_CATEGORIES.length; i++) {
      var cat = BEHAVIOR_CATEGORIES[i];
      renderCategoryChip(cat.kind === "bad" ? badGrid : goodGrid, cat);
    }
  }

  function renderPointPickers() {
    var person = personById(rewardContext.personId);
    if (!person || !elPointAll) return;
    normalizePersonItems(person);
    elPointAll.replaceChildren("");
    var kind = rewardContext.pendingCategoryKind;
    elPointAll.classList.toggle("point-picker--oops-only", kind === "bad");
    if (kind === "bad") {
      elPointAll.appendChild(createPointButton(-1, mcItemById(person.items.dislike1)));
      elPointAll.appendChild(createPointButton(-3, mcItemById(person.items.dislike3)));
      return;
    }
    elPointAll.appendChild(createPointButton(1, mcItemById(person.items.like1)));
    elPointAll.appendChild(createPointButton(3, mcItemById(person.items.like3)));
    elPointAll.appendChild(createPointButton(5, mcItemById(person.items.like5)));
  }

  function logStar(points, lootId) {
    if (rewardContext.personId == null) return;
    var entry = {
      id: uid("led"),
      type: "score",
      personId: rewardContext.personId,
      points: points,
      categoryId: rewardContext.pendingCategoryId || "other",
      lootId: lootId || "unknown",
      note: "",
      ts: Date.now(),
    };
    state.ledger.push(entry);
    saveState();

    var person = personById(rewardContext.personId);
    var cat = behaviorCategoryById(entry.categoryId);
    var kind =
      points >= 5
        ? "mega"
        : points === 3
          ? "rare"
          : points === -3
            ? "oops-big"
            : points < 0
              ? "oops"
              : null;
    showStarToast(person, points, cat, lootId, kind);
    closeRewardSheet();
    renderAll();
  }

  function removePerson(personId) {
    var person = personById(personId);
    if (!person) return;
    if (
      !window.confirm(
        "Remove " + person.name + " and all their star history?"
      )
    ) {
      return;
    }
    state.people = state.people.filter(function (p) {
      return p.id !== personId;
    });
    state.ledger = state.ledger.filter(function (e) {
      return e.personId !== personId;
    });
    state.dayNotes = state.dayNotes.filter(function (n) {
      return n.personId !== personId;
    });
    if (filterPersonId() === personId) {
      state.settings.filterPersonId = "all";
    }
    saveState();
    renderAll();
  }

  function openPlayerModal(mode, personId) {
    playerModalDraft.mode = mode === "edit" ? "edit" : "add";
    playerModalDraft.editPersonId = mode === "edit" ? personId : null;
    playerModalDraft.setupStep = "profile";
    if (mode === "edit") {
      var person = personById(personId);
      if (!person) return;
      var ch = characterById(person.characterId);
      playerModalDraft.charKind = ch && ch.kind === "villain" ? "villain" : "hero";
      playerModalDraft.characterId = person.characterId;
      if (elPlayerName) elPlayerName.value = person.name;
      fillPlayerModalItems(person.items);
      if (elAddTitle) elAddTitle.textContent = "Edit player";
      if (elAddHint) {
        elAddHint.textContent =
          "Update name, character, or their +1/+3/+5 loot and −1/−3 oops picks.";
      }
      if (elAddSave) elAddSave.textContent = "Save changes";
    } else {
      if (state.people.length >= MAX_PEOPLE) {
        showToast("Max " + MAX_PEOPLE + " players for now.");
        return;
      }
      playerModalDraft.charKind = "hero";
      playerModalDraft.characterId = firstCharIdForKind("hero");
      if (elPlayerName) elPlayerName.value = "";
      fillPlayerModalItems(defaultPersonItems());
      if (elAddTitle) elAddTitle.textContent = "New player";
      if (elAddHint) {
        elAddHint.textContent =
          "Name, face, then pick loot they want — blocks, minerals, TNT, and more.";
      }
      if (elAddSave) elAddSave.textContent = "Save player";
    }
    renderCharGrid();
    renderPlayerSetupStep();
    syncAddSaveEnabled();
    if (elAddModal) elAddModal.hidden = false;
    window.setTimeout(function () {
      if (elPlayerName) elPlayerName.focus();
    }, 50);
  }

  function openAddPlayerModal() {
    openPlayerModal("add");
  }

  function openEditPlayerModal(personId) {
    openPlayerModal("edit", personId);
  }

  function closeAddPlayerModal() {
    if (elAddModal) elAddModal.hidden = true;
    playerModalDraft.mode = "add";
    playerModalDraft.editPersonId = null;
    playerModalDraft.setupStep = "profile";
  }

  function renderCharGrid() {
    if (!elCharGrid) return;
    elCharGrid.replaceChildren("");
    var kind = playerModalDraft.charKind;
    var shown = 0;
    var i;
    for (i = 0; i < characters.length; i++) {
      var ch = characters[i];
      if (ch.kind !== kind) continue;
      shown++;
      (function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "char-pick";
        if (playerModalDraft.characterId === c.id) {
          btn.classList.add("char-pick--selected");
        }
        var img = document.createElement("img");
        img.alt = c.name;
        img.loading = "lazy";
        attachSpriteImg(img, c.id, c.wikiKey || c.id, c.src, c.name);
        btn.appendChild(img);
        var lbl = document.createElement("span");
        lbl.textContent = c.name;
        btn.appendChild(lbl);
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          playerModalDraft.characterId = c.id;
          renderCharGrid();
          syncAddSaveEnabled();
        });
        elCharGrid.appendChild(btn);
      })(ch);
    }
    if (elCharGridEmpty) {
      elCharGridEmpty.hidden = shown > 0;
    }
    if (!shown && !playerModalDraft.characterId) {
      playerModalDraft.characterId = firstCharIdForKind(kind);
    }
    if (elCharTabHero) {
      elCharTabHero.classList.toggle("char-tabs__btn--active", kind === "hero");
    }
    if (elCharTabVillain) {
      elCharTabVillain.classList.toggle(
        "char-tabs__btn--active",
        kind === "villain"
      );
    }
  }

  function syncAddSaveEnabled() {
    if (!elAddSave || !elPlayerName) return;
    var name = String(elPlayerName.value || "").trim();
    var ok =
      !!(
        name &&
        playerModalDraft.characterId &&
        playerModalDraft.like1 &&
        playerModalDraft.like3 &&
        playerModalDraft.like5 &&
        playerModalDraft.dislike1 &&
        playerModalDraft.dislike3
      );
    elAddSave.disabled = !ok;
    elAddSave.setAttribute("aria-disabled", ok ? "false" : "true");
  }

  function saveNewPlayer(e) {
    if (e && e.preventDefault) e.preventDefault();
    var name = String(elPlayerName && elPlayerName.value ? elPlayerName.value : "").trim();
    if (!name) {
      showToast("Type a name first.");
      if (elPlayerName) elPlayerName.focus();
      return;
    }
    if (!playerModalDraft.characterId) {
      showToast("Pick a character.");
      return;
    }
    var items = readPersonItemsFromDraft();
    if (playerModalDraft.mode === "edit" && playerModalDraft.editPersonId) {
      var existing = personById(playerModalDraft.editPersonId);
      if (!existing) return;
      existing.name = name;
      existing.characterId = playerModalDraft.characterId;
      existing.items = items;
      saveState();
      closeAddPlayerModal();
      showToast(personDisplayLabel(existing) + " updated!");
      renderAll();
      return;
    }
    if (state.people.length >= MAX_PEOPLE) return;
    state.people.push({
      id: uid("p"),
      name: name,
      characterId: playerModalDraft.characterId,
      items: items,
    });
    saveState();
    closeAddPlayerModal();
    showToast(name + " joined the overworld!");
    renderAll();
  }

  function buildExportPayload() {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: "reward_overworld",
      people: state.people,
      ledger: state.ledger,
      dayNotes: state.dayNotes,
    };
  }

  function parseImportPayload(raw) {
    var text = String(raw || "").trim();
    if (!text) {
      throw new Error("Nothing to import.");
    }

    var chunks = [];
    try {
      var parsed = JSON.parse(text);
      chunks = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      chunks = extractJsonObjects(text);
    }

    if (!chunks.length) {
      throw new Error("Invalid backup JSON.");
    }

    return mergeImportChunks(chunks);
  }

  function extractJsonObjects(text) {
    var out = [];
    var depth = 0;
    var start = -1;
    var inString = false;
    var escape = false;
    var i;
    for (i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try {
            out.push(JSON.parse(text.slice(start, i + 1)));
          } catch (err) {
            /* skip malformed chunk */
          }
          start = -1;
        }
      }
    }
    if (!out.length) {
      throw new Error("Invalid backup JSON.");
    }
    return out;
  }

  function importChunkFromObject(data) {
    if (!data || typeof data !== "object") {
      return { people: [], ledger: [], dayNotes: [] };
    }
    var ledger = [];
    if (Array.isArray(data.ledger)) ledger = data.ledger;
    else if (Array.isArray(data.events)) ledger = data.events;
    return {
      people: Array.isArray(data.people) ? data.people : [],
      ledger: ledger,
      dayNotes: Array.isArray(data.dayNotes) ? data.dayNotes : [],
    };
  }

  function mergeImportChunks(chunks) {
    var merged = { people: [], ledger: [], dayNotes: [] };
    var ledgerIds = {};
    var peopleIds = {};
    var noteIds = {};
    var c;
    var i;

    for (c = 0; c < chunks.length; c++) {
      var chunk = importChunkFromObject(chunks[c]);

      for (i = 0; i < chunk.ledger.length; i++) {
        var entry = normalizeLedgerEntry(chunk.ledger[i]);
        if (!entry || ledgerIds[entry.id]) continue;
        merged.ledger.push(entry);
        ledgerIds[entry.id] = true;
      }

      for (i = 0; i < chunk.people.length; i++) {
        var person = chunk.people[i];
        if (!person || !person.id || !person.name || peopleIds[person.id]) continue;
        merged.people.push(person);
        peopleIds[person.id] = true;
      }

      for (i = 0; i < chunk.dayNotes.length; i++) {
        var note = chunk.dayNotes[i];
        if (!note || !note.id || noteIds[note.id]) continue;
        merged.dayNotes.push(note);
        noteIds[note.id] = true;
      }
    }

    return merged;
  }

  function formatImportStats(stats) {
    var parts = [];
    if (stats.ledgerAdded) parts.push("+" + stats.ledgerAdded + " stars");
    if (stats.peopleAdded) parts.push("+" + stats.peopleAdded + " players");
    if (stats.notesAdded) parts.push("+" + stats.notesAdded + " diary notes");
    var skipped =
      stats.ledgerSkipped + stats.peopleSkipped + stats.notesSkipped;
    if (skipped) parts.push(skipped + " duplicates skipped");
    return parts.length ? parts.join(" · ") : "Nothing new to merge";
  }

  function ledgerIdSet() {
    var ids = {};
    var i;
    for (i = 0; i < state.ledger.length; i++) {
      ids[state.ledger[i].id] = true;
    }
    return ids;
  }

  function peopleIdSet() {
    var ids = {};
    var i;
    for (i = 0; i < state.people.length; i++) {
      ids[state.people[i].id] = true;
    }
    return ids;
  }

  function noteIdSet() {
    var ids = {};
    var i;
    for (i = 0; i < state.dayNotes.length; i++) {
      if (state.dayNotes[i].id) ids[state.dayNotes[i].id] = true;
    }
    return ids;
  }

  function importBackupData(data) {
    var stats = {
      ledgerAdded: 0,
      ledgerSkipped: 0,
      peopleAdded: 0,
      peopleSkipped: 0,
      notesAdded: 0,
      notesSkipped: 0,
    };
    var existingLedger = ledgerIdSet();
    var existingPeople = peopleIdSet();
    var existingNotes = noteIdSet();
    var i;

    for (i = 0; i < data.ledger.length; i++) {
      var entry = normalizeLedgerEntry(data.ledger[i]);
      if (!entry) continue;
      if (existingLedger[entry.id]) {
        stats.ledgerSkipped += 1;
        continue;
      }
      state.ledger.push(entry);
      existingLedger[entry.id] = true;
      stats.ledgerAdded += 1;
    }

    for (i = 0; i < data.people.length; i++) {
      var person = data.people[i];
      if (!person || !person.id || !person.name) continue;
      if (existingPeople[person.id]) {
        stats.peopleSkipped += 1;
        continue;
      }
      normalizePersonItems(person);
      state.people.push(person);
      existingPeople[person.id] = true;
      stats.peopleAdded += 1;
    }

    for (i = 0; i < data.dayNotes.length; i++) {
      var note = data.dayNotes[i];
      if (!note || !note.id) continue;
      if (existingNotes[note.id]) {
        stats.notesSkipped += 1;
        continue;
      }
      state.dayNotes.push(note);
      existingNotes[note.id] = true;
      stats.notesAdded += 1;
    }

    state.ledger.sort(function (a, b) {
      return a.ts - b.ts;
    });
    saveState();
    renderAll();
    return stats;
  }

  function buildExportText() {
    return JSON.stringify(buildExportPayload(), null, 2);
  }

  function exportFilename() {
    return "reward-overworld-" + dayKeyFromTs(Date.now()) + ".json";
  }

  function exportSummaryLine() {
    return (
      state.people.length +
      " players · " +
      state.ledger.length +
      " stars · " +
      state.dayNotes.length +
      " diary notes"
    );
  }

  function copyTextToClipboard(text) {
    return new Promise(function (resolve, reject) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(reject);
        return;
      }
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function downloadExportFile(text, filename) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  function setExportResult(message, isError) {
    if (!elExportResult) return;
    elExportResult.hidden = !message;
    elExportResult.textContent = message || "";
    elExportResult.classList.toggle("import-result--error", !!isError);
  }

  function copyExportToClipboard(showFeedback) {
    var text = exportDraft.text;
    if (!text) return Promise.reject(new Error("empty"));
    return copyTextToClipboard(text).then(
      function () {
        if (showFeedback !== false) {
          setExportResult(
            "Copied to clipboard! (" + exportSummaryLine() + ")",
            false
          );
        }
      },
      function () {
        setExportResult(
          "Could not copy automatically — tap Copy, Share, or select all in the box.",
          true
        );
        return Promise.reject(new Error("copy failed"));
      }
    );
  }

  function shareExportBackup() {
    var text = exportDraft.text;
    var filename = exportDraft.filename || exportFilename();
    if (!text) return Promise.reject(new Error("empty"));
    if (typeof navigator === "undefined" || !navigator.share) {
      return Promise.reject(new Error("share unavailable"));
    }
    var sharePromise;
    try {
      if (typeof File !== "undefined" && navigator.canShare) {
        var file = new File([text], filename, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          sharePromise = navigator.share({
            files: [file],
            title: "Reward Overworld backup",
          });
          return Promise.resolve(sharePromise).then(function () {
            setExportResult("Shared " + filename + " (" + exportSummaryLine() + ")", false);
          });
        }
      }
      sharePromise = navigator.share({
        title: "Reward Overworld backup",
        text: text,
      });
      return Promise.resolve(sharePromise).then(function () {
        setExportResult("Shared backup (" + exportSummaryLine() + ")", false);
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function openExportModal() {
    hideToast();
    exportDraft.text = buildExportText();
    exportDraft.filename = exportFilename();
    if (elExportTextarea) {
      elExportTextarea.value = exportDraft.text;
    }
    setExportResult("", false);
    if (elExportShare) {
      elExportShare.hidden = !(
        typeof navigator !== "undefined" && typeof navigator.share === "function"
      );
    }
    if (elExportModal) elExportModal.hidden = false;
    copyExportToClipboard(false).then(
      function () {
        setExportResult(
          "Copied to clipboard! (" + exportSummaryLine() + ")",
          false
        );
      },
      function () {
        setExportResult(
          "Tap Copy, Share, or select all in the box below.",
          true
        );
      }
    );
    if (elExportTextarea) {
      window.setTimeout(function () {
        elExportTextarea.focus();
        elExportTextarea.select();
      }, 0);
    }
  }

  function closeExportModal() {
    hideToast();
    if (elExportModal) elExportModal.hidden = true;
  }

  function exportBackup() {
    openExportModal();
  }

  function importBackupFromText(text) {
    var parsed;
    try {
      parsed = parseImportPayload(text);
    } catch (e) {
      return null;
    }
    return importBackupData(parsed);
  }

  function openImportModal() {
    hideToast();
    if (!elImportModal) return;
    if (elImportTextarea) elImportTextarea.value = "";
    if (elImportResult) {
      elImportResult.hidden = true;
      elImportResult.textContent = "";
      elImportResult.classList.remove("import-result--error");
    }
    elImportModal.hidden = false;
    if (elImportTextarea) {
      window.setTimeout(function () {
        elImportTextarea.focus();
      }, 0);
    }
  }

  function closeImportModal() {
    hideToast();
    if (elImportModal) elImportModal.hidden = true;
  }

  function setImportResult(message, isError) {
    if (!elImportResult) return;
    elImportResult.hidden = !message;
    elImportResult.textContent = message || "";
    elImportResult.classList.toggle("import-result--error", !!isError);
  }

  function runImportFromModal() {
    if (!elImportTextarea) return;
    var text = String(elImportTextarea.value || "").trim();
    if (!text) {
      setImportResult("Paste or pick a backup file first.", true);
      return;
    }
    var stats;
    try {
      var parsed = parseImportPayload(text);
      stats = importBackupData(parsed);
    } catch (e) {
      setImportResult("Could not read backup — check the JSON.", true);
      return;
    }
    setImportResult("Merged: " + formatImportStats(stats), false);
    window.setTimeout(closeImportModal, 900);
  }

  function importFromSelectedFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      if (elImportTextarea) elImportTextarea.value = text;
      runImportFromModal();
    };
    reader.onerror = function () {
      setImportResult("Could not read that file.", true);
    };
    reader.readAsText(file);
  }

  function isTypingInField() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el.isContentEditable
    );
  }

  function randomPick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function charactersByKind(kind) {
    var out = [];
    var i;
    for (i = 0; i < characters.length; i++) {
      if (characters[i].kind === kind) out.push(characters[i]);
    }
    return out;
  }

  function mineCheatItems() {
    var pool = MC_ITEMS_COMMON.concat(MC_ITEMS_RARE, MC_ITEMS_EPIC);
    var mineralIds = {
      dirt: 1,
      coal: 1,
      iron: 1,
      gold: 1,
      diamond: 1,
      emerald: 1,
      redstone: 1,
      netherite: 1,
      cobblestone: 1,
      torch: 1,
      chest: 1,
      plank: 1,
    };
    var picked = [];
    var i;
    for (i = 0; i < pool.length; i++) {
      if (mineralIds[pool[i].id]) picked.push(pool[i]);
    }
    return picked.length ? picked : pool;
  }

  function clearCheatFx() {
    if (!elCheatFx) return;
    elCheatFx.replaceChildren();
    elCheatFx.hidden = true;
    elCheatFx.setAttribute("aria-hidden", "true");
    cheatState.busy = false;
  }

  function runMineCheat() {
    if (!elCheatFx || cheatState.busy) return;
    var items = mineCheatItems();
    if (!items.length) {
      showToast("Nothing to mine yet — wait for items to load!");
      return;
    }
    cheatState.busy = true;
    elCheatFx.hidden = false;
    elCheatFx.setAttribute("aria-hidden", "false");
    elCheatFx.replaceChildren();

    var count = 36;
    var i;
    for (i = 0; i < count; i++) {
      (function (idx) {
        var item = items[idx % items.length];
        var img = document.createElement("img");
        img.className = "cheat-mine-item";
        img.alt = item.label;
        img.style.left = 4 + Math.random() * 92 + "%";
        img.style.animationDuration = 2.4 + Math.random() * 1.8 + "s";
        img.style.animationDelay = Math.random() * 1.2 + "s";
        img.style.setProperty(
          "--cheat-drift",
          (Math.random() * 80 - 40).toFixed(0) + "px"
        );
        img.style.width = 32 + Math.floor(Math.random() * 20) + "px";
        img.style.height = img.style.width;
        attachSpriteImg(img, item.id, item.wikiKey, item.src);
        elCheatFx.appendChild(img);
      })(i);
    }

    showToast("⛏️ Mine cheat! Look out below!");
    window.setTimeout(clearCheatFx, 4800);
  }

  function spawnCheatBoom(parent, x, y, big) {
    var boom = document.createElement("span");
    boom.className =
      "cheat-boom cheat-boom--pop" + (big ? " cheat-boom--big" : "");
    boom.style.left = x + "px";
    boom.style.top = y + "px";
    parent.appendChild(boom);
    var count = big ? 16 : 10;
    var p;
    for (p = 0; p < count; p++) {
      (function (n) {
        var spark = document.createElement("span");
        spark.className =
          "cheat-boom-particle" + (big ? " cheat-boom-particle--big" : "");
        spark.style.left = x + "px";
        spark.style.top = y + "px";
        var angle = (Math.PI * 2 * n) / count + Math.random() * 0.4;
        var dist = (big ? 40 : 28) + Math.random() * (big ? 55 : 42);
        spark.style.setProperty("--sx", Math.cos(angle) * dist + "px");
        spark.style.setProperty("--sy", Math.sin(angle) * dist + "px");
        spark.style.background =
          n % 3 === 0 ? "#ff5252" : n % 3 === 1 ? "#ffb300" : "#fff59d";
        parent.appendChild(spark);
      })(p);
    }
  }

  function craftProjectileItems() {
    return mineCheatItems();
  }

  function fighterCenterInArena(fighterEl, arenaEl) {
    var fr = fighterEl.getBoundingClientRect();
    var ar = arenaEl.getBoundingClientRect();
    return {
      x: fr.left - ar.left + fr.width / 2,
      y: fr.top - ar.top + fr.height * 0.38,
    };
  }

  function shootCheatProjectile(arena, fromEl, toEl, item, onDone) {
    var from = fighterCenterInArena(fromEl, arena);
    var to = fighterCenterInArena(toEl, arena);
    var size = 26;
    var proj = document.createElement("img");
    proj.className = "cheat-projectile";
    proj.alt = item.label;
    proj.width = size;
    proj.height = size;
    proj.style.setProperty("--from-x", from.x - size / 2 + "px");
    proj.style.setProperty("--from-y", from.y - size / 2 + "px");
    proj.style.setProperty("--to-x", to.x - size / 2 + "px");
    proj.style.setProperty("--to-y", to.y - size / 2 + "px");
    proj.style.left = from.x - size / 2 + "px";
    proj.style.top = from.y - size / 2 + "px";
    attachSpriteImg(proj, item.id, item.wikiKey, item.src);
    arena.appendChild(proj);
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (proj.parentNode) proj.parentNode.removeChild(proj);
      if (onDone) onDone();
    }
    proj.addEventListener("animationend", finish);
    window.setTimeout(finish, 520);
  }

  function buildCheatFighter(character, sideClass) {
    var wrap = document.createElement("div");
    wrap.className = "cheat-fighter " + sideClass;
    var img = document.createElement("img");
    img.alt = character.name;
    attachSpriteImg(img, character.id, character.wikiKey || character.id, character.src, character.name);
    wrap.appendChild(img);
    var lbl = document.createElement("span");
    lbl.className = "cheat-fighter__name";
    lbl.textContent = character.name;
    wrap.appendChild(lbl);
    return wrap;
  }

  function runCraftCheat() {
    if (!elCheatFx || cheatState.busy) return;
    var heroes = charactersByKind("hero");
    var villains = charactersByKind("villain");
    var items = craftProjectileItems();
    if (!heroes.length || !villains.length) {
      showToast("Need heroes and mobs loaded first!");
      return;
    }
    if (!items.length) {
      showToast("Wait for items to load first!");
      return;
    }

    var hero = randomPick(heroes);
    var villain = randomPick(villains);
    var heroWins = Math.random() < 0.5;
    var loserSide = heroWins ? "villain" : "hero";
    var winnerChar = loserSide === "hero" ? villain : hero;
    var loserChar = loserSide === "hero" ? hero : villain;
    var heroEl;
    var villainEl;
    var winnerEl;
    var loserEl;

    cheatState.busy = true;
    elCheatFx.hidden = false;
    elCheatFx.setAttribute("aria-hidden", "false");
    elCheatFx.replaceChildren();

    var stage = document.createElement("div");
    stage.className = "cheat-fight";

    var title = document.createElement("p");
    title.className = "cheat-fight__title";
    title.textContent = "Block battle!";
    stage.appendChild(title);

    var arena = document.createElement("div");
    arena.className = "cheat-fight__arena";

    heroEl = buildCheatFighter(hero, "cheat-fighter--hero");
    villainEl = buildCheatFighter(villain, "cheat-fighter--villain");
    arena.appendChild(heroEl);
    arena.appendChild(villainEl);
    winnerEl = loserSide === "hero" ? villainEl : heroEl;
    loserEl = loserSide === "hero" ? heroEl : villainEl;
    stage.appendChild(arena);
    elCheatFx.appendChild(stage);

    showToast("⚔️ Craft cheat! " + hero.name + " vs " + villain.name);

    var volleys = [
      { from: heroEl, to: villainEl, throwClass: "cheat-fighter--throw-left" },
      { from: villainEl, to: heroEl, throwClass: "cheat-fighter--throw-right" },
      { from: heroEl, to: villainEl, throwClass: "cheat-fighter--throw-left" },
      { from: villainEl, to: heroEl, throwClass: "cheat-fighter--throw-right" },
    ];
    var volleyIdx = 0;

    function runVolley() {
      if (volleyIdx >= volleys.length) {
        runFinalBarrage();
        return;
      }
      var v = volleys[volleyIdx];
      var item = randomPick(items);
      v.from.classList.add(v.throwClass);
      shootCheatProjectile(arena, v.from, v.to, item, function () {
        v.from.classList.remove(v.throwClass);
        v.to.classList.add("cheat-fighter--hit");
        arena.classList.add("cheat-fight__arena--shake");
        window.setTimeout(function () {
          arena.classList.remove("cheat-fight__arena--shake");
          v.to.classList.remove("cheat-fighter--hit");
          volleyIdx += 1;
          runVolley();
        }, 220);
      });
    }

    function runFinalBarrage() {
      title.textContent = "FINISH HIM!";
      title.classList.add("cheat-fight__title--dramatic");
      var blasts = 0;
      var maxBlasts = 6;

      function nextBlast() {
        if (blasts >= maxBlasts) {
          window.setTimeout(koFinish, 350);
          return;
        }
        var item = randomPick(items);
        winnerEl.classList.add(
          winnerEl === heroEl
            ? "cheat-fighter--throw-left"
            : "cheat-fighter--throw-right"
        );
        shootCheatProjectile(arena, winnerEl, loserEl, item, function () {
          winnerEl.classList.remove(
            "cheat-fighter--throw-left",
            "cheat-fighter--throw-right"
          );
          loserEl.classList.add("cheat-fighter--hit");
          arena.classList.add("cheat-fight__arena--shake");
          window.setTimeout(function () {
            arena.classList.remove("cheat-fight__arena--shake");
            loserEl.classList.remove("cheat-fighter--hit");
          }, 120);
          blasts += 1;
          window.setTimeout(nextBlast, 140);
        });
      }

      nextBlast();
    }

    function koFinish() {
      title.textContent = "K.O.! " + winnerChar.name + " wins!";
      loserEl.classList.add("cheat-fighter--ko");

      var rect = loserEl.getBoundingClientRect();
      var arenaRect = arena.getBoundingClientRect();
      var cx = rect.left - arenaRect.left + rect.width / 2;
      var cy = rect.top - arenaRect.top + rect.height * 0.35;

      spawnCheatBoom(arena, cx, cy, true);
      window.setTimeout(function () {
        spawnCheatBoom(arena, cx - 18, cy - 10, false);
        spawnCheatBoom(arena, cx + 16, cy + 8, false);
      }, 180);

      window.setTimeout(function () {
        loserEl.classList.remove("cheat-fighter--ko");
        loserEl.classList.add("cheat-fighter--explode", "cheat-fighter--explode-big");
        winnerEl.classList.add("cheat-fighter--win");
      }, 420);

      window.setTimeout(function () {
        loserEl.classList.add("cheat-fighter--gone");
      }, 1100);

      showToast("💥 " + loserChar.name + " got block-blasted!");
      window.setTimeout(clearCheatFx, 3200);
    }

    window.setTimeout(runVolley, 450);
  }

  function renderCheatList() {
    if (!elCheatList) return;
    elCheatList.replaceChildren("");
    var i;
    for (i = 0; i < CHEAT_DEFS.length; i++) {
      (function (def) {
        if (def.action === "help") return;
        var li = document.createElement("li");
        li.className = "cheat-list__item";
        var code = document.createElement("span");
        code.className = "cheat-list__code";
        code.textContent = def.code;
        var desc = document.createElement("span");
        desc.className = "cheat-list__desc";
        desc.textContent = def.desc;
        li.appendChild(code);
        li.appendChild(desc);
        elCheatList.appendChild(li);
      })(CHEAT_DEFS[i]);
    }
  }

  function renderCheatActions() {
    if (!elCheatActions) return;
    elCheatActions.replaceChildren("");
    var i;
    for (i = 0; i < CHEAT_DEFS.length; i++) {
      (function (def) {
        if (def.action === "help") return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cheat-action-btn cheat-action-btn--" + def.action;
        btn.setAttribute("data-cheat-action", def.action);
        var title = document.createElement("span");
        title.className = "cheat-action-btn__label";
        title.textContent = def.label || def.code;
        var hint = document.createElement("span");
        hint.className = "cheat-action-btn__hint";
        hint.textContent = def.desc;
        btn.appendChild(title);
        btn.appendChild(hint);
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          runCheatAction(def.action);
        });
        elCheatActions.appendChild(btn);
      })(CHEAT_DEFS[i]);
    }
  }

  function runCheatAction(action) {
    var key = String(action || "").trim();
    if (key === "mine") {
      closeCheatHelp();
      runMineCheat();
      return;
    }
    if (key === "craft") {
      closeCheatHelp();
      runCraftCheat();
      return;
    }
    if (key === "help") {
      openCheatHelp();
    }
  }

  function openCheatHelp() {
    if (!elCheatHelpModal) return;
    renderCheatActions();
    renderCheatList();
    elCheatHelpModal.hidden = false;
  }

  function closeCheatHelp() {
    if (elCheatHelpModal) elCheatHelpModal.hidden = true;
  }

  function tryCheatCodes(key) {
    var now = Date.now();
    if (now - cheatState.lastAt > 3500) cheatState.buffer = "";
    cheatState.lastAt = now;

    if (key.length !== 1) return;
    cheatState.buffer += key === "?" ? "?" : key.toLowerCase();
    if (cheatState.buffer.length > 12) {
      cheatState.buffer = cheatState.buffer.slice(-12);
    }

    if (cheatState.buffer.slice(-4) === "mine") {
      cheatState.buffer = "";
      runMineCheat();
      return;
    }
    if (cheatState.buffer.slice(-5) === "craft") {
      cheatState.buffer = "";
      runCraftCheat();
      return;
    }
    if (cheatState.buffer.slice(-1) === "?") {
      cheatState.buffer = "";
      openCheatHelp();
    }
  }

  function resetAllData() {
    if (
      !window.confirm(
        "Delete ALL players and star history on this device? This cannot be undone."
      )
    ) {
      return;
    }
    state.people = [];
    state.ledger = [];
    state.dayNotes = [];
    state.settings.filterPersonId = "all";
    state.settings.selectedDayKey = dayKeyFromTs(Date.now());
    saveState();
    try {
      localStorage.removeItem(LS_DATA);
      localStorage.removeItem("reward_overworld_v1");
    } catch (e) {}
    clearStateCookie();
    renderAll();
    showToast("All data cleared.");
  }

  function bind() {
    if (elTabHome) {
      elTabHome.addEventListener("click", function () {
        setView("home");
      });
    }
    if (elTabDiary) {
      elTabDiary.addEventListener("click", function () {
        setView("diary");
      });
    }
    if (elTabStats) {
      elTabStats.addEventListener("click", function () {
        setView("stats");
        setStatsPeriod(statsPeriod());
        setLeaderboardRange(leaderboardRange());
        renderTrendChart();
        renderDayDetail();
        renderLeaderboard();
        renderPersonStats();
        renderStatsDiary();
        renderBreakdown();
        renderActivityLog();
      });
    }
    var leaderboardTabs = document.querySelectorAll(".leaderboard-tabs__btn");
    var lb;
    for (lb = 0; lb < leaderboardTabs.length; lb++) {
      leaderboardTabs[lb].addEventListener("click", function () {
        var range = this.getAttribute("data-range");
        if (range) setLeaderboardRange(range);
      });
    }
    if (elPersonFilter) {
      elPersonFilter.addEventListener("change", function () {
        state.settings.filterPersonId = elPersonFilter.value || "all";
        saveState();
        renderAll();
      });
    }
    if (document.getElementById("btn-add-player")) {
      document.getElementById("btn-add-player").addEventListener("click", openAddPlayerModal);
    }
    if (elRewardClose) elRewardClose.addEventListener("click", closeRewardSheet);
    if (elRewardBackdrop) elRewardBackdrop.addEventListener("click", closeRewardSheet);
    if (elRewardStepBack) {
      elRewardStepBack.addEventListener("click", function () {
        showRewardStep("category");
      });
    }

    if (elAddBackdrop) elAddBackdrop.addEventListener("click", closeAddPlayerModal);
    if (elAddForm) {
      elAddForm.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      elAddForm.addEventListener("submit", saveNewPlayer);
    }
    if (document.getElementById("add-player-cancel")) {
      document.getElementById("add-player-cancel").addEventListener("click", closeAddPlayerModal);
    }
    if (elPlayerName) {
      elPlayerName.addEventListener("input", syncAddSaveEnabled);
    }
    if (elPlayerSetupNext) {
      elPlayerSetupNext.addEventListener("click", beginItemSetupWizard);
    }
    if (elItemSetupBack) {
      elItemSetupBack.addEventListener("click", setupStepBack);
    }
    if (elCharTabHero) {
      elCharTabHero.addEventListener("click", function (e) {
        e.preventDefault();
        playerModalDraft.charKind = "hero";
        playerModalDraft.characterId = firstCharIdForKind("hero");
        renderCharGrid();
        syncAddSaveEnabled();
      });
    }
    if (elCharTabVillain) {
      elCharTabVillain.addEventListener("click", function (e) {
        e.preventDefault();
        playerModalDraft.charKind = "villain";
        playerModalDraft.characterId = firstCharIdForKind("villain");
        renderCharGrid();
        syncAddSaveEnabled();
      });
    }
    if (document.getElementById("btn-export")) {
      document.getElementById("btn-export").addEventListener("click", exportBackup);
    }
    if (elExportBackdrop) {
      elExportBackdrop.addEventListener("click", closeExportModal);
    }
    if (elExportDone) {
      elExportDone.addEventListener("click", closeExportModal);
    }
    if (elExportCopy) {
      elExportCopy.addEventListener("click", function () {
        copyExportToClipboard(true);
      });
    }
    if (elExportDownload) {
      elExportDownload.addEventListener("click", function () {
        if (
          downloadExportFile(exportDraft.text, exportDraft.filename)
        ) {
          setExportResult("Saved " + exportDraft.filename, false);
        } else {
          setExportResult("Could not save file here — try Share or Copy.", true);
        }
      });
    }
    if (elExportShare) {
      elExportShare.addEventListener("click", function () {
        shareExportBackup().catch(function () {
          setExportResult("Share not available — use Copy or Save file.", true);
        });
      });
    }
    if (document.getElementById("btn-import")) {
      document.getElementById("btn-import").addEventListener("click", openImportModal);
    }
    if (elImportPickFile && elImportFile) {
      elImportPickFile.addEventListener("click", function () {
        elImportFile.click();
      });
      elImportFile.addEventListener("change", function () {
        var file = elImportFile.files && elImportFile.files[0];
        elImportFile.value = "";
        importFromSelectedFile(file);
      });
    }
    if (elImportBackdrop) {
      elImportBackdrop.addEventListener("click", closeImportModal);
    }
    if (elImportCancel) {
      elImportCancel.addEventListener("click", closeImportModal);
    }
    if (elImportMerge) {
      elImportMerge.addEventListener("click", runImportFromModal);
    }
    if (document.getElementById("btn-clear-data")) {
      document.getElementById("btn-clear-data").addEventListener("click", resetAllData);
    }
    if (elPeriodWeek) {
      elPeriodWeek.addEventListener("click", function () {
        setStatsPeriod("week");
      });
    }
    if (elPeriodMonth) {
      elPeriodMonth.addEventListener("click", function () {
        setStatsPeriod("month");
      });
    }
    if (elBtnOpenDiary) {
      elBtnOpenDiary.addEventListener("click", function () {
        setView("diary");
      });
    }
    if (elDayNoteFormHome) {
      elDayNoteFormHome.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = elDayNoteInputHome ? elDayNoteInputHome.value : "";
        if (addDayNote(dayKeyFromTs(Date.now()), text)) {
          if (elDayNoteInputHome) elDayNoteInputHome.value = "";
          renderDayNotesPanels();
          showToast("Saved to diary.");
        }
      });
    }
    if (elDayNoteFormDiary) {
      elDayNoteFormDiary.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = elDayNoteInputDiary ? elDayNoteInputDiary.value : "";
        if (addDayNote(dayKeyFromTs(Date.now()), text)) {
          if (elDayNoteInputDiary) elDayNoteInputDiary.value = "";
          renderDayNotesPanels();
          showToast("Saved to diary.");
        }
      });
    }
    if (elDayNoteFormStats) {
      elDayNoteFormStats.addEventListener("submit", function (e) {
        e.preventDefault();
        var text = elDayNoteInputStats ? elDayNoteInputStats.value : "";
        if (addDayNote(selectedDayKey(), text)) {
          if (elDayNoteInputStats) elDayNoteInputStats.value = "";
          renderDayNotesPanels();
          showToast("Diary entry saved.");
        }
      });
    }
    if (elCheatHelpBackdrop) {
      elCheatHelpBackdrop.addEventListener("click", closeCheatHelp);
    }
    if (elCheatHelpClose) {
      elCheatHelpClose.addEventListener("click", closeCheatHelp);
    }
    if (elCheatLaunch) {
      elCheatLaunch.addEventListener("click", function (e) {
        e.preventDefault();
        openCheatHelp();
      });
    }

    window.addEventListener("pagehide", function () {
      saveState();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") saveState();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (elCheatHelpModal && !elCheatHelpModal.hidden) closeCheatHelp();
        if (elCheatFx && !elCheatFx.hidden) clearCheatFx();
        if (elImportModal && !elImportModal.hidden) closeImportModal();
        if (elExportModal && !elExportModal.hidden) closeExportModal();
        if (elRewardSheet && !elRewardSheet.hidden) closeRewardSheet();
        if (elAddModal && !elAddModal.hidden) closeAddPlayerModal();
        return;
      }
      if (isTypingInField()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      tryCheatCodes(e.key);
    });
  }

  function init() {
    hideToast();
    rebuildItemIndex();
    loadState();
    bind();
    Promise.all([loadCharacters(), loadMcItems(), loadBehaviorCategories()]).then(function () {
      setStatsPeriod(statsPeriod());
      renderAll();
      prefetchAnimatedWikiGifs();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
