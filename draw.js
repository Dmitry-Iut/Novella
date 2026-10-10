/* draw.js — мини-игра «Тетрадь»: обведи панду по пунктиру → раскрась по цифрам → переверни страницу → нарисуй что хочешь.
   Подключается между ball.js и game.js. Стили и разметка создаются сами, картинок не нужно.

   Страница 1: панда с бамбуком нарисована пунктиром — проведи пальцем по линиям, и они становятся ровными.
               Потом внутри появляется мозаика из сотен областей с цифрами. Выбери цвет с нужной цифрой и закрашивай
               (можно вести пальцем). Ластик стирает цвет у области.
   Страница 2: чистый лист — рисуй, что хочешь.
   Инструменты: карандаш, маркер, мягкая кисть, заливка, ластик, текст; толщина кисти; палитра + свой цвет;
                отмена / вернуть (удерживай стрелку — быстрая перемотка); скачать картинку; переворот страницы. */
const KDraw = (() => {
  'use strict';

  const PW = 660, PH = 990;               // размер страницы в «бумажных» пикселях
  const GW = PW >> 1, GH = PH >> 1;       // сетка проверки обводки (в два раза грубее)
  const INK = '#2a1c14';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* =====================================================================
     ГЕОМЕТРИЯ: панда (обводится) и фон (напечатан заранее)
     ===================================================================== */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const hashStr = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; };

  function ell(id, z, cx, cy, rx, ry, rot = 0, extra = null, o = null) {
    const shape = new Path2D(); shape.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    const c = Math.cos(rot), s = Math.sin(rot);
    return Object.assign({
      id, z, shape, extra, closed: true, rx, ry, cx, cy,
      pts(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
          out.push([cx + x * c - y * s, cy + x * s + y * c]);
        }
        return out;
      }
    }, o || {});
  }
  const quad = (p0, c, p1, n = 14) => {
    const o = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      o.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
    return o;
  };
  const line = (a, b, n = 8) => { const o = []; for (let i = 0; i <= n; i++) o.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return o; };

  function footExtra(cx, cy) {
    const p = new Path2D();
    p.moveTo(cx + 30, cy + 8); p.ellipse(cx, cy + 8, 30, 22, 0, 0, Math.PI * 2);
    [[-26, -26], [0, -34], [26, -26]].forEach(t => { p.moveTo(cx + t[0] + 9, cy + t[1]); p.arc(cx + t[0], cy + t[1], 9, 0, Math.PI * 2); });
    return p;
  }
  function dotExtra(x, y, r) { const p = new Path2D(); p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); return p; }

  /* num — цифра области, alt — цифра «тени», cell — размер мозаики внутри части */
  function makeParts() {
    const mouth = {
      id: 'mouth', z: 7, shape: null, extra: null, closed: false,
      fixed: [line([330, 419], [330, 435]), quad([330, 435], [318, 454], [298, 443]), quad([330, 435], [342, 454], [362, 443])]
    };
    const W = (cell) => ({ num: 1, alt: 3, cell }), B = (cell) => ({ num: 2, alt: 4, cell });
    return [
      ell('body', 0, 330, 640, 155, 200, 0, null, W(56)),
      ell('earL', 0.5, 230, 268, 46, 46, 0, null, { num: 2, alt: 4 }), ell('earR', 0.5, 430, 268, 46, 46, 0, null, { num: 2, alt: 4 }),
      ell('inL', 0.6, 232, 272, 20, 20, 0, null, { num: 13 }), ell('inR', 0.6, 428, 272, 20, 20, 0, null, { num: 13 }),
      ell('footL', 1, 240, 830, 66, 44, -0.15, footExtra(240, 830), B(40)),
      ell('footR', 1, 420, 830, 66, 44, 0.15, footExtra(420, 830), B(40)),
      ell('belly', 2, 330, 690, 106, 128, 0, null, W(50)),
      ell('stick', 2.5, 335, 662, 185, 13, -0.418, null, { num: 6, alt: 5, cell: 30 }),
      ell('leafA', 2.6, 532, 556, 44, 15, -1.0, null, { num: 7, alt: 6 }),
      ell('leafB', 2.6, 546, 600, 42, 15, -0.1, null, { num: 6, alt: 7 }),
      ell('leafD', 2.6, 134, 754, 38, 13, 2.5, null, { num: 7, alt: 6 }),
      ell('armL', 3, 234, 628, 46, 104, -0.42, null, B(46)), ell('armR', 3, 426, 628, 46, 104, 0.42, null, B(46)),
      ell('cheekL', 3.9, 224, 392, 34, 26, 0.6, null, { num: 1, alt: 3 }), ell('cheekR', 3.9, 436, 392, 34, 26, -0.6, null, { num: 1, alt: 3 }),
      ell('head', 4, 330, 360, 118, 112, 0, null, W(52)),
      ell('patchL', 5, 278, 362, 40, 52, 0.5, null, { num: 2, alt: 4 }), ell('patchR', 5, 382, 362, 40, 52, -0.5, null, { num: 2, alt: 4 }),
      ell('blushL', 5.2, 250, 414, 17, 11, 0.3, null, { num: 13 }), ell('blushR', 5.2, 410, 414, 17, 11, -0.3, null, { num: 13 }),
      ell('muzzle', 5.5, 330, 426, 50, 36, 0, null, { num: 1, alt: 3 }),
      ell('eyeL', 6, 282, 360, 12, 12, 0, dotExtra(277, 354, 4.5), { num: 2, extraNum: 1 }),
      ell('eyeR', 6, 378, 360, 12, 12, 0, dotExtra(373, 354, 4.5), { num: 2, extraNum: 1 }),
      ell('nose', 6.5, 330, 404, 21, 14, 0, null, { num: 2 }),
      ell('tongue', 6.8, 330, 450, 15, 11, 0, null, { num: 13 }),
      mouth
    ];
  }

  /* какие участки линии видны (не закрыты более «передними» частями) */
  let vctx = null;
  function ensureCtx() { if (!vctx) { const c = document.createElement('canvas'); c.width = c.height = 2; vctx = c.getContext('2d'); } }
  function computeVisibility(parts) {
    ensureCtx();
    for (const p of parts) {
      let runs;
      if (p.fixed) runs = p.fixed;
      else {
        const per = 2 * Math.PI * Math.sqrt((p.rx * p.rx + p.ry * p.ry) / 2), N = Math.max(48, Math.ceil(per / 4));
        const pts = p.pts(N), occ = parts.filter(o => o !== p && o.shape && o.z > p.z);
        const vis = pts.map(pt => !occ.some(o => vctx.isPointInPath(o.shape, pt[0], pt[1])));
        if (vis.every(Boolean)) runs = [pts.concat([pts[0]])];
        else {
          runs = []; const h = vis.indexOf(false); let cur = [];
          for (let k = 1; k <= N; k++) {
            const i = (h + k) % N;
            if (vis[i]) cur.push(pts[i]);
            else { if (cur.length > 3) runs.push(cur); cur = []; }
          }
          if (cur.length > 3) runs.push(cur);
        }
      }
      if (!runs.length) runs = [[[p.cx || 0, p.cy || 0], [(p.cx || 0) + 1, (p.cy || 0) + 1]]];
      p.runs = runs;
      const path = new Path2D();
      runs.forEach(r => { path.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) path.lineTo(r[i][0], r[i][1]); });
      p.vpath = path;
      const sm = [];
      runs.forEach(r => {
        let acc = 999;
        for (let i = 0; i < r.length; i++) {
          if (i) acc += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
          if (acc >= 12) { sm.push(r[i]); acc = 0; }
        }
      });
      p.samples = sm.length ? sm : runs[0].slice(0, 1);
      p.done = false; p.cov = 0;
    }
  }

  /* ---------- мозаика (диаграмма Вороного) ---------- */
  function clipHalf(poly, s, q) {
    const mx = (s[0] + q[0]) / 2, my = (s[1] + q[1]) / 2, nx = q[0] - s[0], ny = q[1] - s[1];
    const f = p => (p[0] - mx) * nx + (p[1] - my) * ny, out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa <= 0) out.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function voronoiPolys(seeds, box) {
    return seeds.map((s, i) => {
      let poly = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
      const order = seeds.map((q, j) => j).filter(j => j !== i)
        .sort((a, b) => (seeds[a][0] - s[0]) ** 2 + (seeds[a][1] - s[1]) ** 2 - (seeds[b][0] - s[0]) ** 2 - (seeds[b][1] - s[1]) ** 2);
      for (const j of order) {
        const q = seeds[j], d = Math.hypot(q[0] - s[0], q[1] - s[1]) / 2;
        let far = 0; for (const v of poly) far = Math.max(far, Math.hypot(v[0] - s[0], v[1] - s[1]));
        if (d > far) break;
        poly = clipHalf(poly, s, q); if (poly.length < 3) break;
      }
      return poly;
    });
  }
  function poisson(rand, inside, box, minD, tries) {
    const pts = [];
    for (let k = 0; k < tries; k++) {
      const x = box[0] + rand() * (box[2] - box[0]), y = box[1] + rand() * (box[3] - box[1]);
      if (!inside(x, y)) continue;
      let ok = true; for (const p of pts) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < minD * minD) { ok = false; break; }
      if (ok) pts.push([x, y]);
    }
    return pts;
  }
  const polyPath = (polys, path = new Path2D()) => { polys.forEach(pl => { path.moveTo(pl[0][0], pl[0][1]); for (let i = 1; i < pl.length; i++) path.lineTo(pl[i][0], pl[i][1]); path.closePath(); }); return path; };

  function buildMosaic(parts) {
    ensureCtx();
    for (const p of parts) {
      p.mosaic = null;
      if (!p.cell || !p.shape) continue;
      const pts = p.pts(72); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
      const rand = rng(hashStr(p.id) + 11), area = Math.PI * p.rx * p.ry;
      const seeds = poisson(rand, (x, y) => vctx.isPointInPath(p.shape, x, y), [x0, y0, x1, y1], p.cell * 0.8, Math.ceil(area / (p.cell * p.cell)) * 60 + 80);
      if (seeds.length < 2) continue;
      p.mosaic = polyPath(voronoiPolys(seeds, [x0 - 12, y0 - 12, x1 + 12, y1 + 12]));
    }
  }

  /* ---------- фон ---------- */
  const leafPath = (x, y, len, ang, wid) => {
    const p = new Path2D(), dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, tx = x + dx * len, ty = y + dy * len;
    p.moveTo(x, y);
    p.quadraticCurveTo(x + dx * len * 0.5 + nx * wid, y + dy * len * 0.5 + ny * wid, tx, ty);
    p.quadraticCurveTo(x + dx * len * 0.5 - nx * wid, y + dy * len * 0.5 - ny * wid, x, y);
    p.closePath(); return p;
  };
  const leafHalf = (x, y, len, ang, wid, sg) => {
    const p = new Path2D(), dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    p.moveTo(x, y); p.quadraticCurveTo(x + dx * len * 0.5 + sg * nx * wid, y + dy * len * 0.5 + sg * ny * wid, x + dx * len, y + dy * len);
    p.closePath(); return p;
  };
  const circP = (x, y, r) => { const p = new Path2D(); p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); return p; };
  const rectP = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };

  function buildDecor(parts) {
    ensureCtx();
    const CX = 330, CY = 510, items = [];
    const add = (path, num, z, o) => items.push(Object.assign({ path, num, z, opaque: true, lw: 3.2, idx: items.length }, o || {}));

    // фон-мозаика
    const rand = rng(4242);
    const seeds = poisson(rand, (x, y) => Math.hypot(x - CX, y - CY) > 262 && x > 64 && x < 596, [0, 0, PW, PH], 80, 6000);
    voronoiPolys(seeds, [-30, -30, PW + 30, PH + 30]).forEach((pl, i) => {
      const y = seeds[i][1], pick = y < 330 ? [8, 8, 12] : y < 700 ? [12, 8, 9] : [5, 6, 9];
      add(polyPath([pl]), pick[Math.floor(rand() * 3)], -1, { opaque: false, lw: 2.6 });
    });
    // солнечный диск, лучи, бусины
    add(circP(CX, CY, 270), 9, 0, { lw: 0 });
    const ann = new Path2D(); ann.moveTo(CX + 270, CY); ann.arc(CX, CY, 270, 0, Math.PI * 2); ann.moveTo(CX + 218, CY); ann.arc(CX, CY, 218, 0, Math.PI * 2);
    add(ann, 12, 0.3, { rule: 'evenodd' });
    for (let i = 0; i < 24; i++) {
      const a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2, w = new Path2D();
      w.moveTo(CX + Math.cos(a0) * 130, CY + Math.sin(a0) * 130); w.lineTo(CX + Math.cos(a0) * 218, CY + Math.sin(a0) * 218);
      w.arc(CX, CY, 218, a0, a1); w.lineTo(CX + Math.cos(a1) * 130, CY + Math.sin(a1) * 130); w.arc(CX, CY, 130, a1, a0, true); w.closePath();
      add(w, i % 2 ? 10 : 9, 0.5, { lw: 2.8 });
      const am = (i + 0.5) / 24 * Math.PI * 2;
      add(circP(CX + Math.cos(am) * 244, CY + Math.sin(am) * 244, 9), i % 2 ? 13 : 14, 0.6, { lw: 2.6 });
    }
    // бамбуковые стебли
    const ys = [-20, 170, 350, 530, 710, 890, 1010];
    [34, 626].forEach(sx => {
      for (let i = 0; i < ys.length - 1; i++) {
        add(rectP(sx - 22, ys[i], 44, ys[i + 1] - ys[i]), 5, 2, { lw: 3.2 });
        add(rectP(sx - 14, ys[i] + 12, 9, ys[i + 1] - ys[i] - 24), 9, 2.1, { lw: 2 });
      }
      for (let i = 1; i < ys.length - 1; i++) add(rectP(sx - 25, ys[i] - 8, 50, 16), 11, 2.2, { lw: 3 });
    });
    [170, 350, 710, 890].forEach(ny => {
      [[56, 0], [604, Math.PI]].forEach(([bx, base]) => {
        [-0.6, 0.6].forEach(da => {
          const ang = base === 0 ? da : Math.PI - da;
          add(leafHalf(bx, ny, 96, ang, 27, 1), 7, 4, { lw: 3 });
          add(leafHalf(bx, ny, 96, ang, 27, -1), 6, 4, { lw: 3 });
        });
      });
    });
    // пузырьки
    [[215, 150, 14, 13], [470, 160, 15, 12], [330, 70, 22, 9], [420, 40, 12, 13], [250, 36, 12, 12], [110, 825, 16, 12], [556, 828, 18, 13], [96, 560, 0, 0]]
      .forEach(b => { if (b[2]) add(circP(b[0], b[1], b[2]), b[3], 0.2, { lw: 2.8 }); });
    // цветы
    [[135, 120, 34], [530, 110, 34], [120, 905, 32], [545, 905, 32]].forEach(f => {
      for (let i = 0; i < 6; i++) add(leafPath(f[0], f[1], f[2], i / 6 * Math.PI * 2 - Math.PI / 2, f[2] * 0.43), 13, 5, { lw: 2.8 });
      add(circP(f[0], f[1], f[2] * 0.3), 14, 5.5, { lw: 2.6 });
    });
    // трава
    for (let i = 0; i < 15; i++) {
      const x = 66 + i * 38, h = 40 + (i * 37 % 30), lean = ((i * 53) % 21) - 10, g = new Path2D();
      g.moveTo(x, PH + 4); g.quadraticCurveTo(x + 4, PH - h * 0.6, x + 22 + lean, PH - h);
      g.quadraticCurveTo(x + 34, PH - h * 0.5, x + 40, PH + 4); g.closePath();
      add(g, i % 2 ? 6 : 5, 3, { lw: 2.8 });
    }
    items.sort((a, b) => a.z - b.z || a.idx - b.idx);

    const paint = () => {
      const c = document.createElement('canvas'); c.width = PW; c.height = PH;
      const o = c.getContext('2d'); o.lineJoin = 'round'; o.lineCap = 'round'; o.strokeStyle = INK;
      for (const it of items) {
        if (it.opaque) { o.globalCompositeOperation = 'destination-out'; o.fill(it.path, it.rule || 'nonzero'); o.globalCompositeOperation = 'source-over'; }
        if (it.lw) { o.lineWidth = it.lw; o.stroke(it.path); }
      }
      return c;
    };
    const full = paint();
    const cut = document.createElement('canvas'); cut.width = PW; cut.height = PH;
    const k = cut.getContext('2d'); k.drawImage(full, 0, 0);
    const sil = new Path2D();
    parts.filter(p => p.shape && p.z < 5).forEach(p => sil.addPath(p.shape));
    k.globalCompositeOperation = 'destination-out'; k.fill(sil); k.lineWidth = 18; k.lineJoin = 'round'; k.stroke(sil);
    return { full, cut, items: items.slice().reverse() };
  }

  /* какая цифра у области, содержащей точку */
  const NUMPAL = [null, '#f7f2e8', '#2b2a30', '#bdb9b4', '#5d5c66', '#b6d96b', '#69a94f', '#2f8a78', '#9dd3ea', '#f8d56b', '#f29a4b', '#9c6b46', '#c5aee9', '#ef7fa7', '#e8503c'];
  function numberAt(x, y, parts, items) {
    ensureCtx();
    const ps = parts.filter(p => p.shape).sort((a, b) => b.z - a.z);
    for (const p of ps) {
      if (p.extraNum && p.extra && vctx.isPointInPath(p.extra, x, y)) return p.extraNum;
      if (vctx.isPointInPath(p.shape, x, y) || (p.extra && vctx.isPointInPath(p.extra, x, y))) {
        if (p.alt && ((x - p.cx) * 0.45 + (y - p.cy) * 0.9) / p.ry > 0.3) return p.alt;
        return p.num;
      }
    }
    for (const it of items) if (vctx.isPointInPath(it.path, x, y, it.rule || 'nonzero')) return it.num;
    return 1;
  }

  /* =====================================================================
     ИНТЕРФЕЙС
     ===================================================================== */
  const COLORS = ['#1d1a1a', '#4a4543', '#8c8582', '#cfc8c2', '#ffffff',
    '#7b2d26', '#c0392b', '#e8613c', '#f4a259', '#f7d154',
    '#c9a227', '#8a9a3b', '#4f8a3c', '#2f6b4a', '#1f4d3a',
    '#5fb7a5', '#3d8fb5', '#2a5aa0', '#1d3557', '#6c5bb5',
    '#9b59b6', '#d86fb0', '#f2a0b8', '#f6c7b0', '#b88a64',
    '#7a5236', '#a67c52', '#e9d8b4', '#ffd9c0', '#ff7aa2'];
  const TOOLS = [
    ['num', '🔢', 'По цифрам'], ['pencil', '✏️', 'Карандаш'], ['marker', '🖍️', 'Маркер'], ['brush', '🖌️', 'Кисть'],
    ['fill', '🪣', 'Заливка'], ['eraser', '🧽', 'Ластик'], ['text', 'Aa', 'Текст']
  ];

  const CSS = `
  #nb{position:absolute;inset:0;z-index:18;display:flex;flex-direction:column;opacity:0;pointer-events:none;
    transition:opacity .6s ease;padding:calc(var(--st) + 58px) 6px calc(var(--sb) + 10px);
    background:radial-gradient(120% 80% at 50% 0%,#3a281c 0%,#1a110c 70%)}
  #nb.on{opacity:1;pointer-events:auto}
  #nb *{-webkit-user-select:none;user-select:none}
  .nb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 6px 0}
  .nb-title{font-size:20px;font-style:italic;color:#f2b36b}
  .nb-chip{padding:5px 12px;border-radius:14px;font-size:14px;color:#f3e7d4;background:rgba(22,15,11,.7);
    border:1px solid rgba(242,179,107,.35);font-variant-numeric:tabular-nums}
  .nb-tip{min-height:22px;padding:4px 6px 6px;font-size:14.5px;font-style:italic;color:#b9a78d}
  .nb-body{flex:1;min-height:0;display:flex;gap:6px}
  .nb-rail{width:44px;flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;border-radius:22px;
    background:rgba(22,15,11,.72);border:1px solid rgba(242,179,107,.25);transition:opacity .35s}
  .nb-rail.off,.nb-pal.off,.nb-size.off{opacity:.28;pointer-events:none}
  .nb-t{width:38px;height:38px;border-radius:14px;font-size:20px;line-height:1;display:grid;place-items:center;color:#f3e7d4;
    border:1px solid transparent;transition:transform .12s,background .2s;font-family:ui-serif,Georgia,serif}
  .nb-t.sel{background:linear-gradient(180deg,#f5be7e,#dc9250);color:#2a170a;box-shadow:0 4px 14px rgba(242,160,80,.3)}
  .nb-t:active{transform:scale(.9)}
  .nb-t:disabled{opacity:.25}
  .nb-sep{width:26px;height:1px;background:rgba(185,167,141,.3);margin:2px 0}
  .nb-wrap{position:relative;flex:1;min-width:0;display:grid;place-items:center;perspective:1500px}
  .nb-sheet{position:relative;border-radius:8px;overflow:hidden;background:#fffdf7;touch-action:none;
    box-shadow:0 10px 40px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.25)}
  .nb-sheet.p2{background-color:#fffaf0;
    background-image:radial-gradient(circle,rgba(120,100,80,.28) 1.4px,transparent 1.6px);background-size:26px 26px}
  .nb-sheet canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
  #nbLine{mix-blend-mode:multiply}
  #nbScr{transition:opacity .8s ease}
  .nb-flip{position:absolute;pointer-events:none;transform-origin:left center;transform-style:preserve-3d;z-index:6;will-change:transform}
  .nb-flip .ff,.nb-flip .fb{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:8px}
  .nb-flip .ff{background:#fffdf7 center/100% 100% no-repeat}
  .nb-flip .fb{transform:rotateY(180deg);background:#efe6d3;box-shadow:inset 0 0 40px rgba(120,90,50,.3)}
  .nb-flip.go{animation:nbflip 1s cubic-bezier(.55,.05,.3,1) forwards}
  @keyframes nbflip{0%{transform:rotateY(0);opacity:1}82%{opacity:1}100%{transform:rotateY(-176deg);opacity:0}}
  .nb-size{display:flex;align-items:center;gap:12px;padding:8px 8px 2px;transition:opacity .35s}
  .nb-size input{flex:1;accent-color:#f2b36b;height:30px}
  .nb-prev{width:42px;height:42px;display:grid;place-items:center;flex:none}
  .nb-prev i{display:block;border-radius:50%;background:#333}
  .nb-pal{display:flex;gap:8px;overflow-x:auto;padding:8px 6px 6px;scrollbar-width:none;transition:opacity .35s}
  .nb-pal::-webkit-scrollbar{display:none}
  .nb-sw{flex:none;width:34px;height:34px;border-radius:50%;border:2px solid rgba(255,255,255,.25);transition:transform .12s}
  .nb-pal.nums{flex-wrap:wrap;justify-content:center;overflow:visible;gap:6px 8px;padding:6px 4px 4px}
  .nb-sw.num{display:grid;place-items:center;font:700 16px/1 ui-sans-serif,system-ui,sans-serif;position:relative}
  .nb-sw.num.done{opacity:.35}
  .nb-sw.num.done::after{content:'✓';position:absolute;right:-3px;top:-6px;font-size:13px;color:#f2b36b}
  .nb-pal.shake{animation:nbshake .35s}
  @keyframes nbshake{20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}
  .nb-t.hid,.nb-size.hid{display:none}
  .nb-sheet{transform-origin:50% 50%;will-change:transform}
  .nb-wrap.zoomed{overflow:hidden}
  .nb-zoom{position:absolute;right:4px;top:4px;z-index:7;display:flex;flex-direction:column;gap:6px}
  .nb-zoom button{width:38px;height:38px;border-radius:50%;font-size:20px;line-height:1;color:#f3e7d4;display:grid;place-items:center;
    background:rgba(22,15,11,.78);border:1px solid rgba(242,179,107,.4)}
  .nb-zoom button:active{transform:scale(.9)}
  .nb-sw.sel{outline:3px solid #f2b36b;outline-offset:2px;transform:scale(1.1)}
  .nb-sw.custom{position:relative;display:grid;place-items:center;font-size:17px;
    background:conic-gradient(#f66,#fd6,#6f8,#6df,#a6f,#f66)}
  .nb-sw.custom input{position:absolute;inset:0;opacity:0;width:100%;height:100%}
  .nb-act{display:flex;gap:10px;padding-top:6px}
  .nb-act .btn{flex:1;min-height:50px;padding:0 10px;font-size:16.5px}
  .nb-act .btn[disabled]{opacity:.35;pointer-events:none}
  .nb-act .hide{display:none}
  .nb-modal{position:absolute;inset:0;z-index:12;display:none;align-items:flex-end;background:rgba(5,3,2,.55)}
  .nb-modal.on{display:flex}
  .nb-msheet{width:100%;padding:18px 18px calc(var(--sb) + 18px);border-radius:26px 26px 0 0;background:#1b130e;
    border-top:1px solid rgba(242,179,107,.3);display:flex;flex-direction:column;gap:12px}
  .nb-msheet h4{margin:0;font-size:20px;font-weight:500;font-style:italic;color:#f2b36b}
  .nb-msheet input{height:50px;border-radius:16px;padding:0 16px;font-size:20px;color:#f3e7d4;background:#2a1e17;
    border:1px solid rgba(242,179,107,.3);outline:none;font-family:inherit;-webkit-user-select:text;user-select:text}
  .nb-mrow{display:flex;gap:10px}.nb-mrow .btn{flex:1}
  `;

  let root, wrap, sheet, cvColor, cvTmp, cvLine, cvScr, cvGuide, cvNum, cx, ct, cl, cs, cg, cn;
  let elTitle, elChip, elTip, elRail, elPal, elSize, elPrev, elSlide, bA, bB, bC, elModal, elTxt, elUndo, elRedo, elTools = {};
  let built = false, active = false, busy = false, raf = 0, cb = null, page = 1, phase = 'trace', t0 = 0;
  let view = { z: 1, x: 0, y: 0 }, pts = new Map(), pin = null;
  let selNum = 1, lab = null, regs = [], rStart = null, rIdx = null, filled = null, shownTotal = 0, allDone = false, tipT = 0;
  let parts = [], decor = null, grid = new Uint8Array(GW * GH), lineData = null;
  let tool = 'pencil', color = '#2f2f35', size = 8, ptr = null, tmpAlpha = 1, strokeBox = null;
  let hist = [], hi = -1, lastCheck = 0, lastSfx = 0, doneCount = 0, textAt = null, repeat = 0, traceDone = false;

  function build() {
    if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'nb';
    root.innerHTML =
      '<div class="nb-head"><div class="nb-title"></div><div class="nb-chip"></div></div>' +
      '<div class="nb-tip"></div>' +
      '<div class="nb-body"><div class="nb-rail"></div>' +
      '<div class="nb-wrap"><div class="nb-sheet">' +
      '<canvas id="nbColor"></canvas><canvas id="nbTmp"></canvas><canvas id="nbLine"></canvas><canvas id="nbNum"></canvas><canvas id="nbScr"></canvas><canvas id="nbGuide"></canvas>' +
      '</div></div></div>' +
      '<div class="nb-size"><div class="nb-prev"><i></i></div><input type="range" min="2" max="40" value="8" aria-label="Толщина"></div>' +
      '<div class="nb-pal"></div>' +
      '<div class="nb-act"><button class="btn ghost bA"></button><button class="btn bB"></button><button class="btn primary bC"></button></div>' +
      '<div class="nb-modal"><div class="nb-msheet"><h4>Что написать?</h4><input maxlength="26" placeholder="Напиши что-нибудь…">' +
      '<div class="nb-mrow"><button class="btn ghost mNo">Отмена</button><button class="btn primary mYes">Добавить</button></div></div></div>';
    document.getElementById('screen-game').appendChild(root);

    wrap = root.querySelector('.nb-wrap'); sheet = root.querySelector('.nb-sheet');
    cvColor = root.querySelector('#nbColor'); cvTmp = root.querySelector('#nbTmp'); cvLine = root.querySelector('#nbLine');
    cvScr = root.querySelector('#nbScr'); cvGuide = root.querySelector('#nbGuide'); cvNum = root.querySelector('#nbNum');
    [cvColor, cvTmp, cvLine, cvScr, cvGuide, cvNum].forEach(c => { c.width = PW; c.height = PH; });
    cx = cvColor.getContext('2d', { willReadFrequently: true }); ct = cvTmp.getContext('2d');
    cl = cvLine.getContext('2d', { willReadFrequently: true }); cs = cvScr.getContext('2d'); cg = cvGuide.getContext('2d'); cn = cvNum.getContext('2d');

    elTitle = root.querySelector('.nb-title'); elChip = root.querySelector('.nb-chip'); elTip = root.querySelector('.nb-tip');
    elRail = root.querySelector('.nb-rail'); elPal = root.querySelector('.nb-pal'); elSize = root.querySelector('.nb-size');
    elPrev = root.querySelector('.nb-prev i'); elSlide = elSize.querySelector('input');
    bA = root.querySelector('.bA'); bB = root.querySelector('.bB'); bC = root.querySelector('.bC');
    const zm = document.createElement('div'); zm.className = 'nb-zoom';
    zm.innerHTML = '<button aria-label="Приблизить">＋</button><button aria-label="Отдалить">－</button><button aria-label="Вся страница">⤢</button>';
    wrap.appendChild(zm);
    const zb = zm.querySelectorAll('button');
    zb[0].addEventListener('click', () => { zoomBy(1.5); KAudio.play('tap'); });
    zb[1].addEventListener('click', () => { zoomBy(1 / 1.5); KAudio.play('tap'); });
    zb[2].addEventListener('click', () => { setView(1); KAudio.play('tap'); });
    elModal = root.querySelector('.nb-modal'); elTxt = elModal.querySelector('input');

    TOOLS.forEach(t => {
      const b = document.createElement('button'); b.className = 'nb-t'; b.textContent = t[1]; b.setAttribute('aria-label', t[2]);
      b.addEventListener('click', () => { setTool(t[0]); KAudio.play('tap'); });
      elRail.appendChild(b); elTools[t[0]] = b;
    });
    elRail.appendChild(Object.assign(document.createElement('div'), { className: 'nb-sep' }));
    elUndo = document.createElement('button'); elUndo.className = 'nb-t'; elUndo.textContent = '↶'; elUndo.setAttribute('aria-label', 'Отменить');
    elRedo = document.createElement('button'); elRedo.className = 'nb-t'; elRedo.textContent = '↷'; elRedo.setAttribute('aria-label', 'Вернуть');
    elRail.appendChild(elUndo); elRail.appendChild(elRedo);
    holdRepeat(elUndo, undo); holdRepeat(elRedo, redo);

    elSlide.addEventListener('input', () => { size = +elSlide.value; updPrev(); });
    sheet.addEventListener('pointerdown', onDown); sheet.addEventListener('pointermove', onMove);
    sheet.addEventListener('pointerup', onUp); sheet.addEventListener('pointercancel', onUp);
    bA.addEventListener('click', onA); bB.addEventListener('click', onB); bC.addEventListener('click', onC);
    elModal.querySelector('.mNo').addEventListener('click', closeText);
    elModal.querySelector('.mYes').addEventListener('click', addText);
    elTxt.addEventListener('keydown', e => { if (e.key === 'Enter') addText(); });
    window.addEventListener('resize', () => { if (active) layout(); });
  }

  function palFree() {
    elPal.className = 'nb-pal'; elPal.innerHTML = '';
    COLORS.forEach(c => {
      const b = document.createElement('button'); b.className = 'nb-sw'; b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', c);
      b.addEventListener('click', () => setColor(c)); elPal.appendChild(b);
    });
    const cu = document.createElement('label'); cu.className = 'nb-sw custom'; cu.innerHTML = '<span>＋</span><input type="color" value="#2f2f35">';
    cu.querySelector('input').addEventListener('input', e => setColor(e.target.value, true));
    elPal.appendChild(cu);
  }
  function palNums() {
    elPal.className = 'nb-pal nums'; elPal.innerHTML = '';
    for (let n = 1; n < NUMPAL.length; n++) {
      const b = document.createElement('button'), c = NUMPAL[n], rgb = hex(c);
      b.className = 'nb-sw num'; b.style.background = c; b.dataset.n = n; b.textContent = n;
      b.style.color = (rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11) > 150 ? '#2a1c14' : '#fff';
      b.addEventListener('click', () => pickNum(n)); elPal.appendChild(b);
    }
    pickNum(selNum, true);
  }
  function pickNum(n, quiet) {
    selNum = n; color = NUMPAL[n];
    elPal.querySelectorAll('.nb-sw.num').forEach(b => b.classList.toggle('sel', +b.dataset.n === n));
    if (tool === 'eraser' && !quiet) setTool('num');
    updPrev(); if (!quiet) KAudio.play('tap');
  }

  function holdRepeat(btn, fn) {
    const go = () => { fn(); repeat = setTimeout(go, 130); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); KAudio.play('tap'); fn(); clearTimeout(repeat); repeat = setTimeout(go, 450); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, () => clearTimeout(repeat)));
  }

  function setView(z, fx, fy) {
    const W = sheet.offsetWidth, H = sheet.offsetHeight; if (!W) return;
    z = clamp(z, 1, 4.5);
    let x = view.x, y = view.y;
    if (fx != null) { const k = W / PW; x = -z * (fx - PW / 2) * k; y = -z * (fy - PH / 2) * k; }
    else if (z === 1) { x = 0; y = 0; }
    view = { z, x: clamp(x, -(z - 1) * W / 2, (z - 1) * W / 2), y: clamp(y, -(z - 1) * H / 2, (z - 1) * H / 2) };
    sheet.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`; wrap.classList.toggle('zoomed', view.z > 1.001);
  }
  function zoomBy(f) { const z = clamp(view.z * f, 1, 4.5); view.x *= z / view.z; view.y *= z / view.z; setView(z); }
  function startPinch() {
    const a = [...pts.values()];
    pin = { d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, z0: view.z, t0: { x: view.x, y: view.y }, s0: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 } };
  }
  function updatePinch() {
    const a = [...pts.values()]; if (a.length < 2 || !pin) return;
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    const z = clamp(pin.z0 * d / pin.d0, 1, 4.5), r = wrap.getBoundingClientRect();
    const cxs = r.left + r.width / 2, cys = r.top + r.height / 2;
    const ux = (pin.s0.x - cxs - pin.t0.x) / pin.z0, uy = (pin.s0.y - cys - pin.t0.y) / pin.z0;
    view.x = s.x - cxs - z * ux; view.y = s.y - cys - z * uy; setView(z);
  }
  function abortStroke() {
    if (!ptr) return;
    if (ptr.mode === 'num') { const ch = ptr.changed; ptr = null; if (ch) snap(work); work = null; }
    else if (phase !== 'trace') { ptr = null; try { endStroke(); } catch (x) {} }
    else ptr = null;
  }

  function layout() {
    const w = wrap.clientWidth - 2, h = wrap.clientHeight - 2;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(w / PW, h / PH);
    sheet.style.width = Math.floor(PW * s) + 'px'; sheet.style.height = Math.floor(PH * s) + 'px';
    setView(view.z);
  }

  /* ---------- инструменты и цвет ---------- */
  function setTool(t) {
    tool = t;
    Object.keys(elTools).forEach(k => elTools[k].classList.toggle('sel', k === t));
    updPrev(); sizeVis();
  }
  function sizeVis() {
    if (!elSize) return;
    elSize.classList.toggle('hid', phase === 'color' && (tool === 'num' || tool === 'eraser'));
    if (active) requestAnimationFrame(layout);
  }
  function setColor(c, custom) {
    color = c;
    elPal.querySelectorAll('.nb-sw').forEach(b => b.classList.toggle('sel', !custom && b.dataset.c === c));
    if (tool === 'eraser' || tool === 'num') setTool('pencil');
    updPrev(); KAudio.play('tap');
  }
  function updPrev() {
    const d = tool === 'eraser' ? size * 2 + 6 : tool === 'marker' ? size * 1.6 + 4 : tool === 'brush' ? size * 1.2 + 2 : size * 0.6 + 1;
    const px = clamp(d * 0.55, 4, 38);
    elPrev.style.width = elPrev.style.height = px + 'px';
    elPrev.style.background = tool === 'eraser' ? '#e8dcc6' : color;
    elPrev.style.opacity = tool === 'marker' ? .6 : 1;
  }

  /* ---------- история (отмена / вернуть) ---------- */
  function snap(data) {
    hist.length = hi + 1;
    hist.push({ img: data || cx.getImageData(0, 0, PW, PH), f: filled && page === 1 ? filled.slice() : null });
    if (hist.length > 20) hist.shift();
    hi = hist.length - 1; updHist();
  }
  function applyHist() {
    const h = hist[hi]; cx.putImageData(h.img, 0, 0);
    if (h.f && filled) { filled.set(h.f); allDone = false; drawNums(); updProg(); }
    updHist();
  }
  function undo() { if (busy || phase === 'trace' || hi <= 0) return; hi--; applyHist(); }
  function redo() { if (busy || phase === 'trace' || hi >= hist.length - 1) return; hi++; applyHist(); }
  function updHist() {
    if (!elUndo) return;
    elUndo.disabled = phase === 'trace' || hi <= 0;
    elRedo.disabled = phase === 'trace' || hi >= hist.length - 1;
  }

  /* ---------- страницы ---------- */
  function resetCanvases() {
    cx.clearRect(0, 0, PW, PH); cl.clearRect(0, 0, PW, PH); cs.clearRect(0, 0, PW, PH); cg.clearRect(0, 0, PW, PH); ct.clearRect(0, 0, PW, PH); cn.clearRect(0, 0, PW, PH);
    cvScr.style.transition = 'none'; cvScr.style.opacity = 1;
    hist = []; hi = -1; lineData = null; lab = null; regs = []; filled = null; allDone = false;
  }

  function setupPage1() {
    page = 1; phase = 'trace'; traceDone = false; doneCount = 0;
    sheet.classList.remove('p2'); resetCanvases(); setView(1);
    parts = makeParts(); computeVisibility(parts); buildMosaic(parts);
    decor = buildDecor(parts);
    grid.fill(0); redrawLines();
    palFree(); setTool('pencil'); setColor('#2f2f35');
    ui();
  }
  function setupPage2() {
    page = 2; phase = 'free';
    sheet.classList.add('p2'); resetCanvases(); parts = []; setView(1);
    snap();
    palFree(); setTool('pencil'); setColor('#2f2f35');
    ui();
  }

  function ui() {
    const trace = phase === 'trace';
    elTitle.textContent = page === 1 ? 'Страница 1' : 'Страница 2';
    elRail.classList.toggle('off', trace); elPal.classList.toggle('off', trace); elSize.classList.toggle('off', trace);
    const numMode = page === 1 && phase === 'color';
    Object.keys(elTools).forEach(k => elTools[k].classList.toggle('hid', (k === 'num' && !numMode) || (k === 'fill' && numMode)));
    elChip.style.display = (trace || numMode) ? '' : 'none';
    if (trace) {
      elChip.textContent = `обведено ${doneCount} / ${parts.length}`;
      elTip.textContent = 'Проведи пальцем по пунктиру — линия станет ровной';
      bA.classList.remove('hide'); bA.textContent = '✨ Обвести за меня'; bB.classList.add('hide');
      bC.textContent = 'Раскрашивать ›'; bC.disabled = !traceDone;
    } else if (phase === 'color') {
      elChip.textContent = `закрашено ${progDone()} / ${shownTotal}`;
      elTip.textContent = allDone ? 'Всё раскрашено — красота! ✨' : 'Выбери цвет и закрашивай области с такой же цифрой. Двумя пальцами — масштаб';
      bA.classList.add('hide'); bB.classList.remove('hide'); bB.textContent = '💾 Скачать';
      bC.textContent = 'Перевернуть страницу ›'; bC.disabled = false;
    } else {
      elTip.textContent = 'Нарисуй всё, что душа пожелает ✨';
      bA.classList.add('hide'); bB.classList.remove('hide'); bB.textContent = '💾 Скачать';
      bC.textContent = 'Готово ✓'; bC.disabled = false;
    }
    updHist(); updPrev(); sizeVis();
  }

  /* ---------- обводка: рисунок линий ---------- */
  function redrawLines() {
    cl.clearRect(0, 0, PW, PH);
    cl.drawImage(traceDone ? decor.full : decor.cut, 0, 0);
    cl.lineJoin = 'round'; cl.lineCap = 'round';
    for (const p of parts.slice().sort((a, b) => a.z - b.z)) {
      if (!p.done) continue;
      if (p.shape) { cl.globalCompositeOperation = 'destination-out'; cl.fill(p.shape); cl.globalCompositeOperation = 'source-over'; }
      cl.strokeStyle = INK; cl.lineWidth = 4.4; cl.stroke(p.vpath);
      if (p.extra) { cl.lineWidth = 3; cl.stroke(p.extra); }
      if (traceDone && p.mosaic) { cl.save(); cl.clip(p.shape); cl.lineWidth = 2.4; cl.stroke(p.mosaic); cl.restore(); }
    }
  }

  function stamp(x, y) {
    const gx = Math.round(x / 2), gy = Math.round(y / 2), R = 10;
    for (let dy = -R; dy <= R; dy++) {
      const yy = gy + dy; if (yy < 0 || yy >= GH) continue;
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const xx = gx + dx; if (xx < 0 || xx >= GW) continue;
        grid[yy * GW + xx] = 1;
      }
    }
  }
  function stampSeg(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 6));
    for (let i = 0; i <= n; i++) stamp(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n);
  }
  function checkParts() {
    let any = false;
    for (const p of parts) {
      if (p.done) continue;
      let hit = 0;
      for (const s of p.samples) { const gx = Math.round(s[0] / 2), gy = Math.round(s[1] / 2); if (grid[clamp(gy, 0, GH - 1) * GW + clamp(gx, 0, GW - 1)]) hit++; }
      p.cov = hit / p.samples.length;
      if (p.cov >= 0.8) { p.done = true; p.t = performance.now(); doneCount++; any = true; }
    }
    if (any) {
      redrawLines(); KAudio.play('pop');
      if (doneCount >= parts.length) finishTrace(); else ui();
    }
  }
  function finishTrace() {
    if (traceDone) return; traceDone = true;
    parts.forEach(p => { if (!p.done) { p.done = true; p.t = performance.now(); } });
    doneCount = parts.length; redrawLines();
    cvScr.style.transition = 'opacity .8s ease'; cvScr.style.opacity = 0;
    KAudio.play('chime');
    elChip.textContent = `обведено ${doneCount} / ${parts.length}`;
    elTip.textContent = 'Отлично! Панда готова ✨'; bC.disabled = false;
    setTimeout(() => { if (active && page === 1 && phase === 'trace') enterColor(); }, 1100);
  }

  /* ---------- раскраска по цифрам: области, цифры, заливка ---------- */
  function progDone() { let n = 0; for (const r of regs) if (r.show && filled[r.id]) n++; return n; }
  function updProg() {
    if (page !== 1 || phase !== 'color') return;
    elChip.textContent = `закрашено ${progDone()} / ${shownTotal}`;
    const left = {}; regs.forEach(r => { if (r.show && !filled[r.id]) left[r.num] = (left[r.num] || 0) + 1; });
    elPal.querySelectorAll('.nb-sw.num').forEach(b => b.classList.toggle('done', !left[+b.dataset.n]));
  }
  function buildRegions() {
    const N = PW * PH, ld = lineData.data, bar = new Uint8Array(N);
    for (let i = 0; i < N; i++) bar[i] = ld[i * 4 + 3] > 80 ? 1 : 0;
    // расстояние до линии (3-4 chamfer)
    const dt = new Uint16Array(N);
    for (let i = 0; i < N; i++) dt[i] = bar[i] ? 0 : 60000;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const i = y * PW + x; let v = dt[i]; if (!v) continue;
      if (x > 0) v = Math.min(v, dt[i - 1] + 3);
      if (y > 0) { v = Math.min(v, dt[i - PW] + 3); if (x > 0) v = Math.min(v, dt[i - PW - 1] + 4); if (x < PW - 1) v = Math.min(v, dt[i - PW + 1] + 4); }
      dt[i] = v;
    }
    for (let y = PH - 1; y >= 0; y--) for (let x = PW - 1; x >= 0; x--) {
      const i = y * PW + x; let v = dt[i]; if (!v) continue;
      if (x < PW - 1) v = Math.min(v, dt[i + 1] + 3);
      if (y < PH - 1) { v = Math.min(v, dt[i + PW] + 3); if (x < PW - 1) v = Math.min(v, dt[i + PW + 1] + 4); if (x > 0) v = Math.min(v, dt[i + PW - 1] + 4); }
      dt[i] = v;
    }
    lab = new Int32Array(N).fill(-1); regs = [];
    const q = new Int32Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (bar[s0] || lab[s0] >= 0) continue;
      const id = regs.length; let h = 0, t = 0; q[t++] = s0; lab[s0] = id;
      let best = s0, bd = dt[s0], x0 = PW, y0 = PH, x1 = 0, y1 = 0;
      while (h < t) {
        const i = q[h++], x = i % PW, y = (i / PW) | 0;
        if (dt[i] > bd) { bd = dt[i]; best = i; }
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !bar[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; q[t++] = i - 1; }
        if (x < PW - 1 && !bar[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; q[t++] = i + 1; }
        if (y > 0 && !bar[i - PW] && lab[i - PW] < 0) { lab[i - PW] = id; q[t++] = i - PW; }
        if (y < PH - 1 && !bar[i + PW] && lab[i + PW] < 0) { lab[i + PW] = id; q[t++] = i + PW; }
      }
      regs.push({ id, area: t, rx: best % PW, ry: (best / PW) | 0, r: bd / 3, x0, y0, x1, y1 });
    }
    // списки пикселей по областям
    rStart = new Int32Array(regs.length + 1);
    regs.forEach(r => { rStart[r.id + 1] = r.area; });
    for (let i = 0; i < regs.length; i++) rStart[i + 1] += rStart[i];
    const fillp = rStart.slice(0, regs.length); rIdx = new Int32Array(rStart[regs.length]);
    for (let i = 0; i < N; i++) { const l = lab[i]; if (l >= 0) rIdx[fillp[l]++] = i; }
    // цифры
    shownTotal = 0;
    regs.forEach(r => {
      r.num = numberAt(r.rx + 0.5, r.ry + 0.5, parts, decor.items);
      const two = r.num >= 10;
      r.show = r.r >= (two ? 5.2 : 3.2) && r.area >= 60;
      r.fs = Math.max(7, Math.min(15, r.r * (two ? 1.3 : 1.8)));
      if (r.show) shownTotal++;
    });
    filled = new Uint8Array(regs.length);
  }
  function drawNums() {
    cn.clearRect(0, 0, PW, PH);
    cn.textAlign = 'center'; cn.textBaseline = 'middle'; cn.fillStyle = 'rgba(74,54,40,.92)';
    for (const r of regs) {
      if (!r.show || filled[r.id]) continue;
      cn.font = `600 ${r.fs}px ui-sans-serif,system-ui,sans-serif`;
      cn.fillText(String(r.num), r.rx + 0.5, r.ry + 1);
    }
  }
  function enterColor() {
    cs.clearRect(0, 0, PW, PH); phase = 'color';
    lineData = cl.getImageData(0, 0, PW, PH);
    buildRegions(); drawNums();
    palNums(); setTool('num');
    snap(); ui(); updProg();
    setView(2.2, 330, 430);
  }
  function regionAt(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= PW || y >= PH) return -1;
    let l = lab[y * PW + x]; if (l >= 0) return l;
    for (let r = 1; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
      l = lab[ny * PW + nx]; if (l >= 0) return l;
    }
    return -1;
  }
  function paintRegion(id, d, rgb) {      // rgb=null → стереть
    const r = regs[id];
    for (let k = rStart[id]; k < rStart[id + 1]; k++) {
      const i = rIdx[k] * 4;
      if (rgb) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; } else d[i + 3] = 0;
    }
    if (rgb) {                            // подкрашиваем под линию — без светлых щелей
      for (let k = rStart[id]; k < rStart[id + 1]; k++) {
        const i = rIdx[k], x = i % PW;
        for (const j of [x > 0 ? i - 1 : -1, x < PW - 1 ? i + 1 : -1, i >= PW ? i - PW : -1, i < PW * (PH - 1) ? i + PW : -1])
          if (j >= 0 && lab[j] < 0 && d[j * 4 + 3] === 0) { d[j * 4] = rgb[0]; d[j * 4 + 1] = rgb[1]; d[j * 4 + 2] = rgb[2]; d[j * 4 + 3] = 255; }
      }
    }
    cx.putImageData(work, 0, 0, r.x0 - 2, r.y0 - 2, r.x1 - r.x0 + 5, r.y1 - r.y0 + 5);
  }
  let work = null;
  function numTouch(p) {
    const id = regionAt(p.x, p.y); if (id < 0) return;
    const r = regs[id];
    if (tool === 'eraser') {
      if (!filled[id]) return;
      paintRegion(id, work.data, null); filled[id] = 0; allDone = false; ptr.changed = true;
      drawNums(); updProg(); ui(); return;
    }
    if (filled[id]) return;
    if (r.num !== selNum) {
      const now = performance.now();
      if (now - tipT > 500) {
        tipT = now; KAudio.play('boing');
        elPal.classList.remove('shake'); void elPal.offsetWidth; elPal.classList.add('shake');
        elTip.textContent = `Тут цифра ${r.num} — выбери её в палитре`;
        const b = elPal.querySelector(`.nb-sw[data-n="${r.num}"]`); if (b) b.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    paintRegion(id, work.data, hex(NUMPAL[selNum])); filled[id] = 1; ptr.changed = true;
    if (Date.now() - lastSfx > 90) { lastSfx = Date.now(); KAudio.play('pencil'); }
    drawNums(); updProg();
    if (progDone() >= shownTotal) complete();
  }
  function complete() {
    if (allDone) return; allDone = true;
    // дорисуем мелкие кусочки, которые без цифры
    regs.forEach(r => { if (!filled[r.id]) { paintRegion(r.id, work.data, hex(NUMPAL[r.num] || '#ffffff')); filled[r.id] = 1; } });
    drawNums(); KAudio.play('chime'); ui(); updProg();
    elTip.textContent = 'Всё раскрашено — красота! ✨';
  }

  /* ---------- пунктир на отдельном слое ---------- */
  function guideFrame(now) {
    cg.clearRect(0, 0, PW, PH);
    if (phase === 'color' && page === 1 && tool === 'num' && regs.length && !busy) {
      const k = 0.5 + 0.5 * Math.sin(now / 220);
      cg.lineWidth = 2.5; cg.strokeStyle = `rgba(232,119,44,${0.35 + 0.55 * k})`;
      for (const r of regs) {
        if (!r.show || filled[r.id] || r.num !== selNum) continue;
        cg.beginPath(); cg.arc(r.rx + 0.5, r.ry + 0.5, Math.max(5, r.fs * 0.8) + k * 3, 0, Math.PI * 2); cg.stroke();
      }
      return;
    }
    if (phase !== 'trace' && !parts.some(p => p.t && now - p.t < 700)) return;
    cg.lineCap = 'round'; cg.lineJoin = 'round';
    cg.setLineDash([14, 11]); cg.lineDashOffset = -(now / 45) % 25;
    cg.strokeStyle = '#e3772c'; cg.lineWidth = 4;
    for (const p of parts) if (!p.done) cg.stroke(p.vpath);
    cg.setLineDash([]);
    for (const p of parts) {
      if (p.t && now - p.t < 700) {
        cg.strokeStyle = `rgba(255,196,90,${0.7 * (1 - (now - p.t) / 700)})`; cg.lineWidth = 16; cg.stroke(p.vpath);
      }
    }
  }

  /* ---------- ввод ---------- */
  const pos = e => { const r = sheet.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * PW, y: (e.clientY - r.top) / r.height * PH }; };

  function onDown(e) {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && active && !busy) { abortStroke(); startPinch(); return; }
    if (pts.size > 1) return;
    if (!active || busy || ptr || elModal.classList.contains('on')) return;
    const p = pos(e); e.preventDefault();
    if (phase === 'trace') {
      try { sheet.setPointerCapture(e.pointerId); } catch (x) {}
      ptr = { id: e.pointerId, last: p };
      cs.strokeStyle = 'rgba(42,28,20,.75)'; cs.lineWidth = 6; cs.lineCap = 'round'; cs.lineJoin = 'round';
      cs.beginPath(); cs.moveTo(p.x, p.y); cs.lineTo(p.x + .01, p.y); cs.stroke(); stamp(p.x, p.y);
      return;
    }
    if (page === 1 && (tool === 'num' || tool === 'eraser')) {
      try { sheet.setPointerCapture(e.pointerId); } catch (x) {}
      work = cx.getImageData(0, 0, PW, PH);
      ptr = { id: e.pointerId, last: p, mode: 'num', changed: false };
      numTouch(p); return;
    }
    if (tool === 'fill') { fillAt(p.x, p.y); return; }
    if (tool === 'text') { openText(p); return; }
    try { sheet.setPointerCapture(e.pointerId); } catch (x) {}
    ptr = { id: e.pointerId, last: p };
    beginStroke(p);
  }
  function onMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pin) { updatePinch(); return; }
    if (!ptr || e.pointerId !== ptr.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = pos(ev);
      if (ptr.mode === 'num') {
        const d = Math.hypot(p.x - ptr.last.x, p.y - ptr.last.y), n = Math.max(1, Math.ceil(d / 5));
        for (let i = 1; i <= n; i++) numTouch({ x: ptr.last.x + (p.x - ptr.last.x) * i / n, y: ptr.last.y + (p.y - ptr.last.y) * i / n });
        ptr.last = p; continue;
      }
      if (phase === 'trace') {
        cs.beginPath(); cs.moveTo(ptr.last.x, ptr.last.y); cs.lineTo(p.x, p.y); cs.stroke();
        stampSeg(ptr.last, p);
      } else strokeTo(ptr.last, p);
      ptr.last = p;
    }
    if (phase === 'trace') {
      const now = performance.now();
      if (now - lastCheck > 90) { lastCheck = now; checkParts(); }
    }
  }
  function onUp(e) {
    pts.delete(e.pointerId); if (pts.size < 2) pin = null;
    if (!ptr || e.pointerId !== ptr.id) return;
    if (ptr.mode === 'num') { const ch = ptr.changed; ptr = null; if (ch) snap(work); work = null; return; }
    ptr = null;
    if (phase === 'trace') { checkParts(); return; }
    endStroke();
  }

  /* ---------- кисти ---------- */
  function brushCfg() {
    if (tool === 'marker') return { w: size * 1.6 + 4, a: 0.5, blur: 0 };
    if (tool === 'brush') return { w: size * 1.2 + 2, a: 0.85, blur: 1 };
    if (tool === 'eraser') return { w: size * 2 + 6, a: 1, blur: 0 };
    return { w: size * 0.6 + 1, a: 0.95, blur: 0 };
  }
  function beginStroke(p) {
    const b = brushCfg();
    if (Date.now() - lastSfx > 160) { lastSfx = Date.now(); KAudio.play('pencil'); }
    if (tool === 'eraser') {
      cx.save(); cx.globalCompositeOperation = 'destination-out'; cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.lineWidth = b.w; cx.fillStyle = '#000'; cx.beginPath(); cx.arc(p.x, p.y, b.w / 2, 0, Math.PI * 2); cx.fill();
      return;
    }
    ct.clearRect(0, 0, PW, PH); cvTmp.style.opacity = b.a; tmpAlpha = b.a;
    ct.lineCap = 'round'; ct.lineJoin = 'round'; ct.lineWidth = b.w; ct.strokeStyle = color; ct.fillStyle = color;
    ct.shadowColor = b.blur ? color : 'transparent'; ct.shadowBlur = b.blur ? b.w * 0.7 : 0;
    ct.beginPath(); ct.arc(p.x, p.y, b.w / 2, 0, Math.PI * 2); ct.fill();
  }
  function strokeTo(a, b2) {
    if (tool === 'eraser') { cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b2.x, b2.y); cx.stroke(); return; }
    ct.beginPath(); ct.moveTo(a.x, a.y); ct.lineTo(b2.x, b2.y); ct.stroke();
  }
  function endStroke() {
    if (tool === 'eraser') { cx.restore(); snap(); return; }
    cx.save(); cx.globalAlpha = tmpAlpha; cx.drawImage(cvTmp, 0, 0); cx.restore();
    ct.clearRect(0, 0, PW, PH); ct.shadowBlur = 0; cvTmp.style.opacity = 1;
    snap();
  }

  /* ---------- заливка ---------- */
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function fillAt(px, py) {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const cd = cx.getImageData(0, 0, PW, PH), d = cd.data, rgb = hex(color);
    let isBar;
    if (page === 1 && lineData) { const ld = lineData.data; isBar = i => ld[i * 4 + 3] > 80; }
    else {
      const si = y * PW + x, r0 = d[si * 4], g0 = d[si * 4 + 1], b0 = d[si * 4 + 2], a0 = d[si * 4 + 3];
      if (a0 > 250 && Math.abs(r0 - rgb[0]) + Math.abs(g0 - rgb[1]) + Math.abs(b0 - rgb[2]) < 6) return;
      isBar = i => Math.abs(d[i * 4] - r0) + Math.abs(d[i * 4 + 1] - g0) + Math.abs(d[i * 4 + 2] - b0) + Math.abs(d[i * 4 + 3] - a0) > 140;
    }
    let sx = x, sy = y;
    if (isBar(sy * PW + sx)) {          // попали на линию — ищем ближайшую область рядом
      let found = false;
      for (let r = 1; r <= 7 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
        if (!isBar(ny * PW + nx)) { sx = nx; sy = ny; found = true; break; }
      }
      if (!found) return;
    }
    const seen = new Uint8Array(PW * PH), region = [], stack = [sx, sy];
    while (stack.length) {
      const cy = stack.pop(), cxx = stack.pop(), row = cy * PW;
      if (seen[row + cxx] || isBar(row + cxx)) continue;
      let x1 = cxx, x2 = cxx;
      while (x1 > 0 && !seen[row + x1 - 1] && !isBar(row + x1 - 1)) x1--;
      while (x2 < PW - 1 && !seen[row + x2 + 1] && !isBar(row + x2 + 1)) x2++;
      for (let xx = x1; xx <= x2; xx++) { seen[row + xx] = 1; region.push(row + xx); }
      for (const ny of [cy - 1, cy + 1]) {
        if (ny < 0 || ny >= PH) continue;
        const nr = ny * PW; let inRun = false;
        for (let xx = x1; xx <= x2; xx++) {
          const ok = !seen[nr + xx] && !isBar(nr + xx);
          if (ok && !inRun) { stack.push(xx, ny); inRun = true; } else if (!ok) inRun = false;
        }
      }
    }
    const paint = i => { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255; };
    for (const i of region) paint(i);
    if (page === 1) {                    // подкрашиваем под линию, чтобы не было светлых щелей
      for (let k = 0; k < region.length; k++) {
        const i = region[k], xx = i % PW, yy = (i / PW) | 0;
        for (const j of [xx > 0 ? i - 1 : -1, xx < PW - 1 ? i + 1 : -1, yy > 0 ? i - PW : -1, yy < PH - 1 ? i + PW : -1]) if (j >= 0 && !seen[j]) paint(j);
      }
    }
    cx.putImageData(cd, 0, 0); snap(cd); KAudio.play('pop');
  }

  /* ---------- текст ---------- */
  function openText(p) { textAt = p; elTxt.value = ''; elModal.classList.add('on'); setTimeout(() => elTxt.focus(), 80); }
  function closeText() { elModal.classList.remove('on'); elTxt.blur(); textAt = null; }
  function addText() {
    const s = elTxt.value.trim();
    if (s && textAt) {
      const fs = Math.round(size * 2 + 22);
      cx.save();
      cx.font = `${fs}px "Bradley Hand","Noteworthy","Segoe Print","Comic Sans MS",cursive`;
      cx.fillStyle = color; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(s, clamp(textAt.x, 20, PW - 20), textAt.y, PW - 40);
      cx.restore(); snap(); KAudio.play('pop');
    }
    closeText();
  }

  /* ---------- кнопки действий ---------- */
  function onA() {                       // обвести за меня
    if (phase !== 'trace' || traceDone) return;
    KAudio.play('tap');
    const left = parts.filter(p => !p.done);
    left.forEach((p, i) => setTimeout(() => {
      if (!active || page !== 1 || p.done) return;
      p.done = true; p.t = performance.now(); doneCount++; redrawLines(); KAudio.play('pop'); ui();
      if (doneCount >= parts.length) finishTrace();
    }, 70 * i));
  }
  function onB() { if (!busy) download(); }
  function onC() {
    if (busy) return;
    KAudio.play('tap');
    if (phase === 'trace') { if (traceDone) enterColor(); return; }
    if (phase === 'color') { flip(); return; }
    done();
  }
  function done() { const f = cb; stop(); if (f) f(); }

  function composite() {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const x = c.getContext('2d');
    x.fillStyle = page === 1 ? '#fffdf7' : '#fffaf0'; x.fillRect(0, 0, PW, PH);
    if (page === 2) {
      x.fillStyle = 'rgba(120,100,80,.28)';
      for (let yy = 13; yy < PH; yy += 26) for (let xx = 13; xx < PW; xx += 26) { x.beginPath(); x.arc(xx, yy, 1.4, 0, Math.PI * 2); x.fill(); }
    }
    x.drawImage(cvColor, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.drawImage(cvLine, 0, 0);
    return c;
  }
  async function download() {
    const name = page === 1 ? 'panda-korzhik.png' : 'risunok-korzhika.png';
    const c = composite();
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) return;
    try {
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- переворот страницы ---------- */
  function flip() {
    busy = true; KAudio.play('page'); setView(1);
    const url = composite().toDataURL('image/png');
    const f = document.createElement('div'); f.className = 'nb-flip';
    f.style.left = sheet.offsetLeft + 'px'; f.style.top = sheet.offsetTop + 'px';
    f.style.width = sheet.offsetWidth + 'px'; f.style.height = sheet.offsetHeight + 'px';
    f.innerHTML = `<div class="ff" style="background-image:url('${url}')"></div><div class="fb"></div>`;
    wrap.appendChild(f);
    setupPage2();
    void f.offsetWidth; f.classList.add('go');
    setTimeout(() => { f.remove(); busy = false; }, 1050);
  }

  /* ---------- запуск / остановка ---------- */
  function loop(now) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    guideFrame(now);
  }

  function start(name, onDone) {
    if (name !== 'draw') { if (onDone) onDone(); return; }
    build(); stop();
    cb = onDone; busy = false; ptr = null; pts.clear(); pin = null;
    setupPage1();
    active = true; root.classList.add('on');
    layout(); requestAnimationFrame(layout);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    active = false; cancelAnimationFrame(raf); clearTimeout(repeat);
    cb = null; ptr = null;
    if (root) { root.classList.remove('on'); elModal.classList.remove('on'); }
  }

  return { start, stop, get active() { return active; }, _dbg: { regs: () => regs.filter(r => r.show).map(r => [r.rx, r.ry, r.num, r.id]), pick: n => pickNum(n, true), tap: (x, y) => { work = cx.getImageData(0, 0, PW, PH); ptr = { changed: false }; numTouch({ x, y }); const c = ptr.changed; ptr = null; if (c) snap(work); work = null; }, filled: () => progDone() }, _test: { makeParts, computeVisibility, buildDecor, PW, PH } };
})();