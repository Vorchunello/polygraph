import { today } from "./dates";
import { langInfo } from "./languages";
import { isDue, isNew } from "./srs";
import type { Concept, LangCode } from "./types";

// Игры: конструктор упражнений, «мост или ловушка», проверка догадок Sennaar.

export type DrillKind = "choose" | "reverse" | "type" | "listen" | "match" | "order" | "gender";

export const DRILL_KINDS: DrillKind[] = ["choose", "reverse", "type", "listen", "match", "order", "gender"];

export type DrillSource = "all" | "due" | "new" | "traps";

export interface DrillPreset {
  id: string;
  name: string;
  kinds: DrillKind[];
  count: number;
  source: DrillSource;
}

export interface Option {
  label: string;
  correct: boolean;
}

export type Exercise =
  | { kind: "choose" | "listen"; concept: Concept; prompt: string; options: Option[] }
  | { kind: "reverse"; concept: Concept; prompt: string; options: Option[] }
  | { kind: "type"; concept: Concept; prompt: string; answer: string; article?: string }
  | { kind: "match"; pairs: { id: string; tgt: string; native: string }[] }
  | { kind: "order"; concept: Concept; translation?: string; answer: string[]; shuffled: string[] }
  | { kind: "gender"; concept: Concept; prompt: string; options: Option[] };

export type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const show = (c: Concept, lang: LangCode) => {
  const t = c.terms[lang];
  return t ? [t.article, t.text].filter(Boolean).join(" ") : "";
};

/** Перевод на первый известный язык, на котором слово есть. */
function nativeOf(c: Concept, known: LangCode[]): string {
  for (const k of known) if (c.terms[k]?.text) return c.terms[k].text;
  return "";
}

export function pickWords(concepts: Concept[], target: LangCode, source: DrillSource, now = today()): Concept[] {
  const withTerm = concepts.filter((c) => c.terms[target]?.text);
  switch (source) {
    case "due":
      return withTerm.filter((c) => isDue(c, target, now));
    case "new":
      return withTerm.filter((c) => isNew(c, target));
    case "traps":
      return withTerm.filter((c) => c.bridges.some((b) => b.strength === "broken"));
    default:
      return withTerm;
  }
}

function options(correct: string, pool: string[], rng: Rng, n = 4): Option[] {
  const wrong = shuffle([...new Set(pool.filter((p) => p && p !== correct))], rng).slice(0, n - 1);
  return shuffle([{ label: correct, correct: true }, ...wrong.map((label) => ({ label, correct: false }))], rng);
}

const GENDER_LABEL: Record<string, string> = { m: "m", f: "f", n: "n", c: "c" };

export function buildDrill(
  concepts: Concept[],
  target: LangCode,
  known: LangCode[],
  preset: Pick<DrillPreset, "kinds" | "count" | "source">,
  rng: Rng = Math.random,
): Exercise[] {
  const words = shuffle(pickWords(concepts, target, preset.source), rng).filter((c) => nativeOf(c, known));
  if (!words.length || !preset.kinds.length) return [];
  const pool = concepts.filter((c) => c.terms[target]?.text && nativeOf(c, known));
  const natives = pool.map((c) => nativeOf(c, known));
  const targets = pool.map((c) => show(c, target));
  const out: Exercise[] = [];
  let k = 0;
  for (let i = 0; out.length < preset.count && i < preset.count * 4; i++) {
    const kind = preset.kinds[k++ % preset.kinds.length];
    const c = words[i % words.length];
    switch (kind) {
      case "choose":
      case "listen":
        out.push({ kind, concept: c, prompt: show(c, target), options: options(nativeOf(c, known), natives, rng) });
        break;
      case "reverse":
        out.push({ kind, concept: c, prompt: nativeOf(c, known), options: options(show(c, target), targets, rng) });
        break;
      case "type":
        out.push({ kind, concept: c, prompt: nativeOf(c, known), answer: c.terms[target].text, article: c.terms[target].article });
        break;
      case "match": {
        const group = shuffle(words, rng).slice(0, 5);
        if (group.length >= 3) out.push({ kind, pairs: group.map((g) => ({ id: g.id, tgt: show(g, target), native: nativeOf(g, known) })) });
        break;
      }
      case "order": {
        const ex = c.examples.find((e) => e.lang === target && e.text.split(/\s+/).length >= 3);
        if (!ex) break;
        const answer = ex.text.split(/\s+/);
        let shuffled = shuffle(answer, rng);
        if (shuffled.join(" ") === answer.join(" ")) shuffled = [...answer].reverse();
        out.push({ kind, concept: c, translation: ex.tr, answer, shuffled });
        break;
      }
      case "gender": {
        const g = c.terms[target].gender;
        const info = langInfo(target);
        if (!g || info.gender === "none") break;
        const genders = info.gender === "mfn" ? ["m", "f", "n"] : info.gender === "common" ? ["c", "n"] : ["m", "f"];
        out.push({
          kind,
          concept: c,
          prompt: c.terms[target].text,
          options: genders.map((x) => ({ label: GENDER_LABEL[x], correct: x === g })),
        });
        break;
      }
    }
  }
  return out;
}

export interface TrapPair {
  a: { lang: LangCode; text: string };
  b: { lang: LangCode; text: string };
  trap: boolean;
  explain: string;
  conceptId?: string;
}

/** Пары «мост или ловушка» из своего словаря: мосты с пометкой надёжности. */
export function trapPairsFromDictionary(concepts: Concept[], target: LangCode): TrapPair[] {
  const out: TrapPair[] = [];
  for (const c of concepts) {
    const t = c.terms[target];
    if (!t) continue;
    for (const b of c.bridges) {
      const other = c.terms[b.from];
      if (!other || b.strength === "weak") continue;
      out.push({
        a: { lang: target, text: [t.article, t.text].filter(Boolean).join(" ") },
        b: { lang: b.from, text: other.text },
        trap: b.strength === "broken",
        explain: b.note,
        conceptId: c.id,
      });
    }
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** Догадка в Sennaar засчитывается, если совпадает со значением или синонимом (с запасом на окончания). */
export function guessMatches(guess: string, meaning: string, accept: string[] = []): boolean {
  const g = norm(guess);
  if (g.length < 2) return false;
  return [meaning, ...accept].some((m) => {
    const t = norm(m);
    if (!t) return false;
    if (g === t) return true;
    // «ночью» ~ «ночь», «schools» ~ «school»: общий корень не короче 4 букв.
    const stem = Math.min(g.length, t.length) - 1;
    return stem >= 3 && g.slice(0, stem) === t.slice(0, stem) && Math.abs(g.length - t.length) <= 3;
  });
}
