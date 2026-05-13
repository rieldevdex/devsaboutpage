/* ════════════════════════════════════════
   MEMORY MATCH — Dev Arcade
   CSS-flip cards, time + flips tracking.
   ════════════════════════════════════════ */
(function () {
  "use strict";
  const $ = Arcade.$;
  const sfx = Arcade.createSfx();

  Arcade.attachBackLink();
  Arcade.attachSoundButton($("#actions"), sfx);

  const DIFFS = {
    easy:   { cols: 4, rows: 3 },
    medium: { cols: 4, rows: 4 },
    hard:   { cols: 6, rows: 4 }
  };
  let diff = "easy";

  const ICONS = ["🚀","⚡","🎯","🌟","🔥","💎","🎮","🎨","🎲","🧩","🪐","🎭"];

  function bestFor(d) { return Arcade.bestStore("memory_best_" + d); }

  const boardEl = $("#board");
  const elTime = $("#time"), elFlips = $("#flips"), elPairs = $("#pairs"), elBest = $("#best");
  const ovMenu = $("#menu"), ovResult = $("#result");

  let cards, first, second, lock, flipsCount, matched, totalPairs, started, startTime, timerId;

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
    elBest.textContent = b ? b + " flips" : "—";
  }

  function newGame() {
    const cfg = DIFFS[diff];
    const cells = cfg.cols * cfg.rows;
    totalPairs = cells / 2;
    flipsCount = 0; matched = 0; started = false; first = null; second = null; lock = false;
    if (timerId) { clearInterval(timerId); timerId = null; }
    elTime.textContent = "0:00";
    elFlips.textContent = "0";
    elPairs.textContent = `0/${totalPairs}`;
    refreshBest();

    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${cfg.cols}, auto)`;

    // pick icons
    const pool = shuffle(ICONS.slice()).slice(0, totalPairs);
    const deck = shuffle([...pool, ...pool]);

    cards = deck.map((icon, i) => {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `<div class="card-face front"></div><div class="card-face back">${icon}</div>`;
      el.addEventListener("click", () => onClick(card));
      const card = { icon, el, matched: false, flipped: false };
      boardEl.appendChild(el);
      return card;
    });

    ovMenu.classList.add("hidden");
    ovResult.classList.add("hidden");
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function onClick(card) {
    if (lock || card.flipped || card.matched) return;
    if (!started) { startTimer(); }
    card.flipped = true;
    card.el.classList.add("flipped");
    sfx.blip();
    flipsCount++;
    elFlips.textContent = flipsCount;

    if (!first) { first = card; return; }
    second = card;
    lock = true;

    if (first.icon === second.icon) {
      first.matched = true; second.matched = true;
      first.el.classList.add("matched");
      second.el.classList.add("matched");
      matched++;
      elPairs.textContent = `${matched}/${totalPairs}`;
      sfx.coin();
      first = null; second = null; lock = false;
      if (matched === totalPairs) finish();
    } else {
      sfx.hit();
      setTimeout(() => {
        first.flipped = false; second.flipped = false;
        first.el.classList.remove("flipped");
        second.el.classList.remove("flipped");
        first = null; second = null; lock = false;
      }, 700);
    }
  }

  function startTimer() {
    started = true;
    startTime = performance.now();
    timerId = setInterval(() => {
      elTime.textContent = Arcade.fmt.time((performance.now() - startTime) / 1000);
    }, 250);
  }

  function finish() {
    if (timerId) clearInterval(timerId);
    sfx.win();
    const elapsed = (performance.now() - startTime) / 1000;
    const store = bestFor(diff);
    const cur = store.get();
    let isNew = false;
    if (cur === 0 || flipsCount < cur) { store.set(flipsCount); isNew = true; }
    $("#rTime").textContent  = Arcade.fmt.time(elapsed);
    $("#rFlips").textContent = flipsCount;
    $("#rBest").textContent  = store.get() + " flips";
    $("#newBest").classList.toggle("hidden", !isNew);
    refreshBest();
    setTimeout(() => ovResult.classList.remove("hidden"), 500);
  }

  // initial idle
  newGame();
  ovMenu.classList.remove("hidden");
})();
