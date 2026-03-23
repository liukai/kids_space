# Typing practice — architecture

Plain **static** site: no build step, no bundler. Open `index.html` in a browser (or serve the folder).

## Separation: code vs data vs config

| Path | Responsibility |
|------|----------------|
| **`data/words.json`** | **Authoritative word list** — edit this (valid JSON). See `data/README.md`. |
| **`js/words-data.js`** | **Embedded copy** for `file://` (browsers block `fetch` for local JSON). Regenerate with `python3 tools/sync_words_to_js.py` after changing the JSON. |
| **`js/config.js`** | **Tunables only** — storage keys, difficulty inference lists, quiz length, trophy ladder, UI hint strings. No entries from the word bank. |
| **`js/app.js`** | **Runtime** — loads config + words, normalizes rows, typing loop, speech, trophies. |
| **`index.html`** | Shell + stable element **`id`s**. |
| **`css/app.css`** | Presentation. |

## Script load order

1. **`js/config.js`** — `window.TYPING_PRACTICE_CONFIG`.
2. **`js/words-data.js`** — `window.TYPING_PRACTICE_PRELOADED_WORDS` (same content as `words.json`).
3. **`js/app.js`** — reads config + preloaded words, then boots.

If `PRELOADED` is missing, the app tries **`fetch(cfg.paths.wordsJson)`** (works when served over `http://`; usually **fails on `file://`**).

## Where to change things

| Goal | Edit |
|------|------|
| Add / change / remove practice items | **`data/words.json`**, then **`python3 tools/sync_words_to_js.py`** |
| Change localStorage key names, quiz length, trophy steps, inference rules | **`js/config.js`** |
| Change behavior (new modes, bugs) | **`js/app.js`** |
| Styling | **`css/app.css`** |
| Markup | **`index.html`** |

## Legacy JS word bank → JSON

If you have an old `word-bank.js` using `c()` / `sight()` / `sim()` / `phrase()`:

```bash
cd typing_practice
python3 tools/js_bank_to_json.py /path/to/word-bank.js
```

## Offline & “Save for later”

- **Recommended:** zip the whole **`typing_practice/`** folder (`data/`, `css/`, `js/` next to `index.html`).
- **Single HTML:** **💾 Save for later** inlines `css/app.css`, `js/config.js`, `data/words.json` (as `TYPING_PRACTICE_PRELOADED_WORDS`), and `js/app.js`. Same-origin `fetch` must work (or zip the folder).

## Optional next steps

- Split `app.js` into ordered non-module scripts if it grows.
- Add a JSON Schema file for `words.json` validation in editors.
