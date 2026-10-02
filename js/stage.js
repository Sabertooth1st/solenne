// WebGL stage: renders the procedural scenes (the stand-ins for footage).
window.Stage = (function () {
  const canvas = document.getElementById('gl');
  const capture = new URLSearchParams(location.search).has('capture');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  if (!gl) return { ok: false, render() {}, resize() {} };

  const vert = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, window.SOLENNE_FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return { ok: false, render() {}, resize() {} };
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['uRes', 'uTime', 'uA', 'uB', 'uTA', 'uTB', 'uMix', 'uFlash'].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));

  // Render below native resolution: the scenes are soft by nature and the
  // grain overlay hides the upscale. Keeps phones cool.
  const mobile = matchMedia('(max-width: 760px)').matches;
  const scale = mobile ? 0.55 : 0.7;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(innerWidth * dpr * scale);
    const h = Math.round(innerHeight * dpr * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function render(s, time) {
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uA, s.a);
    gl.uniform1i(u.uB, s.b);
    gl.uniform1f(u.uTA, s.ta);
    gl.uniform1f(u.uTB, s.tb);
    gl.uniform1f(u.uMix, s.mix);
    gl.uniform1f(u.uFlash, s.flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resize();
  return { ok: true, render, resize };
})();
