# Kids Space

**Quick games that run in the tab you already have open.**  
No installers, no “please ask a grown-up to type their Apple ID.” Just HTML, CSS, and JavaScript folders you can unzip, double-click (or serve locally), and play.

## What’s inside the toy box

| Game | Vibe | Open it |
|------|------|---------|
| [**Word flashcards**](flashcards/index.html) | Backyard words & quiz energy: hear a word, pick gaps, or spell the whole thing. A **5×3 treat trail** feeds rotating plant pals—suns (or brains 🧠) fly in on clean answers, checkmarks stay put, mascots get bigger. IPA when you want it. | [`flashcards/index.html`](flashcards/index.html) |
| [**Typing practice**](typing_practice/index.html) | Retro-terminal typing: letters → words → sentences → quiz. Optional English + 中文 speech and chunky key sounds. | [`typing_practice/index.html`](typing_practice/index.html) |
| [**Times table**](times_table/index.html) | Multiplication from **1×1** through **9×9**: trophies, themes, optional 九九 rhymes, progress saved in the browser. | [`times_table/index.html`](times_table/index.html) |

Deeper nerdery per folder:

- [typing_practice/README.md](typing_practice/README.md)
- [times_table/README.md](times_table/README.md)

*(Flashcards are documented here and inline in the app—peek the `flashcards/` source when you’re curious.)*

## GitHub Pages

Workflow: [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys the **repo root** on pushes to `main`.

In **Settings → Pages**, pick **GitHub Actions** as the source. Your site will look like:

`https://<your-username>.github.io/<repository-name>/`

The [root `index.html`](index.html) is the lobby—one hop to flashcards, typing, or times table. All links are relative, so the same layout works on Pages and on your laptop.

## Run locally (quick)

From the repo root (best for the hub page):

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

**Word flashcards** (embedded word list—serving avoids some `file://` quirks):

```bash
cd flashcards && python3 -m http.server 8081
```

**Typing practice** · **Times table** — same idea, from their folders:

```bash
cd typing_practice && python3 -m http.server 8080
# or
cd times_table && python3 -m http.server 8080
```

## Repository layout

```
kids_space/
├── index.html            # Lobby (Pages entry)
├── README.md             # You are here
├── flashcards/           # Word cards, quiz, treat trail, IPA
├── typing_practice/
├── times_table/
├── quiz-report/          # Standalone quiz report UI (optional)
├── .githooks/            # Optional: strip editor footers from commits (see install-git-hooks.sh)
└── .github/workflows/    # CI + Pages deploy
```

## License

The **times table** app is [MIT](times_table/LICENSE). Align licenses for other folders if you ship the whole repo publicly.

---

*Now go feed the sunflower. ☀️*
