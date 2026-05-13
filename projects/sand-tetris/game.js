// Sand Tetris
// Pieces dissolve into individual sand grains. Sand falls with gravity simulation.
// Clear: connected same-color sand spanning left edge to right edge.

const COLS = 100;      // grain columns
const ROWS = 200;      // grain rows
const GRAIN = 3;       // px per grain (smaller = finer sand)
const BLOCK = 10;      // grains per tetromino-block side
const COLS_B = COLS / BLOCK; // 10
const ROWS_B = ROWS / BLOCK; // 20

const canvas = document.getElementById('board');
canvas.width = COLS * GRAIN;
canvas.height = ROWS * GRAIN;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
document.getElementById('restart').addEventListener('click', () => reset());

// Offscreen low-res canvas for sand pixels
const sandCanvas = document.createElement('canvas');
sandCanvas.width = COLS;
sandCanvas.height = ROWS;
const sctx = sandCanvas.getContext('2d');
const imgData = sctx.createImageData(COLS, ROWS);
const data = imgData.data;

const TOTAL = COLS * ROWS;
const keys = new Uint8Array(TOTAL);   // 0=empty, 1..7=piece type id
const rArr = new Uint8Array(TOTAL);
const gArr = new Uint8Array(TOTAL);
const bArr = new Uint8Array(TOTAL);
const pending = new Uint8Array(TOTAL); // 1 = cell locked into a clear-animation, frozen and ignored


// Only 4 color groups (keys 1..4). Multiple shapes share a color to make it easier
// to build connected same-color paths.
const COLORS = [
  null,
  [60, 200, 230],   // 1 cyan
  [240, 200, 60],   // 2 yellow
  [200, 90, 220],   // 3 purple
  [230, 90, 90],    // 4 red
];
const PIECES = [
  null,
  { name: 'I', colorId: 1, blocks: [[1,1,1,1]] },
  { name: 'O', colorId: 2, blocks: [[1,1],[1,1]] },
  { name: 'T', colorId: 3, blocks: [[0,1,0],[1,1,1]] },
  { name: 'S', colorId: 4, blocks: [[0,1,1],[1,1,0]] },
  { name: 'Z', colorId: 4, blocks: [[1,1,0],[0,1,1]] },
  { name: 'J', colorId: 3, blocks: [[1,0,0],[1,1,1]] },
  { name: 'L', colorId: 2, blocks: [[0,0,1],[1,1,1]] },
];

let current, next, pos, score, lines, level, dropTimer, dropInterval, lastTime, paused, over;
let floatTexts = []; // {x, y, vy, text, t, color, size}
let particles = [];  // {x, y, vx, vy, r, g, b, life}
let clearings = []; // active slow-mo clear animations
let combo = 0;
let comboResetTimer = 0;
const COMBO_WINDOW = 3500;
const comboEl = document.getElementById('combo');
const gameOverEl = document.getElementById('gameOver');
const goScoreEl = document.getElementById('goScore');
const goBestEl = document.getElementById('goBest');
const goLinesEl = document.getElementById('goLines');
const goLevelEl = document.getElementById('goLevel');
const newBestEl = document.getElementById('newBest');
const HS_KEY = 'sand_tetris_best';
function loadBest() { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; }
function saveBest(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) {} }
let best = loadBest();
document.getElementById('goRestart').addEventListener('click', () => reset());

function rgbStr(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

function randomPiece() {
  const shapeIdx = 1 + Math.floor(Math.random() * 7);
  const p = PIECES[shapeIdx];
  const piece = {
    id: p.colorId,
    rgb: COLORS[p.colorId],
    blocks: p.blocks.map(r => r.slice()),
  };
  bakeGrains(piece);
  return piece;
}

// Pre-bake the per-grain colors so the piece looks like sand while falling and
// dissolves into the pile without re-randomizing colors on lock.
function bakeGrains(piece) {
  const [br, bg, bb] = piece.rgb;
  const grains = [];
  piece.blocks.forEach((row, by) => {
    row.forEach((v, bx) => {
      if (!v) return;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const j = (Math.random() - 0.5) * 50;
          grains.push({
            dx: bx * BLOCK + x,
            dy: by * BLOCK + y,
            r: clamp8(br + j),
            g: clamp8(bg + j),
            b: clamp8(bb + j),
          });
        }
      }
    });
  });
  piece.grains = grains;
}

function rotate(m) {
  const h = m.length, w = m[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      out[x][h - 1 - y] = m[y][x];
  return out;
}

// Piece collision: piece at block coords (px,py). Each filled block occupies a BLOCK x BLOCK grain area.
function collides(blocks, px, py) {
  for (let by = 0; by < blocks.length; by++) {
    for (let bx = 0; bx < blocks[by].length; bx++) {
      if (!blocks[by][bx]) continue;
      const gx0 = (px + bx) * BLOCK;
      const gy0 = (py + by) * BLOCK;
      if (gx0 < 0 || gx0 + BLOCK > COLS) return true;
      if (gy0 + BLOCK > ROWS) return true;
      if (gy0 < 0) continue; // above ceiling: no sand collision
      for (let y = gy0; y < gy0 + BLOCK; y++) {
        const row = y * COLS;
        for (let x = gx0; x < gx0 + BLOCK; x++) {
          if (keys[row + x]) return true;
        }
      }
    }
  }
  return false;
}

function spawn() {
  current = next || randomPiece();
  next = randomPiece();
  pos = {
    x: Math.floor((COLS_B - current.blocks[0].length) / 2),
    y: -current.blocks.length,
  };
  drawNext();
  if (collides(current.blocks, pos.x, pos.y + 1)) {
    over = true;
    showGameOver();
  }
}

function showGameOver() {
  const isNewBest = score > best;
  if (isNewBest) {
    best = score;
    saveBest(best);
  }
  goScoreEl.textContent = score;
  goBestEl.textContent = best;
  goLinesEl.textContent = lines;
  goLevelEl.textContent = level;
  if (isNewBest && score > 0) {
    newBestEl.classList.remove('hidden');
    // re-trigger badge pop animation
    void newBestEl.offsetWidth;
  } else {
    newBestEl.classList.add('hidden');
  }
  gameOverEl.classList.remove('hidden');
}

function hideGameOver() { gameOverEl.classList.add('hidden'); }

function move(dx) {
  if (!collides(current.blocks, pos.x + dx, pos.y)) pos.x += dx;
}

function tryRotate() {
  const r = rotate(current.blocks);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(r, pos.x + dx, pos.y)) {
      current.blocks = r;
      pos.x += dx;
      bakeGrains(current);
      return;
    }
  }
}

function softDrop() {
  if (!collides(current.blocks, pos.x, pos.y + 1)) {
    pos.y++;
    score += 1;
    bumpUI();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  let n = 0;
  while (!collides(current.blocks, pos.x, pos.y + 1)) {
    pos.y++;
    score += 2;
    n++;
  }
  bumpUI();
  lockPiece();
}

// Transfer pre-baked piece grains directly into the sand pile (no re-randomization).
function lockPiece() {
  for (const g of current.grains) {
    const gx = pos.x * BLOCK + g.dx;
    const gy = pos.y * BLOCK + g.dy;
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
    const idx = gy * COLS + gx;
    if (keys[idx]) continue;
    keys[idx] = current.id;
    rArr[idx] = g.r;
    gArr[idx] = g.g;
    bArr[idx] = g.b;
  }
  // line clear runs continuously in loop after settling
  spawn();
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

// One step of sand gravity. Process bottom-up. Flashing cells are frozen.
function settle() {
  let moved = false;
  for (let y = ROWS - 2; y >= 0; y--) {
    const rowOff = y * COLS;
    // Alternate scan direction per row to avoid bias
    const ltr = (y & 1) === 0;
    const xStart = ltr ? 0 : COLS - 1;
    const xEnd = ltr ? COLS : -1;
    const xStep = ltr ? 1 : -1;
    for (let x = xStart; x !== xEnd; x += xStep) {
      const idx = rowOff + x;
      if (!keys[idx] || pending[idx]) continue;
      const below = idx + COLS;
      if (!keys[below]) {
        moveCell(idx, below);
        moved = true;
        continue;
      }
      // try diagonals
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (const d of [dir, -dir]) {
        const nx = x + d;
        if (nx < 0 || nx >= COLS) continue;
        const diag = below + d;
        if (!keys[diag]) {
          moveCell(idx, diag);
          moved = true;
          break;
        }
      }
    }
  }
  return moved;
}

function moveCell(src, dst) {
  keys[dst] = keys[src];
  rArr[dst] = rArr[src];
  gArr[dst] = gArr[src];
  bArr[dst] = bArr[src];
  keys[src] = 0;
}

// Connected component clear: any same-color group touching both left and right edges clears.
function clearLines() {
  const visited = new Uint8Array(TOTAL);
  let totalCleared = 0;
  for (let y = 0; y < ROWS; y++) {
    const idx = y * COLS;
    if (!keys[idx] || visited[idx] || pending[idx]) continue;
    const k = keys[idx];
    // BFS / iterative DFS using a stack
    const stack = [idx];
    const cells = [];
    let touchesRight = false;
    visited[idx] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const cx = c % COLS;
      if (cx === COLS - 1) touchesRight = true;
      // 4-neighbors
      if (cx > 0) {
        const n = c - 1;
        if (!visited[n] && !pending[n] && keys[n] === k) { visited[n] = 1; stack.push(n); }
      }
      if (cx < COLS - 1) {
        const n = c + 1;
        if (!visited[n] && !pending[n] && keys[n] === k) { visited[n] = 1; stack.push(n); }
      }
      if (c >= COLS) {
        const n = c - COLS;
        if (!visited[n] && !pending[n] && keys[n] === k) { visited[n] = 1; stack.push(n); }
      }
      if (c < TOTAL - COLS) {
        const n = c + COLS;
        if (!visited[n] && !pending[n] && keys[n] === k) { visited[n] = 1; stack.push(n); }
      }
    }
    if (touchesRight) {
      combo++;
      comboResetTimer = COMBO_WINDOW;
      const mult = 1 + (combo - 1) * 0.5;
      lines += 1;
      level = Math.floor(lines / 3) + 1;
      dropInterval = Math.max(120, 600 - (level - 1) * 50);

      // mark cells as pending; group by column for left-to-right sweep
      const byColumn = new Array(COLS);
      let minC = COLS, maxC = 0, minY = ROWS, maxY = 0;
      for (const c of cells) {
        pending[c] = 1;
        const cx = c % COLS;
        const cy = (c / COLS) | 0;
        if (cx < minC) minC = cx;
        if (cx > maxC) maxC = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        (byColumn[cx] = byColumn[cx] || []).push(c);
      }
      totalCleared += cells.length;

      const finalPoints = Math.round(cells.length * 2 * mult);
      // sweep takes ~1.4s; speed scales so visually slow regardless of width
      const sweepDurationMs = 1200;
      const sweepCols = (maxC - minC + 1);
      const sweepSpeed = sweepCols / (sweepDurationMs / 16.6); // cols per frame

      clearings.push({
        byColumn,
        minC, maxC, minY, maxY,
        cellCount: cells.length,
        k,
        comboMult: mult,
        comboAtClear: combo,
        pointsPerCell: 2 * mult,
        finalPoints,
        runningPoints: 0,
        sweepCol: minC - 1,
        sweepSpeed,
        lastCol: minC - 1,
        phase: 'sweep',
        flashFrames: 0,
        showTime: 0,
      });
      updateComboUI(true);
      bumpUI();
    }
  }
  return totalCleared;
}

function updateComboUI(pulse) {
  if (combo > 1) {
    comboEl.textContent = `x${combo}  +${Math.round(((1 + (combo - 1) * 0.5) - 1) * 100)}%`;
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

// Slow-motion clear animation: sweep left->right removing one column of cells per step,
// accumulating points; then black/white flash; then big total-points reveal.
function updateClearings(dt) {
  for (const cl of clearings) {
    if (cl.phase === 'sweep') {
      cl.sweepCol += cl.sweepSpeed;
      const target = Math.min(cl.maxC, cl.sweepCol | 0);
      while (cl.lastCol < target) {
        cl.lastCol++;
        const colCells = cl.byColumn[cl.lastCol];
        if (colCells) {
          for (const idx of colCells) {
            // small dust burst: lateral kick, slight upward, gravity
            if (Math.random() < 0.5) {
              particles.push({
                x: (idx % COLS) * GRAIN + GRAIN * 0.5,
                y: ((idx / COLS) | 0) * GRAIN + GRAIN * 0.5,
                vx: (Math.random() * 1.5) + 0.5, // mostly rightward chase the sweep
                vy: -Math.random() * 1.5 - 0.2,
                r: rArr[idx], g: gArr[idx], b: bArr[idx],
                life: 0.8,
              });
            }
            keys[idx] = 0;
            pending[idx] = 0;
            cl.runningPoints += cl.pointsPerCell;
          }
        }
      }
      // commit running points to score (rounded), reflecting accumulating tick
      const shown = Math.round(cl.runningPoints);
      if (shown !== cl._shown) {
        const delta = shown - (cl._shown || 0);
        score += delta;
        cl._shown = shown;
        bumpUI();
      }
      if (cl.lastCol >= cl.maxC) {
        cl.phase = 'flash';
        cl.flashFrames = 12; // ~6 toggles
      }
    } else if (cl.phase === 'flash') {
      cl.flashFrames--;
      if (cl.flashFrames <= 0) {
        cl.phase = 'reveal';
        cl.showTime = 1300;
        // big floating total-points text
        const cx = ((cl.minC + cl.maxC) / 2) * GRAIN;
        const cy = ((cl.minY + cl.maxY) / 2) * GRAIN;
        const total = Math.round(cl._shown || cl.runningPoints);
        const c0 = COLORS[cl.k];
        floatTexts.push({
          x: cx, y: cy, vy: -0.5,
          text: '+' + total,
          t: 1.6,
          color: `rgb(${clamp8(c0[0]+90)},${clamp8(c0[1]+90)},${clamp8(c0[2]+90)})`,
          size: Math.min(60, 22 + Math.sqrt(total) * 2.2),
        });
        if (cl.comboAtClear > 1) {
          const pct = Math.round((cl.comboMult - 1) * 100);
          floatTexts.push({
            x: cx, y: cy + 38, vy: -0.4,
            text: `COMBO x${cl.comboAtClear}  +${pct}%`,
            t: 1.8,
            color: '#ffd24a',
            size: Math.min(42, 18 + cl.comboAtClear * 3),
          });
        }
      }
    } else if (cl.phase === 'reveal') {
      cl.showTime -= dt;
      if (cl.showTime <= 0) cl.done = true;
    }
  }
  for (let i = clearings.length - 1; i >= 0; i--) {
    if (clearings[i].done) clearings.splice(i, 1);
  }
}

function updateEffects(dt) {
  // particles
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.25;
    p.vx *= 0.985;
    p.life -= dt / 900;
  }
  particles = particles.filter(p => p.life > 0 && p.y < canvas.height + 20);
  // float texts
  for (const f of floatTexts) {
    f.y += f.vy;
    f.vy *= 0.97;
    f.t -= dt / 1000;
  }
  floatTexts = floatTexts.filter(f => f.t > 0);
  // combo timeout
  if (comboResetTimer > 0) {
    comboResetTimer -= dt;
    if (comboResetTimer <= 0) {
      combo = 0;
      updateComboUI(false);
    }
  }
}

// Render sand to offscreen, then scale to main canvas; overlay current piece.
function render() {
  // Fill imgData. Cells in 'pending' (waiting to be swept) render as their normal color
  // but slightly brightened so the user can see the doomed cluster.
  for (let i = 0; i < TOTAL; i++) {
    const p = i * 4;
    if (keys[i]) {
      if (pending[i]) {
        data[p] = clamp8(rArr[i] + 60);
        data[p + 1] = clamp8(gArr[i] + 60);
        data[p + 2] = clamp8(bArr[i] + 60);
      } else {
        data[p] = rArr[i];
        data[p + 1] = gArr[i];
        data[p + 2] = bArr[i];
      }
      data[p + 3] = 255;
    } else {
      data[p + 3] = 0;
    }
  }
  // Stamp the falling piece directly as sand grains so it looks identical to settled sand.
  if (current && !over) {
    const baseGX = pos.x * BLOCK;
    const baseGY = pos.y * BLOCK;
    for (const g of current.grains) {
      const gx = baseGX + g.dx;
      const gy = baseGY + g.dy;
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
      const p = (gy * COLS + gx) * 4;
      data[p] = g.r;
      data[p + 1] = g.g;
      data[p + 2] = g.b;
      data[p + 3] = 255;
    }
  }
  sctx.putImageData(imgData, 0, 0);

  ctx.fillStyle = '#0a0805';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sandCanvas, 0, 0, canvas.width, canvas.height);

  // sweep cursor + flash overlay for clearings
  for (const cl of clearings) {
    if (cl.phase === 'sweep') {
      // bright vertical line at sweep front
      const x = (cl.lastCol + 1) * GRAIN;
      const y0 = cl.minY * GRAIN;
      const y1 = (cl.maxY + 1) * GRAIN;
      const grad = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 8, y0, 16, y1 - y0);
      // running points text near the cursor
      const yMid = (cl.minY + cl.maxY) * 0.5 * GRAIN;
      ctx.save();
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const txt = '+' + (cl._shown || 0);
      const tx = Math.min(canvas.width - 80, x + 6);
      ctx.strokeText(txt, tx, yMid);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(txt, tx, yMid);
      ctx.restore();
    } else if (cl.phase === 'flash') {
      const on = (cl.flashFrames & 1) === 0;
      ctx.fillStyle = on ? '#fff' : '#000';
      ctx.globalAlpha = 0.7;
      const x = cl.minC * GRAIN;
      const y = cl.minY * GRAIN;
      const w = (cl.maxC - cl.minC + 1) * GRAIN;
      const h = (cl.maxY - cl.minY + 1) * GRAIN;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // sand burst particles
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life));
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    const sz = GRAIN + 1;
    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  // (falling piece is already drawn into the sand imgData above as individual grains)

  // floating points text
  if (floatTexts.length) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    for (const f of floatTexts) {
      const a = Math.max(0, Math.min(1, f.t));
      ctx.globalAlpha = a;
      ctx.font = `bold ${f.size | 0}px -apple-system, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}

function drawNext() {
  nctx.fillStyle = '#0a0805';
  nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const s = 18;
  const w = next.blocks[0].length * s;
  const h = next.blocks.length * s;
  const ox = (nextCanvas.width - w) / 2;
  const oy = (nextCanvas.height - h) / 2;
  const c = next.rgb;
  const fill = `rgb(${c[0]},${c[1]},${c[2]})`;
  const lite = `rgb(${clamp8(c[0]+50)},${clamp8(c[1]+50)},${clamp8(c[2]+50)})`;
  const dark = `rgb(${clamp8(c[0]-40)},${clamp8(c[1]-40)},${clamp8(c[2]-40)})`;
  next.blocks.forEach((row, y) => {
    row.forEach((v, x) => {
      if (!v) return;
      const px = ox + x * s, py = oy + y * s;
      const grad = nctx.createLinearGradient(0, py, 0, py + s);
      grad.addColorStop(0, lite);
      grad.addColorStop(1, dark);
      nctx.fillStyle = grad;
      nctx.fillRect(px, py, s, s);
      nctx.strokeStyle = 'rgba(0,0,0,0.4)';
      nctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    });
  });
}

let prevScore = 0, prevLines = 0, prevLevel = 1;
function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 150);
}
function bumpUI() {
  if (score !== prevScore) bump(scoreEl);
  if (lines !== prevLines) bump(linesEl);
  if (level !== prevLevel) bump(levelEl);
  prevScore = score; prevLines = lines; prevLevel = level;
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); }

function reset() {
  keys.fill(0);
  pending.fill(0);
  particles = [];
  floatTexts = [];
  clearings = [];
  combo = 0;
  comboResetTimer = 0;
  updateComboUI(false);
  score = 0; lines = 0; level = 1;
  dropInterval = 600;
  dropTimer = 0;
  lastTime = 0;
  paused = false; over = false;
  next = null;
  spawn();
  bumpUI();
  hideOverlay();
  hideGameOver();
}

function loop(t = 0) {
  const dt = Math.min(50, t - lastTime);
  lastTime = t;
  const slowMo = clearings.length > 0;
  if (!paused && !over) {
    if (!slowMo) {
      // normal play: sand physics + piece gravity
      // Only check for line clears once all sand has finished settling, so points
      // register only after a locked piece has fully cascaded to rest.
      const movedA = settle();
      const movedB = settle();
      if (!movedA && !movedB) clearLines();
      dropTimer += dt;
      if (dropTimer > dropInterval) {
        dropTimer = 0;
        if (!collides(current.blocks, pos.x, pos.y + 1)) pos.y++;
        else lockPiece();
      }
    } else {
      // slow-motion clear: gameplay frozen, only the clear animation advances
      updateClearings(dt);
    }
  }
  updateEffects(dt);
  render();
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (over) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      reset();
    }
    return;
  }
  if (e.key === 'p' || e.key === 'P') {
    paused = !paused;
    if (paused) showOverlay('PAUSED'); else hideOverlay();
    return;
  }
  if (paused || clearings.length > 0) return;
  switch (e.key) {
    case 'ArrowLeft': move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'ArrowDown': softDrop(); break;
    case 'ArrowUp': tryRotate(); break;
    case ' ': e.preventDefault(); hardDrop(); break;
  }
});

// Auto-pause when the tab/window loses focus; auto-resume when it returns
// (only if we were the one who paused — manual pauses stay paused).
let sandResting = true;
let pausedByBlur = false;
function handleBlur() {
  if (over || paused) return;
  paused = true;
  pausedByBlur = true;
  showOverlay('PAUSED');
}
function handleFocus() {
  if (pausedByBlur && paused) {
    paused = false;
    pausedByBlur = false;
    hideOverlay();
    lastTime = performance.now();
  }
}
window.addEventListener('blur', handleBlur);
window.addEventListener('focus', handleFocus);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) handleBlur(); else handleFocus();
});

reset();
loop();
