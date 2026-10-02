// Procedural stand-in scenes. Each scene(i, uv, t) is a full-frame "shot";
// t is the scene's scroll-local progress (0..1), uTime drives ambient motion.
// 0 cove (aerial) · 1 underwater · 2 arrival · 3 suite · 4 golden terrace
// 5 restaurant blue hour · 6 candle dinner · 7 night suite
window.SOLENNE_FRAG = /* glsl */ `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform int   uA;
uniform int   uB;
uniform float uTA;
uniform float uTB;
uniform float uMix;
uniform float uFlash;

#define PI 3.14159265
#define TAU 6.28318531

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ v += a*noise(p); p = m*p; a *= 0.5; }
  return v;
}
// Iterative water caustic
float caustic(vec2 uv, float time){
  vec2 p = mod(uv*TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++){
    float t = time * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0/length(vec2(p.x / (sin(i.x+t)/inten), p.y / (cos(i.y+t)/inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
float bokeh(vec2 uv, vec2 c, float r){
  float d = length(uv - c);
  float disk = smoothstep(r, r*0.86, d);
  float rim  = smoothstep(r*0.7, r*0.95, d) * disk;
  return disk*0.55 + rim*0.45;
}

// ── 0 · The cove, from above ─────────────────────────────────────────────
vec3 sCove(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  float z = mix(1.05, 0.28, e*e);                 // descend toward the water
  vec2 p = uv*z + vec2(0.04, 0.02 - 0.08*e);
  p = mat2(cos(0.25*e), -sin(0.25*e), sin(0.25*e), cos(0.25*e)) * p;

  float n = fbm(p*2.1 + vec2(3.1, 7.4));
  float s = abs(p.x - 0.05*sin(p.y*3.0))*1.05 + (n-0.5)*0.55 - p.y*0.32; // distance from cove axis
  float rockM = smoothstep(0.60, 0.65, s);
  float depth = clamp(0.62 + p.y*0.85 - s*0.9 + (fbm(p*3.3)-0.5)*0.25, 0.0, 1.0);

  vec3 sand    = vec3(0.86, 0.90, 0.80);
  vec3 shallow = vec3(0.46, 0.92, 0.86);
  vec3 mid     = vec3(0.04, 0.68, 0.76);
  vec3 deep    = vec3(0.01, 0.27, 0.50);
  vec3 water = mix(sand, shallow, smoothstep(0.0, 0.18, depth));
  water = mix(water, mid,  smoothstep(0.18, 0.55, depth));
  water = mix(water, deep, smoothstep(0.55, 1.0,  depth));

  float c = caustic(p*2.4 + vec2(0.0, uTime*0.01), uTime*0.35);
  water += c * (1.0-depth) * vec3(0.55, 0.75, 0.7);
  // seabed stones through shallow water
  float stones = smoothstep(0.62, 0.7, fbm(p*14.0));
  water = mix(water, water*0.78, stones*(1.0-smoothstep(0.1,0.5,depth))*0.6);
  // shadow cast by the rocks
  water *= 1.0 - 0.35*smoothstep(0.48, 0.62, s+0.04);
  // sun glitter
  float g = pow(noise(p*vec2(70.0, 40.0) + uTime*vec2(0.6, -0.3)), 28.0);
  water += g * 0.5 * smoothstep(0.35, 0.9, depth);

  // limestone with pines on top
  float rn = fbm(p*9.0);
  vec3 rock = mix(vec3(0.97, 0.90, 0.78), vec3(0.74, 0.64, 0.52), rn);
  rock *= 0.85 + 0.25*smoothstep(0.3, 0.8, fbm(p*4.0 + 1.7));
  float pines = smoothstep(0.55, 0.62, fbm(p*5.0 + 9.0)) * smoothstep(0.72, 0.85, s);
  rock = mix(rock, vec3(0.13, 0.24, 0.14), pines*0.85);

  // foam lapping the rock edge
  float edge = smoothstep(0.03, 0.0, abs(s - 0.6 - 0.008*sin(uTime*1.2 + p.y*30.0)));
  float foam = edge * (0.35 + 0.65*smoothstep(0.3, 0.8, fbm(p*22.0 + uTime*0.4)));

  vec3 col = mix(water, rock, rockM);
  col = mix(col, vec3(0.97, 1.0, 1.0), foam*0.6);
  // atmospheric haze toward the end — we're about to break the surface
  col = mix(col, vec3(0.75, 0.97, 1.0), smoothstep(0.82, 1.0, t)*0.55);
  return col;
}

// ── 1 · Underwater ──────────────────────────────────────────────────────
vec3 sUnder(vec2 uv, float t){
  float y = uv.y;
  vec3 col = mix(vec3(0.0, 0.14, 0.30), vec3(0.18, 0.72, 0.86), smoothstep(-0.65, 0.55, y + t*0.25));

  // sandy floor, receding as we rise toward the light
  float fy = -0.18 - t*0.45;
  float below = fy - y;
  if (below > 0.0){
    float pz = 1.0/(below + 0.06);
    vec2 fp = vec2(uv.x*pz*0.6, pz*0.35 - t*2.0);
    float cc = caustic(fp*0.35, uTime*0.45);
    vec3 sand = mix(vec3(0.42, 0.66, 0.68), vec3(0.72, 0.88, 0.84), fbm(fp*1.5));
    float fade = smoothstep(0.0, 0.25, below);
    vec3 fl = sand*0.75 + cc*0.55;
    col = mix(col, fl, fade*0.85);
  }

  // god rays
  vec2 src = vec2(0.18*sin(uTime*0.05) + 0.1, 1.15);
  vec2 d = uv - src;
  float ang = atan(d.x, -d.y);
  float r1 = fbm(vec2(ang*7.0, uTime*0.12));
  float r2 = fbm(vec2(ang*15.0 + 3.0, -uTime*0.09));
  float rays = pow(r1*0.65 + r2*0.35, 3.2) * 2.6;
  col += rays * vec3(0.55, 0.92, 1.0) * smoothstep(-0.7, 0.55, y) * 0.55;

  // suspended particles
  vec2 q = uv*vec2(26.0, 26.0) + vec2(0.0, uTime*0.2);
  float mote = smoothstep(0.985, 1.0, hash(floor(q))) * smoothstep(0.45, 0.0, length(fract(q)-0.5));
  col += mote*0.25;

  // rising bubbles
  for (int i = 0; i < 28; i++){
    float fi = float(i);
    float h1 = hash(vec2(fi, 1.7)), h2 = hash(vec2(fi, 2.3)), h3 = hash(vec2(fi, 9.1));
    float speed = 0.05 + 0.10*h2;
    vec2 bp = vec2((h1 - 0.5)*1.9, fract(h3 + uTime*speed)*1.6 - 0.8);
    bp.x += sin(uTime*1.7 + fi*3.0)*0.012;
    float r = 0.003 + 0.012*hash(vec2(fi, 4.4));
    float dd = length(uv - bp);
    float ring = smoothstep(r, r*0.75, dd) - smoothstep(r*0.8, r*0.4, dd)*0.7;
    float spec = smoothstep(r*0.35, 0.0, length(uv - bp - vec2(-r*0.35, r*0.35)));
    col += (ring*0.45 + spec*0.6) * vec3(0.85, 1.0, 1.0);
  }

  // break toward the bright surface
  col = mix(col, vec3(0.92, 1.0, 0.99), smoothstep(0.7, 1.0, t)*smoothstep(-0.5, 0.6, y));
  return col;
}

// ── 2 · Arrival: arched hall, sheer curtains ────────────────────────────
float arch(vec2 p, float w, float top){
  float rect = smoothstep(w, w-0.004, abs(p.x)) * step(p.y, top) * smoothstep(-0.38, -0.376, p.y);
  float dome = smoothstep(w, w-0.004, length(p - vec2(0.0, top)));
  return max(rect, dome * step(top, p.y));
}
vec3 sArrival(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  vec2 p = uv * mix(1.0, 0.82, e);                 // slow push-in

  vec3 wall = vec3(0.88, 0.83, 0.75) * (0.9 + 0.12*fbm(p*7.0));
  wall *= 0.82 + 0.18*smoothstep(0.9, 0.0, abs(p.x));

  // view through the arch: sky, horizon, sea
  float hz = -0.06;
  vec3 sky = mix(vec3(1.0, 0.99, 0.95), vec3(0.62, 0.83, 0.95), smoothstep(hz, 0.45, p.y));
  vec3 sea = mix(vec3(0.10, 0.55, 0.70), vec3(0.32, 0.72, 0.82), smoothstep(-0.38, hz, p.y));
  float dz = hz - p.y + 0.02;
  sea += pow(noise(vec2(p.x*22.0/dz, 2.5/dz + uTime*1.2)), 9.0)*0.5;
  vec3 view = mix(sea, sky, smoothstep(hz-0.002, hz+0.002, p.y));

  float a = arch(p, 0.27, 0.12);
  vec3 col = mix(wall, view, a);
  // floor with reflected window light
  float fl = smoothstep(-0.375, -0.385, p.y);
  vec3 stone = vec3(0.80, 0.75, 0.67) * (0.85 + 0.15*fbm(p*vec2(3.0, 20.0)));
  stone += 0.35*smoothstep(0.3, 0.0, abs(p.x)) * smoothstep(-0.6, -0.38, p.y);
  col = mix(col, stone, fl);

  // sheer curtains: part as you scroll, breathe in the breeze
  float open = mix(0.03, 0.30, e);
  float sway = (sin(p.y*3.2 + uTime*0.7) + 0.6*sin(p.y*7.1 - uTime*1.1)) * 0.018 * (0.5 - p.y);
  float side = abs(p.x) + sway;
  float cur = smoothstep(open - 0.03, open + 0.03, side) * smoothstep(0.9, 0.55, side);
  float folds = 0.5 + 0.5*sin((p.x + sway*2.0)*85.0 + fbm(vec2(p.x*8.0, p.y*1.5 + uTime*0.15))*4.0);
  vec3 fabric = mix(vec3(0.90, 0.87, 0.81), vec3(1.0, 0.99, 0.96), folds);
  float back = mix(0.55, 1.0, a);                  // backlit where the window is
  col = mix(col, fabric*mix(0.85, 1.08, a), cur*0.72);
  col += cur * a * 0.08;

  // white bloom from the transition into this scene
  col = mix(col, vec3(1.0), smoothstep(0.12, 0.0, t)*0.5);
  return col;
}

// ── 3 · Suite: shuttered sunlight on plaster ────────────────────────────
vec3 sSuite(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  vec2 p = uv * mix(1.0, 0.85, e) + vec2(e*0.06, 0.0);
  vec3 wall = vec3(0.83, 0.74, 0.63) * (0.88 + 0.14*fbm(p*5.0) + 0.04*noise(p*90.0));

  // projected window — sheared, sliding with the sun
  vec2 q = p;
  q.x += q.y*0.55;
  q -= vec2(mix(-0.35, 0.28, e), 0.02);
  float soft = 0.025;
  float win = smoothstep(0.30+soft, 0.30-soft, abs(q.x)) * smoothstep(0.30+soft, 0.30-soft, abs(q.y));
  float slats = smoothstep(0.25, 0.55, fract(q.y*13.0 + 0.2));
  float mullion = smoothstep(0.006, 0.02, abs(q.x));
  float leaves = smoothstep(0.38, 0.62, fbm(q*3.5 + vec2(uTime*0.12, uTime*0.05)));
  float light = win * mix(0.35, 1.0, slats) * mullion * mix(0.55, 1.0, leaves);
  vec3 sun = vec3(1.0, 0.80, 0.55);
  vec3 col = wall*0.58 + wall*sun*light*1.05;

  // bed linen in the foreground
  float bedTop = -0.24 + 0.012*sin(p.x*6.0 + 1.0);
  float bed = smoothstep(bedTop + 0.004, bedTop - 0.004, p.y);
  vec3 linen = vec3(0.95, 0.93, 0.89) * (0.86 + 0.14*sin(p.x*30.0 + fbm(p*6.0)*6.0));
  linen *= 0.75 + 0.35*light + 0.12*smoothstep(-0.5, bedTop, p.y);
  col = mix(col, linen, bed);

  // dust in the beam
  vec2 m = p*vec2(40.0) + vec2(uTime*0.15, -uTime*0.08);
  float dust = smoothstep(0.992, 1.0, hash(floor(m))) * smoothstep(0.5, 0.1, length(fract(m)-0.5));
  col += dust * light * 0.6;
  return col;
}

// ── 4 · Golden hour on the terrace ──────────────────────────────────────
vec3 sGolden(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  float hz = -0.04;
  vec2 sunP = vec2(0.28, mix(0.16, 0.0, e));
  float up = uv.y - hz;
  vec3 sky = mix(vec3(1.0, 0.70, 0.42), vec3(0.98, 0.56, 0.48), smoothstep(0.0, 0.18, up));
  sky = mix(sky, vec3(0.40, 0.46, 0.68), smoothstep(0.12, 0.55, up));
  float dS = length(uv - sunP);
  sky += vec3(1.0, 0.75, 0.45) * exp(-dS*7.0) * 0.6;
  sky += vec3(1.0, 0.95, 0.85) * smoothstep(0.045, 0.040, dS);
  // thin cloud streaks
  sky = mix(sky, vec3(1.0, 0.72, 0.62), smoothstep(0.55, 0.8, fbm(vec2(uv.x*2.0 + uTime*0.01, uv.y*14.0))) * smoothstep(0.02, 0.2, up) * 0.35);

  float dn = hz - uv.y;
  vec3 sea = mix(vec3(0.42, 0.33, 0.40), vec3(0.10, 0.16, 0.28), smoothstep(0.0, 0.35, dn));
  float w = noise(vec2(uv.x*10.0/(dn + 0.03), 1.0/(dn + 0.03) + uTime*0.6));
  sea += (w - 0.5)*0.06;
  float path = exp(-abs(uv.x - sunP.x)*(7.0 + dn*10.0));
  float glit = pow(noise(vec2(uv.x*26.0/(dn + 0.015), 2.8/(dn + 0.015) + uTime*1.6)), 6.0);
  sea += vec3(1.0, 0.72, 0.42) * (path*0.35 + glit*path*2.2);

  vec3 col = mix(sea, sky, smoothstep(-0.001, 0.001, up));

  // stone balustrade in the foreground, warm side-light
  float rail = smoothstep(-0.30, -0.305, uv.y);
  vec3 stone = vec3(0.86, 0.62, 0.42) * (0.75 + 0.25*fbm(uv*vec2(4.0, 30.0)));
  stone *= 0.7 + 0.4*smoothstep(-0.6, 0.8, uv.x);
  col = mix(col, stone*0.9, rail);
  float post = rail * smoothstep(0.02, 0.0, abs(fract(uv.x*3.0) - 0.5) - 0.06);
  col *= 1.0 - post*0.15;
  return col;
}

// ── 5 · Ristorante Lume, blue hour ──────────────────────────────────────
vec3 sLume(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  float hz = 0.02 - e*0.08;                       // camera cranes down
  float up = uv.y - hz;
  vec3 col = mix(vec3(0.44, 0.40, 0.55), vec3(0.06, 0.10, 0.24), smoothstep(-0.02, 0.5, up));
  col = mix(col, vec3(0.03, 0.06, 0.12), smoothstep(0.0, -0.01, up));
  // coast lights on the horizon
  vec2 cl = vec2(uv.x*140.0, (uv.y - hz)*900.0);
  float dots = smoothstep(0.96, 1.0, hash(vec2(floor(cl.x), 3.0))) * smoothstep(1.2, 0.0, abs(cl.y + 2.0));
  col += dots * vec3(1.0, 0.8, 0.5) * 0.8;

  // festoon bulbs, out of focus
  for (int s = 0; s < 2; s++){
    float fs = float(s);
    for (int i = 0; i < 11; i++){
      float fi = float(i);
      float x = -1.0 + fi*0.2 + fs*0.1;
      float y = 0.40 - fs*0.12 - 0.10*cos((x + fs*0.3)*2.4) + e*0.10;
      float r = 0.035 + 0.02*fs;
      float tw = 0.85 + 0.15*sin(uTime*2.0 + fi*1.7);
      col += bokeh(uv, vec2(x, y), r) * vec3(1.0, 0.72, 0.38) * 0.55 * tw;
    }
  }
  // tables: candle glows in the lower frame
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    vec2 c = vec2((hash(vec2(fi, 5.0)) - 0.5)*1.7, -0.22 - 0.22*hash(vec2(fi, 6.0)) + e*0.08);
    float r = 0.02 + 0.05*hash(vec2(fi, 7.0));
    float fl = 0.8 + 0.2*sin(uTime*(5.0 + fi) + fi);
    col += bokeh(uv, c, r) * vec3(1.0, 0.62, 0.30) * 0.5 * fl;
    col += exp(-length(uv - c)*9.0) * vec3(1.0, 0.5, 0.2) * 0.12;
  }
  // linen tablecloth plane catching the warm light
  float table = smoothstep(-0.32, -0.34, uv.y - e*0.05);
  col = mix(col, vec3(0.30, 0.20, 0.14) + 0.15*exp(-abs(uv.x)*2.0), table*0.7);
  return col;
}

// ── 6 · Candlelit dinner ────────────────────────────────────────────────
vec3 sCandle(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  vec2 p = uv * mix(1.0, 0.62, e) + vec2(-0.02*e, 0.04*e);
  vec3 col = vec3(0.045, 0.025, 0.018);

  // background candles + glass glints
  for (int i = 0; i < 10; i++){
    float fi = float(i);
    vec2 c = vec2((hash(vec2(fi, 11.0)) - 0.5)*1.9, (hash(vec2(fi, 12.0)) - 0.35)*0.7);
    float r = 0.05 + 0.08*hash(vec2(fi, 13.0));
    float fl = 0.85 + 0.15*sin(uTime*(3.0 + fi*0.7) + fi);
    col += bokeh(uv*0.9, c, r) * vec3(1.0, 0.55, 0.24) * 0.28 * fl;
  }

  vec2 f = p - vec2(0.0, 0.035);
  float flick = sin(uTime*9.0)*0.5 + sin(uTime*13.7)*0.3 + sin(uTime*23.0)*0.2;
  f.x += (sin(uTime*4.3 + f.y*30.0)*0.004 + flick*0.002) * smoothstep(-0.03, 0.1, f.y);
  float hgt = 0.075 + flick*0.004;
  float wdt = 0.021 * (1.0 - smoothstep(-0.02, hgt, f.y)) + 0.0015;
  float d = length(vec2(f.x/wdt, (f.y - hgt*0.25)/(hgt*0.62)));
  float flame = smoothstep(1.0, 0.55, d);
  float core = smoothstep(0.7, 0.15, d) * smoothstep(0.06, -0.01, f.y);
  float blue = smoothstep(0.7, 0.3, length(vec2(f.x/0.012, (f.y + 0.022)/0.012)));

  float glow = 0.022/length(p - vec2(0.0, 0.05));
  col += vec3(1.0, 0.55, 0.22) * glow * 0.55;
  col += vec3(1.0, 0.45, 0.12) * exp(-length(p - vec2(0.0, 0.05))*4.0) * 0.35;

  // candle body
  float body = smoothstep(0.052, 0.048, abs(p.x)) * smoothstep(0.004, -0.004, p.y + 0.012) * smoothstep(-0.6, -0.59, p.y);
  vec3 wax = vec3(0.98, 0.86, 0.68) * (0.35 + 0.9*exp((p.y + 0.012)*9.0)) * (0.8 + 0.2*cos(p.x*30.0));
  col = mix(col, wax, body);
  // wick
  col = mix(col, vec3(0.05), smoothstep(0.003, 0.0, abs(p.x)) * smoothstep(-0.014, -0.008, p.y) * smoothstep(0.02, 0.012, p.y));

  vec3 flameCol = mix(vec3(1.0, 0.45, 0.10), vec3(1.0, 0.86, 0.55), smoothstep(0.9, 0.3, d));
  col = mix(col, flameCol*1.4, flame);
  col += core * vec3(1.0, 0.97, 0.88);
  col += blue * vec3(0.15, 0.25, 0.8) * 0.4;

  // wine glass rim + stem highlight, to the right
  vec2 g = p - vec2(0.36, -0.02);
  float bowl = smoothstep(0.006, 0.0, abs(length(g*vec2(1.0, 0.75)) - 0.12)) * step(-0.03, g.y);
  float stem = smoothstep(0.004, 0.0, abs(g.x)) * smoothstep(-0.05, -0.06, g.y) * smoothstep(-0.32, -0.3, g.y);
  col += (bowl*smoothstep(-0.1, 0.1, -g.x + 0.05) + stem) * vec3(1.0, 0.7, 0.4) * 0.6;
  col += smoothstep(0.11, 0.0, length(g*vec2(1.0, 0.75) + vec2(0.0, 0.03))) * step(g.y, -0.03) * vec3(0.35, 0.03, 0.06) * 0.6;

  // tablecloth
  float cloth = smoothstep(-0.18, -0.2, p.y);
  col = mix(col, vec3(0.20, 0.13, 0.09)*(0.6 + 0.9*exp(-length(p - vec2(0.0, -0.2))*3.0)), cloth*0.9);
  return col;
}

// ── 7 · Night suite, moon on the water ──────────────────────────────────
vec3 sNight(vec2 uv, float t){
  float e = smoothstep(0.0, 1.0, t);
  vec2 p = uv * mix(1.12, 0.9, e);
  float hz = -0.06;
  vec2 moon = vec2(-0.22, 0.26);
  float up = p.y - hz;
  vec3 sky = mix(vec3(0.07, 0.10, 0.20), vec3(0.01, 0.02, 0.07), smoothstep(0.0, 0.5, up));
  vec2 sg = p*120.0;
  float star = smoothstep(0.994, 1.0, hash(floor(sg))) * smoothstep(0.4, 0.0, length(fract(sg) - 0.5));
  sky += star * (0.6 + 0.4*sin(uTime*3.0 + hash(floor(sg))*20.0)) * smoothstep(0.05, 0.3, up);
  float dm = length(p - moon);
  sky += vec3(0.75, 0.82, 1.0) * exp(-dm*9.0) * 0.35;
  sky = mix(sky, vec3(0.96, 0.95, 0.90), smoothstep(0.034, 0.03, dm));

  float dn = hz - p.y;
  vec3 sea = vec3(0.01, 0.03, 0.08) + 0.03*noise(vec2(p.x*12.0/(dn + 0.03), 1.0/(dn + 0.03) + uTime*0.4));
  float path = exp(-abs(p.x - moon.x)*(10.0 + dn*14.0));
  float glit = pow(noise(vec2(p.x*26.0/(dn + 0.015), 2.8/(dn + 0.015) + uTime*1.1)), 6.0);
  sea += vec3(0.7, 0.8, 1.0) * (path*0.10 + glit*path*1.6);
  vec3 col = mix(sea, sky, smoothstep(-0.001, 0.001, up));

  // window frame + open shutters in silhouette, lamp light inside
  float frameL = smoothstep(0.5, 0.52, abs(p.x));             // |x| > 0.5
  float sill   = smoothstep(-0.30, -0.31, p.y);
  float head   = smoothstep(0.40, 0.41, p.y);
  float inside = max(max(frameL, sill), head);
  vec3 room = vec3(0.14, 0.08, 0.05);
  room += vec3(1.0, 0.62, 0.32) * exp(-length(p - vec2(-0.9, -0.42))*2.6) * 0.65; // bedside lamp
  room += vec3(1.0, 0.62, 0.32) * exp(-length(p - vec2(0.95, 0.1))*3.5) * 0.25;
  room *= 0.8 + 0.2*fbm(p*6.0);
  // shutter slats on the open leaves
  float leaf = frameL * smoothstep(0.62, 0.6, abs(p.x)) ;
  room = mix(room, room*0.55 + vec3(0.04, 0.03, 0.03)*step(0.5, fract(p.y*28.0)), leaf);
  col = mix(col, room, inside);
  // sheer curtain catching the night air on the right
  float sway = sin(p.y*3.0 + uTime*0.6)*0.02;
  float cur = smoothstep(0.30, 0.36, p.x + sway) * (1.0 - inside);
  float folds = 0.5 + 0.5*sin((p.x + sway)*90.0 + fbm(vec2(p.x*7.0, p.y + uTime*0.1))*4.0);
  col = mix(col, vec3(0.30, 0.30, 0.38)*(0.6 + 0.5*folds), cur*0.45);
  return col;
}

vec3 scene(int id, vec2 uv, float t){
  if (id == 0) return sCove(uv, t);
  if (id == 1) return sUnder(uv, t);
  if (id == 2) return sArrival(uv, t);
  if (id == 3) return sSuite(uv, t);
  if (id == 4) return sGolden(uv, t);
  if (id == 5) return sLume(uv, t);
  if (id == 6) return sCandle(uv, t);
  return sNight(uv, t);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  // portrait screens: keep the composition from getting cramped
  float asp = uRes.x/uRes.y;
  if (asp < 1.0) uv *= mix(0.75, 1.0, asp);

  vec3 col = scene(uA, uv, uTA);
  if (uMix > 0.001) col = mix(col, scene(uB, uv, uTB), uMix);
  col = mix(col, vec3(1.0, 1.0, 0.98), uFlash);

  // filmic shoulder + vignette + grain
  col = col / (1.0 + col*0.18) * 1.12;
  vec2 v = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(v, v)*0.55;
  col += (hash(gl_FragCoord.xy + fract(uTime)*100.0) - 0.5) * 0.025;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
