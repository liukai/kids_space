/**
 * Reward Overworld — Minecraft-themed star board for kids.
 * Data stays in the browser (localStorage + cookie mirror for prefs).
 */
(function () {
  "use strict";

  var LS_DATA = "reward_overworld_v1";
  var COOKIE_DATA = "reward_overworld_v1";
  var MAX_PEOPLE = 12;
  var MAX_EVENTS = 2000;

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
    migrateEvents();
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
      hint: "Everyday loot — dirt, coal, torches, chests, and starter blocks.",
      tier: "common",
      field: "like1",
      next: "like3",
    },
    like3: {
      label: "+3 reward · Rare",
      hint: "Shinier finds — iron, gold, diamonds, redstone, even TNT!",
      tier: "rare",
      field: "like3",
      next: "like5",
    },
    like5: {
      label: "+5 reward · Epic",
      hint: "Legendary loot — netherite, beacons, enchanted gear, and big flex items.",
      tier: "epic",
      field: "like5",
      next: "dislike1",
    },
    dislike1: {
      label: "−1 oops · Yikes!",
      hint: "Gross traps & creep-outs — slime, mushrooms, dispensers, observers, and nether junk.",
      tier: "dislike_mild",
      field: "dislike1",
      next: "dislike3",
    },
    dislike3: {
      label: "−3 oops · BIG YIKES",
      hint: "The scariest stuff — lava, TNT, sculk, the Warden, Wither, and bedrock!",
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
      src: "https://minecraft.wiki/images/thumb/Steve_%28classic%29_JE2.png/128px-Steve_%28classic%29_JE2.png?790ea",
    },
    {
      id: "alex",
      name: "Alex",
      kind: "hero",
      src: "https://minecraft.wiki/images/thumb/Alex_%28slim%29_JE2.png/128px-Alex_%28slim%29_JE2.png?f1c0e",
    },
    {
      id: "villager",
      name: "Villager",
      kind: "hero",
      src: "https://minecraft.wiki/images/thumb/Plains_Villager_Base_JE2.png/128px-Plains_Villager_Base_JE2.png?a2fcc",
    },
    {
      id: "creeper",
      name: "Creeper",
      kind: "villain",
      src: "https://minecraft.wiki/images/thumb/Creeper_JE3_BE1.png/128px-Creeper_JE3_BE1.png?dc7b2",
    },
    {
      id: "zombie",
      name: "Zombie",
      kind: "villain",
      src: "https://minecraft.wiki/images/thumb/Zombie_JE3_BE2.png/128px-Zombie_JE3_BE2.png?c5423",
    },
  ];

  var characters = [];
  var charById = {};

  var state = {
    version: 1,
    people: [],
    events: [],
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
    step: "points",
    pendingPoints: null,
    pendingItemId: null,
    pendingItemLabel: null,
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

  function wikiFilePathUrl(filename) {
    return (
      "https://minecraft.wiki/Special:FilePath/" +
      encodeURIComponent(filename) +
      "?width=128"
    );
  }

  function resolveWikiThumb(wikiKey) {
    var key = String(wikiKey || "").trim();
    if (!key) return "";
    if (window.REWARD_WIKI_IMAGES && window.REWARD_WIKI_IMAGES[key]) {
      return window.REWARD_WIKI_IMAGES[key];
    }
    if (window.REWARD_EXTRA_WIKI_FILES && window.REWARD_EXTRA_WIKI_FILES[key]) {
      return wikiFilePathUrl(window.REWARD_EXTRA_WIKI_FILES[key]);
    }
    return "";
  }

  function localSpriteCandidates(id) {
    var base = "assets/sprites/" + id;
    return [base + ".png", base + ".gif", base + ".webp"];
  }

  function isLocalSpritePlaceholder(src, id) {
    var local = String(src || "").trim();
    if (local.indexOf("assets/sprites/") !== 0) return false;
    var base = "assets/sprites/" + id;
    return (
      local === base + ".png" ||
      local === base + ".gif" ||
      local === base + ".webp"
    );
  }

  function spriteSrcCandidates(id, wikiKey, jsonSrc) {
    var candidates = [];
    var seen = {};
    var local = String(jsonSrc || "").trim();
    var key = String(wikiKey || id || "").trim();
    var wiki = resolveWikiThumb(key);
    var placeholder = isLocalSpritePlaceholder(local, id);
    var i;

    function push(url) {
      if (!url || seen[url]) return;
      seen[url] = true;
      candidates.push(url);
    }

    if (wiki && placeholder) push(wiki);
    if (local.indexOf("assets/") === 0 && !placeholder) push(local);
    if (local.indexOf("http://") === 0 || local.indexOf("https://") === 0) {
      push(local);
    }
    if (wiki) push(wiki);
    if (local.indexOf("assets/") === 0) push(local);
    for (i = 0; i < localSpriteCandidates(id).length; i++) {
      push(localSpriteCandidates(id)[i]);
    }
    if (local && local.indexOf("assets/") !== 0 && local.indexOf("http") !== 0) {
      push(local);
    }
    return candidates;
  }

  function resolvedSpriteSrc(id, wikiKey, jsonSrc) {
    var candidates = spriteSrcCandidates(id, wikiKey, jsonSrc);
    return candidates[0] || localSpriteCandidates(id)[0];
  }

  function attachSpriteImg(img, id, wikiKey, jsonSrc) {
    var candidates = spriteSrcCandidates(id, wikiKey, jsonSrc);
    var step = 0;
    img.onerror = function () {
      step += 1;
      if (step < candidates.length) {
        img.src = candidates[step];
      } else {
        img.onerror = null;
        img.classList.add("sprite-img--missing");
      }
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

  function saveState() {
    if (state.events.length > MAX_EVENTS) {
      state.events = state.events.slice(-MAX_EVENTS);
    }
    var str = JSON.stringify(state);
    try {
      localStorage.setItem(LS_DATA, str);
    } catch (e) {}
    if (isHttpProto() && str.length < 3500) {
      try {
        document.cookie =
          COOKIE_DATA +
          "=" +
          encodeURIComponent(str) +
          ";path=/;max-age=" +
          365 * 86400 +
          ";SameSite=Lax";
      } catch (e2) {}
    }
  }

  function loadState() {
    var raw = null;
    if (isHttpProto()) {
      var all = document.cookie.split("; ");
      var i;
      for (i = 0; i < all.length; i++) {
        var ix = all[i].indexOf("=");
        if (ix === -1) continue;
        if (all[i].slice(0, ix) === COOKIE_DATA) {
          try {
            raw = decodeURIComponent(all[i].slice(ix + 1));
          } catch (e) {}
          break;
        }
      }
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(LS_DATA);
      } catch (e2) {}
    }
    if (!raw) {
      ensureSettingsDefaults();
      return;
    }
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.people) && Array.isArray(parsed.events)) {
        state.people = parsed.people;
        state.events = parsed.events;
        state.dayNotes = Array.isArray(parsed.dayNotes) ? parsed.dayNotes : [];
        if (parsed.settings) {
          state.settings = parsed.settings;
        }
      }
    } catch (e3) {}
    ensureSettingsDefaults();
    migratePeople();
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
    var evs = personId != null ? state.events.filter(function (e) { return e.personId === personId; }) : eventsForFilter();
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
      var id = ev.reasonId || ev.reasonLabel || "other";
      var label = ev.reasonLabel || itemDisplay(id);
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
      lbl.textContent =
        (person ? personDisplayLabel(person) + " · " : "") +
        eventItemAndCategory(ev);
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
    if (pid === "all") return state.events.slice();
    return state.events.filter(function (ev) {
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

  function categoryDisplay(ev) {
    if (!ev) return "";
    if (ev.categoryLabel) return ev.categoryLabel;
    var cat = behaviorCategoryById(resolveLegacyCategoryId(ev.categoryId));
    return cat ? cat.label : "";
  }

  function eventItemAndCategory(ev) {
    var item = itemDisplay(ev.reasonId || ev.reasonLabel);
    var cat = categoryDisplay(ev);
    return cat ? item + " · " + cat : item;
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
    attachSpriteImg(img, character.id, character.wikiKey || character.id, character.src);
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

  function migrateEvents() {
    var i;
    for (i = 0; i < state.events.length; i++) {
      var ev = state.events[i];
      if (!ev.categoryId && !ev.categoryLabel) {
        ev.categoryId = "other";
        ev.categoryLabel = "";
        continue;
      }
      if (ev.categoryId) {
        var resolved = resolveLegacyCategoryId(ev.categoryId);
        if (resolved !== ev.categoryId) {
          ev.categoryId = resolved;
          if (!ev.categoryLabel) {
            var cat = behaviorCategoryById(resolved);
            if (cat) ev.categoryLabel = cat.label;
          }
        }
      }
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
    if (isProfile) return;

    var meta = ITEM_SETUP_META[step];
    if (!meta) return;
    if (elItemPickStepLabel) elItemPickStepLabel.textContent = meta.label;
    if (elItemPickStepHint) elItemPickStepHint.textContent = meta.hint;

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
      beginCategoryPick(
        points,
        item ? item.id : "unknown",
        item ? item.label : "?"
      );
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
    var evs = state.events.filter(function (e) {
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

  function showToast(msg, kind) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.hidden = false;
    elToast.classList.remove("toast--mega", "toast--rare", "toast--oops", "toast--oops-big");
    if (kind === "mega") elToast.classList.add("toast--mega");
    if (kind === "rare") elToast.classList.add("toast--rare");
    if (kind === "oops") elToast.classList.add("toast--oops");
    if (kind === "oops-big") elToast.classList.add("toast--oops-big");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      elToast.hidden = true;
    }, 2400);
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
        itemsPreview.className = "person-card__rewards";
        itemsPreview.textContent =
          "+1 " +
          itemDisplay(person.items.like1) +
          " · +3 " +
          itemDisplay(person.items.like3) +
          " · +5 " +
          itemDisplay(person.items.like5);
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
      title.textContent =
        (person ? personDisplayLabel(person) : "?") +
        " · " +
        eventItemAndCategory(ev);
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
    if (elRewardStepPoints) elRewardStepPoints.hidden = step !== "points";
    if (elRewardStepCategory) elRewardStepCategory.hidden = step !== "category";
  }

  function openRewardSheet(personId) {
    var person = personById(personId);
    if (!person || !elRewardSheet) return;
    rewardContext.personId = personId;
    rewardContext.pendingPoints = null;
    rewardContext.pendingItemId = null;
    rewardContext.pendingItemLabel = null;

    var ch = characterById(person.characterId);
    if (elRewardPerson) {
      elRewardPerson.replaceChildren();
      if (ch) {
        appendCharacterImg(elRewardPerson, ch, "sheet__avatar");
      }
      var copy = document.createElement("div");
      var strong = document.createElement("strong");
      strong.textContent = personDisplayLabel(person);
      copy.appendChild(strong);
      if (ch) {
        var sub = document.createElement("span");
        sub.textContent = ch.name + (ch.kind === "villain" ? " · mob avatar" : " · hero");
        copy.appendChild(sub);
      }
      normalizePersonItems(person);
      var itemsLine = document.createElement("span");
      itemsLine.className = "sheet__rewards-line";
      itemsLine.textContent = personItemsSummary(person);
      copy.appendChild(itemsLine);
      elRewardPerson.appendChild(copy);
    }

    if (elRewardTierHint) elRewardTierHint.textContent = "Pick points";
    showRewardStep("points");
    renderPointPickers();
    elRewardSheet.hidden = false;
  }

  function closeRewardSheet() {
    if (elRewardSheet) elRewardSheet.hidden = true;
    rewardContext.personId = null;
    rewardContext.pendingPoints = null;
    rewardContext.pendingItemId = null;
    rewardContext.pendingItemLabel = null;
    rewardContext.step = "points";
  }

  function beginCategoryPick(points, itemId, itemLabel) {
    rewardContext.pendingPoints = points;
    rewardContext.pendingItemId = itemId;
    rewardContext.pendingItemLabel = itemLabel;
    if (elRewardPendingSummary) {
      elRewardPendingSummary.textContent =
        formatScore(points) + " · " + itemDisplay(itemId);
      elRewardPendingSummary.className =
        "reward-pending-summary" +
        (points < 0 ? " reward-pending-summary--oops" : " reward-pending-summary--good");
    }
    renderCategoryPicker();
    showRewardStep("category");
  }

  function renderCategoryPicker() {
    if (!elCategoryPicker) return;
    elCategoryPicker.replaceChildren("");
    var points = rewardContext.pendingPoints;
    var cats = categoriesForPoints(points);
    var stepHint = document.querySelector("#reward-step-category .point-picker-hint");
    if (stepHint) {
      stepHint.textContent =
        points >= 0 ? "What did they do well?" : "What happened?";
    }
    var i;
    for (i = 0; i < cats.length; i++) {
      (function (cat) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "category-chip category-chip--" + (cat.kind === "bad" ? "bad" : "good");
        appendCategoryImg(btn, cat, "category-chip__img", 44);
        var lbl = document.createElement("span");
        lbl.className = "category-chip__label";
        lbl.textContent = cat.label;
        btn.appendChild(lbl);
        btn.addEventListener("click", function () {
          logStar(
            rewardContext.pendingPoints,
            rewardContext.pendingItemId,
            rewardContext.pendingItemLabel,
            cat.id,
            cat.label
          );
        });
        elCategoryPicker.appendChild(btn);
      })(cats[i]);
    }
  }

  function renderPointPickers() {
    var person = personById(rewardContext.personId);
    if (!person || !elPointAll) return;
    normalizePersonItems(person);
    elPointAll.replaceChildren("");
    elPointAll.appendChild(createPointButton(1, mcItemById(person.items.like1)));
    elPointAll.appendChild(createPointButton(3, mcItemById(person.items.like3)));
    elPointAll.appendChild(createPointButton(5, mcItemById(person.items.like5)));
    elPointAll.appendChild(createPointButton(-1, mcItemById(person.items.dislike1)));
    elPointAll.appendChild(createPointButton(-3, mcItemById(person.items.dislike3)));
  }

  function logStar(points, itemId, itemLabel, categoryId, categoryLabel) {
    if (rewardContext.personId == null) return;
    var ev = {
      id: uid("ev"),
      personId: rewardContext.personId,
      points: points,
      reasonId: itemId,
      reasonLabel: itemLabel,
      categoryId: categoryId || "other",
      categoryLabel: categoryLabel || "",
      note: "",
      ts: Date.now(),
    };
    state.events.push(ev);
    saveState();

    var person = personById(rewardContext.personId);
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
    var catPart = categoryLabel ? " · " + categoryLabel : "";
    showToast(
      (person ? personDisplayLabel(person) + ": " : "") +
        formatScore(points) +
        " ⭐ · " +
        itemDisplay(itemId) +
        catPart,
      kind
    );
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
    state.events = state.events.filter(function (e) {
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
        attachSpriteImg(img, c.id, c.wikiKey || c.id, c.src);
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

  function exportBackup() {
    var str = JSON.stringify(state, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(
        function () {
          showToast("Backup copied to clipboard.");
        },
        function () {
          window.prompt("Copy this backup:", str);
        }
      );
    } else {
      window.prompt("Copy this backup:", str);
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
    state.events = [];
    state.dayNotes = [];
    state.settings.filterPersonId = "all";
    state.settings.selectedDayKey = dayKeyFromTs(Date.now());
    saveState();
    try {
      localStorage.removeItem(LS_DATA);
    } catch (e) {}
    document.cookie = COOKIE_DATA + "=;path=/;max-age=0;SameSite=Lax";
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
        showRewardStep("points");
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

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (elRewardSheet && !elRewardSheet.hidden) closeRewardSheet();
        if (elAddModal && !elAddModal.hidden) closeAddPlayerModal();
      }
    });
  }

  function init() {
    rebuildItemIndex();
    loadState();
    bind();
    Promise.all([loadCharacters(), loadMcItems(), loadBehaviorCategories()]).then(function () {
      setStatsPeriod(statsPeriod());
      renderAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
