# Typing practice

Kid-friendly **typing practice**: letters, CVC / sight / vocab, short sentences, and a quiz — with optional English + 中文 speech (master + per-language toggles), **key sounds** on/off, trophy **popups after** you finish a letter / word / line / quiz, and a short **completion flash** on the screen. **Retro computer** styling.

## Project structure

```
typing_practice/
├── index.html
├── data/
│   ├── words.json      # ← Source of truth — edit here (then sync, see below)
│   └── README.md       # Schema & examples
├── css/
│   └── app.css
├── js/
│   ├── config.js       # Tunables
│   ├── words-data.js   # ← Embedded copy of words (required for file:// / pure local)
│   └── app.js
├── tools/
│   ├── sync_words_to_js.py  # words.json → words-data.js (run after JSON edits)
│   └── js_bank_to_json.py   # Optional: legacy word-bank.js → words.json
├── ARCHITECTURE.md
├── README.md
└── download-online.sh
```

See **`ARCHITECTURE.md`** and **`data/README.md`** for how code, config, and data split.

## Run locally (pure local — double-click `index.html`)

Keep **`data/`**, **`css/`**, and **`js/`** next to **`index.html`**.

Words are loaded from **`js/words-data.js`** (no `fetch`), so **opening `index.html` from the folder works** in Chrome / Safari / Edge.

After you change **`data/words.json`**, regenerate the embed:

```bash
cd typing_practice && python3 tools/sync_words_to_js.py
```

Optional local server (same files, useful for dev):

```bash
cd typing_practice && python3 -m http.server 8080
```

## Save for offline

1. **Best:** zip the whole **`typing_practice/`** folder.
2. Or **💾 Save for later** (inlines CSS, config, `words.json`, and `app.js` when `fetch` works).

Google Fonts load when online; **system monospace** fallbacks apply offline.

## Download from the web

Serve or zip the **entire** `typing_practice/` directory (not `index.html` alone).

## Files

| File | Purpose |
|------|---------|
| `data/words.json` | Word bank (edit me) |
| `js/words-data.js` | Same data embedded for `file://` (run `sync_words_to_js.py` after edits) |
| `js/config.js` | App configuration |
| `js/app.js` | App behavior |
| `css/app.css` | Styles |
| `download-online.sh` | Optional `curl` for a single bundled HTML |
| `ARCHITECTURE.md` | Maintainer overview |

Parent folder holds other exercises; this app lives under **`typing_practice/`**.
