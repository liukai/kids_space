/**
 * @typedef {{ word: string; correct: number; attempts: number; maxScore: number }} QuizRow
 */

const BLOCK_COUNT = 5;

/** @type {QuizRow[]} */
const SAMPLE_DATA = [
  { word: "chip", correct: 1, attempts: 5, maxScore: 5 },
  { word: "man", correct: 3, attempts: 5, maxScore: 5 },
  { word: "chair", correct: 0, attempts: 5, maxScore: 5 },
];

/**
 * @param {number} correct
 * @param {number} maxScore
 */
function pctLabel(correct, maxScore) {
  const denom = maxScore > 0 ? maxScore : 1;
  return `${Math.round((correct / denom) * 100)}%`;
}

/**
 * @param {QuizRow} item
 * @param {HTMLElement} pctEl
 * @param {HTMLElement[]} blocks
 */
function applyRowState(item, pctEl, blocks) {
  const cap = Math.min(item.maxScore, BLOCK_COUNT);
  const filled = Math.min(Math.max(0, item.correct), cap);
  pctEl.textContent = pctLabel(
    Math.min(Math.max(0, item.correct), item.maxScore),
    item.maxScore
  );

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const isFilled = i < filled;
    block.classList.toggle("score-block--filled", isFilled);
    block.classList.toggle("score-block--empty", !isFilled);
  }
}

/**
 * @param {QuizRow} item
 * @param {(w: string) => void} [onRetry]
 */
function createRow(item, onRetry) {
  const row = document.createElement("div");
  row.className = "report__row";

  const word = document.createElement("p");
  word.className = "report__word";
  word.textContent = item.word;

  const barCell = document.createElement("div");
  barCell.className = "report__bar-cell";

  const bar = document.createElement("div");
  bar.className = "score-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    `${item.correct} of ${item.maxScore} correct`
  );

  const blocks = [];
  for (let i = 0; i < BLOCK_COUNT; i += 1) {
    const block = document.createElement("span");
    block.className = "score-block";
    bar.appendChild(block);
    blocks.push(block);
  }

  const pct = document.createElement("p");
  pct.className = "report__pct";

  const action = document.createElement("div");
  action.className = "report__action";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "retry-btn";
  btn.textContent = "\u21bb";
  btn.setAttribute("aria-label", `Retry ${item.word}`);

  btn.addEventListener("click", () => {
    if (onRetry) {
      onRetry(item.word);
    }
  });

  barCell.appendChild(bar);
  action.appendChild(btn);

  row.appendChild(word);
  row.appendChild(barCell);
  row.appendChild(pct);
  row.appendChild(action);

  applyRowState(item, pct, blocks);

  return { row, pct, blocks };
}

/**
 * @param {HTMLElement} root
 * @param {QuizRow[]} rows
 */
function renderReport(root, rows) {
  root.replaceChildren();

  const header = document.createElement("div");
  header.className = "report__header";
  const hWord = document.createElement("span");
  hWord.textContent = "Word";
  const hScore = document.createElement("span");
  hScore.textContent = "Score";
  const hPct = document.createElement("span");
  hPct.textContent = "Pct";
  const hPad = document.createElement("span");
  header.append(hWord, hScore, hPct, hPad);
  root.appendChild(header);

  const state = rows.map((item) => createRow(item, handleRetry));
  for (const { row } of state) {
    root.appendChild(row);
  }

  return state;
}

/** Demo: bump correct on retry, clamped */
function handleRetry(word) {
  const item = SAMPLE_DATA.find((r) => r.word === word);
  if (!item) {
    return;
  }
  item.correct = Math.min(item.maxScore, item.correct + 1);
  item.attempts += 1;
  redraw();
}

const reportEl = document.getElementById("report");
if (!reportEl) {
  throw new Error("Missing #report");
}

function redraw() {
  renderReport(reportEl, SAMPLE_DATA);
}

redraw();
