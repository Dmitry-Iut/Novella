/* audio.js — вся музыка и все звуки рождаются прямо в браузере (WebAudio).
   Никаких mp3 не нужно. Позже можно заменить любой звук на свой файл. */
const KAudio = (() => {
  let ctx = null, master, musicBus, musicLevel, sfxBus, delayIn, noiseBuf;
  let timer = null, silentEl = null;
  const S = { music: true, sfx: true, mVol: 0.6, sVol: 0.8 };
  let mood = null, moodName = null, pendingMood = 'calm', step = 0, nextT = 0;

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------- настроения музыки ---------- */
  const MOODS = {
    // тёплый ночной лоуфай: введение, воспоминания
    calm: {
      bpm: 62, level: 1, pad: 0.05, wave: 'sine',
      chords: [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 59, 64, 67], [55, 59, 62, 64, 67]],
      arp: [0, -1, 2, -1, 3, -1, 2, 1], arpV: 0.09, bass: [0, 4], hat: [2, 6], hatV: 0.012, kick: []
    },
    // одиночество в комнате: редкие нотки
    quiet: {
      bpm: 52, level: 0.85, pad: 0.04, wave: 'sine',
      chords: [[50, 53, 57, 60, 64], [46, 53, 57, 62, 65], [53, 57, 60, 64, 69], [57, 60, 64, 67, 71]],
      arp: [-1, -1, 3, -1, -1, -1, 2, -1], arpV: 0.08, bass: [0], hat: [], hatV: 0, kick: []
    },
    // охота на голубя: игривое пиццикато
    playful: {
      bpm: 108, level: 1, pad: 0.03, wave: 'triangle',
      chords: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [40, 52, 56, 59]],
      arp: [0, 2, 1, 3, 0, 2, 3, 1], arpV: 0.1, bass: [0, 4], hat: [2, 6], hatV: 0.02, kick: [0, 4], kickV: 0.1
    },
    // радость, прогулка
    happy: {
      bpm: 98, level: 1, pad: 0.04, wave: 'triangle',
      chords: [[48, 55, 60, 64, 67], [53, 57, 60, 65, 69], [57, 60, 64, 67, 72], [55, 59, 62, 67, 71]],
      arp: [0, 2, 3, 2, 1, 2, 3, 2], arpV: 0.1, bass: [0, 4], hat: [2, 6], hatV: 0.018, kick: [0, 4], kickV: 0.09
    },
    // почти тишина (на звонке, на падении)
    silent: { bpm: 60, level: 0, chords: null }
  };

  /* ---------- запуск ---------- */
  function silentWavURL() {
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function init() {
    if (ctx) { resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // iPhone: звук должен идти даже при включённом беззвучном режиме
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try {
      silentEl = document.createElement('audio');
      silentEl.src = silentWavURL(); silentEl.loop = true; silentEl.setAttribute('playsinline', '');
      silentEl.play().catch(() => {});
    } catch (e) {}

    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);

    musicBus = ctx.createGain(); musicLevel = ctx.createGain();
    musicBus.connect(musicLevel); musicLevel.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);

    // мягкое эхо для музыки
    delayIn = ctx.createGain();
    const d = ctx.createDelay(1.5); d.delayTime.value = 0.45;
    const fb = ctx.createGain(); fb.gain.value = 0.36;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    delayIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    applyVolumes();
    nextT = ctx.currentTime + 0.15;
    timer = setInterval(pump, 90);
    setMood(pendingMood);
    resume();
  }

  function resume() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); if (silentEl && silentEl.paused) silentEl.play().catch(() => {}); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(S.music ? S.mVol * 0.9 : 0, t, 0.05);
    sfxBus.gain.setTargetAtTime(S.sfx ? S.sVol : 0, t, 0.05);
  }
  function setSettings(p) { Object.assign(S, p); applyVolumes(); }

  /* ---------- музыка ---------- */
  function setMood(name) {
    pendingMood = name;
    if (!ctx || moodName === name || !MOODS[name]) return;
    moodName = name; mood = MOODS[name]; step = 0;
    musicLevel.gain.setTargetAtTime(mood.level, ctx.currentTime, 0.6);
  }

  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    const sd = mood ? 60 / mood.bpm / 2 : 0.25;
    while (nextT < ctx.currentTime + 0.35) {
      if (mood && mood.chords) playStep(step, nextT, sd);
      nextT += sd; step++;
    }
  }

  function playStep(n, t, sd) {
    const m = mood, len = 8;
    const ch = m.chords[Math.floor(n / len) % m.chords.length], pos = n % len;
    if (pos === 0) pad(ch, t, sd * len, m.pad);
    if (m.bass.includes(pos)) { let r = ch[0] - 12; while (r < 38) r += 12; bass(r, t, sd * 3.5); }
    const a = m.arp[pos]; if (a >= 0) pluck(ch[a] + 12, t, m.arpV, m.wave);
    if (m.hat.includes(pos)) hat(t, m.hatV);
    if (m.kick && m.kick.includes(pos)) kick(t, m.kickV || 0.1);
  }

  function pad(notes, t, dur, vol) {
    const per = vol / (notes.length * 0.5);
    notes.forEach((n, i) => [-5, 5].forEach(dt => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = dt;
      f.type = 'lowpass'; f.frequency.value = 700 + i * 60;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(per, t + dur * 0.35);
      g.gain.setValueAtTime(per, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + dur + 1);
    }));
  }
  function pluck(n, t, vol, wave) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), s = ctx.createGain();
    o.type = wave; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.gain.value = 0.55;
    o.connect(f); f.connect(g); g.connect(musicBus); g.connect(s); s.connect(delayIn);
    o.start(t); o.stop(t + 1);
  }
  function bass(n, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function hat(t, v) {
    if (!v) return;
    noise({ t, dur: 0.05, vol: v, type: 'highpass', f: 7000, a: 0.003, bus: musicBus });
  }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  }

  /* ---------- кирпичики для звуков ---------- */
  function noise({ t, dur, vol = 0.3, type = 'bandpass', f = 1000, f2, q = 1, a = 0.005, bus }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(a, dur * 0.9));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone({ t, f, f2, type = 'sine', dur = 0.3, vol = 0.3, a = 0.01, filt, fq = 1, bus }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(a, dur * 0.9));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = o;
    if (filt) {
      const fl = ctx.createBiquadFilter(); fl.type = filt.type; fl.frequency.value = filt.f; fl.Q.value = fq;
      o.connect(fl); last = fl;
    }
    last.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const breath = (t, dur, vol, f) => noise({ t, dur, vol, f, q: 0.8, a: dur * 0.45 });
  const thud = (t, v = 1) => {
    tone({ t, f: 150, f2: 38, dur: 0.45, vol: 0.9 * v });
    noise({ t, dur: 0.25, vol: 0.5 * v, type: 'lowpass', f: 260, a: 0.004 });
  };

  /* ---------- звуки сцен ---------- */
  const SFX = {
    sniff(t) { breath(t, 0.25, 0.16, 900); breath(t + 0.35, 0.25, 0.13, 1000); },
    snore(t) { breath(t, 1.2, 0.2, 380); breath(t + 1.9, 1.4, 0.22, 330); },
    pant(t) { for (let i = 0; i < 5; i++) noise({ t: t + i * 0.19, dur: 0.12, vol: 0.14, f: 3000, q: 0.7, a: 0.03 }); },

    ring(t) { // телефон: два звонка, каждый из двух трелей
      for (let r = 0; r < 2; r++) for (let b = 0; b < 2; b++) {
        const s = t + r * 1.5 + b * 0.5;
        for (let i = 0; i < 9; i++)
          tone({ t: s + i * 0.045, f: i % 2 ? 1318 : 1046, type: 'triangle', dur: 0.05, vol: 0.2, a: 0.004 });
      }
    },
    pickup(t) { noise({ t, dur: 0.04, vol: 0.3, type: 'highpass', f: 2000 }); noise({ t: t + 0.09, dur: 0.05, vol: 0.25, type: 'highpass', f: 1500 }); },
    rustle(t) { for (let i = 0; i < 5; i++) noise({ t: t + i * 0.11 + rnd(0, 0.04), dur: 0.14, vol: rnd(0.1, 0.2), f: 2400, q: 0.4, a: 0.02 }); },
    keys(t) { for (let i = 0; i < 9; i++) tone({ t: t + i * 0.05 + rnd(0, 0.03), f: rnd(2800, 5400), type: 'triangle', dur: 0.28, vol: 0.09 }); },
    collar(t) {
      for (let i = 0; i < 5; i++) tone({ t: t + i * 0.07 + rnd(0, 0.03), f: rnd(2400, 4200), type: 'triangle', dur: 0.3, vol: 0.09 });
      tone({ t: t + 0.05, f: 2200, dur: 0.5, vol: 0.07 });
    },
    steps(t) { for (let i = 0; i < 6; i++) { const s = t + i * 0.24, v = 0.5 - i * 0.06; tone({ t: s, f: 95, f2: 50, dur: 0.12, vol: v }); noise({ t: s, dur: 0.07, vol: v * 0.5, type: 'lowpass', f: 600 }); } },
    door(t) {
      tone({ t, f: 150, f2: 230, type: 'sawtooth', dur: 0.7, vol: 0.12, a: 0.1, filt: { type: 'bandpass', f: 520 }, fq: 6 });
      tone({ t: t + 0.65, f: 230, f2: 140, type: 'sawtooth', dur: 0.6, vol: 0.1, a: 0.05, filt: { type: 'bandpass', f: 480 }, fq: 6 });
      thud(t + 1.35, 0.55);
    },
    jar(t) { noise({ t, dur: 0.09, vol: 0.3, f: 900, q: 1.2 }); tone({ t: t + 0.02, f: 420, f2: 190, dur: 0.12, vol: 0.25 }); },
    crunch(t) { for (let i = 0; i < 5; i++) noise({ t: t + i * 0.075 + rnd(0, 0.03), dur: 0.06, vol: 0.32, type: 'highpass', f: 1800, a: 0.003 }); },
    bark(t, n = 3, hi = false) {
      for (let i = 0; i < n; i++) {
        const s = t + i * 0.27;
        tone({ t: s, f: hi ? 660 : 480, f2: hi ? 430 : 300, type: 'sawtooth', dur: 0.17, vol: 0.34, a: 0.01, filt: { type: 'bandpass', f: 900 }, fq: 1.5 });
        noise({ t: s, dur: 0.07, vol: 0.2, f: 1800, q: 0.8, a: 0.004 });
      }
    },
    yip(t) { SFX.bark(t, 2, true); },
    wings(t) { for (let i = 0; i < 8; i++) { const s = t + i * (0.07 + i * 0.012), v = 0.34 * (1 - i / 14); noise({ t: s, dur: 0.1, vol: v, f: 1500, f2: 700, q: 0.7, a: 0.015 }); tone({ t: s, f: 70, dur: 0.09, vol: v * 0.6 }); } },
    coo(t) { [310, 270, 290].forEach((f, i) => tone({ t: t + i * 0.22, f, f2: f * 0.86, type: 'triangle', dur: 0.2, vol: 0.2, a: 0.03, filt: { type: 'lowpass', f: 900 } })); },
    scramble(t) {
      SFX.rustle(t);
      for (let i = 0; i < 9; i++) noise({ t: t + i * 0.09 + rnd(0, 0.03), dur: 0.035, vol: 0.14, f: 3200, q: 1.5, a: 0.002 });
    },
    whoosh(t) { noise({ t, dur: 0.7, vol: 0.28, f: 1800, f2: 200, q: 0.6, a: 0.12 }); tone({ t, f: 700, f2: 180, dur: 0.6, vol: 0.06, a: 0.1 }); },
    thud(t) { thud(t); },
    chime(t) { [72, 76, 79, 84].forEach((m, i) => tone({ t: t + i * 0.12, f: midi(m), dur: 1.1, vol: 0.14, a: 0.01 })); },
    windowClose(t) {
      noise({ t, dur: 0.5, vol: 0.16, f: 700, f2: 300, q: 0.8, a: 0.08 });
      thud(t + 0.5, 0.3);
      tone({ t: t + 0.55, f: 1400, type: 'square', dur: 0.03, vol: 0.1, a: 0.002 });
    }
  };

  function play(name, delay = 0) {
    if (!ctx || !S.sfx || !SFX[name]) return;
    resume();
    try { SFX[name](ctx.currentTime + 0.03 + delay); } catch (e) {}
  }

  /* ---------- расширения (часть 2): audio2.js докладывает сюда новую музыку и звуки ---------- */
  function addMoods(m) { Object.assign(MOODS, m); }
  function addSfx(factory) { Object.assign(SFX, factory({ noise, tone, rnd, midi, SFX })); }

  return { init, resume, suspend, setSettings, setMood, play, addMoods, addSfx };
})();