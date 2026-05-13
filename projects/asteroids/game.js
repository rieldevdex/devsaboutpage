/* ════════════════════════════════════════
   ASTEROIDS — Dev Arcade
   Vector ship, wrapping world, particles.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();
  const best = Arcade.bestStore("asteroids_best");

  Arcade.attachBackLink();
  Arcade.preventArrowScroll();
  Arcade.attachSoundButton($("#actions"), sfx);

  const canvas = $("#game"), ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  let state = "menu";
  let ship, asteroids, bullets, particles, score, wave, lives, invuln, shake, respawnAt;
  const elScore = $("#score"), elWave = $("#wave"), elLives = $("#lives"), elBest = $("#best");
  const ovMenu = $("#menu"), ovPause = $("#pause"), ovGO = $("#gameover");
  elBest.textContent = best.get();

  const keys = {};
  let lastFire = 0;

  // ── Init helpers ──
  function makeShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2, r: 12, alive: true };
  }
  function makeAsteroid(x, y, size) {
    // size: 3 (large), 2 (med), 1 (small)
    const speed = (1 + Math.random() * 1.4) * (4 - size) * 0.6;
    const ang = Math.random() * Math.PI * 2;
    const verts = [];
    const n = 8 + (Math.random() * 4 | 0);
    const baseR = size === 3 ? 36 : size === 2 ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = baseR * (0.75 + Math.random() * 0.5);
      verts.push({ a, rad });
    }
    return {
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ang: 0,
      vAng: (Math.random() - 0.5) * 0.04,
      size, r: baseR, verts
    };
  }
  function spawnWaveAsteroids(n) {
    asteroids = [];
    for (let i = 0; i < n; i++) {
      let x, y;
      // ensure they spawn away from ship
      do {
        x = Math.random() * W; y = Math.random() * H;
      } while (Math.hypot(x - W / 2, y - H / 2) < 120);
      asteroids.push(makeAsteroid(x, y, 3));
    }
  }

  function start() {
    score = 0; wave = 1; lives = 3;
    bullets = []; particles = []; invuln = 90; shake = 0;
    ship = makeShip();
    spawnWaveAsteroids(3);
    state = "playing";
    ovMenu.classList.add("hidden");
    ovPause.classList.add("hidden");
    ovGO.classList.add("hidden");
    updateHUD();
  }

  function nextWave() {
    wave++;
    sfx.win();
    spawnWaveAsteroids(3 + Math.min(7, wave));
    invuln = 60;
    updateHUD();
  }

  function updateHUD() {
    elScore.textContent = score;
    elWave.textContent  = wave;
    elLives.textContent = lives;
  }

  function gameOver() {
    state = "gameover";
    sfx.lose();
    const isNew = best.maybeSet(score);
    $("#goScore").textContent = score;
    $("#goWave").textContent  = wave;
    $("#goBest").textContent  = best.get();
    elBest.textContent = best.get();
    $("#newBest").classList.toggle("hidden", !isNew);
    setTimeout(() => ovGO.classList.remove("hidden"), 350);
  }

  // ── Input ──
  window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === "p" || e.key === "P") {
      if (state === "playing") { state = "paused"; ovPause.classList.remove("hidden"); }
      else if (state === "paused") { state = "playing"; ovPause.classList.add("hidden"); }
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.key] = false; });

  $("#startBtn").addEventListener("click",   () => { sfx.click(); start(); });
  $("#resumeBtn").addEventListener("click",  () => { sfx.click(); state = "playing"; ovPause.classList.add("hidden"); });
  $("#quitBtn").addEventListener("click",    () => { sfx.click(); state = "menu"; ovPause.classList.add("hidden"); ovMenu.classList.remove("hidden"); });
  $("#retryBtn").addEventListener("click",   () => { sfx.click(); start(); });
  $("#menuBtn").addEventListener("click",    () => { sfx.click(); state = "menu"; ovGO.classList.add("hidden"); ovMenu.classList.remove("hidden"); });

  // ── Particles ──
  function emit(x, y, n, color, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 3) * spread;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }

  // ── Update ──
  function update() {
    if (ship.alive) {
      // rotate
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) ship.ang -= 0.08;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) ship.ang += 0.08;
      // thrust
      if (keys["ArrowUp"] || keys["w"] || keys["W"]) {
        ship.vx += Math.cos(ship.ang) * 0.18;
        ship.vy += Math.sin(ship.ang) * 0.18;
        // exhaust
        const ex = ship.x - Math.cos(ship.ang) * ship.r;
        const ey = ship.y - Math.sin(ship.ang) * ship.r;
        emit(ex, ey, 1, "#FF6A2A", 0.5);
        if (Math.random() < 0.25) sfx.tone(80 + Math.random() * 40, 0.04, "sawtooth", 0.04);
      }
      // fire
      if ((keys[" "] || keys["Space"]) && performance.now() - lastFire > 180) {
        bullets.push({
          x: ship.x + Math.cos(ship.ang) * ship.r,
          y: ship.y + Math.sin(ship.ang) * ship.r,
          vx: Math.cos(ship.ang) * 8 + ship.vx * 0.5,
          vy: Math.sin(ship.ang) * 8 + ship.vy * 0.5,
          life: 60
        });
        lastFire = performance.now();
        sfx.tone(900, 0.05, "square", 0.08);
      }
    }

    // ship physics
    ship.vx *= 0.992; ship.vy *= 0.992;
    ship.x += ship.vx; ship.y += ship.vy;
    wrap(ship);

    if (invuln > 0) invuln--;

    // bullets
    bullets = bullets.filter(b => --b.life > 0);
    bullets.forEach(b => { b.x += b.vx; b.y += b.vy; wrap(b); });

    // asteroids
    asteroids.forEach(a => {
      a.x += a.vx; a.y += a.vy;
      a.ang += a.vAng;
      wrap(a);
    });

    // bullet-asteroid collisions
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r) {
          bullets.splice(j, 1);
          asteroids.splice(i, 1);
          score += [0, 100, 50, 20][a.size];
          shake = 4;
          sfx.explode();
          emit(a.x, a.y, 16, "#FF965F", 1.2);
          if (a.size > 1) {
            asteroids.push(makeAsteroid(a.x, a.y, a.size - 1));
            asteroids.push(makeAsteroid(a.x, a.y, a.size - 1));
          }
          updateHUD();
          break;
        }
      }
    }

    // ship-asteroid collisions
    if (ship.alive && invuln <= 0) {
      for (const a of asteroids) {
        if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r * 0.7) {
          ship.alive = false;
          shake = 14;
          emit(ship.x, ship.y, 30, "#E8002D", 1.6);
          sfx.explode();
          lives--;
          updateHUD();
          respawnAt = performance.now() + 1100;
          break;
        }
      }
    }

    if (!ship.alive && performance.now() > (respawnAt || 0)) {
      if (lives > 0) { ship = makeShip(); invuln = 100; }
      else { gameOver(); return; }
    }

    if (asteroids.length === 0) nextWave();

    // particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life -= 0.025;
    });
    if (shake > 0.1) shake *= 0.88;
  }

  function wrap(o) {
    if (o.x < 0) o.x += W; if (o.x > W) o.x -= W;
    if (o.y < 0) o.y += H; if (o.y > H) o.y -= H;
  }

  // ── Render ──
  function draw() {
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // bg
    ctx.fillStyle = "#0c0c14";
    ctx.fillRect(0, 0, W, H);

    // starfield
    if (!draw._stars) {
      draw._stars = Array.from({ length: 60 }, () => ({
        x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.7 + 0.2
      }));
    }
    for (const s of draw._stars) {
      ctx.fillStyle = `rgba(255,255,255,${s.a * (0.6 + 0.4 * Math.sin(performance.now() / 800 + s.x))})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // asteroids
    asteroids.forEach(a => {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);
      ctx.beginPath();
      a.verts.forEach((v, i) => {
        const x = Math.cos(v.a) * v.rad, y = Math.sin(v.a) * v.rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(0,217,232,0.05)";
      ctx.fill();
      ctx.restore();
    });

    // bullets
    bullets.forEach(b => {
      ctx.fillStyle = "#FF6A2A";
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,106,42,0.25)";
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    });

    // ship
    if (ship.alive) {
      const blink = invuln > 0 && Math.floor(invuln / 6) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.ang);
        ctx.beginPath();
        ctx.moveTo(ship.r, 0);
        ctx.lineTo(-ship.r * 0.8, ship.r * 0.7);
        ctx.lineTo(-ship.r * 0.5, 0);
        ctx.lineTo(-ship.r * 0.8, -ship.r * 0.7);
        ctx.closePath();
        ctx.strokeStyle = "#9AF5FA";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = "rgba(0,217,232,0.18)";
        ctx.fill();
        ctx.restore();
      }
    }

    // particles
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // initial idle
  ship = makeShip();
  asteroids = [makeAsteroid(120, 120, 3), makeAsteroid(W - 140, H - 140, 2), makeAsteroid(W - 100, 120, 2)];
  bullets = []; particles = [];
  score = 0; wave = 1; lives = 3; invuln = 0; shake = 0;

  function loop() {
    if (state === "playing") update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
