// Отбор слов из текста (книга, PDF, субтитры ролика): какие из них стоит учить.
// Здесь — чистая логика без сети и хранилища, поэтому её легко проверить тестами.
// Словарь подставляется снаружи функцией lookup: есть офлайн-словарь — отбор умнее.

export interface WordStat {
  /** Ключ: слово в нижнем регистре. */
  key: string;
  /** Как слово впервые встретилось в тексте. */
  word: string;
  count: number;
  /** Первое предложение, где слово встретилось. */
  example: string;
}

export interface VocabItem {
  /** Начальная форма (если словарь её знает), иначе слово как в тексте. */
  lemma: string;
  /** Формы, в которых слово встретилось. */
  forms: string[];
  count: number;
  example: string;
  pos?: string;
  gloss?: string;
  translation?: string;
  level?: string;
  why?: string;
}

export interface LookupResult {
  lemma: string;
  pos: string;
  gloss: string;
  /** Полнота статьи 0–10: чем больше, тем вероятнее слово частое. */
  rank: number;
  function: boolean;
}

const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
const SENTENCE = /[^.!?…。！？\n]+[.!?…。！？]*/gu;

/** Письменности без пробелов между словами: там «слово» из регулярки — целая фраза. */
export const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Частоты слов и первое предложение с каждым словом. */
export function wordStats(paragraphs: string[]): WordStat[] {
  const stats = new Map<string, WordStat>();
  for (const p of paragraphs) {
    for (const sm of p.matchAll(SENTENCE)) {
      const sentence = sm[0].trim();
      for (const m of sentence.matchAll(WORD)) {
        const word = m[0].replace(/['’-]+$/, "");
        const key = word.toLowerCase();
        const s = stats.get(key);
        if (s) s.count++;
        else stats.set(key, { key, word, count: 1, example: sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence });
      }
    }
  }
  return [...stats.values()];
}

/** Слово написано с заглавной не в начале предложения — скорее всего имя. */
export function looksLikeName(s: WordStat): boolean {
  if (s.word === s.key) return false;
  const at = s.example.indexOf(s.word);
  return at > 0 && !/[.!?…«"“(—–-]\s*$/.test(s.example.slice(0, at).trimEnd() + " ");
}

export interface PickOptions {
  /** Слова, которые учить не нужно: уже в словаре или отмечены «знаю». Ключи в нижнем регистре. */
  skip: Set<string>;
  limit: number;
  /** Офлайн-словарь (если установлен). */
  lookup?: (word: string) => Promise<LookupResult | null>;
  /** В немецком все существительные с заглавной — там имена так не распознать. */
  lang?: string;
}

/**
 * Кандидаты на изучение. Со словарём: слова сводятся к начальной форме,
 * служебные части речи и имена отбрасываются, выше — частые в тексте и
 * «полные» статьи словаря. Без словаря — частота и длина слова.
 */
export async function pickVocabulary(paragraphs: string[], opts: PickOptions): Promise<VocabItem[]> {
  const stats = wordStats(paragraphs)
    .filter((s) => !/\d/.test(s.word) && (opts.lang === "de" || !looksLikeName(s)))
    // По алфавиту: соседние слова лежат в одной части словаря — меньше чтений с диска.
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const byLemma = new Map<string, VocabItem & { score: number }>();
  for (const s of stats) {
    if (opts.skip.has(s.key)) continue;
    let lemma = s.key;
    let pos: string | undefined;
    let gloss: string | undefined;
    let score: number;
    if (opts.lookup) {
      const hit = await opts.lookup(s.word);
      // Слова нет в словаре — опечатка, имя или редкость: пропускаем.
      if (!hit || hit.function) continue;
      lemma = hit.lemma;
      if (opts.skip.has(lemma.toLowerCase())) continue;
      pos = hit.pos;
      gloss = hit.gloss;
      score = hit.rank;
    } else {
      // Без словаря короткие слова — почти всегда служебные (и, в, the, de).
      const len = [...s.key].length;
      if (len < 4 && !UNSPACED.test(s.key)) continue;
      score = Math.min(len, 8) / 2;
    }
    const prev = byLemma.get(lemma);
    if (prev) {
      prev.count += s.count;
      if (!prev.forms.includes(s.word)) prev.forms.push(s.word);
    } else byLemma.set(lemma, { lemma, forms: [s.word], count: s.count, example: s.example, pos, gloss, score });
  }
  const items = [...byLemma.values()];
  // Без словаря самые частые длинные слова всё равно часто служебные — их немного
  // приглушаем логарифмом; со словарём частота в тексте важнее.
  const weight = (x: (typeof items)[number]) => (opts.lookup ? Math.log2(1 + x.count) * 4 + x.score : Math.log2(1 + x.count) + x.score);
  return items
    .sort((a, b) => weight(b) - weight(a) || a.lemma.localeCompare(b.lemma))
    .slice(0, opts.limit)
    .map(({ score: _score, ...rest }) => rest);
}

/** Предложение абзаца, в котором стоит слово, — пример для карточки. */
export function sentenceWith(paragraph: string, word: string): string {
  const w = word.toLowerCase();
  for (const m of paragraph.matchAll(SENTENCE)) {
    const s = m[0].trim();
    if ([...s.matchAll(WORD)].some((x) => x[0].toLowerCase() === w)) return s;
  }
  return paragraph.trim();
}

/**
 * Примеры из своих книг: предложения со словом. Кроме точного совпадения берём
 * формы с короткими окончаниями (noche → noches), если слово не совсем короткое.
 */
export function findExamples(word: string, paragraphs: string[], limit = 5): string[] {
  const key = word.toLowerCase();
  const len = [...key].length;
  const matches = (token: string) => {
    const t = token.toLowerCase();
    return t === key || (len >= 4 && t.startsWith(key) && [...t].length - len <= 2);
  };
  const out: string[] = [];
  for (const p of paragraphs) {
    for (const m of p.matchAll(SENTENCE)) {
      const s = m[0].trim();
      if (s.length > 260 || out.includes(s)) continue;
      if ([...s.matchAll(WORD)].some((x) => matches(x[0]))) out.push(s);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Выборка текста для ИИ: длинную книгу берём кусками из начала, середины и конца. */
export function sampleText(paragraphs: string[], maxChars: number): string {
  const all = paragraphs.join("\n");
  if (all.length <= maxChars) return all;
  const parts = 3;
  const size = Math.floor(maxChars / parts);
  const out: string[] = [];
  for (let i = 0; i < parts; i++) {
    const start = Math.floor(((all.length - size) * i) / (parts - 1));
    out.push(all.slice(start, start + size));
  }
  return out.join("\n…\n");
}
