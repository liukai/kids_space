/**
 * Typing practice — tunable configuration (no word entries here).
 * Edit this file to change storage keys, difficulty rules, quiz length, trophies, UI copy.
 * Word list: data/words.json (see data/README.md for schema).
 */
window.TYPING_PRACTICE_CONFIG = {
  /** Relative to index.html (fetch). */
  paths: {
    wordsJson: "data/words.json",
  },

  /** Allowed `kind` values when loading words.json */
  wordSchema: {
    allowedKinds: ["cvc", "sight", "simple", "phrase"],
  },

  storage: {
    statsKey: "typingPracticeKidV2",
    zhVoiceKey: "typingPracticeZhVoiceURI",
    enVoiceKey: "typingPracticeEnVoiceURI",
    ttsMasterKey: "typingPracticeTtsMaster",
    ttsEnKey: "typingPracticeTtsEn",
    ttsZhKey: "typingPracticeTtsZh",
    keySoundsKey: "typingPracticeKeySounds",
  },

  difficulty: {
    min: 1,
    max: 5,
  },

  /** Index 0 = difficulty 1 (letter warm-up row uses ①). */
  difficultyLevels: [
    { label: "Easy", sub: "🔤 one letter", emoji: "①" },
    { label: "Sound-out", sub: "🐸 c-a-t words", emoji: "②" },
    { label: "Fast read", sub: "❤️ know it by heart", emoji: "③" },
    { label: "Bigger", sub: "📖 longer words", emoji: "④" },
    { label: "Story", sub: "📝 whole lines", emoji: "⑤" },
  ],

  /** Shown under the type badge when an entry has no custom `level` field. */
  eduHintsByKind: {
    cvc: "🐸 Sound each chunk, then say the word.",
    sight: "❤️ Read the whole word fast.",
    simple: "📖 Bigger word — go slow.",
    phrase: "📝 Spaces & dots like a book.",
  },

  /**
   * Used only when a word has no explicit `difficulty` in JSON.
   * sightTier2 / sightTier3: space-separated lowercase tokens.
   */
  inference: {
    cvcHarderWords: [
      "yet",
      "sum",
      "web",
      "rip",
      "rid",
      "rot",
      "zig",
      "wax",
      "sub",
      "jug",
      "kit",
      "pit",
      "ram",
      "sag",
      "tan",
      "rod",
      "lab",
      "dug",
      "hid",
      "fin",
      "tin",
    ],
    sightTier2Words:
      "a i at it in is on no up go do am an me my we he so to the and you can see for of",
    sightTier3Words: "was be us are all but had has her his get here she or if by as",
    phraseShortMaxWords: 5,
    phraseShortMaxChars: 20,
  },

  /** Random pick for word/sentence practice (not quiz). */
  practicePick: {
    /** If random < this and pool has diff-5 items, pick diff 5. */
    difficulty5MaxR: 0.1,
    /** Else if random < this and pool has diff-4, pick diff 4. */
    difficulty4MaxR: 0.25,
  },

  quiz: {
    targetWordCount: 30,
    lineBreakEveryNWords: 10,
  },

  trophies: {
    /** 🥇 medals required for one big 🏆. */
    goldForMega: 3,
    /** Bronze / silver dots & merge: merge when count reaches mergeSteps. */
    mergeSteps: 3,
  },
};
