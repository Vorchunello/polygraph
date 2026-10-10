import { MORSE } from "../core/scripts";

// Звук Морзе через WebAudio. Единица — длительность точки; тире = 3,
// пауза между знаками буквы = 1, между буквами = 3, между словами = 7.

let ctx: AudioContext | null = null;
let stopAt = 0;

export function stopMorse() {
  if (ctx) {
    ctx.close();
    ctx = null;
  }
}

/** Проиграть текст. Возвращает длительность в секундах. */
export function playMorse(text: string, wpm = 15, freq = 620): number {
  stopMorse();
  ctx = new AudioContext();
  const unit = 1.2 / wpm;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  let t = ctx.currentTime + 0.1;
  const on = (len: number) => {
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.setValueAtTime(0, t + len * unit);
    t += (len + 1) * unit;
  };
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (const ch of word) {
      const code = MORSE[ch];
      if (!code) continue;
      for (const sym of code) on(sym === "." ? 1 : 3);
      t += 2 * unit;
    }
    t += 4 * unit;
  }
  osc.start();
  stopAt = t;
  osc.stop(stopAt);
  return stopAt - ctx.currentTime;
}
