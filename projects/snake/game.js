/* ════════════════════════════════════════
   SNAKE — Dev Arcade
   Smooth grid-based snake with speed ramp,
   particle juice, and 4 modes.
   ════════════════════════════════════════ */
(function () {
  "use strict";

  const $  = Arcade.$;
  const sfx = Arcade.createSfx();
  const best = Arcade.bestStore("snake_best");

  Arcade.attachBackLink();
  Arcade.preventArrowScroll();
  Arcade.attachSoundButton($("#actions"), sfx);

  // ── Canvas setup ──
  const canvas = $("#game");
  const ctx    = canvas.getContext("2d");
  const GRID   = 22;                // cells per side
  const CELL   = canvas.width / GRID;

  // ── Modes ──
  const MODES = {
    chill:  { tickMs: 130, ramp: 0.985, walls: true,  label: "Chill"   },
    normal: { tickMs: 100, ramp: 0.97,  walls: true,  label: "Normal"  },
    fast:   { tickMs: 70,  ramp: 0.96,  walls: true,  label: "Fast"    },
    walls:  { tickMs: 90,  ramp: 0.965, walls: false, label: "No Walls"}
  };

  // ── State ──
  let state = "menu"; // menu | playing | paused | gameover
  let mode  = "normal";
  let snake, dir, nextDir, food, score, tickMs, baseTickMs, lastTick, particles, eatPulse;

  // ── DOM refs ──
  const elScore = $("#score"), elLen = $("#length"), elBest = $("#best");
  const elMode  = $("#modeBadge");
  const ovMenu  = $("#menu"), ovPause = $("#pause"), ovGO = $("#gameover");

  elBest.textContent = best.get();

  // ── Mode selection ──
  document.querySelectorAll("#modeGrid .mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#modeGrid .mode-btn").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      mode = b.dataset.mode;
      sfx.click();
    });
  });

  $("#startBtn").addEventListener("click", () => { sfx.click(); start(); });
  $("#resumeBtn").addEventListener("click", () => { sfx.click(); state = "playing"; ovPause.classList.add("hidden"); lastTick = performance.now(); });
  $("#quitBtn").addEventListener("click",   () => { sfx.click(); toMenu(); });
  $("#retryBtn").addEventListener("click",  () => { sfx.click(); start(); });
  $("#menuBtn").addEventListener("click",   () => { sfx.click(); toMenu(); });

  function toMenu() {
    state = "menu";
    ovGO.classList.add("hidden");
    ovPause.classList.add("hidden");
    ovMenu.classList.remove("hidden");
  }

  function start() {
    const m = MODES[mode];
    snake   = [{x:11,y:11},{x:10,y:11},{x:9,y:11}];
    dir     = {x:1,y:0};
    nextDir = {x:1,y:0};
    score   = 0;
    baseTickMs = m.tickMs;
    tickMs  = m.tickMs;
    particles = [];
    eatPulse = 0;
    placeFood();
    elMode.textContent = m.label;
    updateHUD();
    ovMenu.classList.add("hidden");
    ovPause.classList.add("hidden");
    ovGO.classList.add("hidden");
    state = "playing";
    lastTick = performance.now();
  }

  function placeFood() {
    while (true) {
      const f = { x: (Math.random() * GRID) | 0, y: (Math.random() * GRID) | 0 };
      if (!snake.some(s => s.x === f.x && s.y === f.y)) { food = f; return; }
    }
  }

  function updateHUD() {
    elScore.textContent = score;
    elLen.textContent   = snake.length;
    bump(elScore);
  }
  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  // ── Input ──
  const KEY = {
    ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
    w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
    W:[0,-1], S:[0,1], A:[-1,0], D:[1,0]
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P") {
      if (state === "playing") { state = "paused"; ovPause.classList.remove("hidden"); }
      else if (state === "paused") { state = "playing"; ovPause.classList.add("hidden"); lastTick = performance.now(); }
      return;
    }
    if (state !== "playing") return;
    const v = KEY[e.key];
    if (!v) return;
    const [dx, dy] = v;
    // disallow 180° reversal
    if (dx === -dir.x && dy === -dir.y) return;
    nextDir = { x: dx, y: dy };
  });

  // touch swipe
  let tStart = null;
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length) tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!tStart || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStart.x;
    const dy = t.clientY - tStart.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) nextDir = { x: dx > 0 ? 1 : -1, y: 0 };
    else                              nextDir = { x: 0, y: dy > 0 ? 1 : -1 };
    if (nextDir.x === -dir.x && nextDir.y === -dir.y) nextDir = dir;
    tStart = null;
  });

  // ── Game step ──
  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const m = MODES[mode];

    if (m.walls) {
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) return die();
    } else {
      head.x = (head.x + GRID) % GRID;
      head.y = (head.y + GRID) % GRID;
    }
    if (snake.some(s => s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      tickMs = Math.max(40, tickMs * MODES[mode].ramp);
      eatPulse = 1;
      spawnParticles(food.x, food.y);
      sfx.coin();
      placeFood();
      updateHUD();
    } else {
      snake.pop();
    }
  }

  function die() {
    state = "gameover";
    sfx.explode();
    explosion(snake[0].x, snake[0].y);
    const isNew = best.maybeSet(score);
    $("#goScore").textContent = score;
    $("#goLen").textContent   = snake.length;
    $("#goBest").textContent  = best.get();
    elBest.textContent        = best.get();
    $("#newBest").classList.toggle("hidden", !isNew);
    setTimeout(() => ovGO.classList.remove("hidden"), 250);
  }

  function spawnParticles(cx, cy, n = 14, color = "#FF6A2A") {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp  = 1 + Math.random() * 3;
      particles.push({
        x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, color
      });
    }
  }
  function explosion(cx, cy) { spawnParticles(cx, cy, 30, "#E8002D"); }

  // ── Render ──
  function draw() {
    // background w/ subtle vignette + grid
    ctx.fillStyle = "#0c0c14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }

    // food: glowing orb
    const fx = (food.x + 0.5) * CELL, fy = (food.y + 0.5) * CELL;
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 220);
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * 1.4);
    grad.addColorStop(0, "rgba(255,106,42,0.55)");
    grad.addColorStop(1, "rgba(255,106,42,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(fx - CELL*1.5, fy - CELL*1.5, CELL*3, CELL*3);
    ctx.fillStyle = "#FF6A2A";
    ctx.beginPath();
    ctx.arc(fx, fy, (CELL/2 - 3) * pulse, 0, Math.PI*2);
    ctx.fill();

    // snake
    snake.forEach((s, i) => {
      const isHead = i === 0;
      const x = s.x * CELL + 1, y = s.y * CELL + 1, w = CELL - 2, h = CELL - 2;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      if (isHead) {
        g.addColorStop(0, "#9AF5FA"); g.addColorStop(1, "#00D9E8");
      } else {
        const t = i / snake.length;
        g.addColorStop(0, `rgba(0,217,232,${1 - t * 0.6})`);
        g.addColorStop(1, `rgba(0,176,200,${1 - t * 0.6})`);
      }
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, isHead ? 6 : 4);
      ctx.fill();
      if (isHead) {
        // eyes
        ctx.fillStyle = "#0c0c14";
        const ex = x + w/2, ey = y + h/2;
        const ox = dir.x * 4, oy = dir.y * 4;
        const px = -dir.y * 3, py = dir.x * 3;
        ctx.beginPath(); ctx.arc(ex + ox + px, ey + oy + py, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + ox - px, ey + oy - py, 2, 0, Math.PI*2); ctx.fill();
      }
    });

    // particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= 0.025;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // eat pulse vignette
    if (eatPulse > 0) {
      ctx.strokeStyle = `rgba(255,106,42,${eatPulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
      eatPulse = Math.max(0, eatPulse - 0.04);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── Loop ──
  function loop(now) {
    if (state === "playing") {
      if (!lastTick) lastTick = now;
      while (now - lastTick >= tickMs) {
        step();
        if (state !== "playing") break;
        lastTick += tickMs;
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // initial idle render
  snake = [{x:11,y:11},{x:10,y:11},{x:9,y:11}];
  dir = {x:1,y:0}; nextDir = dir;
  score = 0; particles = []; eatPulse = 0; tickMs = 100;
  placeFood();
  requestAnimationFrame(loop);
})();
