// Timeline: one long scroll mapped onto eight shots. Lengths are in viewport
// heights; the last 22% of each shot dissolves into the next.
(function () {
  const SCENES = [
    { name: 'The Cove',  tone: 'light', len: 2.8, clock: ['11:02', '11:05'] },
    { name: 'Below',     tone: 'light', len: 2.2, clock: ['11:05', '11:07'] },
    { name: 'Arrival',   tone: 'dark',  len: 2.2, clock: ['13:30', '13:45'] },
    { name: 'Suite',     tone: 'dark',  len: 2.6, clock: ['15:10', '17:20'] },
    { name: 'Terrace',   tone: 'light', len: 2.2, clock: ['18:40', '19:45'] },
    { name: 'Lume',      tone: 'light', len: 2.2, clock: ['20:15', '21:10'] },
    { name: 'Dinner',    tone: 'light', len: 2.4, clock: ['21:30', '22:50'] },
    { name: 'Night',     tone: 'light', len: 3.4, clock: ['23:50', '00:25'] },
  ];
  const OVERLAP = 0.22;

  // Beat windows in scene-local progress [scene, from, to]
  const BEATS = {
    hero:    [0, -1,   0.2],
    cove:    [0, 0.34, 0.78],
    below:   [1, 0.1,  0.74],
    arrival: [2, 0.12, 0.76],
    suite:   [3, 0.1,  0.78],
    terrace: [4, 0.12, 0.76],
    lume:    [5, 0.12, 0.76],
    dinner:  [6, 0.1,  0.78],
    night:   [7, 0.05, 0.4],
    stay:    [7, 0.56, 9],
  };
  const ANCHORS = { top: [0, 0], cove: [0, 0.45], suite: [3, 0.2], lume: [5, 0.2], stay: [7, 0.7] };

  const starts = [];
  let total = 0;
  for (const s of SCENES) { starts.push(total); total += s.len; }
  const at = (scene, f) => starts[scene] + SCENES[scene].len * f;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ?capture: no smooth scroll, no RAF loop — a recorder drives draw(pos, time) per frame.
  const CAPTURE = new URLSearchParams(location.search).has('capture');
  const track = document.getElementById('track');
  const beats = [...document.querySelectorAll('.beat')].map((el) => {
    const [sc, a, b] = BEATS[el.dataset.beat];
    return { el, from: at(sc, Math.max(a, 0)) - (a < 0 ? 1 : 0), to: b > 1 ? Infinity : at(sc, b) };
  });

  // Chapter list in the clock
  const list = document.getElementById('chapters');
  SCENES.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" tabindex="-1">${s.name}</button>`;
    li.firstChild.addEventListener('click', () => go(at(i, i === 0 ? 0 : 0.18)));
    list.appendChild(li);
  });
  const chapterEls = [...list.children];

  function layout() {
    track.style.height = `${(total + 1) * innerHeight}px`;
    Stage.resize();
    Footage.resize();
  }
  layout();
  addEventListener('resize', layout);

  const lenis = window.Lenis && !reduce && !CAPTURE ? new Lenis({ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9 }) : null;
  function go(vh) {
    const y = vh * innerHeight;
    lenis ? lenis.scrollTo(y, { duration: 2.2 }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const key = a.getAttribute('href').slice(1);
      if (!ANCHORS[key]) return;
      e.preventDefault();
      go(at(...ANCHORS[key]));
    });
  });

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmt = (min) => { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; };
  const ease = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  // Global position (in vh) → which shots are on screen.
  function shotAt(pos) {
    let i = SCENES.length - 1;
    for (let k = 0; k < SCENES.length; k++) if (pos < starts[k] + SCENES[k].len) { i = k; break; }
    const f = clamp01((pos - starts[i]) / SCENES[i].len);
    const last = i === SCENES.length - 1;
    const mix = last ? 0 : ease(clamp01((f - (1 - OVERLAP)) / OVERLAP));
    let flash = 0;
    if (i === 0) flash = Math.sin(Math.PI * mix) * 0.55;   // breaking the surface
    if (i === 1) flash = Math.sin(Math.PI * mix) * 0.9;    // up into the light → the hall
    return { i, f, a: i, b: Math.min(i + 1, SCENES.length - 1), ta: f, tb: mix * 0.06, mix, flash };
  }

  const clockTime = document.getElementById('clockTime');
  const clockFill = document.getElementById('clockFill');
  const cue = document.getElementById('cue');
  let lastTone = '', lastClock = '', lastChapter = -1;

  function frame(now) {
    if (lenis) lenis.raf(now);
    draw(scrollY / innerHeight, now / 1000);
    requestAnimationFrame(frame);
  }

  function draw(pos, time) {
    const st = shotAt(pos);

    const covered = Footage.render(st);
    if (!covered) Stage.render(st, time);

    // Copy beats
    const fade = 0.38;
    for (const b of beats) {
      const inn = clamp01((pos - b.from) / fade);
      const out = b.to === Infinity ? 0 : clamp01((pos - (b.to - fade)) / fade);
      const vis = inn * (1 - out);
      b.el.style.setProperty('--in', inn.toFixed(3));
      b.el.style.setProperty('--out', out.toFixed(3));
      b.el.style.visibility = vis > 0.001 ? 'visible' : 'hidden';
      b.el.classList.toggle('is-live', vis > 0.6);
    }

    // Tone follows whichever shot dominates the frame
    const tone = SCENES[st.mix > 0.5 ? st.b : st.a].tone;
    if (tone !== lastTone) { document.body.dataset.tone = tone; lastTone = tone; }

    // Day clock
    const sc = SCENES[st.i];
    const t0 = toMin(sc.clock[0]);
    let t1 = toMin(sc.clock[1]); if (t1 < t0) t1 += 1440;
    const c = fmt(t0 + (t1 - t0) * st.f);
    if (c !== lastClock) { clockTime.textContent = c; lastClock = c; }
    clockFill.style.transform = `scaleY(${clamp01(pos / total).toFixed(4)})`;
    if (st.i !== lastChapter) {
      chapterEls.forEach((el, k) => el.classList.toggle('is-on', k === st.i));
      lastChapter = st.i;
    }
    cue.style.opacity = String(1 - clamp01(pos / 0.25));
  }

  const veil = document.getElementById('veil');
  const lift = () => { document.body.classList.add('is-ready'); setTimeout(() => veil.remove(), 1600); };

  if (CAPTURE) {
    // CSS animations are pinned to the recorder's clock too, so the logo
    // intro and grain advance exactly one frame per capture.
    const born = new Map();
    window.__capture = {
      total, starts: [...starts], lens: SCENES.map((s) => s.len),
      ready: Footage.init({ all: true }).then(() => document.fonts.ready),
      frame(pos, time, veilAt) {
        if (time >= veilAt) document.body.classList.add('is-ready');
        draw(pos, time);
        for (const a of document.getAnimations()) {
          if (!born.has(a)) born.set(a, time);
          a.pause();
          a.currentTime = (time - born.get(a)) * 1000;
        }
      },
    };
    return;
  }

  Footage.init();
  requestAnimationFrame(frame);

  // Intro veil
  if (reduce) lift();
  else Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(lift, 1500));
})();
