import { today } from "../core/dates";
import type { Concept, LangCode } from "../core/types";
import { hitEtymology, hitGender, hitNotes, shortGloss, type DictHit } from "../storage/dictionary";

/** Переводчики пишут одиночное слово с заглавной («Улица»); слово строчное — и перевод строчный. */
export function matchCase(translation: string, word: string): string {
  const first = word.charAt(0);
  const lowerWord = first === first.toLowerCase() && first !== first.toUpperCase();
  const t0 = translation.charAt(0);
  const rest = translation.slice(1);
  return lowerWord && t0 !== t0.toLowerCase() && rest === rest.toLowerCase() ? t0.toLowerCase() + rest : translation;
}

/**
 * Карточка слова из читалки или отбора слов: начальная форма, перевод,
 * пример — предложение, где слово встретилось, и данные словаря, если он есть.
 */
export function learnCard(o: {
  id: string;
  lang: LangCode;
  lemma: string;
  hit?: DictHit | null;
  translation?: { lang: LangCode; text: string };
  example?: string;
  tags: string[];
  /** Знакомые ученику языки: английское значение из словаря идёт в карточку, только если английский знаком. */
  known: LangCode[];
}): Concept {
  const now = today();
  const terms: Concept["terms"] = { [o.lang]: { text: o.lemma, ...(o.hit && hitGender(o.hit) ? { gender: hitGender(o.hit) } : {}) } };
  if (o.translation?.text.trim() && o.translation.lang !== o.lang) terms[o.translation.lang] = { text: matchCase(o.translation.text.trim(), o.lemma) };
  if (o.hit && o.lang !== "en" && !terms.en && o.known.includes("en")) {
    const gloss = shortGloss(o.hit);
    if (gloss) terms.en = { text: gloss };
  }
  const etymology = o.hit ? hitEtymology(o.hit) : undefined;
  return {
    id: o.id,
    terms,
    bridges: [],
    examples: o.example ? [{ lang: o.lang, text: o.example }] : [],
    ...(etymology ? { etymology, etymologyVerified: true, etymologySource: "wiktionary" } : {}),
    tags: o.tags,
    srs: {},
    created: now,
    updated: now,
    notes: o.hit ? hitNotes(o.hit) : "",
  };
}
