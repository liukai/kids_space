/**
 * Regenerate flashcards/words-embed.js from flashcards/words.json
 * so opening index.html via file:// works (fetch is blocked there).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "words.json");
const outPath = path.join(root, "words-embed.js");

const data = fs.readFileSync(jsonPath, "utf8");
JSON.parse(data); // validate
const banner =
  "// Auto-generated from words.json — run: node flashcards/tools/sync-embed.mjs\n";
fs.writeFileSync(outPath, `${banner}window.__FLASHCARD_WORDS__ = ${data.trim()}\n`);
console.log("Wrote", outPath);
