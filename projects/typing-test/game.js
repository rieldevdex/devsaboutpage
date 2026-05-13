/* ════════════════════════════════════════
   TYPING TEST — Dev Arcade
   WPM, accuracy, longest streak.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();
  const best = Arcade.bestStore("typing_best_wpm");

  Arcade.attachBackLink();
  Arcade.attachSoundButton($("#actions"), sfx);

  // Word pool — common English words good for typing tests
  const WORDS = (
    "the of and to in a is that it for was on as with at by an be this from or have not but " +
    "they had which one all you we will were so can their said if do what when up out many time about then them " +
    "would there could into other than first water been call who oil its now find long down day did get come made " +
    "may part over new sound take only little work know place year live back give most very after thing our just " +
    "name good sentence man think say great where help through much before line right too means old any same tell " +
    "boy follow came want show also around form three small set put end does another well large must big even such " +
    "because turn here why ask went men read need land different home us move try kind hand picture again change " +
    "off play spell air away animals house point page letter mother answer found study still learn should america world " +
    "code build ship deploy server client browser request response array object string boolean number function module " +
    "import export class const let async await return promise resolve reject stack queue tree graph node leaf root"
  ).split(" ").filter(Boolean);

  function genText(n = 60) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(WORDS[(Math.random() * WORDS.length) | 0]);
    return arr.join(" ");
  }

  // ── State ──
  let duration = 15;
  let target = "", typed = "", started = false, done = false;
  let startTime = 0, timerId = null;
  let correctChars = 0, wrongChars = 0;
  let currentStreak = 0, longestStreak = 0;
  let prevCorrect = true;

  const elText   = $("#textArea");
  const elBar    = $("#barFill");
  const elPrompt = $("#prompt");
  const elWpm = $("#wpm"), elAcc = $("#acc"), elTime = $("#time"), elStreak = $("#streak"), elBest = $("#best");
  const ovResult = $("#result");

  elBest.textContent = best.get();
  elTime.textContent = duration;

  // ── Mode buttons ──
  document.querySelectorAll("#modeGrid .mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#modeGrid .mode-btn").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      duration = parseInt(b.dataset.time, 10);
      reset();
      sfx.click();
    });
  });

  $("#restartBtn").addEventListener("click",  () => { sfx.click(); reset(); });
  $("#restartBtn2").addEventListener("click", () => { sfx.click(); reset(); });

  function reset() {
    target = genText(80);
    typed = "";
    started = false; done = false;
    startTime = 0;
    correctChars = 0; wrongChars = 0;
    currentStreak = 0; longestStreak = 0;
    prevCorrect = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    elTime.textContent = duration;
    elWpm.textContent = "0";
    elAcc.textContent = "100%";
    elStreak.textContent = "0";
    elBar.style.width = "0%";
    elPrompt.textContent = "Click the text and start typing to begin.";
    ovResult.classList.add("hidden");
    render();
  }

  function render() {
    let html = "";
    for (let i = 0; i < target.length; i++) {
      const ch = target[i];
      let cls = "ch";
      if (i < typed.length) {
        cls += typed[i] === ch ? " correct" : " wrong";
      } else if (i === typed.length) {
        cls += " current";
      }
      const dispCh = ch === " "
        ? " "
        : ch.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html += `<span class="${cls}">${dispCh}</span>`;
    }
    elText.innerHTML = html;
  }

  // ── Input handling ──
  elText.addEventListener("focus", () => {
    if (!started && !done) elPrompt.textContent = "Start typing...";
  });

  window.addEventListener("keydown", (e) => {
    if (done) return;
    // ignore modifier-combos
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // make sure the typing area is "focus" (we accept keys regardless, but only when not in an input/textarea elsewhere)
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.key === "Backspace") {
      if (typed.length > 0) {
        typed = typed.slice(0, -1);
        // recalculate counts (cheap)
        recount();
        render();
      }
      e.preventDefault();
      return;
    }

    if (e.key.length !== 1) return; // ignore Shift/Alt/etc
    e.preventDefault();

    if (!started) {
      started = true;
      startTime = performance.now();
      timerId = setInterval(tick, 200);
      elPrompt.textContent = "Go!";
      sfx.click();
    }

    const expected = target[typed.length];
    typed += e.key;

    if (e.key === expected) {
      correctChars++;
      currentStreak++;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
      if (Math.random() < 0.3) sfx.blip();
    } else {
      wrongChars++;
      currentStreak = 0;
      sfx.hit();
    }
    elStreak.textContent = currentStreak;

    render();

    // extend text if running low
    if (typed.length > target.length - 30) target += " " + genText(30);

    updateLiveStats();
  });

  function recount() {
    correctChars = 0; wrongChars = 0; currentStreak = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] === target[i]) { correctChars++; currentStreak++; }
      else { wrongChars++; currentStreak = 0; }
    }
    elStreak.textContent = currentStreak;
    updateLiveStats();
  }

  function tick() {
    const elapsed = (performance.now() - startTime) / 1000;
    const left = Math.max(0, duration - elapsed);
    elTime.textContent = Math.ceil(left);
    elBar.style.width = `${(elapsed / duration) * 100}%`;
    updateLiveStats();
    if (left <= 0) finish();
  }

  function updateLiveStats() {
    const elapsedMin = Math.max(0.001, ((performance.now() - startTime) / 1000) / 60);
    const wpm = Math.round((correctChars / 5) / elapsedMin);
    const total = correctChars + wrongChars;
    const acc = total === 0 ? 100 : Math.round((correctChars / total) * 100);
    if (started) {
      elWpm.textContent = isFinite(wpm) ? wpm : 0;
      elAcc.textContent = acc + "%";
    }
  }

  function finish() {
    done = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    elBar.style.width = "100%";
    sfx.win();
    const elapsedMin = duration / 60;
    const wpm = Math.round((correctChars / 5) / elapsedMin);
    const total = correctChars + wrongChars;
    const acc = total === 0 ? 0 : Math.round((correctChars / total) * 100);
    const isNew = best.maybeSet(wpm);
    elBest.textContent = best.get();
    $("#rWpm").textContent    = wpm;
    $("#rAcc").textContent    = acc + "%";
    $("#rStreak").textContent = longestStreak;
    $("#newBest").classList.toggle("hidden", !isNew);
    setTimeout(() => ovResult.classList.remove("hidden"), 250);
  }

  // initial setup
  reset();
  setTimeout(() => elText.focus(), 50);
})();
