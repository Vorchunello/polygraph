import { detectCyrillic, glyphTable, morphOrder, morphWord, scriptInfo, type ScriptId, type VowelStyle } from "./scripts";

// Режим адаптации: текст на родном языке шаг за шагом превращается в текст
// на изучаемом. Стадии (каждую можно отключить или сделать плавнее):
//   1. исходный текст;
//   2. слова встают справа налево (для письма справа налево);
//   3. по желанию — и буквы внутри слов читаются справа налево;
//   4. буквы по несколько штук меняются на буквы цели (гласные — последними);
//   5. слова, затем конструкции меняются на настоящие слова цели — по всему
//      тексту по очереди, а не пачкой в каждом предложении;
//   6. предложения целиком на цели — по одному или группами по сложности,
//      от простых к сложным.
// Для кодов (Морзе, Брайль) и «только алфавита» есть лишь стадии 1 и 4.

export interface AdaptChunk {
  src: string;
  tgt: string;
}

export interface AdaptSentence {
  src: string;
  tgt?: string;
  /** 1 — короткое и простое, 3 — сложное. */
  level: 1 | 2 | 3;
  chunks: AdaptChunk[];
  /** Номер абзаца — чтобы сохранить разбивку исходника. */
  para: number;
}

export interface AdaptSettings {
  /** Стадия «слова справа налево». */
  flipWords: boolean;
  /** Стадия «и буквы внутри слов справа налево». */
  mirrorLetters: boolean;
  /** Сколько букв меняется за один шаг. */
  lettersPerStep: number;
  /** Сколько слов или конструкций меняется за один шаг. */
  wordsPerStep: number;
  /** Предложения целиком: по одному, группами по сложности или не менять. */
  sentences: "one" | "level" | "off";
  /** Гласные в арабском и иврите: длинными буквами или огласовками. */
  vowels: VowelStyle;
}

export const DEFAULT_ADAPT_SETTINGS: AdaptSettings = {
  flipWords: true,
  mirrorLetters: false,
  lettersPerStep: 2,
  wordsPerStep: 2,
  sentences: "one",
  vowels: "letters",
};

export interface AdaptDoc {
  id: string;
  title: string;
  srcLang: string;
  /** Язык цели, если текст переведён; для кодов и «только букв» — пусто. */
  tgtLang?: string;
  script: ScriptId;
  sentences: AdaptSentence[];
  created: string;
  settings?: AdaptSettings;
}

export type StageKind = "original" | "flip" | "mirror" | "letters" | "words" | "sentences";

export interface Stage {
  kind: StageKind;
  /** Слова идут справа налево. */
  rtl: boolean;
  /** Буквы внутри слов тоже идут справа налево. */
  mirror: boolean;
  /** Сколько букв из порядка замены уже заменено. */
  letters: number;
  /** Сколько слов и конструкций (по общему порядку) уже на цели. */
  words: number;
  /** Сколько предложений (по порядку сложности) уже целиком на цели. */
  sentences: number;
  step: number;
  of: number;
}

export interface Segment {
  text: string;
  kind: "src" | "morph" | "tgt";
  /** Слово исходника (а не пробел или знак) — его можно развернуть отдельно. */
  word?: boolean;
}

export function settingsOf(doc: AdaptDoc): AdaptSettings {
  return { ...DEFAULT_ADAPT_SETTINGS, ...doc.settings };
}

export function splitSentences(text: string): { src: string; para: number }[] {
  const out: { src: string; para: number }[] = [];
  text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .forEach((p, para) => {
      for (const s of p.split(/(?<=[.!?…])\s+(?=\S)/)) if (s.trim()) out.push({ src: s.trim(), para });
    });
  return out;
}

function sourceText(doc: AdaptDoc): string {
  return doc.sentences.map((s) => s.src).join(" ");
}

function tableFor(doc: AdaptDoc) {
  return glyphTable(doc.script, detectCyrillic(sourceText(doc)), settingsOf(doc).vowels);
}

export function letterOrder(doc: AdaptDoc): string[] {
  const table = tableFor(doc);
  if (!table) return [];
  return morphOrder(sourceText(doc), table, true);
}

/** Все куски перевода по тексту в порядке замены: сначала одиночные слова, потом конструкции. */
export function chunkOrder(doc: AdaptDoc): { sentence: number; chunk: AdaptChunk }[] {
  const all = doc.sentences.flatMap((s, si) => s.chunks.map((chunk, ci) => ({ sentence: si, chunk, ci, level: s.level })));
  return all
    .sort(
      (a, b) =>
        a.chunk.src.split(/\s+/).length - b.chunk.src.split(/\s+/).length || a.level - b.level || a.sentence - b.sentence || a.ci - b.ci,
    )
    .map(({ sentence, chunk }) => ({ sentence, chunk }));
}

/** Порядок перехода предложений целиком: от простых и коротких к сложным. */
export function sentenceOrder(doc: AdaptDoc): number[] {
  return doc.sentences
    .map((s, i) => ({ i, level: s.level, len: s.src.length, ok: !!s.tgt }))
    .filter((x) => x.ok)
    .sort((a, b) => a.level - b.level || a.len - b.len || a.i - b.i)
    .map((x) => x.i);
}

/**
 * Стадии без повторов: если шаг ничего не меняет на экране (например,
 * предложение уже целиком заменили отдельные слова), он выкидывается —
 * иначе «дальше» выглядит как зависание.
 */
export function buildStages(doc: AdaptDoc): Stage[] {
  const raw = rawStages(doc);
  const out: Stage[] = [];
  let prev = "";
  for (const s of raw) {
    const sig = `${s.rtl}|${s.mirror}|${renderDoc(doc, s)
      .map((p) => p.map((x) => x.segments.map((g) => g.text).join("")).join(" "))
      .join("\n")}`;
    if (sig !== prev) out.push(s);
    prev = sig;
  }
  // Номера шагов внутри групп после выброса пересчитываем.
  for (const kind of new Set(out.map((s) => s.kind))) {
    const group = out.filter((s) => s.kind === kind);
    group.forEach((s, i) => Object.assign(s, { step: i + 1, of: group.length }));
  }
  return out;
}

function rawStages(doc: AdaptDoc): Stage[] {
  const set = settingsOf(doc);
  const info = scriptInfo(doc.script);
  const rtl = !!info.rtl;
  const totalLetters = letterOrder(doc).length;
  const base = { rtl: false, mirror: false, letters: 0, words: 0, sentences: 0 };
  const stages: Stage[] = [{ kind: "original", ...base, step: 1, of: 1 }];

  const flip = rtl && set.flipWords;
  const mirror = rtl && set.mirrorLetters;
  if (flip) stages.push({ kind: "flip", ...base, rtl: true, step: 1, of: 1 });
  if (mirror) stages.push({ kind: "mirror", ...base, rtl: true, mirror: true, step: 1, of: 1 });
  const dir = { rtl: flip || mirror, mirror };

  const per = Math.max(1, set.lettersPerStep);
  const letterSteps = Math.ceil(totalLetters / per);
  for (let i = 1; i <= letterSteps; i++)
    stages.push({ kind: "letters", ...base, ...dir, letters: Math.min(totalLetters, i * per), step: i, of: letterSteps });

  const translated = !!doc.tgtLang && doc.sentences.some((s) => s.tgt);
  if (!translated) return stages;

  const chunks = chunkOrder(doc).length;
  const wPer = Math.max(1, set.wordsPerStep);
  const wordSteps = Math.ceil(chunks / wPer);
  for (let i = 1; i <= wordSteps; i++)
    stages.push({ kind: "words", ...base, ...dir, letters: totalLetters, words: Math.min(chunks, i * wPer), step: i, of: wordSteps });

  const order = sentenceOrder(doc);
  if (set.sentences === "one") {
    order.forEach((_, i) =>
      stages.push({ kind: "sentences", ...base, ...dir, letters: totalLetters, words: chunks, sentences: i + 1, step: i + 1, of: order.length }),
    );
  } else if (set.sentences === "level") {
    const levels = [...new Set(order.map((i) => doc.sentences[i].level))];
    levels.forEach((lv, k) => {
      const count = order.filter((i) => doc.sentences[i].level <= lv).length;
      stages.push({ kind: "sentences", ...base, ...dir, letters: totalLetters, words: chunks, sentences: count, step: k + 1, of: levels.length });
    });
  }
  return stages;
}

const WORD = /(\p{L}[\p{L}\p{M}'’-]*)/u;

function morphText(text: string, table: ReturnType<typeof glyphTable>, replaced: Set<string>, code: boolean): Segment[] {
  return text
    .split(WORD)
    .filter((p) => p !== "")
    .map((part) => {
      if (!WORD.test(part)) {
        if (!code || !table || replaced.size === 0) return { text: part, kind: "src" as const };
        // В коде знак препинания, прижатый к слову, сливается с последней
        // буквой («р» + «.» = «л»), поэтому кодируем его и отделяем пробелом.
        const coded = [...part].map((ch) => (ch === " " ? "   " : ` ${typeof table[ch] === "string" ? table[ch] : ch}`)).join("");
        return { text: coded, kind: "morph" as const };
      }
      if (!table || replaced.size === 0) return { text: part, kind: "src" as const, word: true };
      const m = morphWord(part, table, replaced, code);
      return { text: m, kind: m === part ? ("src" as const) : ("morph" as const), word: true };
    });
}

export interface RenderContext {
  order: string[];
  table: ReturnType<typeof glyphTable>;
  chunks: { sentence: number; chunk: AdaptChunk }[];
  sentenceRank: Map<number, number>;
  code: boolean;
}

export function renderContext(doc: AdaptDoc): RenderContext {
  return {
    order: letterOrder(doc),
    table: tableFor(doc),
    chunks: chunkOrder(doc),
    sentenceRank: new Map(sentenceOrder(doc).map((si, rank) => [si, rank])),
    code: !!scriptInfo(doc.script).code,
  };
}

export function renderSentence(doc: AdaptDoc, si: number, stage: Stage, ctx: RenderContext): Segment[] {
  const s = doc.sentences[si];
  const rank = ctx.sentenceRank.get(si);
  if (s.tgt && rank !== undefined && rank < stage.sentences) return [{ text: s.tgt, kind: "tgt" }];
  const replaced = new Set(ctx.order.slice(0, stage.letters));

  const chosen = ctx.chunks.slice(0, stage.words).filter((c) => c.sentence === si);
  // Находим выбранные куски в предложении без пересечений.
  const lower = s.src.toLowerCase();
  const spans: { start: number; end: number; tgt: string }[] = [];
  for (const { chunk } of chosen) {
    const needle = chunk.src.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      if (!spans.some((sp) => at < sp.end && end > sp.start)) {
        spans.push({ start: at, end, tgt: chunk.tgt });
        break;
      }
      from = at + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let pos = 0;
  for (const sp of spans) {
    if (sp.start > pos) out.push(...morphText(s.src.slice(pos, sp.start), ctx.table, replaced, ctx.code));
    out.push({ text: sp.tgt, kind: "tgt" });
    pos = sp.end;
  }
  if (pos < s.src.length) out.push(...morphText(s.src.slice(pos), ctx.table, replaced, ctx.code));
  return out;
}

/** Документ по абзацам: абзац — список предложений {номер, сегменты}. */
export function renderDoc(doc: AdaptDoc, stage: Stage): { index: number; segments: Segment[] }[][] {
  const ctx = renderContext(doc);
  const paras: { index: number; segments: Segment[] }[][] = [];
  doc.sentences.forEach((s, i) => {
    (paras[s.para] ??= []).push({ index: i, segments: renderSentence(doc, i, stage, ctx) });
  });
  return paras.filter(Boolean);
}

/** Документ без перевода: для кодов и «только алфавита». */
export function plainDoc(id: string, title: string, text: string, srcLang: string, script: ScriptId, created: string): AdaptDoc {
  return {
    id,
    title,
    srcLang,
    script,
    created,
    sentences: splitSentences(text).map((s) => ({ ...s, level: 1, chunks: [] })),
  };
}
