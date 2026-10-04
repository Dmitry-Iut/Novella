/* game.js — движок новеллы: экраны, карусель, сцены, текст, настройки */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- сохранение ---------- */
  const KEY = 'korzhik.novel.v1';
  const DEFAULTS = { music: true, sfx: true, mVol: 60, sVol: 80, speed: 2, bright: 100, warm: 12 };
  let state = { done: {}, set: { ...DEFAULTS } };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); state.done = p.done || {}; state.set = { ...DEFAULTS, ...(p.set || {}) }; }
  } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

  /* ---------- экраны ---------- */
  let screen = 'title';
  function go(name) {
    screen = name;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name !== 'game') KAudio.setMood('calm');
  }

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- картинки сцен ---------- */
  const sceneCache = {};
  function loadScene(id) {
    if (sceneCache[id]) return sceneCache[id];
    const cands = [];
    if (SCENE_FILES[id]) cands.push('images/' + SCENE_FILES[id]);
    ['jpg', 'png', 'jpeg', 'webp'].forEach(e => { const u = `images/scene_${id}.${e}`; if (!cands.includes(u)) cands.push(u); });
    sceneCache[id] = (async () => {
      for (const u of cands) {
        const ok = await new Promise(r => { const im = new Image(); im.onload = () => r(true); im.onerror = () => r(false); im.src = u; });
        if (ok) return u;
      }
      return null;
    })();
    return sceneCache[id];
  }

  /* ---------- титульный экран ---------- */
  loadScene(1).then(u => { if (u) $('#tBg').style.backgroundImage = `url('${u}')`; });
  (function dust() {
    const box = $('#dust');
    for (let i = 0; i < 22; i++) {
      const m = document.createElement('span'); m.className = 'mote';
      const s = 3 + Math.random() * 6;
      m.style.cssText = `left:${Math.random() * 100}%;width:${s}px;height:${s}px;` +
        `animation-duration:${12 + Math.random() * 16}s;animation-delay:${-Math.random() * 20}s;--dx:${(Math.random() - .5) * 90}px`;
      box.appendChild(m);
    }
  })();

  /* ---------- выбор историй ---------- */
  const isUnlocked = ch => !ch.dev && (!ch.requires || state.done[ch.requires]);

  function buildLevels() {
    const car = $('#carousel'); car.innerHTML = '';
    CHAPTERS.forEach((ch, i) => {
      const open = isUnlocked(ch);
      const el = document.createElement('div');
      el.className = 'card' + (open ? '' : ' locked') + (ch.dev ? ' dev' : '');
      let html = '';
      if (ch.cover) html += `<div class="c-img" data-cover="${ch.cover}"></div>`;
      html += '<div class="c-shade"></div>';
      if (!open) html += '<div class="c-lock">🔒</div>';
      html += `<div class="c-body"><div class="c-label">${ch.label}</div><div class="c-title">${ch.title}</div>`;
      if (open) {
        html += `<p class="c-text">${ch.blurb || ''}</p>`;
        if (state.done[ch.id]) html += '<div class="c-done">✓ пройдено</div>';
        html += `<button class="btn primary">${state.done[ch.id] ? 'Прочитать снова' : 'Начать'}</button>`;
      } else if (ch.dev) {
        html += '<span class="c-status">в разработке</span>';
      } else {
        html += '<span class="c-status">откроется после введения</span>';
      }
      html += '</div>';
      el.innerHTML = html;
      el.addEventListener('click', () => {
        if (open) startChapter(ch.id);
        else toast(ch.dev ? 'Эта история ещё в разработке' : 'Сначала пройди введение');
      });
      car.appendChild(el);
    });
    $$('.c-img', car).forEach(d => loadScene(+d.dataset.cover).then(u => { if (u) d.style.backgroundImage = `url('${u}')`; }));

    const dots = $('#dots'); dots.innerHTML = '';
    CHAPTERS.forEach(() => dots.appendChild(document.createElement('i')));
    updateDots();
  }

  function cardStep() {
    const c = $$('#carousel .card');
    return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : 1;
  }
  function updateDots() {
    const car = $('#carousel');
    const i = Math.max(0, Math.min(CHAPTERS.length - 1, Math.round(car.scrollLeft / cardStep())));
    $$('#dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  }
  function scrollToCard(i, smooth) {
    $('#carousel').scrollTo({ left: i * cardStep(), behavior: smooth ? 'smooth' : 'auto' });
  }
  $('#carousel').addEventListener('scroll', updateDots, { passive: true });

  function openLevels(focus) {
    buildLevels(); go('levels');
    requestAnimationFrame(() => { scrollToCard(focus || 0, false); updateDots(); });
  }

  /* ---------- игра ---------- */
  let chapter = null, beats = [], idx = 0, curScene = null, sceneSeq = 0, typing = null;

  const PH = id => `<div class="sbg ph-bg"></div><div class="ph"><div class="ph-ico">🖼</div>` +
    `<div class="ph-t">Сцена ${id}</div><div class="ph-s">${SCENE_CAPTIONS[id] || ''}</div>` +
    `<div class="ph-f">положи картинку: images/scene_${id}.jpg</div></div>`;

  async function setScene(id) {
    if (id === curScene) return;
    curScene = id; const my = ++sceneSeq;
    const url = await loadScene(id);
    if (my !== sceneSeq) return;
    const el = document.createElement('div'); el.className = 'scene';
    el.innerHTML = url
      ? `<div class="sbg" style="background-image:url('${url}')"></div><img class="simg" src="${url}" alt="">`
      : PH(id);
    const stage = $('#stage');
    const olds = $$('.scene', stage);
    stage.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => olds.forEach(o => o.remove()), 1000);
  }

  function startChapter(id) {
    chapter = CHAPTERS.find(c => c.id === id);
    beats = chapter.beats; idx = 0; curScene = null; sceneSeq++;
    $('#stage').innerHTML = '';
    new Set(beats.map(b => b.s).filter(Boolean)).forEach(loadScene);
    go('game');
    show(0, 1);
  }

  const moodAt = i => { for (let k = i; k >= 0; k--) if (beats[k].mood) return beats[k].mood; return 'calm'; };

  /* печатная машинка: скрытая часть уже занимает место, поэтому текст не прыгает */
  function stopType() { if (typing) { cancelAnimationFrame(typing.raf); typing = null; } }
  function finishTyping() {
    if (!typing) return;
    const full = typing.text; stopType();
    $('#tv').textContent = full; $('#th').textContent = '';
    $('#panel').classList.add('done');
  }
  function startType(text) {
    stopType();
    const v = $('#tv'), h = $('#th'), panel = $('#panel');
    const per = [0, 44, 24, 10][state.set.speed] || 24;
    let n = 0, last = performance.now(), acc = 0;
    v.textContent = ''; h.textContent = text; panel.classList.remove('done');
    $('#text').scrollTop = 0;
    const tick = now => {
      acc += now - last; last = now;
      const add = Math.floor(acc / per);
      if (add > 0) {
        acc -= add * per; n = Math.min(text.length, n + add);
        v.textContent = text.slice(0, n); h.textContent = text.slice(n);
      }
      if (n >= text.length) { typing = null; panel.classList.add('done'); return; }
      typing.raf = requestAnimationFrame(tick);
    };
    typing = { raf: requestAnimationFrame(tick), text };
  }

  function fx(name) {
    if (name === 'shake') { const s = $('#stage'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
    if (name === 'flash') { const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  }

  function show(i, dir) {
    idx = i; const b = beats[i], panel = $('#panel'), card = $('#card');
    $('#fill').style.width = ((i + 1) / beats.length * 100) + '%';
    $('#count').textContent = `${i + 1} / ${beats.length}`;
    $('#btnPrev').disabled = i === 0;
    $('#blackout').classList.toggle('on', !!b.black);
    panel.classList.remove('peek');
    if (b.s) setScene(b.s);
    KAudio.setMood(moodAt(i));

    if (b.card) {
      stopType();
      $('#cKicker').textContent = b.card.kicker;
      $('#cTitle').textContent = b.card.title;
      $('#cSub').textContent = b.card.sub;
      $('#cNext').textContent = i === beats.length - 1 ? 'В меню' : 'Дальше';
      card.classList.add('show'); panel.classList.add('hidden');
    } else {
      card.classList.remove('show'); panel.classList.remove('hidden');
      panel.dataset.k = b.k;
      startType(b.text);
      if (dir < 0) finishTyping();
    }
    if (dir > 0) {
      if (b.fx) fx(b.fx);
      (b.sfx || []).forEach(x => Array.isArray(x) ? KAudio.play(x[0], x[1]) : KAudio.play(x));
    }
  }

  function next() {
    if (typing) { finishTyping(); return; }
    if (idx >= beats.length - 1) { finishChapter(); return; }
    show(idx + 1, 1);
  }
  function prev() {
    if (idx === 0) return;
    stopType(); show(idx - 1, -1);
  }

  function finishChapter() {
    const k = CHAPTERS.indexOf(chapter);
    const wasNew = !state.done[chapter.id];
    state.done[chapter.id] = true; persist();
    const nextCh = CHAPTERS[k + 1];
    openLevels(nextCh && isUnlocked(nextCh) ? k + 1 : k);
    if (wasNew && nextCh && !nextCh.dev) setTimeout(() => toast(`Открыто: ${nextCh.label} — ${nextCh.title}`), 700);
  }

  function leaveGame() { stopType(); const k = CHAPTERS.indexOf(chapter); openLevels(Math.max(0, k)); }

  $('#btnNext').addEventListener('click', next);
  $('#btnPrev').addEventListener('click', prev);
  $('#cNext').addEventListener('click', next);
  $('#text').addEventListener('click', next);
  $('#gBack').addEventListener('click', leaveGame);
  $('#gEye').addEventListener('click', () => $('#panel').classList.toggle('peek'));
  $('#stage').addEventListener('click', () => $('#panel').classList.remove('peek'));

  // свайпы: влево — дальше, вправо — назад
  let sx = 0, sy = 0;
  const game = $('#screen-game');
  game.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  game.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) (dx < 0 ? next : prev)();
  }, { passive: true });

  document.addEventListener('keydown', e => {
    if (screen !== 'game') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') prev();
  });

  /* ---------- настройки ---------- */
  function applySettings() {
    const s = state.set;
    KAudio.setSettings({ music: s.music, sfx: s.sfx, mVol: s.mVol / 100, sVol: s.sVol / 100 });
    const r = document.documentElement.style;
    r.setProperty('--bright', s.bright / 100);
    r.setProperty('--warm', s.warm / 100);
  }
  function syncUI() {
    const s = state.set;
    $('#sMusic').checked = s.music; $('#sSfx').checked = s.sfx;
    $('#sMVol').value = s.mVol; $('#sSVol').value = s.sVol;
    $('#sBright').value = s.bright; $('#sWarm').value = s.warm;
    $$('#sSpeed button').forEach(b => b.classList.toggle('on', +b.dataset.v === s.speed));
  }
  const openSettings = () => { syncUI(); $('#settings').classList.add('open'); };
  const closeSettings = () => $('#settings').classList.remove('open');
  const upd = (k, v, sound) => { state.set[k] = v; applySettings(); persist(); if (sound) KAudio.play(sound); };

  $('#sMusic').addEventListener('change', e => upd('music', e.target.checked));
  $('#sSfx').addEventListener('change', e => upd('sfx', e.target.checked, 'chime'));
  $('#sMVol').addEventListener('input', e => upd('mVol', +e.target.value));
  $('#sSVol').addEventListener('change', e => upd('sVol', +e.target.value, 'chime'));
  $('#sBright').addEventListener('input', e => upd('bright', +e.target.value));
  $('#sWarm').addEventListener('input', e => upd('warm', +e.target.value));
  $$('#sSpeed button').forEach(b => b.addEventListener('click', () => { upd('speed', +b.dataset.v); syncUI(); }));
  $('#sReset').addEventListener('click', () => {
    if (confirm('Сбросить прогресс? Все истории, кроме введения, снова закроются.')) {
      state.done = {}; persist(); buildLevels(); toast('Прогресс сброшен');
    }
  });
  $('#sClose').addEventListener('click', closeSettings);
  $('#setShade').addEventListener('click', closeSettings);
  ['btnSettings', 'lvSettings', 'gSettings'].forEach(id => $('#' + id).addEventListener('click', openSettings));

  /* ---------- кнопки меню ---------- */
  $('#btnPlay').addEventListener('click', () => openLevels(state.done.intro ? 1 : 0));
  $('#lvBack').addEventListener('click', () => go('title'));

  /* ---------- звук: на iPhone включается только после касания ---------- */
  let audioStarted = false;
  const unlock = () => {
    KAudio.init();
    if (!audioStarted) { audioStarted = true; KAudio.setMood('calm'); $('#tHint').classList.add('gone'); }
  };
  document.addEventListener('click', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('visibilitychange', () => document.hidden ? KAudio.suspend() : KAudio.resume());

  applySettings(); syncUI(); buildLevels();
})();
