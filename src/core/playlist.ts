import { joinFrontmatter, splitFrontmatter } from "./markdown";
import type { Concept, LangCode } from "./types";

// Плейлист — «лестница»: базовые слова, потом сочетания из них, потом фразы
// посложнее. Слушается фоном: родной вариант → пауза → изучаемый → повтор.
// Пройденные ступени регулярно возвращаются, чтобы закрепиться.

export interface PlayStep {
  tgt: string;
  native: string;
}

export interface Playlist {
  id: string;
  title: string;
  lang: LangCode;
  nativeLang: LangCode;
  steps: PlayStep[];
  created: string;
}

export interface PlayItem {
  step: PlayStep;
  index: number;
  review: boolean;
}

/** Порядок проигрывания: после каждой новой ступени — повтор пары прежних. */
export function schedule(steps: PlayStep[], reviewEvery = 3): PlayItem[] {
  const out: PlayItem[] = [];
  steps.forEach((step, i) => {
    out.push({ step, index: i, review: false });
    if (reviewEvery > 0 && i > 0 && (i + 1) % reviewEvery === 0) {
      for (const back of [i - 1, i - reviewEvery, Math.floor(i / 2)]) {
        if (back >= 0 && back < i) out.push({ step: steps[back], index: back, review: true });
      }
    }
  });
  return out;
}

/** Грубая оценка длительности: ~0.45 с на слово при обычной скорости плюс паузы. */
export function estimateMinutes(items: PlayItem[], repeats: number, pauseSec: number, rate = 1): number {
  let sec = 0;
  for (const it of items) {
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    sec += (words(it.step.native) * 0.45) / rate + pauseSec + ((words(it.step.tgt) * 0.45) / rate + 0.8) * repeats;
  }
  return Math.round(sec / 60);
}

/** Плейлист без ИИ: слова из словаря, затем их примеры. */
export function offlinePlaylist(concepts: Concept[], target: LangCode, native: LangCode): PlayStep[] {
  const withBoth = concepts.filter((c) => c.terms[target] && c.terms[native]);
  const words = withBoth.map((c) => ({
    tgt: [c.terms[target].article, c.terms[target].text].filter(Boolean).join(" "),
    native: c.terms[native].text,
  }));
  const examples = withBoth.flatMap((c) => c.examples.filter((e) => e.lang === target && e.tr).map((e) => ({ tgt: e.text, native: e.tr! })));
  return [...words, ...examples];
}

export function serializePlaylist(p: Playlist): string {
  const { steps, ...meta } = p;
  const body = steps.map((s) => `- ${s.tgt} — ${s.native}`).join("\n");
  return joinFrontmatter({ ...meta, steps } as unknown as Record<string, unknown>, `# ${p.title}\n\n${body}`);
}

export function parsePlaylist(src: string, id: string): Playlist {
  const { data } = splitFrontmatter(src);
  return {
    id,
    title: String(data.title ?? id),
    lang: String(data.lang ?? "en"),
    nativeLang: String(data.nativeLang ?? "en"),
    created: String(data.created ?? ""),
    steps: Array.isArray(data.steps) ? (data.steps as PlayStep[]).filter((s) => s?.tgt) : [],
  };
}
