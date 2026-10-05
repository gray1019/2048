'use strict';

/* ============================================================
   2048 · dark edition — game logic
   ============================================================ */
const SIZE = 4;
const GAP = 10; // keep in sync with --gap in style.css
const BEST_KEY = '2048-dark-best';

const boardEl = document.getElementById('board');
const cellsEl = document.getElementById('cells');
const tilesEl = document.getElementById('tiles');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const scoreAddEl = document.getElementById('score-add');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlaySubEl = document.getElementById('overlay-sub');
const btnContinue = document.getElementById('btn-continue');
const btnRestart = document.getElementById('btn-restart');
const btnNewGame = document.getElementById('new-game');

// settings / console / cheats
const settingsEl = document.getElementById('settings');
const settingsBtn = document.getElementById('settings-btn');
const settingsClose = document.getElementById('settings-close');
const settingsBest = document.getElementById('settings-best');
const fastAnim = document.getElementById('fast-anim');
const resetBest = document.getElementById('reset-best');
const consoleOut = document.getElementById('console-out');
const consoleIn = document.getElementById('console-in');
const cheatMenu = document.getElementById('cheat-menu');
const cheatGod = document.getElementById('cheat-god');
const cheat2048 = document.getElementById('cheat-2048');
const cheatDouble = document.getElementById('cheat-double');
const cheatScore = document.getElementById('cheat-score');
const cheatNuke = document.getElementById('cheat-nuke');
const toastEl = document.getElementById('toast');

const VEC = {
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
};

const KEYS = {
  ArrowLeft: 'left',  a: 'left',  A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up',    w: 'up',    W: 'up',
  ArrowDown: 'down',  s: 'down',  S: 'down',
};

let grid, score = 0, uid = 0, cellPx = 100;
let won = false, over = false, overlayShown = false;
let best = Number(localStorage.getItem(BEST_KEY)) || 0;
let settingsOpen = false, godMode = false, toastTimer = null;

/* ---------------- geometry ---------------- */
function pos(i) { return GAP + i * (cellPx + GAP); }

function layout() {
  const inner = boardEl.clientWidth - GAP * 2;
  cellPx = (inner - GAP * (SIZE - 1)) / SIZE;
  for (const row of grid) for (const t of row) if (t) placeTile(t);
}

function placeTile(t) {
  t.el.style.width = t.el.style.height = cellPx + 'px';
  t.el.style.transform = `translate(${pos(t.x)}px, ${pos(t.y)}px)`;
  setFace(t);
}

function setFace(t) {
  const inner = t.el.firstChild;
  inner.textContent = t.value;
  inner.className = 'tile-inner ' + faceClass(t.value);
  const len = String(t.value).length;
  const f = len < 3 ? 0.44 : len === 3 ? 0.36 : len === 4 ? 0.3 : 0.24;
  inner.style.fontSize = Math.round(cellPx * f) + 'px';
}

function faceClass(v) { return v <= 2048 ? 't' + v : 'tsuper'; }

/* ---------------- tiles ---------------- */
function makeTile(x, y, value, spawn) {
  const el = document.createElement('div');
  el.className = 'tile' + (spawn ? ' tile-new' : '');
  el.appendChild(document.createElement('div'));
  const t = { id: uid++, x, y, value, el };
  grid[y][x] = t;
  tilesEl.appendChild(el);
  placeTile(t);
  return t;
}

function spawnRandom() {
  const empty = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (!grid[y][x]) empty.push([x, y]);
  if (!empty.length) return;
  const [x, y] = empty[(Math.random() * empty.length) | 0];
  makeTile(x, y, Math.random() < 0.9 ? 2 : 4, true);
}

/* ---------------- movement ---------------- */
function move(dir) {
  if (over || overlayShown) return;
  const v = VEC[dir];

  let moved = false, gained = 0;
  const deaths = []; // { dead, into }
  const newGrid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  for (let i = 0; i < SIZE; i++) {
    // cells listed starting from the destination side
    const cells = [];
    for (let j = 0; j < SIZE; j++) {
      const a = v.x !== 0 ? (v.x > 0 ? SIZE - 1 - j : j) : i;
      const b = v.y !== 0 ? (v.y > 0 ? SIZE - 1 - j : j) : i;
      cells.push(v.x !== 0 ? [a, i] : [i, b]);
    }

    const line = cells.map(([x, y]) => grid[y][x]).filter(Boolean);

    // merge adjacent equal pairs (closer-to-wall tile survives)
    const survivors = [];
    for (let k = 0; k < line.length; k++) {
      if (k + 1 < line.length && line[k].value === line[k + 1].value) {
        line[k].value *= 2;
        gained += line[k].value;
        survivors.push({ t: line[k], merged: true });
        deaths.push({ dead: line[k + 1], into: line[k] });
        k++;
      } else {
        survivors.push({ t: line[k] });
      }
    }

    // assign final positions
    survivors.forEach((s, idx) => {
      const [x, y] = cells[idx];
      const t = s.t;
      if (t.x !== x || t.y !== y || s.merged) moved = true;
      t.x = x; t.y = y;
      newGrid[y][x] = t;
      placeTile(t);
    });
  }

  grid = newGrid;
  if (!moved) return;

  // slide dead tiles onto their merge target, then swap faces
  for (const { dead, into } of deaths) {
    dead.x = into.x; dead.y = into.y;
    placeTile(dead);
  }

  if (gained) addScore(gained);

  setTimeout(() => {
    for (const { dead } of deaths) dead.el.remove();
    for (const { into } of deaths) {
      setFace(into);
      into.el.classList.remove('tile-merged');
      void into.el.offsetWidth; // restart the pop animation
      into.el.classList.add('tile-merged');
    }
  }, 110);

  spawnRandom();
  updateHud();

  if (!won && grid.flat().some(t => t.value >= 2048)) {
    won = true;
    showOverlay('win');
  } else if (!movesAvailable()) {
    if (godMode) {
      const n = nukeSmallest();
      toast(`🛡 God mode cleared ${n} tiles for you!`);
    } else {
      over = true;
      showOverlay('over');
    }
  }
}

function nukeSmallest() {
  let min = Infinity;
  const list = [];
  for (const row of grid) for (const t of row) if (t) { list.push(t); if (t.value < min) min = t.value; }
  let n = 0;
  for (const t of list) {
    if (t.value === min) { grid[t.y][t.x] = null; t.el.remove(); n++; }
  }
  return n;
}

function movesAvailable() {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const t = grid[y][x];
      if (!t) return true;
      if (x + 1 < SIZE && grid[y][x + 1] && grid[y][x + 1].value === t.value) return true;
      if (y + 1 < SIZE && grid[y + 1][x] && grid[y + 1][x].value === t.value) return true;
    }
  return false;
}

/* ---------------- hud / overlay ---------------- */
function addScore(n) {
  score += n;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, best);
    bestEl.textContent = best;
  }
  scoreEl.textContent = score;
  scoreAddEl.textContent = '+' + n;
  scoreAddEl.classList.remove('bump');
  void scoreAddEl.offsetWidth;
  scoreAddEl.classList.add('bump');
}

function updateHud() { scoreEl.textContent = score; }

function showOverlay(kind) {
  overlayShown = true;
  btnContinue.classList.toggle('hidden', kind !== 'win');
  if (kind === 'win') {
    overlayTitleEl.textContent = 'You win! 🎉';
    overlaySubEl.textContent = 'You reached 2048 — keep going for a higher score.';
  } else {
    overlayTitleEl.textContent = 'Game over';
    overlaySubEl.textContent = `Score: ${score}   ·   Best: ${best}`;
  }
  overlayEl.classList.add('show');
}

function hideOverlay() {
  overlayShown = false;
  overlayEl.classList.remove('show');
}

function newGame() {
  tilesEl.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  score = 0; won = false; over = false;
  scoreEl.textContent = '0';
  hideOverlay();
  spawnRandom();
  spawnRandom();
}

/* ---------------- input ---------------- */
window.addEventListener('keydown', (e) => {
  if (settingsOpen) {
    if (e.key === 'Escape') closeSettings();
    return;                       // ignore game keys while settings is open
  }
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  move(dir);
});

let touchStart = null;
boardEl.addEventListener('touchstart', (e) => {
  touchStart = [e.touches[0].clientX, e.touches[0].clientY];
}, { passive: true });

boardEl.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart[0];
  const dy = e.changedTouches[0].clientY - touchStart[1];
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}, { passive: true });

btnNewGame.addEventListener('click', newGame);
btnRestart.addEventListener('click', newGame);
btnContinue.addEventListener('click', hideOverlay);
window.addEventListener('resize', layout);

/* ============================================================
   settings + secret console + cheats
   ============================================================ */
function openSettings() {
  settingsEl.classList.add('show');
  settingsOpen = true;
  settingsBest.textContent = best;
  consoleOut.scrollTop = consoleOut.scrollHeight;
}

function closeSettings() {
  settingsEl.classList.remove('show');
  settingsOpen = false;
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) closeSettings(); });

fastAnim.addEventListener('change', () => {
  document.body.classList.toggle('fast-anim', fastAnim.checked);
});

resetBest.addEventListener('click', () => {
  best = 0;
  localStorage.setItem(BEST_KEY, best);
  bestEl.textContent = best;
  settingsBest.textContent = best;
  toast('Best score reset');
});

function printLine(text) {
  const div = document.createElement('div');
  div.className = 'cline';
  div.textContent = text;
  consoleOut.appendChild(div);
  consoleOut.scrollTop = consoleOut.scrollHeight;
}

consoleIn.addEventListener('keydown', (e) => {
  e.stopPropagation();                      // never move tiles while typing
  if (e.key !== 'Enter') return;
  const cmd = consoleIn.value.trim().toLowerCase();
  consoleIn.value = '';
  if (!cmd) return;
  if (cmd === 'cheats') {
    cheatMenu.classList.remove('hidden');
    printLine('> access granted — cheat menu unlocked 🛠');
    toast('🛠 Cheat menu unlocked!');
  } else if (cmd === 'clear') {
    consoleOut.innerHTML = '';
  } else {
    printLine(`> unknown command: ${cmd}`);
  }
});

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

cheatGod.addEventListener('click', () => {
  godMode = !godMode;
  cheatGod.classList.toggle('on', godMode);
  toast(godMode ? '🛡 God mode ON — you can never lose' : '🛡 God mode OFF');
});

cheat2048.addEventListener('click', () => {
  const empty = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!grid[y][x]) empty.push([x, y]);
  if (!empty.length) { toast('No empty cell!'); return; }
  const [x, y] = empty[(Math.random() * empty.length) | 0];
  makeTile(x, y, 2048, true);
  toast('✨ A wild 2048 appeared!');
});

cheatDouble.addEventListener('click', () => {
  for (const row of grid) for (const t of row) {
    if (!t) continue;
    t.value *= 2;
    setFace(t);
    t.el.classList.remove('tile-merged');
    void t.el.offsetWidth;
    t.el.classList.add('tile-merged');
  }
  toast('✖️ Everything doubled!');
});

cheatScore.addEventListener('click', () => {
  addScore(5000);
  toast('💰 +5000 points!');
});

cheatNuke.addEventListener('click', () => {
  const n = nukeSmallest();
  toast(n ? `💣 Nuked ${n} smallest tiles!` : 'Nothing to nuke!');
});

/* ---------------- boot ---------------- */
for (let i = 0; i < SIZE * SIZE; i++) cellsEl.appendChild(document.createElement('div'));
bestEl.textContent = best;
newGame();
layout();