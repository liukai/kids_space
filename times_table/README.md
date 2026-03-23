# Times Table Quiz

A friendly **multiplication practice** web app (1×1 through 9×9), inspired by the Chinese **九九乘法表**. No build step: open the HTML file or host the folder as static files.

After you publish the repo on GitHub, you can add a CI badge with:

`https://github.com/<you>/<repo>/actions/workflows/ci.yml/badge.svg`

## Features

- **Pick tables** — practice specific factors or use “All” / “Clear” (defaults to 1×).
- **Sets of 10** — progress, accuracy, per-question timer, and average time when correct; summary at the end of each set.
- **Scoring & trophies** — points scale with difficulty; trophies every 20 points with progress bar and animations.
- **Reference ladder** — full table in 九九 “staircase” layout with optional **Chinese rhymes** per cell.
- **Practice history** — per-pair right/wrong bars in the table; **Clear history** resets ladder + saved score/cheat/tried counts (browser `localStorage` only).
- **Themes** — Classic, Retro, and Unicorn; choice is remembered.
- **Touch-friendly** — on-screen number pad; Web Audio feedback (unlocks on first interaction).
- **Accessibility** — labels, `aria-live` regions, progress semantics, reduced-motion awareness for heavy animations.

## Run locally

**Option A — open the file**

Double-click `index.html` or open it from your browser. Most features work; some browsers restrict `file://` for minor behaviors—use a local server if anything feels off.

**Option B — tiny HTTP server**

```bash
cd times_table_quiz
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

**Option C — any static server**

Serve this directory so `index.html` is the default document (e.g. `npx serve .`).

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**: set **Source** to **GitHub Actions** (not “Deploy from a branch” if you use the included workflow).
3. Replace `OWNER` and `REPO` in the CI badge at the top of this README with your GitHub username and repository name.

The workflow in `.github/workflows/pages.yml` publishes the site on pushes to `main`. If your default branch is `master`, change the `branches` filter in that file.

## Project layout

| File         | Role                                      |
| ------------ | ----------------------------------------- |
| `index.html` | Structure, landmarks, practice UI       |
| `styles.css` | Themes, layout, motion, table ladder    |
| `script.js`  | Game logic, storage, audio, table rendering |
| `favicon.svg`| Tab icon                                  |

## Tech

- Plain **HTML**, **CSS**, **JavaScript** (ES5-style IIFE for broad compatibility).
- **No** npm dependencies or bundler required to run or deploy.

## License

[MIT](LICENSE)
