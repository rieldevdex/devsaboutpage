/* ════════════════════════════════════════
   2048 — Dev Arcade
   DOM-based with CSS-driven slide animation.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();
  const best = Arcade.bestStore("2048_best");

  Arcade.attachBackLink();
  Arcade.preventArrowScroll();
  Arcade.attachSoundButton($("#actions"), sfx);

  const SIZE = 4;
  const bgGrid = $("#bgGrid");
  const tiles  = $("#tiles");
  const elScore = $("#score"), elMoves = $("#moves"), elBest = $("#best");
  const overlay = $("#overlay");

  let grid, score, moves, won, idCounter;

  // Build empty bg cells
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    bgGrid.appendChild(cell);
  }

  elBest.textContent = best.get();

  function newGame() {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    score = 0; moves = 0; won = false; idCounter = 0;
    overlay.classList.add("hidden");
    addRandom(); addRandom();
    render(true);
  }

  function addRandom() {
    const empty = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[(Math.random() * empty.length) | 0];
    grid[r][c] = { id: ++idCounter, value: Math.random() < 0.9 ? 2 : 4, isNew: true, merged: false };
  }

  // Move/merge in given direction. dr/dc is the *opposite* of slide (we iterate from "destination" side)
  function move(dr, dc) {
    let moved = false;
    let gained = 0;

    // Reset merge flags
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (grid[r][c]) { grid[r][c].merged = false; grid[r][c].isNew = false; }

    // Iterate cells in correct order so we slide toward destination
    const range = [...Array(SIZE).keys()];
    const rowsOrder = dr > 0 ? [...range].reverse() : range;
    const colsOrder = dc > 0 ? [...range].reverse() : range;

    for (const r of rowsOrder) {
      for (const c of colsOrder) {
        const tile = grid[r][c];
        if (!tile) continue;
        let nr = r, nc = c;
        while (true) {
          const tr = nr + dr, tc = nc + dc;
          if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
          const target = grid[tr][tc];
          if (!target) {
            grid[tr][tc] = tile; grid[nr][nc] = null;
            nr = tr; nc = tc; moved = true;
          } else if (target.value === tile.value && !target.merged && !tile.merged) {
            target.value *= 2;
            target.merged = true;
            grid[nr][nc] = null;
            gained += target.value;
            if (target.value === 2048 && !won) { won = true; sfx.win(); setTimeout(showWinOverlay, 250); }
            sfx.pop();
            moved = true;
            break;
          } else break;
        }
      }
    }

    if (moved) {
      score += gained;
      moves++;
      if (gained > 0) sfx.coin();
      addRandom();
      render(false);
      bump(elScore);
      if (best.maybeSet(score)) elBest.textContent = best.get();
      checkLoss();
    }
  }

  function checkLoss() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) return;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c].value;
        if (r + 1 < SIZE && grid[r+1][c].value === v) return;
        if (c + 1 < SIZE && grid[r][c+1].value === v) return;
      }
    sfx.lose();
    showLossOverlay();
  }

  function showWinOverlay() {
    $("#ovTitle").textContent = "You hit 2048!";
    $("#ovScore").textContent = score;
    $("#ovBest").textContent  = best.get();
    $("#ovMoves").textContent = moves;
    $("#newBest").classList.toggle("hidden", best.get() !== score || score === 0);
    $("#continueBtn").style.display = "";
    overlay.classList.remove("hidden");
  }
  function showLossOverlay() {
    $("#ovTitle").textContent = "No more moves";
    $("#ovScore").textContent = score;
    $("#ovBest").textContent  = best.get();
    $("#ovMoves").textContent = moves;
    $("#newBest").classList.toggle("hidden", best.get() !== score || score === 0);
    $("#continueBtn").style.display = "none";
    overlay.classList.remove("hidden");
  }

  // Render: re-create tile elements but keyed by id for animation
  function render(initial) {
    // current dom by id
    const existing = new Map();
    tiles.querySelectorAll(".tile").forEach(el => existing.set(el.dataset.id, el));

    const seen = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = grid[r][c];
        if (!tile) continue;
        seen.add(String(tile.id));
        let el = existing.get(String(tile.id));
        if (!el) {
          el = document.createElement("div");
          el.className = "tile";
          el.dataset.id = tile.id;
          tiles.appendChild(el);
        }
        el.dataset.v = tile.value;
        el.textContent = tile.value;
        el.style.left = `calc((100% + 10px) * ${c} / 4)`;
        el.style.top  = `calc((100% + 10px) * ${r} / 4)`;
        el.classList.remove("appear", "merged");
        if (tile.isNew && !initial) el.classList.add("appear");
        else if (initial && tile.isNew) {
          // even on initial, give a small pop
          el.classList.add("appear");
        }
        if (tile.merged) requestAnimationFrame(() => el.classList.add("merged"));
      }
    }
    // remove dom for ids no longer present (merged-away)
    existing.forEach((el, id) => { if (!seen.has(id)) el.remove(); });

    elScore.textContent = score;
    elMoves.textContent = moves;
  }

  function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

  // ── Input ──
  const KEY = {
    ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1],
    w:[-1,0], s:[1,0], a:[0,-1], d:[0,1],
    W:[-1,0], S:[1,0], A:[0,-1], D:[0,1],
  };
  window.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("hidden") === false && e.key !== "Escape") return;
    const v = KEY[e.key];
    if (!v) return;
    e.preventDefault();
    move(v[0], v[1]);
  });

  // touch
  let tStart = null;
  const board = $("#board");
  board.addEventListener("touchstart", (e) => {
    if (e.touches.length) tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  board.addEventListener("touchend", (e) => {
    if (!tStart || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
    else                              move(dy > 0 ? 1 : -1, 0);
    tStart = null;
  });

  $("#newGame").addEventListener("click",   () => { sfx.click(); newGame(); });
  $("#restartBtn").addEventListener("click", () => { sfx.click(); newGame(); });
  $("#continueBtn").addEventListener("click", () => { sfx.click(); overlay.classList.add("hidden"); });

  newGame();
})();
