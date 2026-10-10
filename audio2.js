/* audio2.js — музыка и звуки части 2. Подключается ПОСЛЕ audio.js.
   Работает через KAudio.addMoods / KAudio.addSfx (одна строка в audio.js — см. инструкцию). */

KAudio.addMoods({
  // солнечный вечер в парке: акустический, тёплый
  park: {
    bpm: 84, level: 1, pad: 0.04, wave: 'triangle',
    chords: [[55, 59, 62, 67, 71], [52, 55, 59, 64, 67], [48, 55, 60, 64, 67], [50, 57, 62, 66, 69]],
    arp: [0, -1, 2, 3, -1, 2, 1, -1], arpV: 0.09, bass: [0, 4], hat: [2, 6], hatV: 0.012, kick: []
  },
  // нежная сцена на скамейке
  tender: {
    bpm: 66, level: 0.95, pad: 0.05, wave: 'sine',
    chords: [[53, 57, 60, 64, 69], [52, 55, 59, 62, 67], [50, 53, 57, 60, 65], [48, 52, 55, 59, 64]],
    arp: [0, -1, -1, 2, -1, 3, -1, -1], arpV: 0.085, bass: [0], hat: [], hatV: 0, kick: []
  },
  // погоня за мячом
  chase: {
    bpm: 132, level: 1, pad: 0.03, wave: 'triangle',
    chords: [[45, 57, 60, 64], [43, 55, 59, 62], [41, 53, 57, 60], [40, 52, 56, 59]],
    arp: [0, 2, 1, 3, 0, 2, 3, 1], arpV: 0.1, bass: [0, 2, 4, 6], hat: [1, 3, 5, 7], hatV: 0.02, kick: [0, 4], kickV: 0.11
  },
  // тетрадь и карандаши: спокойный лоуфай
  draw: {
    bpm: 72, level: 0.9, pad: 0.045, wave: 'sine',
    chords: [[50, 53, 57, 60, 64], [55, 59, 62, 65, 69], [48, 52, 55, 59, 64], [57, 60, 64, 67, 71]],
    arp: [0, -1, 2, -1, 3, 2, -1, 1], arpV: 0.08, bass: [0, 4], hat: [2, 6], hatV: 0.01, kick: [0], kickV: 0.05
  }
});

KAudio.addSfx(({ noise, tone, rnd, SFX }) => ({
  // птицы в парке
  birds(t) {
    for (let i = 0; i < 6; i++) {
      const s = t + i * 0.18 + rnd(0, 0.08), f = rnd(2600, 4200);
      tone({ t: s, f, f2: f * rnd(1.1, 1.4), type: 'sine', dur: 0.09, vol: 0.07, a: 0.01 });
    }
  },
  // шелест листвы
  leaves(t) {
    for (let i = 0; i < 7; i++)
      noise({ t: t + i * 0.12 + rnd(0, 0.05), dur: 0.2, vol: rnd(0.04, 0.09), f: 3500, q: 0.4, a: 0.05 });
  },
  // бросок мяча
  throw(t) {
    noise({ t, dur: 0.35, vol: 0.22, f: 600, f2: 2600, q: 0.7, a: 0.1 });
    tone({ t, f: 300, f2: 900, dur: 0.3, vol: 0.05, a: 0.1 });
  },
  // прыжок мячика
  boing(t) {
    tone({ t, f: 520, f2: 180, type: 'sine', dur: 0.22, vol: 0.3, a: 0.005 });
    tone({ t: t + 0.14, f: 380, f2: 170, dur: 0.16, vol: 0.12, a: 0.005 });
  },
  // писк игрушки
  squeak(t) {
    tone({ t, f: 1200, f2: 1900, type: 'square', dur: 0.09, vol: 0.08, a: 0.005, filt: { type: 'lowpass', f: 2600 } });
    tone({ t: t + 0.1, f: 1800, f2: 1100, type: 'square', dur: 0.12, vol: 0.07, a: 0.005, filt: { type: 'lowpass', f: 2600 } });
  },
  // грызёт мячик
  chew(t) {
    for (let i = 0; i < 6; i++) {
      const s = t + i * 0.16;
      noise({ t: s, dur: 0.07, vol: 0.25, type: 'highpass', f: 1500, a: 0.003 });
      if (i % 2) SFX.squeak(s + 0.04);
    }
  },
  // смех
  giggle(t) {
    for (let i = 0; i < 5; i++)
      tone({ t: t + i * 0.1, f: 700 + i * 90 + rnd(0, 40), type: 'triangle', dur: 0.09, vol: 0.09, a: 0.01 });
  },
  // молния на сумке
  zip(t) {
    noise({ t, dur: 0.45, vol: 0.12, type: 'highpass', f: 1500, f2: 3500, a: 0.05 });
    for (let i = 0; i < 12; i++) noise({ t: t + i * 0.035, dur: 0.02, vol: 0.06, type: 'highpass', f: 4000, a: 0.002 });
  },
  // переворот страницы
  page(t) {
    noise({ t, dur: 0.55, vol: 0.2, f: 2800, f2: 900, q: 0.5, a: 0.12 });
    SFX.rustle(t + 0.35);
  },
  // карандаш по бумаге
  pencil(t) {
    for (let i = 0; i < 3; i++) noise({ t: t + i * 0.03, dur: 0.05, vol: 0.05, type: 'highpass', f: 3800, a: 0.004 });
  },
  tap(t) { tone({ t, f: 880, dur: 0.06, vol: 0.12, a: 0.003 }); },
  pop(t) { tone({ t, f: 260, f2: 520, dur: 0.1, vol: 0.2, a: 0.004 }); }
}));