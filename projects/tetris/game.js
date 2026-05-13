const COLS = 10;
const ROWS = 20;
const SIZE = 24;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const hctx = holdCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
document.getElementById('restart').addEventListener('click', () => reset());

const SHAPES = {
  I: { color: '#0ff', blocks: [[1,1,1,1]] },
  O: { color: '#ff0', blocks: [[1,1],[1,1]] },
  T: { color: '#c0f', blocks: [[0,1,0],[1,1,1]] },
  S: { color: '#0f0', blocks: [[0,1,1],[1,1,0]] },
  Z: { color: '#f00', blocks: [[1,1,0],[0,1,1]] },
  J: { color: '#00f', blocks: [[1,0,0],[1,1,1]] },
  L: { color: '#f80', blocks: [[0,0,1],[1,1,1]] },
};
const KEYS = Object.keys(SHAPES);

let board, current, next, pos, score, lines, level, dropTimer, dropInterval, lastTime, paused, over;
let particles = [];
let shake = 0;
let flashRows = []; // {y, t}
let bgHue = 240;
let levelFlash = 0;
let lockFlash = 0;
let floatTexts = []; // {x,y,text,t,color}
let hold = null;
let holdUsed = false;
let trails = []; // hard drop swoosh: {blocks, color, x, top, bottom, t}
let menuOpen = false;
let combo = 0;
const HS_KEY = 'tetris_high_scores';
const comboEl = document.getElementById('combo');

function emptyBoard() {
  return Array.from({length: ROWS}, () => Array(COLS).fill(null));
}

function randomPiece() {
  const k = KEYS[Math.floor(Math.random() * KEYS.length)];
  const s = SHAPES[k];
  return { color: s.color, blocks: s.blocks.map(r => r.slice()) };
}

function rotate(matrix) {
  const h = matrix.length, w = matrix[0].length;
  const out = Array.from({length: w}, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out[x][h - 1 - y] = matrix[y][x];
  return out;
}

function collides(blocks, px, py) {
  for (let y = 0; y < blocks.length; y++) {
    for (let x = 0; x < blocks[y].length; x++) {
      if (!blocks[y][x]) continue;
      const nx = px + x, ny = py + y;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge() {
  current.blocks.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v && pos.y + y >= 0) board[pos.y + y][pos.x + x] = current.color;
    });
  });
}

function clearLines() {
  let cleared = 0;
  const fullRows = [];
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(c => c)) fullRows.push(y);
  }
  // burst particles from cleared rows
  fullRows.forEach(y => {
    for (let x = 0; x < COLS; x++) {
      const color = board[y][x];
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: x * SIZE + SIZE / 2,
          y: y * SIZE + SIZE / 2,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 1) * 6,
          life: 1,
          color
        });
      }
    }
  });
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(c => c)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }
  if (cleared) {
    combo++;
    const mult = 1 + (combo - 1) * 0.5;
    const base = [0, 100, 300, 500, 800][cleared] * level;
    const points = Math.round(base * mult);
    score += points;
    const prevLevel = level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(80, 800 - (level - 1) * 70);
    if (level > prevLevel) levelFlash = 1;
    shake = Math.min(20, 4 + cleared * 4);
    flashWrap();
    const labels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
    floatTexts.push({
      x: COLS * SIZE / 2,
      y: ROWS * SIZE / 2,
      text: labels[cleared] + ' +' + points,
      t: 1,
      color: cleared === 4 ? '#0ff' : '#ff0'
    });
    if (combo > 1) {
      floatTexts.push({
        x: COLS * SIZE / 2,
        y: ROWS * SIZE / 2 + 30,
        text: `COMBO x${combo}!`,
        t: 1.2,
        color: '#ffd24a'
      });
      shake = Math.min(28, shake + combo * 2);
    }
    updateComboUI(true);
    updateUI();
  } else {
    if (combo > 0) {
      combo = 0;
      updateComboUI(false);
    }
  }
}

function updateComboUI(pulse) {
  if (combo > 1) {
    const pct = Math.round(((1 + (combo - 1) * 0.5) - 1) * 100);
    comboEl.textContent = `x${combo}  +${pct}%`;
    comboEl.classList.remove('hidden');
    if (pulse) {
      comboEl.classList.remove('pulse');
      void comboEl.offsetWidth;
      comboEl.classList.add('pulse');
    }
  } else {
    comboEl.classList.add('hidden');
    comboEl.classList.remove('pulse');
  }
}

function spawn(piece) {
  if (piece) {
    current = piece;
  } else {
    current = next || randomPiece();
    next = randomPiece();
  }
  holdUsed = false;
  holdCanvas.classList.remove('used');
  pos = { x: Math.floor((COLS - current.blocks[0].length) / 2), y: -current.blocks.length + 1 };
  drawNext();
  if (collides(current.blocks, pos.x, pos.y + 1)) {
    over = true;
    showOverlay('GAME OVER');
    saveHighScore(score, lines, level);
  }
}

function holdPiece() {
  if (holdUsed || over) return;
  const stash = { color: current.color, blocks: SHAPES[colorToKey(current.color)].blocks.map(r => r.slice()) };
  if (hold) {
    const swap = hold;
    hold = stash;
    spawn(swap);
  } else {
    hold = stash;
    spawn();
  }
  holdUsed = true;
  holdCanvas.classList.add('used');
  drawHold();
}

function colorToKey(color) {
  for (const k of KEYS) if (SHAPES[k].color === color) return k;
  return 'I';
}

function move(dx) {
  if (!collides(current.blocks, pos.x + dx, pos.y)) pos.x += dx;
}

function softDrop() {
  if (!collides(current.blocks, pos.x, pos.y + 1)) {
    pos.y++;
    score += 1;
    updateUI();
  } else {
    lock();
  }
}

function hardDrop() {
  const startY = pos.y;
  let dropped = 0;
  while (!collides(current.blocks, pos.x, pos.y + 1)) {
    pos.y++;
    score += 2;
    dropped++;
  }
  if (dropped > 0) {
    trails.push({
      blocks: current.blocks.map(r => r.slice()),
      color: current.color,
      x: pos.x,
      top: startY,
      bottom: pos.y,
      t: 1
    });
  }
  shake = Math.max(shake, Math.min(12, dropped * 0.6));
  // dust particles at landing row
  current.blocks.forEach((row, y) => {
    row.forEach((v, x) => {
      if (!v) return;
      const px = (pos.x + x) * SIZE + SIZE / 2;
      const py = (pos.y + y + 1) * SIZE;
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 2,
          life: 0.6,
          color: current.color
        });
      }
    });
  });
  lock();
}

function lock() {
  merge();
  lockFlash = 1;
  clearLines();
  updateUI();
  spawn();
}

function tryRotate() {
  const rotated = rotate(current.blocks);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(rotated, pos.x + dx, pos.y)) {
      current.blocks = rotated;
      pos.x += dx;
      return;
    }
  }
}

function drawCell(c, x, y, size = SIZE) {
  c.fillStyle = '#0a0a14';
  c.fillRect(x, y, size, size);
  c.fillStyle = arguments[4] || c.fillStyle;
}

function paintCell(c, x, y, color, size = SIZE, glow = 0) {
  if (glow > 0) {
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 16 * glow;
  }
  // gradient fill
  const grad = c.createLinearGradient(x, y, x, y + size);
  grad.addColorStop(0, shade(color, 0.3));
  grad.addColorStop(1, shade(color, -0.2));
  c.fillStyle = grad;
  c.fillRect(x, y, size, size);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(x, y, size, size / 5);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(x, y + size - size / 5, size, size / 5);
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  if (glow > 0) c.restore();
}

function hexToRgba(hex, a) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex, amt) {
  // hex like #abc or #aabbcc
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  let r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
  if (amt >= 0) { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
  else { r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt); }
  return `rgb(${r|0},${g|0},${b|0})`;
}

function ghostY() {
  let gy = pos.y;
  while (!collides(current.blocks, pos.x, gy + 1)) gy++;
  return gy;
}

function draw() {
  ctx.save();
  // shake
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  ctx.translate(sx, sy);

  // animated background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `hsl(${bgHue}, 40%, 8%)`);
  grad.addColorStop(1, `hsl(${(bgHue + 60) % 360}, 40%, 4%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * SIZE, 0); ctx.lineTo(x * SIZE, ROWS * SIZE); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * SIZE); ctx.lineTo(COLS * SIZE, y * SIZE); ctx.stroke();
  }

  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (board[y][x]) paintCell(ctx, x * SIZE, y * SIZE, board[y][x], SIZE, 0.3);

  if (current && !over) {
    const gy = ghostY();
    // ghost outline
    current.blocks.forEach((row, y) => {
      row.forEach((v, x) => {
        if (!v) return;
        ctx.strokeStyle = current.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.strokeRect((pos.x + x) * SIZE + 2, (gy + y) * SIZE + 2, SIZE - 4, SIZE - 4);
        ctx.globalAlpha = 1;
      });
    });
    const pulse = 0.4 + Math.sin(performance.now() / 200) * 0.15;
    current.blocks.forEach((row, y) => {
      row.forEach((v, x) => {
        if (v && pos.y + y >= 0) paintCell(ctx, (pos.x + x) * SIZE, (pos.y + y) * SIZE, current.color, SIZE, pulse);
      });
    });
  }

  // hard drop swoosh trails
  ctx.globalCompositeOperation = 'lighter';
  trails.forEach(tr => {
    const c0 = hexToRgba(tr.color, 0);
    const c1 = hexToRgba(tr.color, 1);
    tr.blocks.forEach((row, ry) => {
      row.forEach((v, cx) => {
        if (!v) return;
        const px = (tr.x + cx) * SIZE;
        const yTop = (tr.top + ry) * SIZE;
        const yBot = (tr.bottom + ry) * SIZE + SIZE;
        const grd = ctx.createLinearGradient(0, yTop, 0, yBot);
        grd.addColorStop(0, c0);
        grd.addColorStop(1, c1);
        ctx.fillStyle = grd;
        ctx.globalAlpha = tr.t * 0.6;
        ctx.fillRect(px + SIZE * 0.15, yTop, SIZE * 0.7, yBot - yTop);
      });
    });
  });
  ctx.globalAlpha = 1;

  // particles
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * p.life + 1, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // floating texts
  floatTexts.forEach(f => {
    ctx.save();
    ctx.globalAlpha = f.t;
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 20;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  });

  // lock flash
  if (lockFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${lockFlash * 0.15})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // level flash
  if (levelFlash > 0) {
    ctx.fillStyle = `rgba(0,255,255,${levelFlash * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.restore();
}

function drawPreview(c, canvasEl, piece) {
  c.fillStyle = '#0a0a14';
  c.fillRect(0, 0, canvasEl.width, canvasEl.height);
  if (!piece) return;
  const s = 20;
  const w = piece.blocks[0].length * s;
  const h = piece.blocks.length * s;
  const ox = (canvasEl.width - w) / 2;
  const oy = (canvasEl.height - h) / 2;
  piece.blocks.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v) paintCell(c, ox + x * s, oy + y * s, piece.color, s, 0.5);
    });
  });
}
function drawNext() { drawPreview(nctx, nextCanvas, next); }
function drawHold() { drawPreview(hctx, holdCanvas, hold); }

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 150);
}
function updateUI() {
  if (scoreEl.textContent != score) bump(scoreEl);
  if (linesEl.textContent != lines) bump(linesEl);
  if (levelEl.textContent != level) bump(levelEl);
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}
const wrapEl = document.querySelector('.wrap');
function flashWrap() {
  wrapEl.classList.remove('flash');
  void wrapEl.offsetWidth;
  wrapEl.classList.add('flash');
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); }

function reset() {
  board = emptyBoard();
  score = 0; lines = 0; level = 1;
  dropInterval = 800;
  dropTimer = 0;
  lastTime = 0;
  paused = false; over = false;
  next = null;
  hold = null;
  trails = [];
  particles = [];
  floatTexts = [];
  combo = 0;
  updateComboUI(false);
  spawn();
  drawHold();
  updateUI();
  hideOverlay();
  closeMenu();
}

// ---- High scores & menu ----
function loadHighScores() {
  try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; } catch { return []; }
}
function saveHighScore(s, l, lv) {
  if (s <= 0) return;
  const list = loadHighScores();
  list.push({ score: s, lines: l, level: lv, date: new Date().toISOString().slice(0,10) });
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem(HS_KEY, JSON.stringify(list.slice(0, 10)));
}
function renderHighScores() {
  const ol = document.getElementById('highScores');
  const list = loadHighScores();
  if (!list.length) {
    ol.innerHTML = '<li class="empty">No scores yet</li>';
    return;
  }
  ol.innerHTML = list.map(h =>
    `<li><span>${h.date} · L${h.level}</span><b>${h.score}</b></li>`
  ).join('');
}
const menuEl = document.getElementById('menu');
function openMenu() {
  menuOpen = true;
  paused = true;
  document.getElementById('menuScore').textContent = score;
  document.getElementById('menuLines').textContent = lines;
  document.getElementById('menuLevel').textContent = level;
  renderHighScores();
  menuEl.classList.remove('hidden');
}
function closeMenu() {
  menuOpen = false;
  if (!over) paused = false;
  menuEl.classList.add('hidden');
}
document.getElementById('btnResume').addEventListener('click', closeMenu);
document.getElementById('btnNew').addEventListener('click', () => reset());
document.getElementById('btnSave').addEventListener('click', () => {
  saveHighScore(score, lines, level);
  renderHighScores();
});

function updateEffects(dt) {
  shake *= Math.pow(0.001, dt / 1000);
  if (shake < 0.05) shake = 0;
  lockFlash = Math.max(0, lockFlash - dt / 150);
  levelFlash = Math.max(0, levelFlash - dt / 600);
  bgHue = (bgHue + dt * 0.01) % 360;
  trails.forEach(tr => tr.t -= dt / 350);
  trails = trails.filter(tr => tr.t > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.3;
    p.vx *= 0.98;
    p.life -= dt / 800;
  });
  particles = particles.filter(p => p.life > 0);
  floatTexts.forEach(f => {
    f.y -= dt * 0.04;
    f.t -= dt / 1200;
  });
  floatTexts = floatTexts.filter(f => f.t > 0);
}

function loop(t = 0) {
  const dt = Math.min(50, t - lastTime);
  lastTime = t;
  if (!paused && !over) {
    dropTimer += dt;
    if (dropTimer > dropInterval) {
      dropTimer = 0;
      if (!collides(current.blocks, pos.x, pos.y + 1)) pos.y++;
      else lock();
    }
  }
  updateEffects(dt);
  if (!paused) draw();
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (menuOpen) closeMenu(); else openMenu();
    return;
  }
  if (menuOpen || over) return;
  if (e.key === 'p' || e.key === 'P') {
    paused = !paused;
    if (paused) showOverlay('PAUSED'); else hideOverlay();
    return;
  }
  if (paused) return;
  switch (e.key) {
    case 'ArrowLeft': move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'ArrowDown': softDrop(); break;
    case 'ArrowUp': tryRotate(); break;
    case ' ': e.preventDefault(); hardDrop(); break;
    case 'c': case 'C': case 'Shift': holdPiece(); break;
  }
});

reset();
loop();
