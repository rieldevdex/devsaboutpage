/* ═══════════════════════════════════════════════
   DEV ARCADE — SHARED UTILITIES
   Sound effects, localStorage helpers, common UX.
   ═══════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ─── LocalStorage best-score store ─── */
  function bestStore(key) {
    const k = "arcade::" + key;
    return {
      get() {
        const v = parseInt(localStorage.getItem(k), 10);
        return Number.isFinite(v) ? v : 0;
      },
      set(v) {
        localStorage.setItem(k, String(v | 0));
      },
      maybeSet(v) {
        const cur = this.get();
        if (v > cur) { this.set(v); return true; }
        return false;
      }
    };
  }

  /* ─── Tiny WebAudio sfx engine ─── */
  function createSfx() {
    let ctx = null;
    let muted = localStorage.getItem("arcade::muted") === "1";

    function ensure() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone(freq, dur = 0.08, type = "square", vol = 0.12) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function sweep(f0, f1, dur = 0.2, type = "sawtooth", vol = 0.1) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function noise(dur = 0.15, vol = 0.1) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = vol;
      src.buffer = buf;
      src.connect(g).connect(c.destination);
      src.start();
    }

    return {
      pop:    () => tone(820, 0.05, "square", 0.10),
      blip:   () => tone(640, 0.04, "triangle", 0.08),
      coin:   () => { tone(880, 0.06, "square", 0.10); setTimeout(() => tone(1320, 0.10, "square", 0.10), 60); },
      score:  () => { tone(660, 0.08, "triangle", 0.12); setTimeout(() => tone(990, 0.12, "triangle", 0.12), 80); },
      hit:    () => sweep(440, 80, 0.18, "sawtooth", 0.12),
      explode:() => { sweep(220, 40, 0.35, "sawtooth", 0.16); noise(0.25, 0.08); },
      win:    () => { tone(660, 0.10, "triangle", 0.12); setTimeout(() => tone(880, 0.10, "triangle", 0.12), 100); setTimeout(() => tone(1320, 0.20, "triangle", 0.14), 200); },
      lose:   () => { tone(330, 0.12, "square", 0.12); setTimeout(() => tone(220, 0.20, "square", 0.12), 130); },
      click:  () => tone(520, 0.03, "square", 0.06),
      tone, sweep, noise,
      get muted() { return muted; },
      toggleMute() {
        muted = !muted;
        localStorage.setItem("arcade::muted", muted ? "1" : "0");
        return muted;
      }
    };
  }

  /* ─── Toast notification ─── */
  function toast(host, msg) {
    if (!host) return;
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  /* ─── Insert "back to portfolio" link if loaded standalone ─── */
  function attachBackLink() {
    if (window.parent !== window) return; // inside iframe — skip
    if (document.querySelector(".arcade-back")) return;
    const a = document.createElement("a");
    a.className = "arcade-back";
    a.href = "../../index.html#live-projects";
    a.textContent = "← Back to portfolio";
    document.body.appendChild(a);
  }

  /* ─── Sound toggle button ─── */
  function attachSoundButton(host, sfx) {
    if (!host || !sfx) return;
    const btn = document.createElement("button");
    btn.className = "btn-icon arcade-sound-btn";
    btn.title = "Toggle sound";
    btn.textContent = sfx.muted ? "🔇" : "🔊";
    btn.addEventListener("click", () => {
      const m = sfx.toggleMute();
      btn.textContent = m ? "🔇" : "🔊";
      if (!m) sfx.click();
    });
    host.appendChild(btn);
    return btn;
  }

  /* ─── Keyboard helper: prevent arrow-scroll while playing ─── */
  function preventArrowScroll() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        if (e.target === document.body || e.target.tagName === "CANVAS") {
          e.preventDefault();
        }
      }
    }, { passive: false });
  }

  /* ─── Format helpers ─── */
  const fmt = {
    score(n) { return (n | 0).toLocaleString(); },
    time(s)  {
      const m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return m + ":" + String(sec).padStart(2, "0");
    }
  };

  /* ─── DOM helper ─── */
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  /* ─── Public API ─── */
  global.Arcade = {
    bestStore,
    createSfx,
    toast,
    attachBackLink,
    attachSoundButton,
    preventArrowScroll,
    fmt,
    $, $$,
  };
})(window);
