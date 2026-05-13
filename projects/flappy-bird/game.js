(() => {
  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_H = 80;

  // UI
  const menu = document.getElementById('menu');
  const pauseEl = document.getElementById('pause');
  const gameoverEl = document.getElementById('gameover');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const levelBadge = document.getElementById('levelBadge');
  const modeBadge = document.getElementById('modeBadge');
  const bestBadge = document.getElementById('bestBadge');
  const powerupBar = document.getElementById('powerupBar');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const menuBtn = document.getElementById('menuBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const menuFromPauseBtn = document.getElementById('menuFromPauseBtn');
  const goScore = document.getElementById('goScore');
  const goLevel = document.getElementById('goLevel');
  const goBest = document.getElementById('goBest');
  const goTitle = document.getElementById('goTitle');
  const newBestEl = document.getElementById('newBest');
  const soundBtn = document.getElementById('soundBtn');
  const modeBtns = document.querySelectorAll('.mode-btn');

  // ---------- Modes ----------
  const MODES = {
    easy:    { label: 'Easy',    gap: 180, speed: 1.8, gravity: 0.38, flap: -7.0, spacing: 240, moving: false, reverse: false, zen: false },
    normal:  { label: 'Normal',  gap: 150, speed: 2.2, gravity: 0.45, flap: -7.5, spacing: 220, moving: false, reverse: false, zen: false },
    hard:    { label: 'Hard',    gap: 125, speed: 2.8, gravity: 0.5,  flap: -8.0, spacing: 200, moving: false, reverse: false, zen: false },
    insane:  { label: 'Insane',  gap: 130, speed: 3.2, gravity: 0.55, flap: -8.4, spacing: 210, moving: true,  reverse: false, zen: false },
    reverse: { label: 'Reverse', gap: 150, speed: 2.2, gravity: -0.45,flap: 7.5,  spacing: 220, moving: false, reverse: true,  zen: false },
    zen:     { label: 'Zen',     gap: 200, speed: 1.5, gravity: 0.35, flap: -6.5, spacing: 260, moving: false, reverse: false, zen: true  },
  };
  let modeKey = 'normal';
  let M; // current mode config

  // ---------- State ----------
  let bird, pipes, particles, powerups, coins, score, best, frame, state, groundX;
  let level, levelProgress, theme, shake, flashAlpha, slowmoT, shieldT, magnetT;
  let bgOffset = 0;
  let comboTimer = 0;
  let lastScoreTime = 0;
  let birdBlack = false;
  let typedBuffer = '';

  // ---------- Best scores per mode ----------
  function getBest(m) { return parseInt(localStorage.getItem('flappy_best_' + m) || '0', 10); }
  function setBest(m, v) { localStorage.setItem('flappy_best_' + m, String(v)); }

  // ---------- Themes (level visuals) ----------
  const THEMES = [
    { name: 'Dawn',     sky: ['#fcd34d', '#fb923c', '#f87171'], ground: '#ded895', groundDark: '#c2b86b', pipe: '#5cb83b', cloud: 'rgba(255,255,255,0.7)' },
    { name: 'Day',      sky: ['#4ec0ca', '#9bdce0', '#c9eef0'], ground: '#ded895', groundDark: '#c2b86b', pipe: '#5cb83b', cloud: 'rgba(255,255,255,0.85)' },
    { name: 'Sunset',   sky: ['#7c3aed', '#ec4899', '#f59e0b'], ground: '#a16207', groundDark: '#78350f', pipe: '#dc2626', cloud: 'rgba(255,200,180,0.6)' },
    { name: 'Night',    sky: ['#0f172a', '#1e293b', '#334155'], ground: '#1f2937', groundDark: '#0f172a', pipe: '#7c3aed', cloud: 'rgba(200,200,255,0.4)' },
    { name: 'Aurora',   sky: ['#064e3b', '#10b981', '#a78bfa'], ground: '#1e3a8a', groundDark: '#172554', pipe: '#06b6d4', cloud: 'rgba(190,255,200,0.5)' },
    { name: 'Inferno',  sky: ['#450a0a', '#dc2626', '#f59e0b'], ground: '#1c1917', groundDark: '#0c0a09', pipe: '#fbbf24', cloud: 'rgba(255,150,80,0.4)' },
  ];

  // ---------- Audio (Web Audio API) ----------
  let audioCtx = null;
  let soundOn = JSON.parse(localStorage.getItem('flappy_sound') || 'true');
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { audioCtx = null; }
    }
  }
  function beep(freq, dur = 0.1, type = 'square', vol = 0.15, slide = 0) {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur);
  }
  const SFX = {
    flap:   () => beep(420, 0.08, 'square', 0.12, -120),
    score:  () => { beep(660, 0.08, 'triangle', 0.18); setTimeout(() => beep(880, 0.1, 'triangle', 0.18), 70); },
    hit:    () => beep(120, 0.25, 'sawtooth', 0.25, -80),
    die:    () => { beep(200, 0.15, 'sawtooth', 0.2, -100); setTimeout(() => beep(80, 0.3, 'sawtooth', 0.2, -50), 120); },
    power:  () => { beep(523, 0.06, 'triangle', 0.18); setTimeout(() => beep(659, 0.06, 'triangle', 0.18), 50); setTimeout(() => beep(784, 0.1, 'triangle', 0.18), 100); },
    coin:   () => beep(990, 0.06, 'square', 0.12),
    levelup:() => { [523, 659, 784, 1046].forEach((f,i)=> setTimeout(()=>beep(f,0.1,'triangle',0.2), i*70)); },
  };
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('flappy_sound', JSON.stringify(soundOn));
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    ensureAudio();
  });

  // ---------- Reset / start ----------
  function applyMode(key) {
    modeKey = key;
    M = MODES[key];
    modeBadge.textContent = M.label;
    bestBadge.textContent = 'Best ' + getBest(key);
  }

  function reset() {
    const startY = M.reverse ? 80 : H / 2;
    bird = { x: 90, y: startY, vy: 0, r: 14, rot: 0, trail: [] };
    pipes = [];
    particles = [];
    powerups = [];
    coins = [];
    score = 0;
    frame = 0;
    groundX = 0;
    level = 1;
    levelProgress = 0;
    theme = 0;
    shake = 0;
    flashAlpha = 0;
    slowmoT = 0;
    shieldT = 0;
    magnetT = 0;
    comboTimer = 0;
    scoreEl.textContent = '0';
    levelBadge.textContent = 'Lv 1';
    bgOffset = 0;
    spawnPipe(W + 50);
    spawnPipe(W + 50 + M.spacing);
    spawnPipe(W + 50 + M.spacing * 2);
    updatePowerupUI();
  }

  function start() {
    ensureAudio();
    reset();
    state = 'playing';
    menu.classList.add('hidden');
    gameoverEl.classList.add('hidden');
    hud.classList.remove('hidden');
    requestAnimationFrame(loop);
  }

  function showMenu() {
    state = 'menu';
    menu.classList.remove('hidden');
    gameoverEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    hud.classList.add('hidden');
    bestBadge.textContent = 'Best ' + getBest(modeKey);
    render(); // render frozen frame
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseEl.classList.remove('hidden');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    pauseEl.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  function gameOver() {
    if (state !== 'playing') return;
    state = 'gameover';
    SFX.die();
    shake = 18;
    flashAlpha = 0.6;
    burstParticles(bird.x, bird.y, 30, ['#fde047', '#f59e0b', '#dc2626']);

    const prevBest = getBest(modeKey);
    const isNew = score > prevBest;
    if (isNew) setBest(modeKey, score);

    goScore.textContent = score;
    goLevel.textContent = level;
    goBest.textContent = Math.max(prevBest, score);
    newBestEl.classList.toggle('hidden', !isNew);
    bestBadge.textContent = 'Best ' + Math.max(prevBest, score);

    setTimeout(() => gameoverEl.classList.remove('hidden'), 700);
  }

  // ---------- Spawning ----------
  function spawnPipe(x) {
    const minTop = 50;
    const maxTop = H - GROUND_H - M.gap - 50;
    const top = Math.random() * (maxTop - minTop) + minTop;
    const moving = M.moving && Math.random() < 0.6;
    pipes.push({
      x, top, passed: false,
      moveAmp: moving ? 30 + Math.random() * 30 : 0,
      moveSpeed: moving ? 0.02 + Math.random() * 0.02 : 0,
      movePhase: Math.random() * Math.PI * 2,
      baseTop: top,
    });

    // Random power-up in the gap
    if (!M.zen && Math.random() < 0.18 && score > 2) {
      const types = ['shield', 'slowmo', 'magnet'];
      const t = types[Math.floor(Math.random() * types.length)];
      powerups.push({
        x: x + 30, y: top + M.gap / 2,
        type: t, r: 12, collected: false,
        bob: Math.random() * Math.PI * 2,
      });
    }
    // Coin trail in some gaps
    if (Math.random() < 0.4) {
      const cy = top + M.gap / 2 + (Math.random() - 0.5) * (M.gap - 60);
      for (let i = 0; i < 3; i++) {
        coins.push({ x: x + 15 + i * 15, y: cy, r: 6, collected: false, spin: 0 });
      }
    }
  }

  // ---------- Input ----------
  function flap() {
    if (state === 'menu') return;
    if (state === 'paused') return;
    if (state === 'gameover') return;
    if (state === 'playing') {
      bird.vy = M.flap;
      SFX.flap();
      // flap particles
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: bird.x - 8, y: bird.y + 4,
          vx: -1 - Math.random() * 1.5, vy: (Math.random() - 0.5) * 1.5,
          life: 20, max: 20, size: 2 + Math.random() * 2,
          color: 'rgba(255,255,255,0.6)',
        });
      }
    }
  }

  const SECRETS = {
    nigga:  () => { birdBlack = !birdBlack; flashAlpha = 0.3; burstParticles(bird.x, bird.y, 18, birdBlack ? ['#000','#374151','#6b7280'] : ['#fde047','#fbbf24']); SFX.power(); },
    gay:() => { birdBlack = false; flashAlpha = 0.3; burstParticles(bird.x, bird.y, 24, ['#ef4444','#f59e0b','#fde047','#10b981','#3b82f6','#a78bfa']); SFX.power(); },
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); flap(); }
    if (e.code === 'KeyP') { state === 'playing' ? pause() : state === 'paused' ? resume() : null; }

    // secret-word detector
    if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      typedBuffer = (typedBuffer + e.key.toLowerCase()).slice(-12);
      for (const word in SECRETS) {
        if (typedBuffer.endsWith(word)) {
          SECRETS[word]();
          typedBuffer = '';
          break;
        }
      }
    }
  });
  canvas.addEventListener('mousedown', flap);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });

  startBtn.addEventListener('click', start);
  retryBtn.addEventListener('click', start);
  menuBtn.addEventListener('click', showMenu);
  resumeBtn.addEventListener('click', resume);
  menuFromPauseBtn.addEventListener('click', showMenu);

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      applyMode(btn.dataset.mode);
    });
  });

  // ---------- Particles ----------
  function burstParticles(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 4;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 30 + Math.random() * 20, max: 50,
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.15,
      });
    }
  }

  function trailParticle() {
    if (frame % 2 !== 0) return;
    bird.trail.push({ x: bird.x - 6, y: bird.y, life: 12, max: 12 });
    if (bird.trail.length > 15) bird.trail.shift();
  }

  // ---------- Level / theme progression ----------
  function checkLevelUp() {
    // Level up every 5 points
    const newLevel = Math.floor(score / 5) + 1;
    if (newLevel > level) {
      level = newLevel;
      theme = (level - 1) % THEMES.length;
      levelBadge.textContent = 'Lv ' + level;
      SFX.levelup();
      flashAlpha = 0.4;
      shake = 6;
      // celebration
      burstParticles(bird.x, bird.y, 25, ['#fde047', '#f472b6', '#a78bfa', '#60a5fa']);
      // small permanent ramp on speed except in zen
      if (!M.zen) M.speed = Math.min(M.speed + 0.1, 5.5);
    }
  }

  // ---------- Update ----------
  function update() {
    frame++;
    if (shake > 0) shake *= 0.85;
    if (flashAlpha > 0) flashAlpha *= 0.9;

    const speedScale = slowmoT > 0 ? 0.5 : 1;
    const speed = M.speed * speedScale;

    // bird physics
    bird.vy += M.gravity * speedScale;
    bird.y += bird.vy * speedScale;
    bird.rot = Math.max(-0.5, Math.min(1.4, bird.vy / 10));
    trailParticle();

    if (slowmoT > 0) slowmoT--;
    if (shieldT > 0) shieldT--;
    if (magnetT > 0) magnetT--;
    if ((slowmoT === 0 || shieldT === 0 || magnetT === 0) && frame % 5 === 0) updatePowerupUI();

    groundX = (groundX - speed) % 24;
    bgOffset = (bgOffset - speed * 0.3) % W;

    // pipes
    for (const p of pipes) {
      p.x -= speed;
      if (p.moveAmp) {
        p.movePhase += p.moveSpeed * speedScale;
        p.top = p.baseTop + Math.sin(p.movePhase) * p.moveAmp;
      }
    }

    if (pipes.length && pipes[0].x + 60 < 0) {
      pipes.shift();
      spawnPipe(pipes[pipes.length - 1].x + M.spacing);
    }

    // power-ups & coins move with world
    for (const pu of powerups) pu.x -= speed;
    for (const c of coins) c.x -= speed;
    powerups = powerups.filter(pu => pu.x > -30 && !pu.collected);
    coins = coins.filter(c => c.x > -30 && !c.collected);

    // magnet pull
    if (magnetT > 0) {
      for (const c of coins) {
        const dx = bird.x - c.x, dy = bird.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 120) {
          c.x += (dx / d) * 3;
          c.y += (dy / d) * 3;
        }
      }
    }

    // collect coins
    for (const c of coins) {
      const d = Math.hypot(bird.x - c.x, bird.y - c.y);
      if (d < bird.r + c.r) {
        c.collected = true;
        score++;
        scoreEl.textContent = score;
        SFX.coin();
        burstParticles(c.x, c.y, 6, ['#fde047']);
        checkLevelUp();
      }
      c.spin += 0.2;
    }

    // collect power-ups
    for (const pu of powerups) {
      pu.bob += 0.1;
      const d = Math.hypot(bird.x - pu.x, bird.y - pu.y);
      if (d < bird.r + pu.r) {
        pu.collected = true;
        SFX.power();
        if (pu.type === 'shield') shieldT = 60 * 6;
        if (pu.type === 'slowmo') slowmoT = 60 * 4;
        if (pu.type === 'magnet') magnetT = 60 * 6;
        burstParticles(pu.x, pu.y, 14, ['#60a5fa', '#a78bfa', '#f472b6']);
        updatePowerupUI();
      }
    }

    // pipe scoring + collision
    for (const p of pipes) {
      if (!p.passed && p.x + 60 < bird.x - bird.r) {
        p.passed = true;
        score++;
        scoreEl.textContent = score;
        SFX.score();
        checkLevelUp();
      }

      const inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + 60;
      if (inX && !M.zen) {
        if (bird.y - bird.r < p.top || bird.y + bird.r > p.top + M.gap) {
          if (shieldT > 0) {
            shieldT = 0;
            SFX.hit();
            shake = 10;
            flashAlpha = 0.4;
            // push past the pipe
            burstParticles(bird.x, bird.y, 20, ['#60a5fa', '#ffffff']);
            // remove this collision risk by snapping safely into the gap
            bird.y = p.top + M.gap / 2;
            bird.vy = 0;
            updatePowerupUI();
          } else {
            SFX.hit();
            return gameOver();
          }
        }
      }
    }

    // bounds
    if (bird.y + bird.r >= H - GROUND_H) {
      if (M.zen) {
        bird.y = H - GROUND_H - bird.r;
        bird.vy = -3;
      } else {
        bird.y = H - GROUND_H - bird.r;
        return gameOver();
      }
    }
    if (bird.y - bird.r < 0) {
      if (M.reverse && !M.zen) return gameOver();
      bird.y = bird.r;
      bird.vy = M.reverse ? 1 : 0;
    }

    // particles
    for (const pt of particles) {
      pt.x += pt.vx;
      pt.y += pt.vy;
      if (pt.gravity) pt.vy += pt.gravity;
      pt.life--;
    }
    particles = particles.filter(p => p.life > 0);

    for (const t of bird.trail) t.life--;
    bird.trail = bird.trail.filter(t => t.life > 0);
  }

  // ---------- Power-up UI ----------
  function updatePowerupUI() {
    const items = [];
    if (shieldT > 0) items.push({ cls: 'shield', txt: '🛡 ' + Math.ceil(shieldT / 60) + 's' });
    if (slowmoT > 0) items.push({ cls: 'slowmo', txt: '⏱ ' + Math.ceil(slowmoT / 60) + 's' });
    if (magnetT > 0) items.push({ cls: 'magnet', txt: '🧲 ' + Math.ceil(magnetT / 60) + 's' });
    powerupBar.innerHTML = items.map(i => `<div class="pu-pill ${i.cls}">${i.txt}</div>`).join('');
  }

  // ---------- Rendering ----------
  function drawBackground() {
    const t = THEMES[theme];
    const grd = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
    grd.addColorStop(0, t.sky[0]);
    grd.addColorStop(0.6, t.sky[1]);
    grd.addColorStop(1, t.sky[2]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H - GROUND_H);

    // stars at night/aurora
    if (t.name === 'Night' || t.name === 'Aurora') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + bgOffset * 0.3) % W + W) % W;
        const sy = (i * 53) % (H - GROUND_H - 100);
        const s = ((frame + i * 13) % 60) / 60;
        ctx.globalAlpha = 0.3 + Math.abs(Math.sin(s * Math.PI)) * 0.7;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // distant mountains
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND_H);
    for (let x = 0; x <= W; x += 40) {
      const wave = Math.sin((x + bgOffset) * 0.02) * 30 + Math.sin((x + bgOffset) * 0.05) * 15;
      ctx.lineTo(x, H - GROUND_H - 80 + wave);
    }
    ctx.lineTo(W, H - GROUND_H);
    ctx.fill();

    // clouds
    ctx.fillStyle = t.cloud;
    for (let i = 0; i < 4; i++) {
      const cx = (((frame * 0.3 + i * 160) % (W + 200)) - 100);
      const cy = 60 + i * 50;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy + 4, 14, 0, Math.PI * 2);
      ctx.arc(cx - 18, cy + 6, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPipe(p) {
    const t = THEMES[theme];
    const PIPE_W = 60;

    // body
    ctx.fillStyle = t.pipe;
    ctx.fillRect(p.x, 0, PIPE_W, p.top);
    ctx.fillRect(p.x, p.top + M.gap, PIPE_W, H - GROUND_H - (p.top + M.gap));

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(p.x + 4, 0, 6, p.top);
    ctx.fillRect(p.x + 4, p.top + M.gap, 6, H - GROUND_H - (p.top + M.gap));

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x + PIPE_W - 8, 0, 8, p.top);
    ctx.fillRect(p.x + PIPE_W - 8, p.top + M.gap, 8, H - GROUND_H - (p.top + M.gap));

    // caps
    ctx.fillStyle = t.pipe;
    ctx.fillRect(p.x - 3, p.top - 20, PIPE_W + 6, 20);
    ctx.fillRect(p.x - 3, p.top + M.gap, PIPE_W + 6, 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 3, p.top - 20, PIPE_W + 6, 20);
    ctx.strokeRect(p.x - 3, p.top + M.gap, PIPE_W + 6, 20);
  }

  function drawCoin(c) {
    if (c.collected) return;
    ctx.save();
    ctx.translate(c.x, c.y);
    const sx = Math.cos(c.spin);
    ctx.scale(Math.abs(sx) * 0.7 + 0.3, 1);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, 0);
    ctx.restore();
  }

  function drawPowerup(pu) {
    if (pu.collected) return;
    const y = pu.y + Math.sin(pu.bob) * 4;
    ctx.save();
    ctx.translate(pu.x, y);

    // glow
    const colors = { shield: '#60a5fa', slowmo: '#a78bfa', magnet: '#f472b6' };
    const icons = { shield: '🛡', slowmo: '⏱', magnet: '🧲' };
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
    glow.addColorStop(0, colors[pu.type] + 'cc');
    glow.addColorStop(1, colors[pu.type] + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(-22, -22, 44, 44);

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(0, 0, pu.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors[pu.type];
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[pu.type], 0, 1);

    ctx.restore();
  }

  function drawGround() {
    const t = THEMES[theme];
    ctx.fillStyle = t.ground;
    ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
    ctx.fillStyle = t.groundDark;
    for (let x = groundX; x < W; x += 24) {
      ctx.fillRect(x, H - GROUND_H, 12, 12);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, H - GROUND_H + 20, W, 4);
  }

  function drawTrail() {
    for (const t of bird.trail) {
      const a = t.life / t.max;
      ctx.fillStyle = `rgba(255,255,255,${a * 0.4})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 6 * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);

    // shield aura
    if (shieldT > 0) {
      const pulse = 1 + Math.sin(frame * 0.3) * 0.1;
      ctx.strokeStyle = 'rgba(96,165,250,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, (bird.r + 8) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(96,165,250,0.3)';
      ctx.lineWidth = 8;
      ctx.stroke();
    }

    // body
    ctx.fillStyle = birdBlack ? '#111827' : '#fde047';
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = birdBlack ? '#000000' : '#a16207';
    ctx.lineWidth = 2;
    ctx.stroke();

    // wing
    ctx.fillStyle = birdBlack ? '#374151' : '#fbbf24';
    const wingY = Math.sin(frame * 0.4) * 3;
    ctx.beginPath();
    ctx.ellipse(-3, 3 + wingY, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(5, -4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(6, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(bird.r - 2, -2);
    ctx.lineTo(bird.r + 8, 0);
    ctx.lineTo(bird.r - 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBackground();
    for (const p of pipes) drawPipe(p);
    for (const c of coins) drawCoin(c);
    for (const pu of powerups) drawPowerup(pu);
    drawGround();
    drawTrail();
    drawBird();
    drawParticles();

    // slow-mo tint
    if (slowmoT > 0) {
      ctx.fillStyle = 'rgba(167,139,250,0.12)';
      ctx.fillRect(0, 0, W, H);
    }

    // flash
    if (flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function loop() {
    if (state !== 'playing') return;
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ---------- Init ----------
  applyMode('normal');
  showMenu();
})();
