/* ball.js — мини-игра «Укатись от Коржика» (WebGL).
   Длинная трасса (600 м) с контрольными точками. Наклоняй телефон — мяч катится по парковой дорожке,
   Коржик гонится сзади и ускоряется. На пути: трамплины (прыгай через брёвна и ямы), камни, конусы,
   ёжики, грязь, ускорители и косточки. Докати мяч до финишной ленты.
   Если Коржик догнал или мяч упал — выбор: «Попробовать снова» (с последней контрольной точки)
   или «Похуй, я же мячик». После победы — «Дальше» или «Сыграть ещё».
   Управление: наклон (iPhone просит разрешение на датчик), либо палец (виртуальный джойстик),
   либо стрелки на клавиатуре. Всё рисуется на чистом WebGL, картинок не нужно. */
const KBall = (() => {
  'use strict';

  const L = 600;             // длина трассы (в 4 раза длиннее первой версии)
  const CPS = [150, 300, 450];   // контрольные точки
  const RAMP_L = 3.2, RAMP_H = 1.1;
  const HW = 3.4;            // полуширина дорожки
  const BR = 0.45;           // радиус мяча
  const EDGE = HW + 0.15;    // за этим краем мяч падает в траву и теряется
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cxAt = s => 3.2 * Math.sin(s * 0.045) + 1.6 * Math.sin(s * 0.11);

  /* ---------- шейдеры ---------- */
  const VS = `
  attribute vec3 aPos; attribute vec3 aNor;
  uniform mat4 uVP; uniform mat4 uM;
  varying vec3 vN; varying vec3 vW; varying vec3 vP;
  void main(){
    vec4 w = uM * vec4(aPos, 1.0);
    vW = w.xyz; vN = (uM * vec4(aNor, 0.0)).xyz; vP = aPos;
    gl_Position = uVP * w;
  }`;

  const FS = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  varying vec3 vN; varying vec3 vW; varying vec3 vP;
  uniform vec3 uColor; uniform float uMode; uniform vec3 uCam; uniform vec3 uFog; uniform float uTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
  }
  float cxAt(float s){ return 3.2*sin(s*0.045) + 1.6*sin(s*0.11); }
  vec3 ground(vec3 w){
    float s = -w.z;
    float d = abs(w.x - cxAt(s));
    float n = vnoise(w.xz*1.7)*0.5 + vnoise(w.xz*5.3)*0.5;
    float stripe = step(0.5, fract(s*0.12));
    vec3 g = mix(vec3(0.30,0.55,0.20), vec3(0.46,0.69,0.25), 0.35*stripe + 0.55*n);
    vec2 c = floor(w.xz*1.4); float h = hash(c); vec2 f = fract(w.xz*1.4) - 0.5;
    vec2 off = (vec2(hash(c+3.1), hash(c+7.7)) - 0.5) * 0.4;
    if (h > 0.94 && length(f - off) < 0.09) g = (h > 0.97) ? vec3(0.98,0.95,0.85) : vec3(1.0,0.85,0.35);
    vec3 dirt = mix(vec3(0.80,0.64,0.43), vec3(0.68,0.52,0.34), n);
    if (hash(floor(w.xz*3.0)) > 0.94) dirt *= 0.82;
    float edge = d + (n - 0.5)*0.8;
    float t = 1.0 - smoothstep(3.15, 3.55, edge);
    return mix(g, dirt, t);
  }
  void main(){
    vec3 n = normalize(vN);
    float dist = length(uCam - vW);
    float fogK = clamp((dist - 22.0)/85.0, 0.0, 1.0); fogK = fogK*fogK;
    if (uMode > 5.5) {                       // мягкая тень
      float r = length(vP.xz);
      gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - smoothstep(0.15, 1.0, r)) * uColor.x * (1.0 - fogK));
      return;
    }
    vec3 base = uColor;
    if (uMode > 0.5 && uMode < 1.5) base = ground(vW);
    else if (uMode > 1.5 && uMode < 2.5) {   // синий теннисный мячик с кремовым швом
      vec3 q = normalize(vP); float a = atan(q.z, q.x);
      float s1 = abs(q.y - 0.55*sin(2.0*a)); float s2 = abs(q.y + 0.55*sin(2.0*a));
      float seam = 1.0 - smoothstep(0.05, 0.11, min(s1, s2));
      float fuzz = 0.9 + 0.1*hash(floor(vP.xy*45.0) + floor(vP.z*45.0));
      base = mix(uColor * fuzz, vec3(0.93,0.88,0.76), seam);
    }
    else if (uMode > 2.5 && uMode < 3.5) {   // трамплин: полосатый
      float c = step(0.5, fract(vP.z*3.0));
      base = mix(vec3(0.85,0.52,0.2), vec3(0.97,0.9,0.72), c);
    }
    else if (uMode > 4.5 && uMode < 5.5) {   // ускоритель: бегущие стрелки
      float c = step(0.5, fract((abs(vP.x)*0.8 - vP.z)*2.2 - uTime*1.6));
      base = mix(vec3(1.0,0.86,0.25), vec3(0.93,0.42,0.1), c);
    }
    else if (uMode > 3.5 && uMode < 4.5) {   // финишная лента в клетку
      float c = mod(floor(vW.x*1.6) + floor(vW.y*1.6) + floor(vW.z*1.6), 2.0);
      base = mix(vec3(0.97), vec3(0.12), c);
    }
    vec3 L = normalize(vec3(-0.35, 0.8, 0.45));
    float dif = max(dot(n, L), 0.0);
    vec3 amb = mix(vec3(0.38,0.34,0.30), vec3(0.58,0.64,0.72), n.y*0.5+0.5);
    vec3 col = base * (amb + vec3(1.0,0.88,0.7) * dif * 0.85);
    if (uMode > 1.5 && uMode < 2.5) {
      vec3 V = normalize(uCam - vW); vec3 R = reflect(-L, n);
      col += vec3(1.0,0.95,0.85) * pow(max(dot(R, V), 0.0), 28.0) * 0.22;
    }
    col = mix(col, uFog, fogK);
    gl_FragColor = vec4(col, 1.0);
  }`;

  /* ---------- матрицы ---------- */
  const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {                    // column-major: a * b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  const T4 = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const S4 = (x, y, z) => { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; };
  const RY = a => { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
  const RX = a => { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
  function persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2), m = new Array(16).fill(0);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  }
  function look(e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }

  /* ---------- геометрия ---------- */
  function sphere(seg, rings) {
    const p = [], n = [], ix = [];
    for (let y = 0; y <= rings; y++) for (let x = 0; x <= seg; x++) {
      const v = y / rings * Math.PI, u = x / seg * Math.PI * 2;
      const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u);
      p.push(nx, ny, nz); n.push(nx, ny, nz);
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x, b = a + seg + 1;
      ix.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { p, n, ix };
  }
  function cube() {
    const F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    const p = [], n = [], ix = [];
    F.forEach((f, i) => {
      const u = f[0] ? [0, 1, 0] : [1, 0, 0], v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(c => {
        p.push(f[0] + u[0] * c[0] + v[0] * c[1], f[1] + u[1] * c[0] + v[1] * c[1], f[2] + u[2] * c[0] + v[2] * c[1]);
        n.push(f[0], f[1], f[2]);
      });
      const o = i * 4; ix.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    return { p, n, ix };
  }
  function cone(seg) {                    // конус: основание на y=0, вершина y=1, радиус 1
    const p = [], n = [], ix = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      p.push(c, 0, s, 0, 1, 0); n.push(c * 0.7, 0.7, s * 0.7, c * 0.7, 0.7, s * 0.7);
    }
    for (let i = 0; i < seg; i++) ix.push(i * 2, i * 2 + 1, (i + 1) * 2);
    return { p, n, ix };
  }
  function cyl(seg) {                     // цилиндр: y 0..1, радиус 1
    const p = [], n = [], ix = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      p.push(c, 0, s, c, 1, s); n.push(c, 0, s, c, 0, s);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    return { p, n, ix };
  }
  function wedge() {                      // клин-трамплин: низ при z=0, верх при z=-1, x -1..1, высота 0..1
    const p = [-1, 0, 0, 1, 0, 0, 1, 1, -1, -1, 1, -1, -1, 0, -1, 1, 0, -1, 1, 1, -1, -1, 1, -1,
      -1, 0, 0, -1, 0, -1, -1, 1, -1, 1, 0, 0, 1, 0, -1, 1, 1, -1];
    const q = Math.SQRT1_2, n = [0, q, q, 0, q, q, 0, q, q, 0, q, q, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
    const ix = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
    return { p, n, ix };
  }
  function quad() {                       // плоский квадрат на земле, лицом вверх
    return { p: [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], n: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], ix: [0, 2, 1, 0, 3, 2] };
  }

  /* ---------- разметка ---------- */
  const CSS = `
  #bl{position:absolute;inset:0;z-index:18;opacity:0;pointer-events:none;transition:opacity .6s ease;background:#7fb3d8}
  #bl.on{opacity:1;pointer-events:auto}
  #bl canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
  .bl-top{position:absolute;left:0;right:0;top:calc(var(--st) + 62px);display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
  .bl-track{position:relative;width:min(300px,76%);height:14px;border-radius:7px;background:rgba(22,15,11,.62);
    border:1px solid rgba(242,179,107,.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .bl-fin{position:absolute;right:-2px;top:-8px;font-size:22px}
  .bl-dot{position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;font-size:16px;line-height:20px;text-align:center}
  .bl-ball{background:radial-gradient(circle at 35% 30%,#6f9fd8,#2c5da0)}
  .bl-dog{font-size:20px}
  .bl-row{display:flex;gap:8px;align-items:center}
  .bl-bones{padding:5px 12px;border-radius:14px;font-size:15px;font-weight:600;color:#fff2dc;background:rgba(22,15,11,.62);
    border:1px solid rgba(242,179,107,.4);font-variant-numeric:tabular-nums}
  .bl-cpm{position:absolute;top:-4px;width:2px;height:20px;background:rgba(255,242,220,.55);border-radius:1px}
  .bl-warn{padding:6px 14px;border-radius:16px;font-size:15px;font-weight:600;color:#2a170a;background:#f2b36b;opacity:0;transition:opacity .25s}
  .bl-warn.on{opacity:1;animation:blsh .35s linear infinite}
  @keyframes blsh{50%{transform:translateX(3px)}}
  .bl-count{position:absolute;left:0;right:0;top:36%;text-align:center;font-size:96px;font-weight:700;color:#fff2dc;
    text-shadow:0 6px 30px rgba(0,0,0,.55);pointer-events:none;opacity:0}
  .bl-count.pop{animation:blpop .9s ease both}
  @keyframes blpop{0%{opacity:0;transform:scale(.5)}25%{opacity:1;transform:scale(1.1)}80%{opacity:1}100%{opacity:0;transform:scale(1.3)}}
  .bl-joy{position:absolute;width:104px;height:104px;margin:-52px 0 0 -52px;border-radius:50%;pointer-events:none;
    border:2px solid rgba(255,242,220,.5);background:rgba(22,15,11,.25);opacity:0;transition:opacity .2s}
  .bl-joy.on{opacity:1}
  .bl-joy i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,226,176,.75)}
  .bl-hint{position:absolute;left:0;right:0;bottom:calc(var(--sb) + 26px);text-align:center;font-size:16px;font-style:italic;
    color:#fff2dc;text-shadow:0 2px 10px #000;pointer-events:none;padding:0 24px;transition:opacity .5s}
  .bl-start{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    text-align:center;padding:0 34px;background:radial-gradient(100% 70% at 50% 45%,rgba(26,18,14,.78),rgba(10,7,5,.94));transition:opacity .5s}
  .bl-start.hide{opacity:0;pointer-events:none}
  .bl-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    text-align:center;padding:0 30px;opacity:0;pointer-events:none;transition:opacity .6s;
    background:radial-gradient(100% 70% at 50% 45%,rgba(26,18,14,.82),rgba(10,7,5,.95))}
  .bl-end.show{opacity:1;pointer-events:auto}
  .bl-k{font-size:17px;font-style:italic;color:#f2b36b}
  .bl-t{font-size:34px;font-weight:600;line-height:1.12;color:#f7dcb4;text-shadow:0 4px 30px rgba(240,150,60,.3)}
  .bl-s{font-size:16px;font-style:italic;color:#b9a78d;max-width:300px;line-height:1.4;margin-bottom:10px}
  .bl-start .btn,.bl-end .btn{width:min(280px,100%)}
  `;

  let root, cv, gl, prog, U = {}, A = {}, MS = {}, built = false, glOK = false;
  let elDotB, elDotD, elWarn, elCount, elStart, elEnd, elJoy, elJoyK, elHint, elEk, elEt, elEs, elE1, elE2, elTilt;
  let active = false, raf = 0, last = 0, cb = null, T = 0, W = 1, H = 1, dpr = 1;
  let phase = 'ready', cd = 0, cdLast = -1, endT = 0, won = false, tries = 0, falling = false;
  let obs = [], ramps = [], pits = [], muds = [], boosts = [], bones = [], cp = 0, nBones = 0, fallWhy = '', seen = {}, elBones, nextCp = 0;
  let B, D, spin = I4(), camP = [0, 4, 6], camL = [0, 0, 0], shake = 0, trees = [], flowers = [];
  let tiltX = 0, tiltZ = 0, tcX = 0, tcZ = 0, cal = null, oriOK = false, oriAsked = false, oriT = 0;
  let joy = null, keyX = 0, keyZ = 0, lastBoing = 0, lastPant = 0, hintT = 0;

  function build() {
    if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'bl';
    root.innerHTML =
      '<canvas></canvas>' +
      '<div class="bl-top"><div class="bl-track"><span class="bl-fin">🏁</span><span class="bl-dot bl-dog">🐕</span><span class="bl-dot bl-ball"></span></div>' +
      '<div class="bl-row"><div class="bl-bones">🦴 0</div><div class="bl-warn">Коржик близко!</div></div></div>' +
      '<div class="bl-count"></div><div class="bl-joy"><i></i></div><div class="bl-hint"></div>' +
      '<div class="bl-start"><div class="bl-k">Мини-игра</div><div class="bl-t">Укатись от<br>Коржика</div>' +
      '<div class="bl-s bl-tilt">Наклоняй телефон — мяч катится в ту сторону. Впереди трамплины, ямы, камни и ёжики. Собирай косточки и докати до финиша, пока Коржик не догнал.</div>' +
      '<button class="btn primary bl-go">Поехали</button></div>' +
      '<div class="bl-end"><div class="bl-k"></div><div class="bl-t"></div><div class="bl-s"></div>' +
      '<button class="btn primary bl-b1"></button><button class="btn bl-b2"></button></div>';
    document.getElementById('screen-game').appendChild(root);
    cv = root.querySelector('canvas');
    elDotB = root.querySelector('.bl-ball'); elDotD = root.querySelector('.bl-dog');
    elWarn = root.querySelector('.bl-warn'); elCount = root.querySelector('.bl-count');
    elStart = root.querySelector('.bl-start'); elEnd = root.querySelector('.bl-end');
    elJoy = root.querySelector('.bl-joy'); elJoyK = elJoy.querySelector('i'); elHint = root.querySelector('.bl-hint');
    elEk = elEnd.querySelector('.bl-k'); elEt = elEnd.querySelector('.bl-t'); elEs = elEnd.querySelector('.bl-s');
    elBones = root.querySelector('.bl-bones'); CPS.forEach(c => { const m = document.createElement('i'); m.className = 'bl-cpm'; m.style.left = (c / L * 100) + '%'; root.querySelector('.bl-track').appendChild(m); });
    elE1 = elEnd.querySelector('.bl-b1'); elE2 = elEnd.querySelector('.bl-b2'); elTilt = root.querySelector('.bl-tilt');

    root.querySelector('.bl-go').addEventListener('click', onGo);
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    window.addEventListener('deviceorientation', onOri);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    window.addEventListener('resize', () => { if (active) resize(); });
    initGL();
  }

  /* ---------- WebGL ---------- */
  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function mesh(g) {
    const m = { n: g.ix.length };
    m.p = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.p), gl.STATIC_DRAW);
    m.nr = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.nr); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.n), gl.STATIC_DRAW);
    m.i = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.ix), gl.STATIC_DRAW);
    return m;
  }
  function initGL() {
    try {
      gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl');
      if (!gl) throw new Error('no webgl');
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      ['uVP', 'uM', 'uColor', 'uMode', 'uCam', 'uFog', 'uTime'].forEach(k => U[k] = gl.getUniformLocation(prog, k));
      A.pos = gl.getAttribLocation(prog, 'aPos'); A.nor = gl.getAttribLocation(prog, 'aNor');
      MS.sphere = mesh(sphere(28, 20)); MS.cube = mesh(cube()); MS.cone = mesh(cone(14)); MS.cyl = mesh(cyl(12)); MS.quad = mesh(quad()); MS.wedge = mesh(wedge());
      glOK = true;
    } catch (e) { glOK = false; }
  }

  function resize() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (glOK) gl.viewport(0, 0, cv.width, cv.height);
  }

  /* ---------- мир ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function genWorld() {
    const r = rng(20261010); trees = [];
    for (let k = -14; k < L + 40; k += 3.2) for (const side of [-1, 1]) {
      if (r() < 0.22) continue;
      const off = HW + 2.6 + r() * 9;
      trees.push({ x: cxAt(k) + side * off, z: -k + (r() - 0.5) * 2, h: 2.6 + r() * 2.8, c: r() });
    }
    obs = []; ramps = []; pits = []; muds = []; boosts = []; bones = [];
    const R = (a, b) => a + r() * (b - a), pick = arr => arr[Math.floor(r() * arr.length)];
    const rock = (ss, off, rad) => obs.push({ k: 'rock', s: ss, off, r: rad, h: rad * 1.5 });
    const cone = (ss, off) => obs.push({ k: 'cone', s: ss, off, r: 0.34, h: 0.75 });
    const log = (ss, a, b) => obs.push({ k: 'log', s: ss, a, b, h: 0.6 });
    const hog = (ss, ph, sp) => obs.push({ k: 'hog', s: ss, amp: 2.3, sp, ph, r: 0.5, h: 0.8 });
    const ramp = ss => ramps.push({ s: ss });
    const pit = (s0, s1) => pits.push({ s0, s1 });
    const mud = (s0, s1) => muds.push({ s0, s1 });
    const boost = (s0, s1) => boosts.push({ s0, s1, hit: false });
    const bone = (ss, off, y) => bones.push({ s: ss, off, y, got: false });
    const line = (s0, n, step, off0, off1, y) => { for (let i = 0; i < n; i++) bone(s0 + i * step, off0 + (off1 - off0) * (i / Math.max(1, n - 1)), y); };

    const P = {
      rocks(s0, p) { const n = 3; let last = 0; for (let i = 0; i < n; i++) { let o; do o = R(-2.3, 2.3); while (Math.abs(o - last) < 1.3); last = o; rock(s0 + i * 4.2, o, R(0.5, 0.75)); }
        line(s0 + 2, 5, 2, -1.2, 1.2, 0.6); return 14; },
      slalom(s0) { for (let i = 0; i < 6; i++) cone(s0 + i * 3, (i % 2 ? 1 : -1) * 1.5); line(s0 + 1.5, 5, 3, 1.5, -1.5, 0.6); return 19; },
      logs(s0) { const L1 = r() < 0.5; log(s0, L1 ? -HW - 0.4 : -0.3, L1 ? 0.3 : HW + 0.4); log(s0 + 8, L1 ? -0.3 : -HW - 0.4, L1 ? HW + 0.4 : 0.3); line(s0 + 3, 4, 1.5, L1 ? 1.8 : -1.8, L1 ? -1.8 : 1.8, 0.6); return 14; },
      jumpLog(s0) { ramp(s0); log(s0 + RAMP_L + 4.2, -HW - 0.4, HW + 0.4); line(s0 + RAMP_L + 3, 4, 1.8, 0, 0, 1.7); return RAMP_L + 11; },
      jumpPit(s0) { boost(s0, s0 + 4); ramp(s0 + 7); const p0 = s0 + 7 + RAMP_L + 0.6; pit(p0, p0 + 3.6); line(p0 - 0.2, 4, 1.3, 0, 0, 1.9); return 7 + RAMP_L + 9; },
      sweep(s0, p) { hog(s0, R(0, 6), 1.5 + p * 0.9); hog(s0 + 7, R(0, 6), 1.8 + p * 1.0); line(s0 + 3, 3, 1.2, 0, 0, 0.6); return 12; },
      mud(s0) { mud(s0, s0 + 7); rock(s0 + 9, pick([-1.8, 1.8]), 0.55); boost(s0 + 11, s0 + 15); return 17; },
      boostRun(s0) { boost(s0, s0 + 4); line(s0 + 5, 7, 2, -1.8, 1.8, 0.6); cone(s0 + 12, pick([-1.2, 1.2])); return 16; },
      combo(s0, p) { ramp(s0); log(s0 + RAMP_L + 4.2, -HW - 0.4, HW + 0.4); const e = s0 + RAMP_L + 10; hog(e + 2, R(0, 6), 2.0 + p); rock(e + 8, pick([-1.9, 1.9]), 0.6); return RAMP_L + 18; }
    };
    const seq = ['rocks', 'jumpLog', 'logs', 'sweep', 'jumpPit'];
    let sPos = 38, i = 0, lastK = '';
    while (sPos < L - 34) {
      const near = CPS.find(c => sPos > c - 27 && sPos < c + 12);
      if (near) { sPos = near + 12; continue; }
      const p = sPos / L;
      let k;
      if (i < seq.length) k = seq[i];
      else {
        const pool = ['rocks', 'slalom', 'logs', 'jumpLog', 'jumpPit', 'sweep', 'mud', 'boostRun'];
        if (p > 0.3) pool.push('combo', 'jumpPit', 'sweep'); if (p > 0.6) pool.push('combo', 'combo');
        do k = pick(pool); while (k === lastK);
      }
      lastK = k; i++;
      const len = P[k](sPos, p);
      // не даём шаблону залезть на контрольную точку
      sPos += len + R(5, 10) - p * 2;
    }
  }

  /* ---------- состояние забега ---------- */
  function resetRun() {
    B = { x: cxAt(cp), s: cp, vx: 0, vs: 0, y: BR, vy: 0, air: false, boostT: 0 };
    D = { x: cxAt(cp), s: cp - 5.2, t: 0 };
    nextCp = CPS.find(c => c > cp + 1) || 1e9; fallWhy = ''; boosts.forEach(b => { b.hit = false; });
    elBones.textContent = '🦴 ' + nBones;
    spin = I4(); T = 0; phase = 'count'; cd = 3.3; cdLast = -1; endT = 0; won = false; falling = false; shake = 0;
    camP = [B.x, 5.8, -cp + 11.2]; camL = [B.x, 0.5, -cp - 6];
    elWarn.classList.remove('on'); elEnd.classList.remove('show');
    setHint('');
  }
  function setHint(t, ms) {
    clearTimeout(hintT); elHint.textContent = t || ''; elHint.style.opacity = t ? 1 : 0;
    if (ms) hintT = setTimeout(() => { elHint.style.opacity = 0; }, ms);
  }

  function start(name, onDone) {
    if (name !== 'ball') { if (onDone) onDone(); return; }
    build(); stop();
    cb = onDone; tries = 0; cal = null; oriOK = false; tcX = tcZ = 0; cp = 0; nBones = 0; seen = {};
    if (!glOK) { setTimeout(() => { const f = cb; cb = null; if (f) f(); }, 0); return; }   // WebGL нет — пропускаем игру
    genWorld(); resize();
    const needAsk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    elTilt.textContent = needAsk
      ? 'Нажми «Поехали» и разреши доступ к датчику — тогда мяч будет слушаться наклона. Если не разрешишь, управляй пальцем.'
      : 'Наклоняй телефон — мяч катится в ту сторону. Впереди трамплины, ямы, камни и ёжики. Собирай косточки и докати до финиша. Можно и пальцем.';
    elStart.classList.remove('hide');
    resetRun(); phase = 'ready';
    active = true; last = performance.now();
    root.classList.add('on');
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    active = false; cancelAnimationFrame(raf); clearTimeout(hintT);
    cb = null; joy = null;
    if (root) { root.classList.remove('on'); elEnd.classList.remove('show'); elJoy.classList.remove('on'); }
  }
  function done() { const f = cb; stop(); if (f) f(); }

  async function onGo() {
    KAudio.play('tap');
    if (!oriAsked && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      oriAsked = true;
      try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
    }
    elStart.classList.add('hide');
    resetRun();
    setHint('Наклоняй телефон или води пальцем', 3200);
  }

  /* ---------- ввод ---------- */
  function onOri(e) {
    if (e.gamma == null || e.beta == null) return;
    oriOK = true; oriT = performance.now();
    if (!cal) cal = { b: e.beta, g: e.gamma };
    let dg = e.gamma - cal.g, db = e.beta - cal.b;
    if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches) { const t = dg; dg = db; db = -t; }
    tiltX = clamp(dg / 22, -1, 1);      // вправо-влево
    tiltZ = clamp(db / 22, -1, 1);      // от себя (+) — мяч катится вперёд
  }
  function onDown(e) {
    if (!active || phase === 'ready') return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    const r = cv.getBoundingClientRect();
    joy = { id: e.pointerId, x0: e.clientX - r.left, y0: e.clientY - r.top, x: 0, z: 0 };
    elJoy.style.left = joy.x0 + 'px'; elJoy.style.top = joy.y0 + 'px'; elJoy.classList.add('on');
    elJoyK.style.transform = 'translate(0,0)';
    e.preventDefault();
  }
  function onMove(e) {
    if (!joy || e.pointerId !== joy.id) return;
    const r = cv.getBoundingClientRect();
    let dx = e.clientX - r.left - joy.x0, dy = e.clientY - r.top - joy.y0;
    const l = Math.hypot(dx, dy), m = 46;
    if (l > m) { dx *= m / l; dy *= m / l; }
    joy.x = dx / m; joy.z = -dy / m;
    elJoyK.style.transform = `translate(${dx}px,${dy}px)`;
  }
  function onUp(e) { if (joy && e.pointerId === joy.id) { joy = null; elJoy.classList.remove('on'); } }
  function onKey(e) {
    const d = e.type === 'keydown';
    if (e.key === 'ArrowLeft' || e.key === 'a') keyX = d ? -1 : (keyX < 0 ? 0 : keyX);
    if (e.key === 'ArrowRight' || e.key === 'd') keyX = d ? 1 : (keyX > 0 ? 0 : keyX);
    if (e.key === 'ArrowUp' || e.key === 'w') keyZ = d ? 1 : (keyZ > 0 ? 0 : keyZ);
    if (e.key === 'ArrowDown' || e.key === 's') keyZ = d ? -1 : (keyZ < 0 ? 0 : keyZ);
  }
  function input() {
    let x = 0, z = 0;
    if (oriOK && performance.now() - oriT < 800) { x = tiltX; z = tiltZ; }
    if (joy) { x += joy.x; z += joy.z; }
    x += keyX; z += keyZ;
    return { x: clamp(x, -1, 1), z: clamp(z, -1, 1) };
  }

  /* ---------- конец забега ---------- */
  function finish(win) {
    if (phase === 'end') return;
    phase = 'end'; won = win; endT = 0;
    elWarn.classList.remove('on');
    setTimeout(() => { if (!active) return; showEnd(); }, win ? 1100 : 900);
    if (win) { KAudio.play('chime'); KAudio.setMood('happy'); } else { KAudio.play(falling ? 'whoosh' : 'yip'); }
  }
  function showEnd() {
    tries += won ? 0 : 1;
    if (won) {
      elEk.textContent = 'Финиш!'; elEt.innerHTML = 'Мяч докатился!<br>Коржик отстал';
      elEs.textContent = `Косточек собрано: ${nBones} из ${bones.length}. Но разве корги сдаётся? Он уже снова несётся следом.`;
      elE1.textContent = 'Дальше'; elE2.textContent = 'Сыграть ещё';
      elE1.onclick = () => done(); elE2.onclick = again;
    } else {
      elEk.textContent = fallWhy === 'pit' ? 'Мяч провалился' : falling ? 'Мяч укатился в траву' : 'Коржик догнал!';
      elEt.innerHTML = fallWhy === 'pit' ? 'Яма!' : falling ? 'Мимо дорожки…' : 'Хвать!';
      elEs.textContent = (cp ? 'Начнём с контрольной точки. ' : '') + (tries > 1 ? 'Ничего страшного. Можно ещё раз или просто идти дальше.' : 'Хочешь попробовать ещё раз или пройти дальше?');
      elE1.textContent = 'Попробовать снова'; elE2.textContent = 'Похуй, я же мячик';
      elE1.onclick = again; elE2.onclick = () => done();
    }
    if (won) { elE2.onclick = () => { cp = 0; nBones = 0; bones.forEach(b => { b.got = false; }); again(); }; }
    elEnd.classList.add('show');
  }
  function again() {
    KAudio.play('tap'); KAudio.setMood('chase');
    elEnd.classList.remove('show'); resetRun(); cal = null;
  }

  /* ---------- физика ---------- */
  function loop(now) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
  }

  function update(dt) {
    T += dt;
    const sec = phase === 'count' || phase === 'run' || phase === 'end';

    if (phase === 'count') {
      cd -= dt;
      const n = Math.ceil(cd);
      if (n !== cdLast && n >= 0) {
        cdLast = n;
        elCount.textContent = n > 0 ? String(n) : 'Вперёд!';
        elCount.style.fontSize = n > 0 ? '96px' : '56px';
        elCount.classList.remove('pop'); void elCount.offsetWidth; elCount.classList.add('pop');
        KAudio.play(n > 0 ? 'tap' : 'bark');
      }
      if (cd <= -0.3) { phase = 'run'; KAudio.setMood('chase'); }
    }

    // мяч
    if (phase === 'run' || phase === 'end') {
      const inp = phase === 'run' ? input() : { x: 0, z: 0 };
      if (!falling) {
        const prevS = B.s, ctl = B.air ? 0.4 : 1;
        B.boostT = Math.max(0, B.boostT - dt);
        const ax = inp.x * 22 * ctl, as = inp.z * 22 * ctl;
        B.vx += ax * dt; B.vs += as * dt;
        const dr = Math.exp(-(B.air ? 0.25 : 0.9) * dt); B.vx *= dr; B.vs *= dr;
        B.vs = Math.max(B.vs, -1.5);                    // назад почти не катится
        const sp = Math.hypot(B.vx, B.vs), MAXV = B.boostT > 0 ? 15 : 11;
        if (sp > MAXV) { B.vx *= MAXV / sp; B.vs *= MAXV / sp; }
        B.x += B.vx * dt; B.s += B.vs * dt;
        if (B.s < cp - 1) { B.s = cp - 1; B.vs = Math.abs(B.vs) * 0.3; }
        if (phase === 'run') worldStep(dt, prevS);
        // катится вокруг оси
        const rx = B.vs * dt / BR, rz = -B.vx * dt / BR;
        if (!B.air) spin = mul(RX(rx), mul(rotZ(rz), spin));
        else spin = mul(RX(rx * 0.5), spin);
        // за краем дорожки
        const off = B.x - cxAt(B.s);
        if (phase === 'run' && !B.air && B.y < BR + 0.5 && Math.abs(off) > EDGE) { falling = true; B.vy = 0; B.vxF = B.vx; finish(false); }
        if (phase === 'run' && B.s >= L) finish(true);
      } else {
        B.vy -= 14 * dt; B.y += B.vy * dt; B.x += B.vx * dt * 0.6; B.s += B.vs * dt * 0.6;
        if (B.y < BR - 0.9) { B.y = BR - 0.9; B.vy = 0; B.vx *= 0.9; B.vs *= 0.9; }
      }
    }

    // Коржик
    if (phase === 'run') {
      const gap = B.s - D.s;
      const prog = clamp(B.s / L, 0, 1), base = 5.0 + prog * 3.4;   // ускоряется по ходу трассы
      let v = base;
      if (gap > 7 - prog * 2) v += (gap - 7 + prog * 2) * 1.6;                // не отстаёт слишком сильно — всегда виден в кадре
      if (gap < 3) v += 1.4;
      D.s += v * dt; D.t += dt * v * 1.8;
      D.x += (cxAt(D.s) + clamp(B.x - cxAt(B.s), -2.5, 2.5) * 0.5 - D.x) * Math.min(1, dt * 3);
      if (gap < 4) {
        elWarn.classList.add('on');
        if (T - lastPant > 0.9) { lastPant = T; KAudio.play('pant'); }
      } else elWarn.classList.remove('on');
      if (D.s >= B.s - 0.95 && !falling) finish(false);
    } else if (phase === 'end' && !won && !falling) {
      D.s += 3 * dt; D.t += dt * 4;                     // догнал: радостно крутится у мяча
    } else if (phase === 'end' && won) {
      D.s += 5.5 * dt; D.t += dt * 9;
      if (D.s > B.s - 1.6) D.s = B.s - 1.6;
    } else { D.t += dt * 1.5; }

    shake = Math.max(0, shake - dt * 3);

    // индикатор на верху
    const tw = root.querySelector('.bl-track').clientWidth - 6;
    elDotB.style.left = (3 + clamp(B.s / L, 0, 1) * tw) + 'px';
    elDotD.style.left = (3 + clamp(D.s / L, 0, 1) * tw) + 'px';
    return sec;
  }
  const hogX = (o, t) => o.amp * Math.sin(t * o.sp + o.ph);
  let lastHit = 0;
  function hit(strong) {
    shake = strong ? 1 : 0.5;
    if (T - lastHit > 0.3) { lastHit = T; KAudio.play('squeak'); }
  }
  function rampTop(s0) { return s0 + RAMP_L; }
  function rampH(sv) {
    for (const rp of ramps) if (sv >= rp.s && sv <= rp.s + RAMP_L) return (sv - rp.s) / RAMP_L * RAMP_H;
    return 0;
  }
  function worldStep(dt, prevS) {
    // трамплины, высота, прыжок
    const gh = rampH(B.s);
    if (!B.air) {
      B.y = BR + gh;
      for (const rp of ramps) if (prevS < rampTop(rp.s) && B.s >= rampTop(rp.s) && B.vs > 1.5) {
        B.air = true; B.vy = B.vs * 0.2 + 2.6; B.y = BR + RAMP_H;
        KAudio.play('boing'); shake = 0.4;
      }
    } else {
      B.vy -= 16 * dt; B.y += B.vy * dt;
      if (B.vy < 0 && B.y <= BR + gh) { B.y = BR + gh; B.vy = 0; B.air = false; KAudio.play('boing'); shake = 0.6; }
    }
    // ямы
    if (!B.air && B.y < BR + 0.05) for (const pt of pits) if (B.s > pt.s0 + 0.35 && B.s < pt.s1 - 0.35) {
      falling = true; fallWhy = 'pit'; B.vy = 0; finish(false); return;
    }
    // грязь, ускорители
    if (!B.air) {
      for (const m of muds) if (B.s > m.s0 && B.s < m.s1) { const k = Math.exp(-2.4 * dt); B.vx *= k; B.vs *= k; }
      for (const bs of boosts) if (B.s > bs.s0 && B.s < bs.s1) {
        B.vs = Math.min(B.vs + 36 * dt, 15); B.boostT = 0.9;
        if (!bs.hit) { bs.hit = true; KAudio.play('zip'); }
      }
    }
    // препятствия
    for (const o of obs) {
      if (Math.abs(o.s - B.s) > 3) continue;
      const cx0 = cxAt(o.s);
      if (o.k === 'log') {
        const lo = cx0 + o.a, hi = cx0 + o.b, hw = 0.45 + BR * 0.8;
        if (B.y - BR < o.h - 0.1 && B.x > lo - BR * 0.6 && B.x < hi + BR * 0.6 && Math.abs(B.s - o.s) < hw) {
          if (prevS <= o.s) { B.s = o.s - hw; B.vs = -Math.abs(B.vs) * 0.3; } else { B.s = o.s + hw; B.vs = Math.abs(B.vs) * 0.3; }
          B.vx *= 0.7; hit(true);
        }
      } else {
        const ox = cx0 + (o.k === 'hog' ? hogX(o, T) : o.off), dx = B.x - ox, ds = B.s - o.s, d = Math.hypot(dx, ds), mn = BR + o.r;
        if (d < mn && d > 1e-4 && B.y - BR < o.h) {
          const nx = dx / d, ns = ds / d;
          B.x = ox + nx * mn; B.s = o.s + ns * mn;
          const vn = B.vx * nx + B.vs * ns;
          if (vn < 0) { const e = o.k === 'cone' ? 1.2 : 1.6; B.vx -= e * vn * nx; B.vs -= e * vn * ns; }
          B.vs *= o.k === 'cone' ? 0.9 : 0.75; hit(o.k !== 'cone');
        }
      }
    }
    // косточки
    for (const b of bones) {
      if (b.got || Math.abs(b.s - B.s) > 1.2) continue;
      const bx = cxAt(b.s) + b.off;
      if (Math.hypot(B.x - bx, B.s - b.s) < 0.9 && Math.abs(B.y - b.y) < 1.1) {
        b.got = true; nBones++; elBones.textContent = '🦴 ' + nBones; KAudio.play('pop');
      }
    }
    // контрольная точка
    if (B.s >= nextCp) {
      cp = nextCp; nextCp = CPS.find(c => c > cp + 1) || 1e9;
      setHint('🚩 Контрольная точка!', 1800); KAudio.play('chime');
    }
    // подсказки перед новыми видами препятствий
    const ahead = (arr, f) => arr.find(o => { const d = (f ? f(o) : o.s) - B.s; return d > 6 && d < 26; });
    if (!seen.ramp && ahead(ramps)) { seen.ramp = 1; setHint('Трамплин! Разгонись — и прыгай', 2600); }
    else if (!seen.pit && ahead(pits, o => o.s0)) { seen.pit = 1; setHint('Яма! Разгонись на ускорителе и перелети', 2600); }
    else if (!seen.hog && ahead(obs.filter(o => o.k === 'hog'))) { seen.hog = 1; setHint('Ёжики! Не задень', 2200); }
    else if (!seen.mud && ahead(muds, o => o.s0)) { seen.mud = 1; setHint('Грязь липкая — объезжай', 2200); }
  }
  function rotZ(a) { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }

  /* ---------- рисование ---------- */
  function setM(m) { gl.uniformMatrix4fv(U.uM, false, new Float32Array(m)); }
  function draw(ms, m, col, mode) {
    setM(m); gl.uniform3fv(U.uColor, col); gl.uniform1f(U.uMode, mode || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ms.p); gl.enableVertexAttribArray(A.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ms.nr); gl.enableVertexAttribArray(A.nor); gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ms.i);
    gl.drawElements(gl.TRIANGLES, ms.n, gl.UNSIGNED_SHORT, 0);
  }

  function drawCorgi() {
    // Коржик (3D-фигурка из примитивов) бежит по -z, смотрит вперёд
    const z = -D.s, x = D.x, bob = Math.abs(Math.sin(D.t)) * 0.12, y0 = 0.28 + bob;
    const ORG = [0.93, 0.56, 0.2], WH = [0.97, 0.9, 0.78], DK = [0.1, 0.07, 0.05], PK = [0.9, 0.55, 0.55];
    const base = T3(x, y0, z);
    // тень
    gl.enable(gl.BLEND); gl.depthMask(false);
    draw(MS.quad, mul(T4(x, 0.02, z), S4(0.9, 1, 1.25)), [0.55, 0, 0], 6);
    gl.depthMask(true); gl.disable(gl.BLEND);
    const part = (ms, tx, ty, tz, sx, sy, sz, col, mode) => draw(ms, mul(base, mul(T4(tx, ty, tz), S4(sx, sy, sz))), col, mode);
    part(MS.sphere, 0, 0.32, 0, 0.36, 0.3, 0.62, ORG);                 // тело
    part(MS.sphere, 0, 0.22, -0.12, 0.3, 0.2, 0.42, WH);               // белое брюшко
    part(MS.sphere, 0, 0.5, -0.62, 0.3, 0.28, 0.3, ORG);               // голова
    part(MS.sphere, 0, 0.42, -0.84, 0.17, 0.14, 0.18, WH);             // морда
    part(MS.sphere, 0, 0.46, -0.98, 0.05, 0.04, 0.04, DK);             // нос
    part(MS.sphere, -0.12, 0.58, -0.82, 0.045, 0.05, 0.04, DK);        // глаза
    part(MS.sphere, 0.12, 0.58, -0.82, 0.045, 0.05, 0.04, DK);
    part(MS.cone, -0.18, 0.66, -0.58, 0.12, 0.34, 0.08, ORG);          // уши
    part(MS.cone, 0.18, 0.66, -0.58, 0.12, 0.34, 0.08, ORG);
    part(MS.cone, -0.18, 0.7, -0.6, 0.07, 0.24, 0.04, PK);
    part(MS.cone, 0.18, 0.7, -0.6, 0.07, 0.24, 0.04, PK);
    part(MS.sphere, 0, 0.3, 0.62, 0.17, 0.17, 0.17, WH);               // пушистый хвостик
    const sw = Math.sin(D.t * 1.0) * 0.28;                             // лапки
    [[-0.2, -0.35, 1], [0.2, -0.35, -1], [-0.2, 0.35, -1], [0.2, 0.35, 1]].forEach(l => {
      part(MS.sphere, l[0], 0.1 - bob * 0.5, l[1] + sw * l[2], 0.09, 0.12, 0.13, WH);
    });
    part(MS.sphere, 0, 0.42, -0.86, 0.1, 0.06, 0.1, PK);               // язычок
  }
  const T3 = (x, y, z) => T4(x, y, z);

  function render() {
    if (!glOK) return;
    // камера летит за мячом
    const tx = B.x, tz = -B.s, ahead = 6;
    const wantP = [tx * 0.85, 5.8 + (B.y - BR) * 0.5, tz + 11.2], wantL = [tx, 0.5 + (B.y - BR) * 0.4, tz - ahead];
    const k = 0.1;
    camP[0] += (wantP[0] - camP[0]) * k; camP[1] += (wantP[1] - camP[1]) * k; camP[2] += (wantP[2] - camP[2]) * k;
    camL[0] += (wantL[0] - camL[0]) * k; camL[1] += (wantL[1] - camL[1]) * k; camL[2] += (wantL[2] - camL[2]) * k;

    gl.clearColor(0.5, 0.72, 0.88, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const vp = mul(persp(1.0, W / H, 0.3, 160), look(camP, camL, [0, 1, 0]));
    gl.uniformMatrix4fv(U.uVP, false, new Float32Array(vp));
    gl.uniform3fv(U.uCam, camP); gl.uniform3fv(U.uFog, [0.78, 0.86, 0.9]); gl.uniform1f(U.uTime, T);

    // земля (одна большая плоскость, узор в шейдере)
    draw(MS.quad, mul(T4(camP[0], 0, camL[2] - 30), S4(130, 1, 130)), [0, 0, 0], 1);

    // деревья
    const zc = camP[2];
    for (const t of trees) {
      if (t.z > zc + 4 || t.z < zc - 130) continue;
      const g = 0.35 + t.c * 0.2;
      draw(MS.cyl, mul(T4(t.x, 0, t.z), S4(0.17, t.h * 0.36, 0.17)), [0.38, 0.25, 0.14], 0);
      draw(MS.sphere, mul(T4(t.x, t.h * 0.62, t.z), S4(t.h * 0.34, t.h * 0.32, t.h * 0.34)), [0.22 + t.c * 0.1, g + 0.2, 0.18], 0);
      draw(MS.sphere, mul(T4(t.x + 0.3, t.h * 0.82, t.z - 0.2), S4(t.h * 0.24, t.h * 0.22, t.h * 0.24)), [0.3 + t.c * 0.1, g + 0.28, 0.2], 0);
    }

    // фонари вдоль дорожки
    for (let s = 6; s < L + 30; s += 18) {
      const lx = cxAt(s) - HW - 0.9, lz = -s;
      if (lz > zc + 4 || lz < zc - 120) continue;
      draw(MS.cyl, mul(T4(lx, 0, lz), S4(0.06, 2.6, 0.06)), [0.1, 0.1, 0.12], 0);
      draw(MS.cube, mul(T4(lx, 2.75, lz), S4(0.2, 0.26, 0.2)), [1, 0.88, 0.55], 0);
    }

    // финиш
    const fz = -L, fx = cxAt(L);
    draw(MS.cyl, mul(T4(fx - HW - 0.3, 0, fz), S4(0.11, 3.2, 0.11)), [0.85, 0.2, 0.2], 0);
    draw(MS.cyl, mul(T4(fx + HW + 0.3, 0, fz), S4(0.11, 3.2, 0.11)), [0.85, 0.2, 0.2], 0);
    draw(MS.cube, mul(T4(fx, 3.0, fz), S4(HW + 0.3, 0.28, 0.05)), [0, 0, 0], 4);
    draw(MS.quad, mul(T4(fx, 0.03, fz), S4(HW, 1, 0.6)), [0, 0, 0], 4);

    // контрольные точки
    CPS.forEach(c => {
      const gx = cxAt(c), gz = -c, on = B.s >= c;
      if (gz > zc + 4 || gz < zc - 120) return;
      const pc = on ? [0.3, 0.75, 0.4] : [0.2, 0.5, 0.85], bc = on ? [0.55, 0.9, 0.5] : [1, 0.8, 0.3];
      draw(MS.cyl, mul(T4(gx - HW - 0.3, 0, gz), S4(0.11, 3.2, 0.11)), pc, 0);
      draw(MS.cyl, mul(T4(gx + HW + 0.3, 0, gz), S4(0.11, 3.2, 0.11)), pc, 0);
      draw(MS.cube, mul(T4(gx, 3.0, gz), S4(HW + 0.3, 0.3, 0.06)), bc, 0);
    });

    // плоские пятна на дорожке: грязь, ускорители, ямы
    for (const m of muds) { const z0 = -(m.s0 + m.s1) / 2; if (z0 > zc + 4 || z0 < zc - 120) continue;
      draw(MS.quad, mul(T4(cxAt((m.s0 + m.s1) / 2), 0.03, z0), S4(HW - 0.1, 1, (m.s1 - m.s0) / 2)), [0.36, 0.24, 0.13], 0); }
    for (const b of boosts) { const z0 = -(b.s0 + b.s1) / 2; if (z0 > zc + 4 || z0 < zc - 120) continue;
      draw(MS.quad, mul(T4(cxAt((b.s0 + b.s1) / 2), 0.04, z0), S4(1.5, 1, (b.s1 - b.s0) / 2)), [0, 0, 0], 5); }
    for (const pt of pits) { const mid = (pt.s0 + pt.s1) / 2, z0 = -mid; if (z0 > zc + 4 || z0 < zc - 120) continue;
      draw(MS.quad, mul(T4(cxAt(mid), 0.045, z0), S4(HW + 0.25, 1, (pt.s1 - pt.s0) / 2)), [0.05, 0.035, 0.03], 0);
      [pt.s0, pt.s1].forEach(e => draw(MS.cube, mul(T4(cxAt(e), 0.12, -e), S4(HW + 0.25, 0.12, 0.12)), [0.55, 0.38, 0.2], 0)); }
    // трамплины
    for (const rp of ramps) { const z0 = -rp.s; if (z0 > zc + 4 || z0 < zc - 120) continue;
      draw(MS.wedge, mul(T4(cxAt(rp.s + RAMP_L / 2), 0, z0), S4(HW - 0.1, RAMP_H, RAMP_L)), [0, 0, 0], 3); }

    // препятствия
    for (const o of obs) {
      const z0 = -o.s; if (z0 > zc + 4 || z0 < zc - 120) continue;
      const cx0 = cxAt(o.s);
      if (o.k === 'rock') {
        draw(MS.sphere, mul(T4(cx0 + o.off, o.r * 0.55, z0), S4(o.r * 1.05, o.r * 0.85, o.r)), [0.56, 0.56, 0.6], 0);
        draw(MS.sphere, mul(T4(cx0 + o.off + o.r * 0.3, o.r * 0.95, z0 - o.r * 0.2), S4(o.r * 0.55, o.r * 0.4, o.r * 0.5)), [0.66, 0.66, 0.7], 0);
      } else if (o.k === 'cone') {
        draw(MS.cube, mul(T4(cx0 + o.off, 0.04, z0), S4(0.3, 0.04, 0.3)), [0.2, 0.2, 0.22], 0);
        draw(MS.cone, mul(T4(cx0 + o.off, 0.05, z0), S4(0.3, 0.72, 0.3)), [0.98, 0.5, 0.1], 0);
        draw(MS.cyl, mul(T4(cx0 + o.off, 0.3, z0), S4(0.19, 0.08, 0.19)), [0.97, 0.97, 0.95], 0);
      } else if (o.k === 'log') {
        const len = o.b - o.a, xr = cx0 + o.b;
        draw(MS.cyl, mul(T4(xr, 0.3, z0), mul(rotZ(Math.PI / 2), S4(0.3, len, 0.3))), [0.46, 0.3, 0.16], 0);
        draw(MS.sphere, mul(T4(xr, 0.3, z0), S4(0.3, 0.3, 0.3)), [0.62, 0.44, 0.25], 0);
        draw(MS.sphere, mul(T4(xr - len, 0.3, z0), S4(0.3, 0.3, 0.3)), [0.62, 0.44, 0.25], 0);
      } else if (o.k === 'hog') {
        const hx = cx0 + hogX(o, T), dir = Math.cos(T * o.sp + o.ph) > 0 ? -1 : 1;
        draw(MS.sphere, mul(T4(hx, 0.42, z0), S4(0.5, 0.4, 0.5)), [0.45, 0.3, 0.2], 0);
        draw(MS.sphere, mul(T4(hx + dir * 0.45, 0.32, z0), S4(0.2, 0.17, 0.17)), [0.86, 0.7, 0.55], 0);
        draw(MS.sphere, mul(T4(hx + dir * 0.6, 0.34, z0), S4(0.05, 0.05, 0.05)), [0.1, 0.07, 0.05], 0);
        for (let k = 0; k < 7; k++) { const a = -2.4 + k * 0.8;
          draw(MS.cone, mul(T4(hx - dir * 0.1 + Math.sin(a) * 0.3, 0.55 + Math.cos(a) * 0.14, z0 + (k % 2 ? 0.12 : -0.12)), mul(rotZ(-a * 0.6), S4(0.07, 0.3, 0.07))), [0.22, 0.14, 0.09], 0);
        }
      }
    }
    // косточки
    for (const b of bones) {
      if (b.got) continue;
      const z0 = -b.s; if (z0 > zc + 4 || z0 < zc - 90) continue;
      const bx = cxAt(b.s) + b.off, by = b.y + Math.sin(T * 3 + b.s) * 0.08, rot = RY(T * 2 + b.s);
      const bm = mul(T4(bx, by, z0), rot);
      draw(MS.cyl, mul(bm, mul(rotZ(Math.PI / 2), mul(T4(0, -0.15, 0), S4(0.06, 0.3, 0.06)))), [0.98, 0.95, 0.85], 0);
      [[-0.15, 0.06], [-0.15, -0.06], [0.15, 0.06], [0.15, -0.06]].forEach(q =>
        draw(MS.sphere, mul(bm, mul(T4(q[0], q[1] * 1.2, 0), S4(0.07, 0.07, 0.07))), [0.98, 0.95, 0.85], 0));
    }

    // тень мяча и Коржика
    gl.enable(gl.BLEND); gl.depthMask(false);
    if (!falling) draw(MS.quad, mul(T4(B.x, 0.02 + rampH(B.s), -B.s), S4(0.7 + (B.y - BR) * 0.15, 1, 0.7 + (B.y - BR) * 0.15)), [0.7 / (1 + (B.y - BR) * 0.5), 0, 0], 6);
    gl.depthMask(true); gl.disable(gl.BLEND);

    drawCorgi();

    // мяч
    draw(MS.sphere, mul(T4(B.x, B.y, -B.s), mul(spin, S4(BR, BR, BR))), [0.2, 0.4, 0.68], 2);
  }

  return { start, stop, get active() { return active; }, _dbg: () => ({ B, D, phase, won, obs, ramps, pits, muds, boosts, bones, cp, nBones, falling, fallWhy }), _tp: (sv, v) => { B.s = sv; B.x = cxAt(sv); B.vs = v || 0; B.vx = 0; D.s = sv - 6; } };
})();