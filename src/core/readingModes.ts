// Режимы чтения для читалки. Всё — чистые функции над текстом, а React
// только раскрашивает результат.

export type FocusMode = "none" | "anchors" | "rhythm" | "ruler";

/**
 * «Опорные буквы»: начало слова жирное, глаз цепляется за него и быстрее
 * скользит по строке. Возвращает [жирная часть, остаток].
 */
export function anchorSplit(word: string): [string, string] {
  const letters = [...word];
  const n = letters.length;
  const bold = n <= 1 ? n : n <= 3 ? 1 : n <= 5 ? 2 : Math.ceil(n * 0.4);
  return [letters.slice(0, bold).join(""), letters.slice(bold).join("")];
}

export type RhythmStyle = "plain" | "bold" | "italic" | "accent";

const RHYTHM: RhythmStyle[] = ["plain", "accent", "plain", "italic", "plain", "bold"];

/** «Ритм»: предложения по очереди меняют начертание, чтобы текст не сливался в серую стену. */
export function rhythmSentences(paragraph: string, offset = 0): { text: string; style: RhythmStyle }[] {
  return paragraph
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean)
    .map((text, i) => ({ text, style: RHYTHM[(i + offset) % RHYTHM.length] }));
}

export interface RsvpToken {
  word: string;
  /** Индекс буквы, на которой фокусируется глаз (оптимальная точка узнавания). */
  pivot: number;
  /** Множитель паузы: длинные слова и концы фраз показываются дольше. */
  weight: number;
}

export function rsvpTokens(text: string): RsvpToken[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const len = [...word.replace(/[^\p{L}\p{N}]/gu, "")].length;
      const pivot = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
      let weight = 1;
      if (len > 8) weight += 0.3;
      if (/[,;:—–-]$/.test(word)) weight += 0.6;
      if (/[.!?…]["»”)]?$/.test(word)) weight += 1.4;
      return { word, pivot, weight };
    });
}

/** Сколько миллисекунд показывать слово при заданной скорости (слов в минуту). */
export function rsvpDelay(token: RsvpToken, wpm: number): number {
  return (60000 / wpm) * token.weight;
}

/** Оценка оставшегося времени чтения в минутах. */
export function minutesLeft(paragraphs: string[], wpm = 180): number {
  const words = paragraphs.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / wpm));
}
