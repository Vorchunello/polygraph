import { addDays, today } from "./dates";
import type { Concept, LangCode, SrsState } from "./types";

// SM-2 в упрощённом виде, интервалы в днях. Оценки как в Anki.
export type Grade = "again" | "hard" | "good" | "easy";

const MIN_EASE = 1.3;

export function review(prev: SrsState | undefined, grade: Grade, now: string = today()): SrsState {
  const s: SrsState = prev
    ? { ...prev }
    : { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };

  switch (grade) {
    case "again":
      s.lapses += 1;
      s.reps = 0;
      s.ease = Math.max(MIN_EASE, s.ease - 0.2);
      s.interval = 1;
      break;
    case "hard":
      s.ease = Math.max(MIN_EASE, s.ease - 0.15);
      s.interval = Math.max(1, Math.round(s.interval * 1.2));
      s.reps += 1;
      break;
    case "good":
      s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease);
      s.reps += 1;
      break;
    case "easy":
      s.interval = s.reps === 0 ? 3 : Math.round(Math.max(s.interval, 1) * s.ease * 1.3);
      s.ease += 0.15;
      s.reps += 1;
      break;
  }
  s.last = now;
  s.due = addDays(now, s.interval);
  return s;
}

export function isNew(c: Concept, lang: LangCode): boolean {
  return !c.srs[lang];
}

export function isDue(c: Concept, lang: LangCode, now: string = today()): boolean {
  const s = c.srs[lang];
  return !!s && s.due <= now;
}

/** Очередь на сегодня: сначала просроченные, потом новые (не больше newLimit). */
export function buildQueue(concepts: Concept[], lang: LangCode, newLimit = 10, now = today()): Concept[] {
  const withTerm = concepts.filter((c) => c.terms[lang]?.text);
  const due = withTerm
    .filter((c) => isDue(c, lang, now))
    .sort((a, b) => a.srs[lang].due.localeCompare(b.srs[lang].due));
  const fresh = withTerm.filter((c) => isNew(c, lang)).slice(0, newLimit);
  return [...due, ...fresh];
}

/**
 * Серия дней подряд, когда было хоть одно повторение. Если сегодня ещё не
 * занимался, серия не обрывается — считается до вчера.
 */
export function studyStreak(concepts: Concept[], now: string = today()): { days: number; today: boolean } {
  const days = new Set<string>();
  for (const c of concepts) for (const s of Object.values(c.srs)) if (s.last) days.add(s.last);
  const studiedToday = days.has(now);
  let cursor = studiedToday ? now : addDays(now, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return { days: n, today: studiedToday };
}
