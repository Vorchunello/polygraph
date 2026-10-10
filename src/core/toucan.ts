import type { Concept, LangCode } from "./types";

// Метод «тукана»: читаешь обычный текст на своём языке, а часть слов в нём
// уже заменена на слова изучаемого языка — из твоего же словаря.
// Тап по слову показывает оригинал.

export interface ToucanSegment {
  text: string;
  /** Есть, если сегмент — подмена. */
  swap?: { original: string; concept: Concept };
}

// Окончания, с которыми слово ещё считается тем же: «ночь» → «ночи», «ночью».
const SUFFIXES: Record<string, string[]> = {
  ru: ["а", "я", "у", "ю", "ы", "и", "е", "ой", "ей", "ом", "ем", "ью", "ов", "ев", "ам", "ям", "ами", "ями", "ах", "ях", "о", "ого", "его", "ому", "ему"],
  uk: ["а", "я", "у", "ю", "и", "і", "ї", "е", "ою", "ею", "ом", "ем", "ів", "ам", "ям", "ами", "ями", "ах", "ях"],
  tr: ["ı", "i", "u", "ü", "a", "e", "da", "de", "ta", "te", "dan", "den", "tan", "ten", "lar", "ler", "ın", "in", "un", "ün", "ları", "leri", "yı", "yi", "ya", "ye"],
  en: ["s", "es", "'s", "ed", "ing"],
  es: ["s", "es"],
  fr: ["s", "x"],
  it: ["i", "e"],
  pt: ["s", "es"],
  de: ["e", "en", "n", "s", "es", "er"],
};

const STRIP_FINAL: Record<string, RegExp> = { ru: /[аяоеьйиы]$/, uk: /[аяоеьйиі]$/ };

export function matchesInflected(token: string, term: string, lang: LangCode): boolean {
  const t = token.toLowerCase();
  const w = term.toLowerCase();
  if (t === w) return true;
  const stem = w.length >= 4 && STRIP_FINAL[lang] ? w.replace(STRIP_FINAL[lang], "") : w;
  if (!t.startsWith(stem)) return false;
  return (SUFFIXES[lang] ?? []).includes(t.slice(stem.length));
}

// Детерминированный «случайный» выбор: при той же плотности подменяются те же слова.
function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return (h >>> 0) / 4294967295;
}

export function toucanize(text: string, concepts: Concept[], from: LangCode, target: LangCode, density = 1): ToucanSegment[] {
  const candidates = concepts
    .filter((c) => c.terms[from]?.text && c.terms[target]?.text && !c.terms[from].text.includes(" "))
    .map((c) => ({ c, term: c.terms[from].text }));
  if (!candidates.length) return [{ text }];

  const out: ToucanSegment[] = [];
  for (const part of text.split(/(\p{L}[\p{L}\p{M}'’-]*)/u)) {
    if (!part) continue;
    const hit = /\p{L}/u.test(part) ? candidates.find((x) => matchesInflected(part, x.term, from)) : undefined;
    if (hit && hash(hit.c.id) < density) {
      const t = hit.c.terms[target];
      out.push({ text: t.text, swap: { original: part, concept: hit.c } });
    } else if (out.length && !out[out.length - 1].swap) {
      out[out.length - 1].text += part;
    } else {
      out.push({ text: part });
    }
  }
  return out;
}
