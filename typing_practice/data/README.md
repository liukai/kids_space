# Word data (`words.json`)

Edit **`words.json`** to add, remove, or change practice items.

**Pure local:** the app reads words from **`js/words-data.js`** (embedded array). After every edit to `words.json`, run:

```bash
python3 tools/sync_words_to_js.py
```

(from the `typing_practice/` folder). That regenerates `words-data.js` so double-clicking **`index.html`** still works without a server.

## Schema (one object per line in the array)

| Field | Required | Description |
|--------|----------|-------------|
| `w` | yes | Word, phrase, or sentence to type (lowercase in bank; app may show as-is). |
| `zh` | yes | Chinese hint / translation (shown below the typing area when relevant). |
| `kind` | yes | `"cvc"` \| `"sight"` \| `"simple"` \| `"phrase"` — drives modes and badges. |
| `e` | yes | Emoji / icon hint for the card. |
| `level` | no | Extra educator note under the type badge (plain text). |
| `difficulty` | no | Integer **1–5**. If omitted, the app **infers** difficulty (see `js/config.js` → `inference`). |

## Example

```json
{
  "w": "cat",
  "zh": "猫",
  "kind": "cvc",
  "e": "🐱"
}
```

```json
{
  "w": "hello",
  "zh": "你好",
  "kind": "simple",
  "e": "👋",
  "level": "Greeting — say it like a friend.",
  "difficulty": 3
}
```

## Regenerating from an old JS bank

If you have a legacy `word-bank.js` using `c()` / `sight()` / `sim()` / `phrase()`:

```bash
cd typing_practice
python3 tools/js_bank_to_json.py /path/to/word-bank.js
```

This overwrites **`data/words.json`**.

## Valid JSON

Use a JSON linter if the page stops loading words after an edit. Invalid files log an error in the browser console.
