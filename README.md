# Kids Space

A small collection of **browser games for kids** — plain HTML, CSS, and JavaScript. No install or build step; each game lives in its own folder.

## Games

| Game | What it is | Open locally |
|------|------------|--------------|
| [**Typing practice**](typing_practice/) | Retro-terminal typing: letters, words, sentences, quiz; optional speech (English + 中文) and key sounds. | Open [`typing_practice/index.html`](typing_practice/index.html) |
| [**Times table**](times_table/) | Multiplication practice (1×1–9×9), trophies, themes, optional 九九 rhymes, progress in the browser. | Open [`times_table/index.html`](times_table/index.html) |

Each folder has its own **README** with features, file layout, and tips:

- [typing_practice/README.md](typing_practice/README.md)
- [times_table/README.md](times_table/README.md)

## GitHub Pages

This repo includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which deploys the **repository root** on pushes to `main`.

After you enable **GitHub Actions** as the Pages source in **Settings → Pages**, your site URL will look like:

`https://<your-username>.github.io/<repository-name>/`

Use the **site home page** ([`index.html`](index.html) at the repo root) to jump to either game:

- `…/typing_practice/`
- `…/times_table/`

Paths are relative, so the same links work when you clone the repo and open `index.html` via a local server (recommended) or from disk where supported.

## Run locally (quick)

**Typing practice** — words load from an embedded script; opening the file often works:

```bash
cd typing_practice && python3 -m http.server 8080
```

**Times table**:

```bash
cd times_table && python3 -m http.server 8080
```

To browse the landing page from disk, use a tiny server from the repo root:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Repository layout

```
kids_space/
├── index.html           # Landing page (GitHub Pages entry)
├── README.md            # This file
├── typing_practice/     # Typing game
├── times_table/       # Multiplication game
└── .github/workflows/   # CI + Pages deploy
```

## License

The **times table** app is [MIT](times_table/LICENSE). Add or align licenses for other parts of the repo if you publish publicly.
