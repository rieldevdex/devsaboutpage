/* ════════════════════════════════════════
   BREAKOUT — Dev Arcade
   Paddle, ball, bricks, particles, levels.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();
  const best = Arcade.bestStore("breakout_best");

  Arcade.attachBackLink();
  Arcade.preventArrowScroll();
  Arcade.attachSoundButton($("#actions"), sfx);

  const canvas = $("#game"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // ── Brick palette by row (top → bottom) ──
  const ROW_COLORS = ["#FF6A2A", "#FF965F", "#FFC906", "#00D9E8", "#9467BD"];

  // ── State ──
  let state = "menu", paddle, ball, bricks, score, level, lives, particles, shake, launching;
  const elScore = $("#score"), elLevel = $("#level"), elLives = $("#lives"), elBest = $("#best");
  const ovMenu = $("#menu"), ovPause = $("#pause"), ovGO = $("#gameover");
  elBest.textContent = best.get();

  function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

  function buildLevel(n) {
    const cols = 9;
    const rows = Math.min(5, 3 + Math.floor((n - 1) / 2));
    const bw   = 44, bh = 16, gap = 4;
    const totalW = cols * (bw + gap) - gap;
    const offX  = (W - totalW) / 2;
    const offY  = 60;
    const arr = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // sprinkle gaps in higher levels
        if (n >= 3 && (r + c) % 7 === 0 && Math.random() < 0.18) continue;
        arr.push({
          x: offX + c * (bw + gap),
          y: offY + r * (bh + gap),
          w: bw, h: bh,
          color: ROW_COLORS[r % ROW_COLORS.length],
          alive: true
        });
      }
    }
    return arr;
  }

  function reset(toLvl) {
    paddle = { x: W / 2 - 50, y: H - 30, w: 100, h: 12, vx: 0 };
    ball   = { x: W / 2, y: paddle.y - 8, vx: 0, vy: 0, r: 7, stuck: true };
    particles = [];
    shake = 0;
    launching = true;
    if (toLvl !== undefined) level = toLvl;
    bricks = buildLevel(level);
  }

  function start() {
    score = 0; level = 1; lives = 3;
    reset(1);
    ovMenu.classList.add("hidden"); ovPause.classList.add("hidden"); ovGO.classList.add("hidden");
    state = "playing";
    updateHUD();
  }

  function updateHUD() {
    elScore.textContent = score; bump(elScore);
    elLevel.textContent = level;
    elLives.textContent = lives;
  }

  function nextLevel() {
    level++;
    sfx.win();
    reset();
    updateHUD();
  }

  function gameOver(won) {
    state = "gameover";
    const isNew = best.maybeSet(score);
    $("#goTitle").textContent = won ? "You Win!" : "Game Over";
    $("#goScore").textContent = score;
    $("#goLevel").textContent = level;
    $("#goBest").textContent  = best.get();
    elBest.textContent = best.get();
    $("#newBest").classList.toggle("hidden", !isNew);
    won ? sfx.win() : sfx.lose();
    setTimeout(() => ovGO.classList.remove("hidden"), 250);
  }

  // ── Input ──
  const keys = {};
  let mouseX = null;
  window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === " " || e.code === "Space") {
      if (state === "playing" && ball.stuck) { launchBall(); }
    }
    if (e.key === "p" || e.key === "P") {
      if (state === "playing") { state = "paused"; ovPause.classList.remove("hidden"); }
      else if (state === "paused") { state = "playing"; ovPause.classList.add("hidden"); }
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.key] = false; });
  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = ((e.clientX - r.left) / r.width) * W;
  });
  canvas.addEventListener("mouseleave", () => { mouseX = null; });
  canvas.addEventListener("click", () => {
    if (state === "playing" && ball.stuck) launchBall();
  });
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length) {
      const r = canvas.getBoundingClientRect();
      mouseX = ((e.touches[0].clientX - r.left) / r.width) * W;
    }
  }, { passive: true });
  canvas.addEventListener("touchstart", (e) => {
    if (state === "playing" && ball.stuck) launchBall();
    if (e.touches.length) {
      const r = canvas.getBoundingClientRect();
      mouseX = ((e.touches[0].clientX - r.left) / r.width) * W;
    }
  }, { passive: true });

  function launchBall() {
    ball.stuck = false;
    const angle = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3);
    const speed = 6 + level * 0.25;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    sfx.blip();
  }

  $("#startBtn").addEventListener("click", () => { sfx.click(); start(); });
  $("#resumeBtn").addEventListener("click", () => { sfx.click(); state = "playing"; ovPause.classList.add("hidden"); });
  $("#quitBtn").addEventListener("click", () => { sfx.click(); state = "menu"; ovPause.classList.add("hidden"); ovMenu.classList.remove("hidden"); });
  $("#retryBtn").addEventListener("click", () => { sfx.click(); start(); });
  $("#menuBtn").addEventListener("click", () => { sfx.click(); state = "menu"; ovGO.classList.add("hidden"); ovMenu.classList.remove("hidden"); });

  // ── Logic ──
  function update() {
    // paddle
    if (mouseX !== null) {
      paddle.x += (mouseX - paddle.w / 2 - paddle.x) * 0.35;
    } else {
      const speed = 8;
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) paddle.x -= speed;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) paddle.x += speed;
    }
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    // ball stuck on paddle
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
    } else {
      ball.x += ball.vx;
      ball.y += ball.vy;

      // walls
      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; sfx.blip(); }
      if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; sfx.blip(); }
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; sfx.blip(); }

      // paddle collide
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 8 &&
          ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
        ball.y = paddle.y - ball.r;
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1..1
        const speed = Math.hypot(ball.vx, ball.vy);
        const angle = (-Math.PI / 2) + hit * (Math.PI / 3);
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        sfx.pop();
      }

      // bricks
      let alive = 0;
      for (const b of bricks) {
        if (!b.alive) continue;
        alive++;
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
            ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
          // figure side
          const overlapL = (ball.x + ball.r) - b.x;
          const overlapR = (b.x + b.w) - (ball.x - ball.r);
          const overlapT = (ball.y + ball.r) - b.y;
          const overlapB = (b.y + b.h) - (ball.y - ball.r);
          const min = Math.min(overlapL, overlapR, overlapT, overlapB);
          if (min === overlapL || min === overlapR) ball.vx *= -1;
          else ball.vy *= -1;

          b.alive = false;
          score += 10 + level * 2;
          shake = 4;
          spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color, 10);
          sfx.coin();
          updateHUD();
          break;
        }
      }
      if (alive === 0) { nextLevel(); return; }

      // miss
      if (ball.y - ball.r > H) {
        lives--;
        updateHUD();
        sfx.lose();
        if (lives <= 0) { gameOver(false); return; }
        // restart ball
        ball.stuck = true;
        ball.vx = 0; ball.vy = 0;
      }
    }

    // particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.08;
      p.life -= 0.025;
    });

    if (shake > 0) shake *= 0.9;
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color });
    }
  }

  // ── Render ──
  function draw() {
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    ctx.fillStyle = "#0c0c14";
    ctx.fillRect(0, 0, W, H);

    // subtle background grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 12; i++) {
      const x = i * (W / 12);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // bricks
    bricks.forEach(b => {
      if (!b.alive) return;
      const grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      grd.addColorStop(0, lighten(b.color, 0.2));
      grd.addColorStop(1, b.color);
      ctx.fillStyle = grd;
      roundRect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // paddle
    const pg = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
    pg.addColorStop(0, "#9AF5FA");
    pg.addColorStop(1, "#00D9E8");
    ctx.fillStyle = pg;
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 5); ctx.fill();

    // ball
    const bg = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
    bg.addColorStop(0, "#fff");
    bg.addColorStop(1, "#FF6A2A");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    // glow
    ctx.fillStyle = "rgba(255,106,42,0.18)";
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 2.2, 0, Math.PI * 2); ctx.fill();

    // particles
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;

    // ball-stuck instruction
    if (ball.stuck && state === "playing") {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRESS SPACE / CLICK TO LAUNCH", W / 2, paddle.y - 30);
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function lighten(hex, amt) {
    const c = hex.replace("#", "");
    const num = parseInt(c, 16);
    let r = (num >> 16) + Math.round(255 * amt);
    let g = ((num >> 8) & 0xff) + Math.round(255 * amt);
    let b = (num & 0xff) + Math.round(255 * amt);
    r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
    return `rgb(${r},${g},${b})`;
  }

  // ── Loop ──
  reset(1); // initial idle
  function loop() {
    if (state === "playing") update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
