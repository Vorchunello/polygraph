import { describe, expect, it } from "vitest";
import { buildDrill, guessMatches, pickWords, trapPairsFromDictionary } from "../src/core/games";
import { speechScore } from "../src/core/similarity";
import { studyStreak } from "../src/core/srs";
import { isSilent } from "../src/storage/speech";
import { guessKnownLang } from "../src/ui/AdaptView";
import { extractJson } from "../src/ai/json";
import { maskWord } from "../src/ui/StudyView";
import { anchorSplit, minutesLeft, rhythmSentences, rsvpDelay, rsvpTokens } from "../src/core/readingModes";
import { parseBookFile, parseSubtitles } from "../src/core/reader";
import type { Concept } from "../src/core/types";

const mk = (id: string, es: string, ru: string, extra: Partial<Concept> = {}): Concept => ({
  id,
  terms: { es: { text: es }, ru: { text: ru } },
  bridges: [],
  examples: [],
  tags: [],
  srs: {},
  created: "2026-10-10",
  updated: "2026-10-10",
  notes: "",
  ...extra,
});

const words = [
  mk("noche", "noche", "ночь", {
    terms: { es: { text: "noche", gender: "f", article: "la" }, ru: { text: "ночь", gender: "f" } },
    bridges: [{ from: "ru", kind: "cognate", strength: "strong", note: "общий корень" }],
    examples: [{ lang: "es", text: "Buenas noches a todos", tr: "Спокойной ночи всем" }],
  }),
  mk("mesa", "mesa", "стол", {
    terms: { es: { text: "mesa", gender: "f", article: "la" }, ru: { text: "стол", gender: "m" } },
    bridges: [{ from: "ru", kind: "gender", strength: "broken", note: "род не совпадает" }],
  }),
  mk("casa", "casa", "дом"),
  mk("perro", "perro", "собака"),
  mk("agua", "agua", "вода"),
];

const seq = (() => {
  let s = 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

describe("reading modes", () => {
  it("bolds the start of words", () => {
    expect(anchorSplit("a")).toEqual(["a", ""]);
    expect(anchorSplit("dom")).toEqual(["d", "om"]);
    expect(anchorSplit("noche")).toEqual(["no", "che"]);
    expect(anchorSplit("biblioteca")).toEqual(["bibl", "ioteca"]);
  });

  it("alternates sentence styles", () => {
    const r = rhythmSentences("Uno. Dos. Tres.");
    expect(r.map((x) => x.text)).toEqual(["Uno.", "Dos.", "Tres."]);
    expect(new Set(r.map((x) => x.style)).size).toBeGreaterThan(1);
  });

  it("pauses longer at the end of a sentence", () => {
    const [a, b] = rsvpTokens("hola mundo.");
    expect(rsvpDelay(b, 300)).toBeGreaterThan(rsvpDelay(a, 300));
    expect(minutesLeft(["uno dos tres"], 180)).toBe(1);
  });
});

describe("drills", () => {
  it("builds the requested exercise kinds", () => {
    const ex = buildDrill(words, "es", ["ru"], { kinds: ["choose", "reverse", "type"], count: 6, source: "all" }, seq);
    expect(ex).toHaveLength(6);
    expect(ex.map((e) => e.kind)).toEqual(["choose", "reverse", "type", "choose", "reverse", "type"]);
    const choose = ex[0];
    if (!("options" in choose)) throw new Error("expected options");
    expect(choose.options.filter((o) => o.correct)).toHaveLength(1);
    expect(choose.options.length).toBeGreaterThanOrEqual(3);
  });

  it("skips kinds a word cannot support", () => {
    const ex = buildDrill(words, "es", ["ru"], { kinds: ["order", "gender"], count: 4, source: "all" }, seq);
    expect(ex.every((e) => e.kind === "order" || e.kind === "gender")).toBe(true);
    const order = ex.find((e) => e.kind === "order");
    if (order && order.kind === "order") expect([...order.shuffled].sort()).toEqual([...order.answer].sort());
  });

  it("filters traps", () => {
    expect(pickWords(words, "es", "traps").map((c) => c.id)).toEqual(["mesa"]);
  });

  it("makes bridge-or-trap pairs from the dictionary", () => {
    const pairs = trapPairsFromDictionary(words, "es");
    expect(pairs).toHaveLength(2);
    expect(pairs.find((p) => p.conceptId === "mesa")?.trap).toBe(true);
    expect(pairs.find((p) => p.conceptId === "noche")?.trap).toBe(false);
  });
});

describe("sennaar guesses", () => {
  it("accepts meanings, synonyms and inflected forms", () => {
    expect(guessMatches("Ночь", "ночь")).toBe(true);
    expect(guessMatches("ночью", "ночь")).toBe(true);
    expect(guessMatches("школа", "учебное заведение", ["школа"])).toBe(true);
    expect(guessMatches("дом", "ночь")).toBe(false);
    expect(guessMatches("н", "ночь")).toBe(false);
  });
});

describe("subtitles", () => {
  const srt = `1
00:00:01,000 --> 00:00:02,500
<i>Hola.</i>

2
00:00:02,600 --> 00:00:04,000
¿Qué tal?

3
00:00:09,000 --> 00:00:10,000
Muy bien.`;

  it("joins cues and splits on long pauses", () => {
    expect(parseSubtitles(srt)).toEqual(["Hola. ¿Qué tal?", "Muy bien."]);
  });

  it("reads WebVTT through the book importer", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nUno\n\n00:02.100 --> 00:03.000\nDos";
    expect(parseBookFile("clip.vtt", new TextEncoder().encode(vtt))).toEqual({ title: "clip", paragraphs: ["Uno Dos"] });
  });
});

describe("streak", () => {
  const withLast = (id: string, last: string) => mk(id, id, id, { srs: { es: { due: last, interval: 1, ease: 2.5, reps: 1, lapses: 0, last } } });

  it("counts consecutive study days", () => {
    const cs = [withLast("a", "2026-10-11"), withLast("b", "2026-10-10"), withLast("c", "2026-10-09"), withLast("d", "2026-10-07")];
    expect(studyStreak(cs, "2026-10-11")).toEqual({ days: 3, today: true });
  });

  it("keeps yesterday's streak alive until the day is over", () => {
    expect(studyStreak([withLast("a", "2026-10-10")], "2026-10-11")).toEqual({ days: 1, today: false });
    expect(studyStreak([withLast("a", "2026-10-08")], "2026-10-11")).toEqual({ days: 0, today: false });
  });
});

describe("bridge hint", () => {
  it("hides the answer inside the hint", () => {
    expect(maskWord("Общий корень: ночь — noche — night.", "noche")).toBe("Общий корень: ночь — … — night.");
    expect(maskWord("Noche и noche", "noche")).toBe("… и …");
    expect(maskWord("a+b (c)", "a+b")).toBe("… (c)");
  });
});

describe("pronunciation score", () => {
  it("rewards close matches and ignores case, accents and articles", () => {
    expect(speechScore("Noche.", "noche")).toBe(1);
    expect(speechScore("la noche", "noche")).toBe(0.95);
    expect(speechScore("canción", "cancion")).toBe(1);
    expect(speechScore("noce", "noche")).toBeGreaterThan(0.7);
    expect(speechScore("perro", "noche")).toBeLessThan(0.3);
  });
});

describe("truncated AI answers", () => {
  it("keeps the complete items of a JSON cut off mid-way", () => {
    const cut = '{"s":[{"tgt":"uno","level":1,"chunks":[{"src":"a","tgt":"b"}]},{"tgt":"dos","level":2,"chunks":[]},{"tgt":"tr';
    const r = extractJson<{ s: { tgt: string }[] }>(cut);
    expect(r.s.map((x) => x.tgt)).toEqual(["uno", "dos"]);
  });

  it("handles an unclosed code fence and commas inside strings", () => {
    const r = extractJson<{ notes: { title: string }[] }>('```json\n{"notes":[{"title":"a, b"},{"title":"c"');
    expect(r.notes.map((n) => n.title)).toEqual(["a, b"]);
  });

  it("still fails clearly on hopeless output", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("adaptation source language", () => {
  it("guesses the known language from the alphabet of the pasted text", () => {
    expect(guessKnownLang("Я иду в школу.", ["en", "tr", "ru"])).toBe("ru");
    expect(guessKnownLang("Okula gidiyorum.", ["ru", "tr"])).toBe("tr");
    expect(guessKnownLang("Я иду в школу.", ["en", "tr"])).toBeNull();
    expect(guessKnownLang("ok", ["en"])).toBeNull();
  });
});

describe("silence check", () => {
  it("does not send silence to speech recognition", () => {
    expect(isSilent(new Float32Array(16000))).toBe(true);
    const tone = Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin(i / 10));
    expect(isSilent(tone)).toBe(false);
  });
});
