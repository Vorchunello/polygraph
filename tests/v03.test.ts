import { describe, expect, it } from "vitest";
import { buildDrill, guessMatches, pickWords, trapPairsFromDictionary } from "../src/core/games";
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
