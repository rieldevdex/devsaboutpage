/* ════════════════════════════════════════
   MINESWEEPER — Dev Arcade
   Recursive flood-fill, 3 difficulties.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();

  Arcade.attachBackLink();
  Arcade.attachSoundButton($("#actions"), sfx);

  const DIFFS = {
    easy:   { w: 9,  h: 9,  mines: 10, label: "Easy"   },
    medium: { w: 12, h: 12, mines: 22, label: "Medium" },
    hard:   { w: 16, h: 16, mines: 50, label: "Hard"   }
  };
  let diff = "easy";

  function bestFor(d) { return Arcade.bestStore("minesweeper_best_" + d); }

  const boardEl = $("#board");
  const elMines = $("#minesLeft"), elTime = $("#time");
  const elDiffBadge = $("#diffBadge"), elBestBadge = $("#bestBadge");
  const ovMenu = $("#menu"), ovResult = $("#result");

  let cells, w, h, mines, flags, revealed, alive, won, started, startTime, timerId, firstClick;

  document.querySelectorAll("#diffGrid .mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#diffGrid .mode-btn").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      diff = b.dataset.d;
      sfx.click();
    });
  });

  $("#startBtn").addEventListener("click",      () => { sfx.click(); newGame(); });
  $("#newGameBtn").addEventListener("click",    () => { sfx.click(); newGame(); });
  $("#playAgainBtn").addEventListener("click",  () => { sfx.click(); newGame(); });
  $("#changeDiffBtn").addEventListener("click", () => { sfx.click(); ovResult.classList.add("hidden"); ovMenu.classList.remove("hidden"); });

  function refreshBest() {
    const b = bestFor(diff).get();
    elBestBadge.textContent = b ? Arcade.fmt.time(b) : "—";
  }

  function updateMines() {
    elMines.textContent = mines - flags;
  }

  function newGame() {
    const cfg = DIFFS[diff];
    w = cfg.w; h = cfg.h; mines = cfg.mines;
    flags = 0; revealed = 0; alive = true; won = false; started = false; firstClick = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    startTime = 0;
    elTime.textContent = "0:00";
    elDiffBadge.textContent = cfg.label;
    refreshBest();

    cells = [];
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${w}, auto)`;

    for (let r = 0; r < h; r++) {
      cells[r] = [];
      for (let c = 0; c < w; c++) {
        const cell = { r, c, mine: false, n: 0, revealed: false, flagged: false, el: null };
        const el = document.createElement("div");
        el.className = "cell";
        el.addEventListener("click",  () => onClick(cell));
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); toggleFlag(cell); });
        let pressTimer = null, longPressed = false;
        el.addEventListener("touchstart", () => {
          longPressed = false;
          pressTimer = setTimeout(() => { longPressed = true; toggleFlag(cell); }, 380);
        }, { passive: true });
        el.addEventListener("touchend", (e) => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          if (longPressed) e.preventDefault();
        });
        cell.el = el;
        boardEl.appendChild(el);
        cells[r][c] = cell;
      }
    }
    updateMines();
    ovMenu.classList.add("hidden");
    ovResult.classList.add("hidden");
  }

  function placeMines(safeR, safeC) {
    let placed = 0;
    while (placed < mines) {
      const r = (Math.random() * h) | 0;
      const c = (Math.random() * w) | 0;
      if (cells[r][c].mine) continue;
      if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
      cells[r][c].mine = true;
      placed++;
    }
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      if (cells[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
        if (cells[nr][nc].mine) n++;
      }
      cells[r][c].n = n;
    }
  }

  function startTimer() {
    if (started) return;
    started = true;
    startTime = performance.now();
    timerId = setInterval(() => {
      const s = (performance.now() - startTime) / 1000;
      elTime.textContent = Arcade.fmt.time(s);
    }, 250);
  }

  function onClick(cell) {
    if (!alive || won) return;
    if (cell.flagged) return;
    if (firstClick) {
      placeMines(cell.r, cell.c);
      firstClick = false;
      startTimer();
    }
    if (cell.mine) return die(cell);
    flood(cell);
    sfx.blip();
    checkWin();
  }

  function toggleFlag(cell) {
    if (!alive || won || cell.revealed) return;
    cell.flagged = !cell.flagged;
    cell.el.classList.toggle("flag", cell.flagged);
    cell.el.textContent = cell.flagged ? "⚑" : "";
    flags += cell.flagged ? 1 : -1;
    updateMines();
    sfx.blip();
  }

  function flood(start) {
    if (start.revealed || start.flagged) return;
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      if (c.revealed || c.flagged) continue;
      c.revealed = true;
      revealed++;
      c.el.classList.add("revealed", "reveal-anim");
      if (c.n > 0) {
        c.el.dataset.n = c.n;
        c.el.textContent = c.n;
      }
      if (c.n === 0) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = c.r + dr, nc = c.c + dc;
          if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
          const n2 = cells[nr][nc];
          if (!n2.revealed && !n2.flagged && !n2.mine) stack.push(n2);
        }
      }
    }
  }

  function die(cell) {
    alive = false;
    cell.el.classList.add("mine", "exploded");
    cell.el.textContent = "✸";
    sfx.explode();
    if (timerId) clearInterval(timerId);
    // reveal all mines
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const x = cells[r][c];
      if (x.mine && x !== cell) {
        x.el.classList.add("mine");
        x.el.textContent = "✸";
      } else if (!x.mine && x.flagged) {
        x.el.classList.add("wrong-flag");
        x.el.textContent = "";
      }
    }
    showResult(false);
  }

  function checkWin() {
    if (revealed === w * h - mines) {
      won = true;
      alive = false;
      if (timerId) clearInterval(timerId);
      sfx.win();
      // auto-flag remaining mines visually
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const x = cells[r][c];
        if (x.mine && !x.flagged) {
          x.flagged = true;
          x.el.classList.add("flag");
          x.el.textContent = "⚑";
        }
      }
      flags = mines; updateMines();
      showResult(true);
    }
  }

  function showResult(victory) {
    const elapsed = (performance.now() - startTime) / 1000;
    $("#resultTitle").textContent = victory ? "Cleared!" : "Boom 💥";
    $("#rTime").textContent = Arcade.fmt.time(elapsed);
    $("#rDiff").textContent = DIFFS[diff].label;
    let isNew = false;
    if (victory) {
      const store = bestFor(diff);
      const cur = store.get();
      const t = Math.floor(elapsed);
      if (cur === 0 || t < cur) { store.set(t); isNew = true; }
      $("#rBest").textContent = Arcade.fmt.time(store.get());
    } else {
      const cur = bestFor(diff).get();
      $("#rBest").textContent = cur ? Arcade.fmt.time(cur) : "—";
    }
    $("#newBest").classList.toggle("hidden", !isNew);
    refreshBest();
    setTimeout(() => ovResult.classList.remove("hidden"), 400);
  }

  // Initial idle: empty grid placeholder
  newGame();
  // Re-show menu over the freshly initialized board
  ovMenu.classList.remove("hidden");
})();
