/* minigame.js — мини-игра «Лови перья корзиной».
   Подключается между audio.js и game.js. Стили и разметка создаются сами,
   картинки и звуки докладывать не надо.

   Механика:
   • перья сыплются сверху — води корзину пальцем влево-вправо и лови их;
   • упущенное перо не пропадает насовсем: оно прилетит снова, поймать надо все 9;
   • иногда из-под двери дует сквозняк (сперва предупреждение!) — он сдувает падающие перья в сторону;
   • последнее — золотое перо: быстрое и вертлявое, летит в одиночку.
*/
const KMini = (() => {
  'use strict';

  const TOTAL = 9, NORMAL = 8;          // 8 обычных перьев + 1 золотое
  const MAX_FLY = 3;                    // сколько перьев одновременно в полёте
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
  let W = 0, H = 0, dpr = 1, ST = 0, SB = 0, basket = { x: 0, tx: 0, vel: 0, tilt: 0 }, zone = {};
  let feathers = [], parts = [], queue = [], ptr = null, count = 0, misses = 0, bump = 0, glow = 0;
  let gust = null, gustId = 0, nextGust = 0, nextSpawn = 0, hintT = 0, endT = 0;
  let skipShown = false, cb = null, moved = false;

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
    window.addEventListener('resize', () => { if (active) resize(); });
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
    basket.w = Math.min(170, W * 0.46); basket.h = 96; basket.y = H - SB - 34 - 96;
    if (!basket.x) basket.x = basket.tx = W / 2;
    basket.x = clamp(basket.x, basket.w / 2 + 6, W - basket.w / 2 - 6);
    basket.tx = clamp(basket.tx, basket.w / 2 + 6, W - basket.w / 2 - 6);
    zone = { x0: 32, x1: W - 32, y0: ST + 160, y1: basket.y };
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
  function mk(golden) {
    return {
      golden, type: golden ? 3 : (Math.random() * 3) | 0,
      x: rnd(zone.x0, zone.x1), y: -40, py: -40, vx: 0,
      rot: rnd(-0.8, 0.8), sw: 0, sc: 1, ph: rnd(0, 6.28), sus: rnd(0.8, 1.2),
      size: golden ? 56 : rnd(44, 52), st: 'fall',
      amp: golden ? 115 : rnd(35, 70), freq: golden ? 3.2 : rnd(1.3, 2.1),
      vyBase: golden ? 215 : rnd(135, 175)
    };
  }

  function start(name, onDone) {
    if (name !== 'feathers') { if (onDone) onDone(); return; }
    build(); stop();
    cb = onDone; basket.x = 0; resize();
    feathers = []; parts = []; ptr = null; count = 0; misses = 0; bump = 0; glow = 0;
    queue = []; for (let i = 0; i < NORMAL; i++) queue.push(false); queue.push(true);
    gust = null; nextGust = 7; nextSpawn = 1.2; skipShown = false; moved = false; ended = false; T = 0;
    basket.vel = 0; basket.tilt = 0;
    elSkip.classList.remove('on'); elEnd.classList.remove('show'); setWind(false, 1);
    setCount(); setHint('Води корзину пальцем — лови перья');
    active = true; last = performance.now();
    root.classList.add('on');
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    active = false; cancelAnimationFrame(raf); clearTimeout(endT); clearTimeout(hintT);
    ptr = null; cb = null;
    if (root) { root.classList.remove('on'); elEnd.classList.remove('show'); }
  }

  function done() {
    const f = cb; stop();
    if (f) f();
  }

  /* ---------- ввод: корзина едет за пальцем ---------- */
  const px = e => { const r = cv.getBoundingClientRect(); return e.clientX - r.left; };
  const aim = x => { basket.tx = clamp(x, basket.w / 2 + 6, W - basket.w / 2 - 6); };

  function onDown(e) {
    if (!active || ended) return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    ptr = { id: e.pointerId }; aim(px(e));
    if (!moved) { moved = true; setHint('', 0); }
    e.preventDefault();
  }
  function onMove(e) { if (ptr && e.pointerId === ptr.id) aim(px(e)); }
  function onUp(e) { if (ptr && e.pointerId === ptr.id) ptr = null; }

  /* ---------- поймали / упустили ---------- */
  function caught(f) {
    f.st = 'in'; f.t0 = T; f.fox = f.x - basket.x; f.fy = f.y;
    f.ox = rnd(-basket.w * 0.25, basket.w * 0.25); f.oy = rnd(0, 6); f.irot = rnd(-0.45, 0.45);
    count++; bump = 1; setCount();
    sparkle(f.x, basket.y + 6, f.golden);
    KAudio.play(f.golden ? 'chime' : 'jar');
    if (count >= TOTAL) { ended = true; endT = setTimeout(showEnd, 800); }
  }

  function missed(f) {
    misses++;
    queue.unshift(f.golden);             // перо прилетит снова
    nextSpawn = Math.max(nextSpawn, T + 0.7);
    for (let i = 0; i < 5; i++)
      parts.push({ x: f.x + rnd(-14, 14), y: H - SB - 8, vx: rnd(-40, 40), vy: rnd(-90, -30), life: 0.5, max: 0.5, r: rnd(1.5, 2.5), c: '185,167,141' });
    feathers.splice(feathers.indexOf(f), 1);
  }

  function showEnd() {
    const n = misses === 0 ? 3 : misses <= 3 ? 2 : 1;
    elEnd.querySelector('.mg-stars').textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
    elEnd.querySelector('.mg-s').textContent = misses === 0 ? 'без единого промаха' : `промахов: ${misses}`;
    elEnd.classList.add('show');
    KAudio.play('chime'); KAudio.setMood('happy');
  }

  function sparkle(x, y, gold) {
    for (let i = 0; i < (gold ? 22 : 10); i++) {
      const a = rnd(-Math.PI, 0), v = rnd(60, 180);
      parts.push({ x: x + rnd(-20, 20), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.5, 0.9), max: 0.9,
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
    // корзина плавно едет за пальцем
    const dx = basket.tx - basket.x, step = clamp(dx * Math.min(1, dt * 14), -1500 * dt, 1500 * dt);
    basket.x += step;
    basket.vel += (step / dt - basket.vel) * Math.min(1, dt * 12);
    basket.tilt = clamp(basket.vel * 0.00028, -0.22, 0.22);

    // сквозняк
    if (!ended) {
      if (!gust && T >= nextGust) {
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

    // новые перья
    if (!ended && queue.length && T >= nextSpawn) {
      const fly = feathers.filter(f => f.st === 'fall').length, nextGold = queue[0];
      if (nextGold ? fly === 0 : fly < MAX_FLY) {
        queue.shift(); feathers.push(mk(nextGold)); nextSpawn = T + rnd(0.9, 1.5);
        if (nextGold) setHint('Золотое перо! Оно быстрое и вертлявое', 3400);
      }
    }

    const mouthY = basket.y + 8;
    for (const f of feathers.slice()) {
      f.sc += (((f.st === 'in' || f.st === 'basket') ? 0.9 : 1) - f.sc) * Math.min(1, dt * 12);

      if (f.st === 'fall') {
        if (s > 0) f.vx += gust.dir * 300 * s * (f.golden ? 1.4 : 1) * f.sus * dt;
        f.vx *= Math.exp(-1.1 * dt);
        f.py = f.y;
        f.x += (f.vx + Math.sin(T * f.freq + f.ph) * f.amp) * dt;
        f.y += (f.vyBase + count * 7) * dt;
        f.sw += (Math.sin(T * f.freq + f.ph) * 0.55 - f.sw) * Math.min(1, dt * 6);
        if (f.x < zone.x0) { f.x = zone.x0; f.vx = Math.abs(f.vx) * 0.5; }
        else if (f.x > zone.x1) { f.x = zone.x1; f.vx = -Math.abs(f.vx) * 0.5; }
        if (f.py < mouthY && f.y >= mouthY && Math.abs(f.x - basket.x) < basket.w / 2 - 2) caught(f);
        else if (f.y > basket.y + basket.h + 30) missed(f);
      } else if (f.st === 'in') {
        const p = Math.min(1, (T - f.t0) / 0.3), e = 1 - Math.pow(1 - p, 3);
        f.x = basket.x + f.fox + (f.ox - f.fox) * e; f.y = f.fy + (basket.y + 4 + f.oy - f.fy) * e;
        f.rot += (f.irot - f.rot) * Math.min(1, dt * 10); f.sw *= 0.9;
        if (p >= 1) f.st = 'basket';
      } else if (f.st === 'basket') {
        f.x = basket.x + f.ox; f.y = basket.y + 4 + f.oy;
      }
    }

    // подсветка корзины, когда перо над ней
    let near = false;
    for (const f of feathers) if (f.st === 'fall' && f.y > mouthY - 170 && Math.abs(f.x - basket.x) < basket.w / 2) near = true;
    glow += ((near ? 1 : 0) - glow) * Math.min(1, dt * 10);
    bump = Math.max(0, bump - dt * 3);
    for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; }
    parts = parts.filter(p => p.life > 0);

    if (!skipShown && !ended && T > 70) { skipShown = true; elSkip.classList.add('on'); }
  }

  /* ---------- рисование ---------- */
  function drawFeather(f) {
    const sc = f.size / 52 * f.sc;
    g.save();
    g.translate(f.x, f.y); g.rotate(f.rot + f.sw); g.scale(sc, sc);
    g.beginPath();
    g.moveTo(0, 26);
    g.bezierCurveTo(-14, 14, -16, -10, 0, -28);
    g.bezierCurveTo(15, -10, 14, 12, 0, 26);
    g.closePath();
    const c = f.golden ? GOLD : PAL[f.type];
    const gr = g.createLinearGradient(-14, 0, 14, 0);
    gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
    if (f.golden) { g.shadowColor = 'rgba(255,190,90,.9)'; g.shadowBlur = 16 + 6 * Math.sin(T * 4); }
    g.fillStyle = gr; g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 1; g.strokeStyle = 'rgba(40,25,15,.5)'; g.stroke();
    g.strokeStyle = 'rgba(60,40,25,.65)'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 34); g.lineTo(0, -24); g.stroke();
    g.strokeStyle = 'rgba(60,40,25,.28)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const y = -18 + k * 7, w = 10 - Math.abs(k - 2.5) * 1.2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(-w, y - 6); g.moveTo(0, y); g.lineTo(w, y - 6); g.stroke();
    }
    g.restore();
  }

  function drawBasket() {
    const cx = basket.x, by = basket.y, bw = basket.w, bh = basket.h, rx = bw / 2, ry = 15, my = by + 10;
    g.save();
    g.translate(cx, by + bh); g.rotate(basket.tilt); g.scale(1 + 0.05 * bump, 1 - 0.07 * bump); g.translate(-cx, -(by + bh));

    const gl = g.createRadialGradient(cx, my, 4, cx, my, rx + 40);
    gl.addColorStop(0, `rgba(255,200,120,${0.1 + 0.5 * glow})`); gl.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gl; g.fillRect(cx - rx - 50, my - 100, bw + 100, 170);

    g.fillStyle = '#1d1109'; g.beginPath(); g.ellipse(cx, my, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#c98b4a';
    g.beginPath(); g.ellipse(cx, my, rx, ry, 0, Math.PI, Math.PI * 2); g.stroke();

    for (const f of feathers) if (f.st === 'basket') drawFeather(f);

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
    for (const f of feathers) if (f.st === 'fall') drawFeather(f);
    drawBasket();
    for (const f of feathers) if (f.st === 'in') drawFeather(f);
    for (const p of parts) {
      g.fillStyle = `rgba(${p.c},${clamp(p.life / p.max, 0, 1)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }

  return { start, stop, get active() { return active; } };
})();
