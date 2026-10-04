/* minigame.js — мини-игра «Собери перья в корзину».
   Подключается между audio.js и game.js. Ничего, кроме этого файла, внутри не нужно:
   стили и разметка создаются сами, картинок и звуков докладывать не надо.

   Механика:
   • перья медленно падают и ложатся на пол — подцепи любое пальцем и перенеси в корзину;
   • перо «пушистое»: когда тащишь одно, соседние отлетают в стороны;
   • иногда из-под двери дует сквозняк (сперва предупреждение!) — лежащие перья взлетают и сдувает;
     перо в пальцах ветер не уносит;
   • когда собрано 6 перьев, прилетает золотое — оно озорное и всё время подпрыгивает.
*/
const KMini = (() => {
  'use strict';

  const TOTAL = 9, NORMAL = 8;          // 8 обычных перьев + 1 золотое
  const PAL = [['#c3c8d1', '#858d9b'], ['#f2efe9', '#c2c7d2'], ['#aeb9d0', '#6c7a98']];
  const GOLD = ['#ffe6a8', '#e6933f'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const CSS = `
  #mg{position:absolute;inset:0;z-index:18;opacity:0;pointer-events:none;transition:opacity .6s ease}
  #mg.on{opacity:1;pointer-events:auto}
  #mg canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;
    -webkit-user-select:none;user-select:none}
  .mg-dim{position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(180deg,rgba(10,7,5,.3),rgba(10,7,5,.5) 60%,rgba(10,7,5,.78))}
  .mg-hud{position:absolute;left:0;right:0;top:calc(var(--st) + 62px);display:flex;flex-direction:column;
    align-items:center;gap:8px;pointer-events:none}
  .mg-count{padding:8px 18px;border-radius:20px;font-size:20px;font-weight:600;color:#f7dcb4;
    background:rgba(22,15,11,.7);border:1px solid rgba(242,179,107,.35);
    backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-variant-numeric:tabular-nums}
  .mg-count.pop{animation:mgpop .4s ease}
  @keyframes mgpop{40%{transform:scale(1.18)}}
  .mg-hint{min-height:22px;font-size:16px;font-style:italic;color:#f3e7d4;text-shadow:0 2px 10px #000;
    opacity:0;transition:opacity .4s;text-align:center;padding:0 24px}
  .mg-hint.on{opacity:.95}
  .mg-wind{padding:6px 14px;border-radius:16px;font-size:15px;color:#2a170a;background:#f2b36b;
    opacity:0;transform:translateY(-6px);transition:all .3s}
  .mg-wind.on{opacity:1;transform:none;animation:mgshake .3s linear infinite}
  @keyframes mgshake{50%{transform:translateX(3px)}}
  .mg-skip{pointer-events:auto;min-height:38px!important;font-size:14px!important;display:none}
  .mg-skip.on{display:block}
  .mg-end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:12px;text-align:center;padding:0 34px;opacity:0;pointer-events:none;transition:opacity .7s ease;
    background:radial-gradient(100% 70% at 50% 45%,rgba(26,18,14,.82),rgba(10,7,5,.95))}
  .mg-end.show{opacity:1;pointer-events:auto}
  .mg-k{font-size:17px;font-style:italic;color:#f2b36b}
  .mg-t{font-size:34px;font-weight:600;line-height:1.12;color:#f7dcb4;text-shadow:0 4px 30px rgba(240,150,60,.3)}
  .mg-stars{font-size:38px;letter-spacing:.15em;color:#f2b36b;margin:4px 0}
  .mg-s{font-size:16px;font-style:italic;color:#b9a78d;margin-bottom:14px}
  `;

  let root, cv, g, elCount, elHint, elWind, elSkip, elEnd, built = false;
  let active = false, ended = false, raf = 0, last = 0, T = 0;
  let W = 0, H = 0, dpr = 1, ST = 0, SB = 0, basket = {}, zone = {};
  let feathers = [], parts = [], hold = null, count = 0, bump = 0, glow = 0, goldenOut = false;
  let gust = null, gustId = 0, nextGust = 0, hintT = 0, endT = 0, skipShown = false, cb = null, grabbed = false;

  /* ---------- разметка ---------- */
  function build() {
    if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'mg';
    root.innerHTML =
      '<div class="mg-dim"></div><canvas></canvas>' +
      '<div class="mg-hud"><div class="mg-count"></div><div class="mg-hint"></div><div class="mg-wind"></div>' +
      '<button class="mg-skip btn ghost">Пропустить</button></div>' +
      '<div class="mg-end"><div class="mg-k">Готово!</div><div class="mg-t">Все перья<br>в корзине</div>' +
      '<div class="mg-stars"></div><div class="mg-s"></div><button class="btn primary mg-go">Дальше</button></div>';
    document.getElementById('screen-game').appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    elCount = root.querySelector('.mg-count'); elHint = root.querySelector('.mg-hint');
    elWind = root.querySelector('.mg-wind'); elSkip = root.querySelector('.mg-skip');
    elEnd = root.querySelector('.mg-end');

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    elSkip.addEventListener('click', () => done());
    root.querySelector('.mg-go').addEventListener('click', () => done());
    window.addEventListener('resize', () => { if (active) { resize(); } });
  }

  function readInsets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:absolute;visibility:hidden;padding-top:var(--st);padding-bottom:var(--sb)';
    root.appendChild(p);
    const cs = getComputedStyle(p);
    ST = parseFloat(cs.paddingTop) || 0; SB = parseFloat(cs.paddingBottom) || 0;
    p.remove();
  }

  function resize() {
    readInsets();
    const r = root.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const bw = Math.min(190, W * 0.52);
    basket = { x: W / 2, w: bw, h: 96, y: H - SB - 34 - 96 };
    zone = { x0: 32, x1: W - 32, y0: ST + 160, y1: basket.y - 56 };
    for (const f of feathers) {
      f.x = clamp(f.x, zone.x0, zone.x1);
      if (f.gy != null) f.gy = clamp(f.gy, zone.y0, zone.y1);
    }
  }

  /* ---------- подсказки / счётчик ---------- */
  function setCount() {
    elCount.textContent = `🪶 ${count} / ${TOTAL}`;
    elCount.classList.remove('pop'); void elCount.offsetWidth; elCount.classList.add('pop');
  }
  function setHint(t, ms) {
    clearTimeout(hintT);
    elHint.textContent = t || ''; elHint.classList.toggle('on', !!t);
    if (ms) hintT = setTimeout(() => elHint.classList.remove('on'), ms);
  }
  function setWind(on, dir) {
    elWind.textContent = dir < 0 ? '← 🍃 Сквозняк!' : '🍃 Сквозняк! →';
    elWind.classList.toggle('on', on);
  }

  /* ---------- перья ---------- */
  function mk(i, golden) {
    return {
      golden, type: golden ? 3 : i % 3,
      x: rnd(zone.x0, zone.x1), y: golden ? -50 : -50 - i * 85,
      gy: rnd(zone.y0, zone.y1), vx: 0, vy: 0,
      rot: rnd(-2.6, 2.6), sw: 0, sc: 1, ph: rnd(0, 6.28), sus: rnd(0.7, 1.2),
      size: golden ? 56 : rnd(44, 52), st: 'air', gid: 0, hop: 0
    };
  }

  function start(name, onDone) {
    if (name !== 'feathers') { if (onDone) onDone(); return; }
    build(); stop();
    cb = onDone; resize();
    feathers = []; parts = []; hold = null; count = 0; bump = 0; glow = 0; goldenOut = false;
    gust = null; nextGust = 7; skipShown = false; grabbed = false; ended = false; T = 0;
    for (let i = 0; i < NORMAL; i++) feathers.push(mk(i, false));
    elSkip.classList.remove('on'); elEnd.classList.remove('show'); setWind(false, 1);
    setCount(); setHint('Перетащи перья в корзину');
    active = true; last = performance.now();
    root.classList.add('on');
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    active = false; cancelAnimationFrame(raf); clearTimeout(endT); clearTimeout(hintT);
    hold = null; cb = null;
    if (root) { root.classList.remove('on'); elEnd.classList.remove('show'); }
  }

  function done() {
    const f = cb; stop();
    if (f) f();
  }

  /* ---------- ввод ---------- */
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onDown(e) {
    if (!active || ended || hold) return;
    const p = pos(e); let best = null, bd = 58;
    for (const f of feathers) {
      if (f.st !== 'floor' && f.st !== 'air') continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    hold = { f: best, id: e.pointerId, x: p.x, y: p.y };
    best.st = 'held'; best.vx = 0; best.vy = 0;
    KAudio.play('rustle');
    if (!grabbed) { grabbed = true; setHint('', 0); }
    e.preventDefault();
  }
  function onMove(e) {
    if (!hold || e.pointerId !== hold.id) return;
    const p = pos(e); hold.x = p.x; hold.y = p.y;
  }
  function onUp(e) {
    if (!hold || (e && e.pointerId !== hold.id)) return;
    const f = hold.f; hold = null;
    if (inMouth(f)) collect(f);
    else {
      f.st = 'air'; f.vx = clamp(f.vx * 0.25, -140, 140); f.vy = 0;
      f.gy = clamp(f.y + rnd(30, 80), zone.y0, zone.y1);
    }
  }
  const inMouth = f => Math.abs(f.x - basket.x) < basket.w / 2 + 14 && f.y > basket.y - 80 && f.y < basket.y + 50;

  function collect(f) {
    f.st = 'in'; f.t0 = T; f.fx = f.x; f.fy = f.y;
    f.tx = basket.x + rnd(-basket.w * 0.27, basket.w * 0.27); f.ty = basket.y + 4; f.irot = rnd(-0.45, 0.45);
    count++; bump = 1; setCount();
    sparkle(basket.x, basket.y + 6, f.golden);
    KAudio.play(f.golden ? 'chime' : 'jar');
    if (count === 6 && !goldenOut) {
      goldenOut = true; feathers.push(mk(99, true));
      setHint('Золотое перо! Оно озорное — лови!', 3600);
    }
    if (count >= TOTAL) { ended = true; endT = setTimeout(showEnd, 800); }
  }

  function showEnd() {
    const sec = Math.round(T), n = sec <= 45 ? 3 : sec <= 75 ? 2 : 1;
    elEnd.querySelector('.mg-stars').textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
    elEnd.querySelector('.mg-s').textContent = `собрано за ${sec} с`;
    elEnd.classList.add('show');
    KAudio.play('chime'); KAudio.setMood('happy');
  }

  function sparkle(x, y, gold) {
    for (let i = 0; i < (gold ? 22 : 10); i++) {
      const a = rnd(-Math.PI, 0), v = rnd(60, 180);
      parts.push({ x: x + rnd(-30, 30), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 0.9), max: 0.9,
        r: rnd(1.5, 3.5), c: gold ? '255,214,130' : '255,226,176' });
    }
  }

  /* ---------- физика ---------- */
  function loop(now) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    update(dt); draw();
  }

  function update(dt) {
    // сквозняк
    if (!ended) {
      if (!gust && T >= nextGust && T > 4) {
        gust = { ph: 'warn', t0: T, dir: Math.random() < 0.5 ? -1 : 1, p: 0, id: ++gustId };
        setWind(true, gust.dir);
      }
      if (gust) {
        const el = T - gust.t0;
        if (gust.ph === 'warn' && el >= 1.1) { gust.ph = 'blow'; gust.t0 = T; KAudio.play('whoosh'); }
        else if (gust.ph === 'blow') {
          gust.p = Math.min(1, el / 1.6);
          if (el >= 1.6) { gust = null; nextGust = T + rnd(5, 8); setWind(false, 1); }
        }
      }
    }
    const s = gust && gust.ph === 'blow' ? Math.sin(Math.PI * gust.p) : 0;

    for (const f of feathers) {
      const tsc = f.st === 'held' ? 1.22 : (f.st === 'in' || f.st === 'basket') ? 0.9 : 1;
      f.sc += (tsc - f.sc) * Math.min(1, dt * 12);

      if (f.st === 'held') {
        const tx = clamp(hold.x, 12, W - 12), ty = hold.y - 34;
        const dx = tx - f.x, dy = ty - f.y, k = Math.min(1, dt * 18);
        f.vx = dx * 18; f.x += dx * k; f.y += dy * k;
        f.rot += (clamp(f.vx * 0.0035, -0.9, 0.9) - f.rot) * Math.min(1, dt * 8);
        f.sw += (Math.sin(T * 9) * 0.06 - f.sw) * Math.min(1, dt * 10);
        for (const o of feathers) {          // пушистость: соседние перья разлетаются
          if (o === f || (o.st !== 'floor' && o.st !== 'air')) continue;
          const ox = o.x - f.x, oy = o.y - f.y, d = Math.hypot(ox, oy);
          if (d < 40 && d > 0.1) { o.vx += ox / d * 240 * dt; o.gy = clamp(o.gy + oy / d * 80 * dt, zone.y0, zone.y1); }
        }
        continue;
      }
      if (f.st === 'in') {
        const p = Math.min(1, (T - f.t0) / 0.45), e = 1 - Math.pow(1 - p, 3);
        f.x = f.fx + (f.tx - f.fx) * e; f.y = f.fy + (f.ty - f.fy) * e;
        f.rot += (f.irot - f.rot) * Math.min(1, dt * 10); f.sw *= 0.9;
        if (p >= 1) f.st = 'basket';
        continue;
      }
      if (f.st === 'basket') continue;

      const lift = f.golden ? 1.6 : 1;
      if (s > 0) {
        f.vx += gust.dir * 340 * s * lift * f.sus * dt;
        if (f.st === 'floor' && s > 0.35 && f.gid !== gust.id) {
          f.gid = gust.id; f.st = 'air'; f.vy = -80 * lift; f.gy = clamp(f.y + rnd(-25, 35), zone.y0, zone.y1);
        }
      }
      if (f.st === 'air') {
        f.vy += (95 - f.vy) * Math.min(1, dt * 3);
        f.vx *= Math.exp(-1.2 * dt);
        f.x += (f.vx + Math.sin(T * 1.7 + f.ph) * 38) * dt;
        f.y += f.vy * dt;
        f.sw += (Math.sin(T * 2.2 + f.ph) * 0.5 - f.sw) * Math.min(1, dt * 6);
        if (f.y >= f.gy && f.vy > 0) { f.st = 'floor'; f.vy = 0; f.vx *= 0.4; if (f.golden) f.hop = T + rnd(1.2, 2); }
      } else {
        f.x += f.vx * dt; f.vx *= Math.exp(-4 * dt);
        f.y += (f.gy - f.y) * Math.min(1, dt * 8);
        f.sw += (0 - f.sw) * Math.min(1, dt * 8);
        if (f.golden && T > f.hop) {         // золотое перо озорничает
          f.st = 'air'; f.vy = -110; f.vx = rnd(-120, 120); f.gy = clamp(f.y + rnd(-50, 50), zone.y0, zone.y1);
        }
      }
      if (f.x < zone.x0) { f.x = zone.x0; f.vx = Math.abs(f.vx) * 0.5; }
      else if (f.x > zone.x1) { f.x = zone.x1; f.vx = -Math.abs(f.vx) * 0.5; }
    }

    const near = hold && inMouth(hold.f);
    glow += ((near ? 1 : 0) - glow) * Math.min(1, dt * 10);
    bump = Math.max(0, bump - dt * 3);
    for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; }
    parts = parts.filter(p => p.life > 0);

    if (!skipShown && !ended && T > 60) { skipShown = true; elSkip.classList.add('on'); }
  }

  /* ---------- рисование ---------- */
  function drawFeather(f, shadow) {
    const sc = f.size / 52 * f.sc, ang = f.rot + f.sw;
    const ox = shadow ? (f.st === 'held' ? 7 : f.st === 'air' ? 6 : 3) : 0;
    const oy = shadow ? (f.st === 'held' ? 32 : f.st === 'air' ? 16 : 5) : 0;
    g.save();
    g.translate(f.x + ox, f.y + oy); g.rotate(ang); g.scale(sc, sc);
    g.beginPath();
    g.moveTo(0, 26);
    g.bezierCurveTo(-14, 14, -16, -10, 0, -28);
    g.bezierCurveTo(15, -10, 14, 12, 0, 26);
    g.closePath();
    if (shadow) {
      g.fillStyle = f.st === 'held' ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.28)'; g.fill();
    } else {
      const c = f.golden ? GOLD : PAL[f.type];
      const gr = g.createLinearGradient(-14, 0, 14, 0);
      gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
      if (f.golden) { g.shadowColor = 'rgba(255,190,90,.9)'; g.shadowBlur = 16 + 6 * Math.sin(T * 4); }
      g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 1; g.strokeStyle = 'rgba(40,25,15,.5)'; g.stroke();
      // стержень и бородки
      g.strokeStyle = 'rgba(60,40,25,.65)'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 34); g.lineTo(0, -24); g.stroke();
      g.strokeStyle = 'rgba(60,40,25,.28)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = -18 + k * 7, w = 10 - Math.abs(k - 2.5) * 1.2;
        g.beginPath(); g.moveTo(0, y); g.lineTo(-w, y - 6); g.moveTo(0, y); g.lineTo(w, y - 6); g.stroke();
      }
    }
    g.restore();
  }

  function drawBasket() {
    const cx = basket.x, by = basket.y, bw = basket.w, bh = basket.h, rx = bw / 2, ry = 15, my = by + 10;
    g.save();
    g.translate(cx, by + bh); g.scale(1 + 0.05 * bump, 1 - 0.07 * bump); g.translate(-cx, -(by + bh));

    const gl = g.createRadialGradient(cx, my, 4, cx, my, rx + 40);
    gl.addColorStop(0, `rgba(255,200,120,${0.1 + 0.5 * glow})`); gl.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gl; g.fillRect(cx - rx - 50, my - 100, bw + 100, 170);

    g.fillStyle = '#1d1109'; g.beginPath(); g.ellipse(cx, my, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#c98b4a';
    g.beginPath(); g.ellipse(cx, my, rx, ry, 0, Math.PI, Math.PI * 2); g.stroke();

    for (const f of feathers) if (f.st === 'basket') drawFeather(f, false);

    const l = cx - bw * 0.42, r = cx + bw * 0.42;
    g.beginPath();
    g.moveTo(cx + rx, my); g.ellipse(cx, my, rx, ry, 0, 0, Math.PI, false);
    g.lineTo(l, by + bh - 12); g.quadraticCurveTo(l, by + bh, l + 14, by + bh);
    g.lineTo(r - 14, by + bh); g.quadraticCurveTo(r, by + bh, r, by + bh - 12);
    g.closePath();
    const bg = g.createLinearGradient(0, by, 0, by + bh);
    bg.addColorStop(0, '#cc9150'); bg.addColorStop(1, '#85502a');
    g.fillStyle = bg; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(70,38,12,.5)'; g.lineWidth = 2.5;
    for (let yy = by + 24; yy < by + bh; yy += 13) {
      g.beginPath(); g.moveTo(cx - rx, yy); g.quadraticCurveTo(cx, yy + 9, cx + rx, yy); g.stroke();
    }
    g.strokeStyle = 'rgba(255,220,160,.2)'; g.lineWidth = 2;
    for (let xx = cx - rx; xx <= cx + rx; xx += 17) {
      g.beginPath(); g.moveTo(xx, my); g.lineTo(xx + (xx - cx) * 0.12, by + bh); g.stroke();
    }
    g.restore();
    g.lineWidth = 2; g.strokeStyle = 'rgba(40,20,8,.55)'; g.stroke();

    g.lineWidth = 7; g.strokeStyle = '#e2a860';
    g.beginPath(); g.ellipse(cx, my, rx, ry, 0, 0, Math.PI); g.stroke();
    g.restore();
  }

  function drawWind() {
    if (!gust || gust.ph !== 'blow') return;
    const s = Math.sin(Math.PI * gust.p);
    g.strokeStyle = `rgba(255,226,176,${0.24 * s})`; g.lineWidth = 2; g.lineCap = 'round';
    const span = W + 160, hh = Math.max(40, zone.y1 - zone.y0);
    for (let i = 0; i < 12; i++) {
      const y = zone.y0 + (i * 67) % hh;
      const x0 = (((T * 700 * gust.dir + i * 173) % span) + span) % span - 80;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + gust.dir * 70, y + (i % 3 - 1) * 6); g.stroke();
    }
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    drawWind();
    for (const f of feathers) if (f.st !== 'basket' && f.st !== 'in') drawFeather(f, true);
    feathers.filter(f => f.st === 'floor' || f.st === 'air').sort((a, b) => a.y - b.y).forEach(f => drawFeather(f, false));
    drawBasket();
    for (const f of feathers) if (f.st === 'in') drawFeather(f, false);
    for (const f of feathers) if (f.st === 'held') drawFeather(f, false);
    for (const p of parts) {
      g.fillStyle = `rgba(${p.c},${clamp(p.life / p.max, 0, 1)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }

  return { start, stop, get active() { return active; } };
})();
