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
  let ship, asteroids, bullets, particles, trails, floatTexts, score, wave, lives, invuln, shake, respawnAt, screenFlash;
  const elScore = $("#score"), elWave = $("#wave"), elLives = $("#lives"), elBest = $("#best");
  const ovMenu = $("#menu"), ovPause = $("#pause"), ovGO = $("#gameover");
  elBest.textContent = best.get();

  const keys = {};
  let lastFire = 0;
  let thrustLevel = 0; // smooth thrust animation
  let thrusting = false;

  // ── Starfield (parallax layers) ──
  const stars = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 30 : layer === 1 ? 50 : 80;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: layer === 0 ? 1.8 + Math.random() : layer === 1 ? 0.8 + Math.random() * 0.6 : 0.4 + Math.random() * 0.3,
        a: layer === 0 ? 0.7 + Math.random() * 0.3 : layer === 1 ? 0.4 + Math.random() * 0.3 : 0.15 + Math.random() * 0.2,
        layer, phase: Math.random() * Math.PI * 2
      });
    }
  }

  // ── Init helpers ──
  function makeShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, ang: -Math.PI / 2, r: 14, alive: true, thrust: false };
  }
  function makeAsteroid(x, y, size) {
    const speed = (1.2 + Math.random() * 1.5) * (4 - size) * 0.55;
    const ang = Math.random() * Math.PI * 2;
    const verts = [];
    const n = 9 + (Math.random() * 5 | 0);
    const baseR = size === 3 ? 38 : size === 2 ? 23 : 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = baseR * (0.7 + Math.random() * 0.6);
      verts.push({ a, rad });
    }
    return {
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ang: 0,
      vAng: (Math.random() - 0.5) * 0.03,
      size, r: baseR, verts,
      hue: Math.random() < 0.5 ? 190 : 30 + Math.random() * 20
    };
  }
  function spawnWaveAsteroids(n) {
    asteroids = [];
    for (let i = 0; i < n; i++) {
      let x, y;
      do {
        x = Math.random() * W; y = Math.random() * H;
      } while (Math.hypot(x - W / 2, y - H / 2) < 140);
      asteroids.push(makeAsteroid(x, y, 3));
    }
  }

  function start() {
    score = 0; wave = 1; lives = 3;
    bullets = []; particles = []; trails = []; floatTexts = [];
    invuln = 90; shake = 0; screenFlash = 0;
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
    screenFlash = 0.3;
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
  function emit(x, y, n, color, spread = 1, sizeMin = 1.5, sizeMax = 3.5, lifeSpan = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 3) * spread;
      const sz = sizeMin + Math.random() * (sizeMax - sizeMin);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: lifeSpan, decay: 0.018 + Math.random() * 0.012,
        color, size: sz, drag: 0.96 + Math.random() * 0.02
      });
    }
  }

  function emitRing(x, y, n, color, radius) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = radius * 0.06;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6, decay: 0.02, color, size: 2, drag: 0.98
      });
    }
  }

  function emitDebris(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      const len = 4 + Math.random() * 8;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 0.012 + Math.random() * 0.008,
        color, size: 1.5, drag: 0.985,
        isDebris: true, debrisLen: len, debrisAng: a
      });
    }
  }

  function addFloatText(x, y, text, color = "#FFC906") {
    floatTexts.push({ x, y, text, color, life: 1, vy: -1.2 });
  }

  // ── Update ──
  function update() {
    thrusting = ship.alive && (keys["ArrowUp"] || keys["w"] || keys["W"]);

    if (ship.alive) {
      // rotate
      const rotSpeed = 0.075;
      if (keys["ArrowLeft"] || keys["a"] || keys["A"]) ship.ang -= rotSpeed;
      if (keys["ArrowRight"] || keys["d"] || keys["D"]) ship.ang += rotSpeed;

      // thrust
      if (thrusting) {
        const power = 0.2;
        ship.vx += Math.cos(ship.ang) * power;
        ship.vy += Math.sin(ship.ang) * power;
        thrustLevel = Math.min(1, thrustLevel + 0.1);

        const backAng = ship.ang + Math.PI;
        const nozzleX = ship.x + Math.cos(backAng) * ship.r * 0.55;
        const nozzleY = ship.y + Math.sin(backAng) * ship.r * 0.55;

        // Hot core particles (white/yellow, tight cone, fast fade)
        for (let i = 0; i < 2; i++) {
          const j = (Math.random() - 0.5) * 0.2;
          const spd = 2.5 + Math.random() * 2;
          particles.push({
            x: nozzleX, y: nozzleY,
            vx: Math.cos(backAng + j) * spd + ship.vx * 0.35,
            vy: Math.sin(backAng + j) * spd + ship.vy * 0.35,
            life: 0.35 + Math.random() * 0.2, decay: 0.04 + Math.random() * 0.02,
            color: Math.random() < 0.4 ? "#fff" : "#FFE8A0", size: 2 + Math.random() * 2, drag: 0.93,
            isFlame: true
          });
        }
        // Mid flame particles (orange, wider spread)
        for (let i = 0; i < 3; i++) {
          const j = (Math.random() - 0.5) * 0.5;
          const spd = 1.5 + Math.random() * 2.2;
          const cols = ["#FF6A2A", "#FF8844", "#FFa050"];
          particles.push({
            x: nozzleX + (Math.random() - 0.5) * 3, y: nozzleY + (Math.random() - 0.5) * 3,
            vx: Math.cos(backAng + j) * spd + ship.vx * 0.3,
            vy: Math.sin(backAng + j) * spd + ship.vy * 0.3,
            life: 0.45 + Math.random() * 0.35, decay: 0.028 + Math.random() * 0.015,
            color: cols[(Math.random() * cols.length) | 0], size: 2.5 + Math.random() * 3, drag: 0.94,
            isFlame: true
          });
        }
        // Outer smoke/embers (dark red, wide, slow)
        if (Math.random() < 0.6) {
          const j = (Math.random() - 0.5) * 0.8;
          const spd = 0.6 + Math.random() * 1.2;
          particles.push({
            x: nozzleX + (Math.random() - 0.5) * 5, y: nozzleY + (Math.random() - 0.5) * 5,
            vx: Math.cos(backAng + j) * spd + ship.vx * 0.2,
            vy: Math.sin(backAng + j) * spd + ship.vy * 0.2,
            life: 0.6 + Math.random() * 0.4, decay: 0.012 + Math.random() * 0.008,
            color: "rgba(180,60,20,0.6)", size: 3 + Math.random() * 3, drag: 0.97,
            isSmoke: true
          });
        }
        // Bright sparks (tiny, fast, long-lived)
        if (Math.random() < 0.4) {
          const j = (Math.random() - 0.5) * 0.6;
          const spd = 3.5 + Math.random() * 3;
          particles.push({
            x: nozzleX, y: nozzleY,
            vx: Math.cos(backAng + j) * spd + ship.vx * 0.4,
            vy: Math.sin(backAng + j) * spd + ship.vy * 0.4,
            life: 0.7 + Math.random() * 0.5, decay: 0.015 + Math.random() * 0.01,
            color: "#FFEE80", size: 0.8 + Math.random() * 0.8, drag: 0.985,
            isSpark: true
          });
        }

        // Engine hum sound
        if (Math.random() < 0.12) sfx.tone(65 + Math.random() * 35, 0.035, "sawtooth", 0.04);
      } else {
        thrustLevel = Math.max(0, thrustLevel - 0.05);
      }

      // fire
      if ((keys[" "] || keys["Space"]) && performance.now() - lastFire > 160) {
        const bx = ship.x + Math.cos(ship.ang) * ship.r;
        const by = ship.y + Math.sin(ship.ang) * ship.r;
        bullets.push({
          x: bx, y: by,
          vx: Math.cos(ship.ang) * 9 + ship.vx * 0.4,
          vy: Math.sin(ship.ang) * 9 + ship.vy * 0.4,
          life: 55, trail: []
        });
        lastFire = performance.now();
        sfx.tone(880, 0.04, "square", 0.07);
        // muzzle flash
        emit(bx, by, 3, "#FF6A2A", 0.4, 1, 2, 0.2);
        shake = Math.max(shake, 1.5);
      }
    } else {
      thrustLevel = Math.max(0, thrustLevel - 0.1);
    }

    // ship physics
    ship.vx *= 0.993; ship.vy *= 0.993;
    ship.x += ship.vx; ship.y += ship.vy;
    wrap(ship);

    if (invuln > 0) invuln--;

    // bullets
    bullets = bullets.filter(b => --b.life > 0);
    bullets.forEach(b => {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 8) b.trail.shift();
      b.x += b.vx; b.y += b.vy;
      wrap(b);
    });

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
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + 3) {
          bullets.splice(j, 1);
          asteroids.splice(i, 1);
          const pts = [0, 100, 50, 20][a.size];
          score += pts;
          shake = a.size === 3 ? 7 : a.size === 2 ? 4 : 2;
          screenFlash = a.size === 3 ? 0.2 : 0.1;
          sfx.explode();

          // Multi-layer explosion
          emit(a.x, a.y, 12 + a.size * 6, "#FF965F", 1.0 + a.size * 0.3, 1.5, 4);
          emit(a.x, a.y, 6 + a.size * 3, "#FFD080", 0.6, 2, 5, 0.7);
          emitRing(a.x, a.y, 16, "rgba(255,150,95,0.6)", a.r * 2);
          emitDebris(a.x, a.y, 3 + a.size * 2, "rgba(255,255,255,0.7)");

          // Score popup
          addFloatText(a.x, a.y - a.r, `+${pts}`);

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
        if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r + ship.r * 0.6) {
          ship.alive = false;
          shake = 18;
          screenFlash = 0.5;
          // Big death explosion
          emit(ship.x, ship.y, 40, "#E8002D", 1.8, 2, 5);
          emit(ship.x, ship.y, 20, "#FF6A2A", 1.2, 1, 3);
          emitRing(ship.x, ship.y, 24, "rgba(232,0,45,0.5)", 60);
          emitDebris(ship.x, ship.y, 8, "#9AF5FA");
          sfx.explode();
          lives--;
          updateHUD();
          respawnAt = performance.now() + 1400;
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
      p.vx *= (p.drag || 0.96);
      p.vy *= (p.drag || 0.96);
      p.life -= (p.decay || 0.025);
    });

    // float texts
    floatTexts = floatTexts.filter(f => f.life > 0);
    floatTexts.forEach(f => { f.y += f.vy; f.life -= 0.02; });

    if (shake > 0.1) shake *= 0.86;
    if (screenFlash > 0) screenFlash *= 0.88;
  }

  function wrap(o) {
    if (o.x < -20) o.x += W + 40; if (o.x > W + 20) o.x -= W + 40;
    if (o.y < -20) o.y += H + 40; if (o.y > H + 20) o.y -= H + 40;
  }

  // ── Render ──
  function draw() {
    const now = performance.now();
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);

    // bg gradient
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
    grad.addColorStop(0, "#0e0e1a");
    grad.addColorStop(1, "#06060c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // starfield with twinkle
    for (const s of stars) {
      const twinkle = 0.6 + 0.4 * Math.sin(now / (600 + s.layer * 400) + s.phase);
      ctx.globalAlpha = s.a * twinkle;
      ctx.fillStyle = s.layer === 0 ? "#fff" : s.layer === 1 ? "#c8d8ff" : "#6080a0";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // asteroids
    asteroids.forEach(a => {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.ang);

      // outer glow
      ctx.shadowColor = `hsla(${a.hue}, 60%, 60%, 0.3)`;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      a.verts.forEach((v, i) => {
        const x = Math.cos(v.a) * v.rad, y = Math.sin(v.a) * v.rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = `hsla(${a.hue}, 40%, 75%, 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = `hsla(${a.hue}, 50%, 20%, 0.15)`;
      ctx.fill();

      // inner detail lines
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `hsla(${a.hue}, 30%, 50%, 0.2)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 2; i++) {
        const v1 = a.verts[i * 2 % a.verts.length];
        const v2 = a.verts[(i * 2 + 4) % a.verts.length];
        ctx.beginPath();
        ctx.moveTo(Math.cos(v1.a) * v1.rad * 0.4, Math.sin(v1.a) * v1.rad * 0.4);
        ctx.lineTo(Math.cos(v2.a) * v2.rad * 0.4, Math.sin(v2.a) * v2.rad * 0.4);
        ctx.stroke();
      }

      ctx.restore();
    });

    // bullet trails
    bullets.forEach(b => {
      if (b.trail.length > 1) {
        for (let i = 1; i < b.trail.length; i++) {
          const t = i / b.trail.length;
          ctx.globalAlpha = t * 0.5;
          ctx.strokeStyle = "#FF6A2A";
          ctx.lineWidth = t * 2;
          ctx.beginPath();
          ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
          ctx.lineTo(b.trail[i].x, b.trail[i].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // bullet glow
      ctx.shadowColor = "#FF6A2A";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,106,42,0.4)";
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
    });

    // ship
    if (ship.alive) {
      const blink = invuln > 0 && Math.floor(invuln / 5) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.ang);

        // Thruster flame (drawn behind ship)
        if (thrustLevel > 0.03) {
          const fl = thrustLevel;
          const t = performance.now() / 1000;

          // Turbulence offsets
          const turb1 = Math.sin(t * 18) * 1.5 * fl;
          const turb2 = Math.cos(t * 23) * 1.2 * fl;
          const turb3 = Math.sin(t * 31) * 0.8 * fl;

          // Engine glow (pulsing circle at nozzle)
          const nGlow = 0.6 + 0.4 * Math.sin(t * 14);
          const nR = (4 + fl * 3) * nGlow;
          const nozzleGrad = ctx.createRadialGradient(-ship.r * 0.45, 0, 0, -ship.r * 0.45, 0, nR * 2.5);
          nozzleGrad.addColorStop(0, `rgba(255,255,240,${0.9 * fl})`);
          nozzleGrad.addColorStop(0.3, `rgba(255,200,80,${0.6 * fl})`);
          nozzleGrad.addColorStop(0.7, `rgba(255,106,42,${0.2 * fl})`);
          nozzleGrad.addColorStop(1, "rgba(255,60,0,0)");
          ctx.fillStyle = nozzleGrad;
          ctx.beginPath();
          ctx.arc(-ship.r * 0.45, 0, nR * 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Outer flame tongue 1 (main, with turbulence)
          const fLen1 = (12 + fl * 18) * (0.85 + Math.random() * 0.3);
          ctx.beginPath();
          ctx.moveTo(-ship.r * 0.48, -ship.r * 0.22 + turb1);
          ctx.bezierCurveTo(
            -ship.r * 0.7 - fLen1 * 0.3, -ship.r * 0.15 + turb2,
            -ship.r * 0.7 - fLen1 * 0.6, turb3 * 0.5,
            -ship.r * 0.48 - fLen1, turb3
          );
          ctx.bezierCurveTo(
            -ship.r * 0.7 - fLen1 * 0.6, turb2 * 0.5,
            -ship.r * 0.7 - fLen1 * 0.3, ship.r * 0.15 + turb1,
            -ship.r * 0.48, ship.r * 0.22 + turb2
          );
          ctx.closePath();
          const g1 = ctx.createLinearGradient(-ship.r * 0.48, 0, -ship.r * 0.48 - fLen1, 0);
          g1.addColorStop(0, `rgba(255,180,60,${0.85 * fl})`);
          g1.addColorStop(0.35, `rgba(255,90,20,${0.6 * fl})`);
          g1.addColorStop(0.7, `rgba(200,30,0,${0.25 * fl})`);
          g1.addColorStop(1, "rgba(120,10,0,0)");
          ctx.fillStyle = g1;
          ctx.fill();

          // Outer flame tongue 2 (secondary, offset & shorter)
          const fLen2 = fLen1 * (0.5 + Math.random() * 0.3);
          ctx.beginPath();
          ctx.moveTo(-ship.r * 0.48, -ship.r * 0.12 + turb2 * 0.5);
          ctx.quadraticCurveTo(
            -ship.r * 0.6 - fLen2 * 0.5, turb1 * 0.7,
            -ship.r * 0.48 - fLen2, turb2 * 0.8
          );
          ctx.quadraticCurveTo(
            -ship.r * 0.6 - fLen2 * 0.5, -turb3 * 0.5,
            -ship.r * 0.48, ship.r * 0.12 + turb3 * 0.5
          );
          ctx.closePath();
          ctx.fillStyle = `rgba(255,140,40,${0.35 * fl})`;
          ctx.fill();

          // Inner flame (hot white/yellow core)
          const iLen = fLen1 * 0.45;
          ctx.beginPath();
          ctx.moveTo(-ship.r * 0.46, -ship.r * 0.08);
          ctx.bezierCurveTo(
            -ship.r * 0.55 - iLen * 0.3, -ship.r * 0.04 + turb3 * 0.3,
            -ship.r * 0.55 - iLen * 0.5, turb1 * 0.2,
            -ship.r * 0.46 - iLen, turb2 * 0.3
          );
          ctx.bezierCurveTo(
            -ship.r * 0.55 - iLen * 0.5, turb2 * 0.2,
            -ship.r * 0.55 - iLen * 0.3, ship.r * 0.04 + turb1 * 0.3,
            -ship.r * 0.46, ship.r * 0.08
          );
          ctx.closePath();
          const gInner = ctx.createLinearGradient(-ship.r * 0.46, 0, -ship.r * 0.46 - iLen, 0);
          gInner.addColorStop(0, `rgba(255,255,255,${0.95 * fl})`);
          gInner.addColorStop(0.35, `rgba(255,240,160,${0.8 * fl})`);
          gInner.addColorStop(0.7, `rgba(255,160,60,${0.3 * fl})`);
          gInner.addColorStop(1, "rgba(255,100,20,0)");
          ctx.fillStyle = gInner;
          ctx.fill();

          // Ambient glow around whole flame area
          ctx.shadowColor = "#FF6A2A";
          ctx.shadowBlur = 20 * fl;
          ctx.fillStyle = "rgba(255,106,42,0.01)";
          ctx.beginPath();
          ctx.arc(-ship.r * 0.5 - fLen1 * 0.3, 0, fLen1 * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Ship body with glow
        ctx.shadowColor = "#00D9E8";
        ctx.shadowBlur = 5;

        ctx.beginPath();
        ctx.moveTo(ship.r + 2, 0);
        ctx.lineTo(-ship.r * 0.7, ship.r * 0.65);
        ctx.lineTo(-ship.r * 0.4, ship.r * 0.15);
        ctx.lineTo(-ship.r * 0.4, -ship.r * 0.15);
        ctx.lineTo(-ship.r * 0.7, -ship.r * 0.65);
        ctx.closePath();
        ctx.strokeStyle = "#9AF5FA";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = "rgba(0,217,232,0.1)";
        ctx.fill();

        // Cockpit detail
        ctx.beginPath();
        ctx.arc(ship.r * 0.2, 0, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#00D9E8";
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // particles
    particles.forEach(p => {
      const alpha = Math.max(0, p.life);
      ctx.globalAlpha = alpha;
      if (p.isDebris) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(p.debrisAng) * p.debrisLen * p.life, p.y - Math.sin(p.debrisAng) * p.debrisLen * p.life);
        ctx.stroke();
      } else if (p.isSpark) {
        // Tiny bright line in direction of motion
        const speed = Math.hypot(p.vx, p.vy);
        const trailLen = Math.min(speed * 3, 10) * alpha;
        const ang = Math.atan2(p.vy, p.vx);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(ang) * trailLen, p.y - Math.sin(ang) * trailLen);
        ctx.stroke();
        // Bright tip
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.isSmoke) {
        const sz = (p.size || 3) * (0.8 + (1 - p.life) * 1.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.isFlame) {
        const sz = (p.size || 3) * (0.4 + p.life * 0.6);
        // Soft glow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = sz * 2;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.color;
        const sz = (p.size || 3) * (0.5 + p.life * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    // float texts
    floatTexts.forEach(f => {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.font = "bold 14px 'Syne', sans-serif";
      ctx.fillStyle = f.color;
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;

    // screen flash
    if (screenFlash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${screenFlash * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }

    // vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }

  // initial idle
  ship = makeShip();
  asteroids = [makeAsteroid(120, 120, 3), makeAsteroid(W - 140, H - 140, 2), makeAsteroid(W - 100, 120, 2)];
  bullets = []; particles = []; trails = []; floatTexts = [];
  score = 0; wave = 1; lives = 3; invuln = 0; shake = 0; screenFlash = 0;

  function loop() {
    if (state === "playing") update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
