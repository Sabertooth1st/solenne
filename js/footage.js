// Generated footage, scrubbed by scroll. Each scene listed in
// media/manifest.json is a numbered JPG sequence (0001.jpg …) that replaces
// the procedural stand-in for that scene. Missing scenes fall back to WebGL.
window.Footage = (function () {
  const canvas = document.getElementById('footage');
  const ctx = canvas.getContext('2d');
  const scenes = {};          // id -> { count, frames: Image[], loaded: Uint8Array }
  let queue = [];
  let active = 0;
  const MAX_PARALLEL = 6;

  function path(def, i) {
    return `${def.dir}/${String(i + 1).padStart(4, '0')}.${def.ext || 'jpg'}`;
  }

  // opts.all: load every frame and resolve once they're all decoded (recorder).
  async function init(opts = {}) {
    const hq = new URLSearchParams(location.search).has('hq');
    try {
      const res = await fetch(hq ? 'media/manifest-hq.json' : 'media/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const m = await res.json();
      for (const [id, def] of Object.entries(m.scenes || {})) {
        if (!def.count) continue;
        scenes[id] = { def, count: def.count, frames: new Array(def.count), loaded: new Uint8Array(def.count) };
      }
    } catch (e) { /* no footage yet — procedural only */ }
    prioritize(0);
    if (opts.all) {
      while (Object.values(scenes).some((s) => s.loaded.some((v) => !v))) {
        if (!queue.length && !active) prioritize(0);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // Coarse-to-fine: every 8th frame first so scrubbing works immediately,
  // then fill in. Current scene first, then its neighbours.
  function prioritize(current) {
    const order = [current, current + 1, current - 1, current + 2, 0, 1, 2, 3, 4, 5, 6, 7];
    const seen = new Set();
    queue = [];
    for (const id of order) {
      if (seen.has(id) || !scenes[id]) continue;
      seen.add(id);
      const s = scenes[id];
      for (const step of [8, 4, 2, 1]) {
        for (let i = 0; i < s.count; i += step) if (!s.loaded[i] && !s.frames[i]) queue.push([id, i]);
      }
    }
    pump();
  }

  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      const [id, i] = queue.shift();
      const s = scenes[id];
      if (s.frames[i]) continue;
      const img = new Image();
      img.decoding = 'sync';
      s.frames[i] = img;
      active++;
      img.onload = () => { s.loaded[i] = 1; active--; pump(); };
      img.onerror = () => { active--; pump(); };
      img.src = path(s.def, i);
    }
  }

  function nearest(s, i) {
    for (let d = 0; d < s.count; d++) {
      if (i - d >= 0 && s.loaded[i - d]) return s.frames[i - d];
      if (i + d < s.count && s.loaded[i + d]) return s.frames[i + d];
    }
    return null;
  }

  // Cover-fit, cropping toward the shot's subject (focus: 0..1 across the frame)
  // so portrait screens keep her in view.
  function cover(img, alpha, focus = 0.5) {
    const cw = canvas.width, ch = canvas.height;
    const r = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    const x = Math.min(0, Math.max(cw - w, cw / 2 - focus * w));
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, (ch - h) / 2, w, h);
  }

  function frameFor(id, t) {
    const s = scenes[id];
    if (!s) return null;
    return nearest(s, Math.min(s.count - 1, Math.max(0, Math.round(t * (s.count - 1)))));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }

  let lastScene = -1;
  // Returns true when footage fully covers the frame (WebGL can skip work).
  function render(st) {
    if (st.a !== lastScene) { lastScene = st.a; prioritize(st.a); }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const A = frameFor(st.a, st.ta);
    const B = st.mix > 0.001 ? frameFor(st.b, st.tb) : null;
    if (A) cover(A, B ? 1 : 1 - st.mix, scenes[st.a].def.focus);
    if (B) cover(B, st.mix, scenes[st.b].def.focus);
    if (st.flash > 0.001) {
      ctx.globalAlpha = st.flash;
      ctx.fillStyle = '#fffffa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1;
    return !!A && (st.mix < 0.001 || !!B);
  }

  function has(id) { return !!scenes[id]; }

  resize();
  return { init, render, resize, has };
})();
