import { detectCyrillic, glyphTable, morphOrder, morphWord, scriptInfo, type ScriptId } from "./scripts";

// Режим адаптации: текст на родном языке шаг за шагом превращается в текст
// на изучаемом. Стадии:
//   1. исходный текст;
//   2. переворот направления (для письма справа налево);
//   3. буквы по одной группе меняются на буквы цели (гласные — последними);
//   4. отдельные слова, затем конструкции меняются на настоящие слова цели;
//   5. простые предложения целиком на цели, потом средние, потом все.
// Для кодов (Морзе, Брайль) и «только алфавита» есть лишь стадии 1–3.

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

export interface AdaptDoc {
  id: string;
  title: string;
  srcLang: string;
  /** Язык цели, если текст переведён; для кодов и «только букв» — пусто. */
  tgtLang?: string;
  script: ScriptId;
  sentences: AdaptSentence[];
  created: string;
}

export type StageKind = "original" | "flip" | "letters" | "words" | "sentences";

export interface Stage {
  kind: StageKind;
  rtl: boolean;
  /** Сколько букв из порядка замены уже заменено. */
  letters: number;
  /** Доля заменённых слов и конструкций, 0..1. */
  words: number;
  /** Предложения с level ≤ этого числа идут целиком на цели. */
  sentences: number;
  /** Для подписи: номер шага внутри своей группы и сколько их всего. */
  step: number;
  of: number;
}

export interface Segment {
  text: string;
  kind: "src" | "morph" | "tgt";
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

export function letterOrder(doc: AdaptDoc): string[] {
  const text = sourceText(doc);
  const table = glyphTable(doc.script, detectCyrillic(text));
  if (!table) return [];
  const info = scriptInfo(doc.script);
  return morphOrder(text, table, !!info.rtl);
}

export function buildStages(doc: AdaptDoc, letterSteps = 5): Stage[] {
  const info = scriptInfo(doc.script);
  const rtl = !!info.rtl;
  const total = letterOrder(doc).length;
  const stages: Stage[] = [{ kind: "original", rtl: false, letters: 0, words: 0, sentences: 0, step: 1, of: 1 }];
  if (rtl) stages.push({ kind: "flip", rtl, letters: 0, words: 0, sentences: 0, step: 1, of: 1 });
  const steps = Math.min(letterSteps, total);
  for (let i = 1; i <= steps; i++)
    stages.push({ kind: "letters", rtl, letters: Math.ceil((i / steps) * total), words: 0, sentences: 0, step: i, of: steps });
  const translated = !!doc.tgtLang && doc.sentences.some((s) => s.tgt);
  if (translated) {
    const w = [1 / 3, 2 / 3, 1];
    w.forEach((words, i) => stages.push({ kind: "words", rtl, letters: total, words, sentences: 0, step: i + 1, of: 3 }));
    [1, 2, 3].forEach((level, i) => stages.push({ kind: "sentences", rtl, letters: total, words: 1, sentences: level, step: i + 1, of: 3 }));
  }
  return stages;
}

// Сначала одиночные слова, потом конструкции из нескольких слов.
function chunkOrder(chunks: AdaptChunk[]): AdaptChunk[] {
  return [...chunks].sort((a, b) => a.src.split(/\s+/).length - b.src.split(/\s+/).length);
}

const WORD = /(\p{L}[\p{L}\p{M}'’-]*)/u;

function morphText(text: string, table: ReturnType<typeof glyphTable>, replaced: Set<string>, code: boolean): Segment[] {
  if (!table || replaced.size === 0) return [{ text, kind: "src" }];
  return text
    .split(WORD)
    .filter((p) => p !== "")
    .map((part) => {
      if (!WORD.test(part)) {
        if (!code) return { text: part, kind: "src" as const };
        // В коде знак препинания, прижатый к слову, сливается с последней
        // буквой («р» + «.» = «л»), поэтому кодируем его и отделяем пробелом.
        const coded = [...part].map((ch) => (ch === " " ? "   " : ` ${typeof table[ch] === "string" ? table[ch] : ch}`)).join("");
        return { text: coded, kind: "morph" as const };
      }
      const m = morphWord(part, table, replaced, code);
      return { text: m, kind: m === part ? ("src" as const) : ("morph" as const) };
    });
}

export function renderSentence(doc: AdaptDoc, s: AdaptSentence, stage: Stage, order: string[]): Segment[] {
  if (stage.sentences >= s.level && s.tgt) return [{ text: s.tgt, kind: "tgt" }];
  const table = glyphTable(doc.script, detectCyrillic(s.src) || detectCyrillic(sourceText(doc)));
  const replaced = new Set(order.slice(0, stage.letters));
  const code = !!scriptInfo(doc.script).code;

  const chosen = chunkOrder(s.chunks).slice(0, Math.ceil(stage.words * s.chunks.length));
  // Находим выбранные куски в предложении без пересечений.
  const lower = s.src.toLowerCase();
  const spans: { start: number; end: number; tgt: string }[] = [];
  for (const c of chosen) {
    const needle = c.src.toLowerCase();
    if (!needle) continue;
    let from = 0;
    while (from <= lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      if (!spans.some((sp) => at < sp.end && end > sp.start)) {
        spans.push({ start: at, end, tgt: c.tgt });
        break;
      }
      from = at + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let pos = 0;
  for (const sp of spans) {
    if (sp.start > pos) out.push(...morphText(s.src.slice(pos, sp.start), table, replaced, code));
    out.push({ text: sp.tgt, kind: "tgt" });
    pos = sp.end;
  }
  if (pos < s.src.length) out.push(...morphText(s.src.slice(pos), table, replaced, code));
  return out;
}

/** Документ по абзацам: каждый абзац — список предложений, каждое — сегменты. */
export function renderDoc(doc: AdaptDoc, stage: Stage): Segment[][][] {
  const order = letterOrder(doc);
  const paras: Segment[][][] = [];
  for (const s of doc.sentences) {
    (paras[s.para] ??= []).push(renderSentence(doc, s, stage, order));
  }
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
