import { describe, expect, it } from "vitest";
import { findExamples, looksLikeName, pickVocabulary, sampleText, sentenceWith, wordStats, type LookupResult } from "../src/core/vocab";
import { dictKey, hitGender, hitNotes, shortGloss, type DictHit } from "../src/storage/dictionary";
import { learnCard, matchCase } from "../src/ui/saveWord";

const TEXT = [
  "María abrió la ventana. La noche era fría y las estrellas brillaban.",
  "Ella miraba las estrellas cada noche. Las noches de invierno son largas.",
];

describe("wordStats", () => {
  it("counts words case-insensitively and keeps the first sentence", () => {
    const s = new Map(wordStats(TEXT).map((x) => [x.key, x]));
    expect(s.get("estrellas")?.count).toBe(2);
    expect(s.get("la")?.count).toBe(2);
    expect(s.get("noche")?.example).toBe("La noche era fría y las estrellas brillaban.");
  });

  it("spots names: capitalized in the middle of a sentence", () => {
    const [st] = wordStats(["Ayer vi a Pedro en el parque."]).filter((x) => x.key === "pedro");
    expect(looksLikeName(st)).toBe(true);
    const [first] = wordStats(["Ayer vi a Pedro."]).filter((x) => x.key === "ayer");
    expect(looksLikeName(first)).toBe(false);
  });
});

describe("pickVocabulary", () => {
  const DICT: Record<string, LookupResult> = {
    la: { lemma: "la", pos: "article", gloss: "the", rank: 10, function: true },
    las: { lemma: "la", pos: "article", gloss: "the", rank: 10, function: true },
    noche: { lemma: "noche", pos: "noun", gloss: "night", rank: 8, function: false },
    noches: { lemma: "noche", pos: "noun", gloss: "night", rank: 8, function: false },
    estrellas: { lemma: "estrella", pos: "noun", gloss: "star", rank: 7, function: false },
    ventana: { lemma: "ventana", pos: "noun", gloss: "window", rank: 7, function: false },
    brillaban: { lemma: "brillar", pos: "verb", gloss: "to shine", rank: 6, function: false },
    fría: { lemma: "frío", pos: "adj", gloss: "cold", rank: 7, function: false },
  };
  const lookup = async (w: string) => DICT[w.toLowerCase()] ?? null;

  it("with a dictionary: lemmas, no grammar words, no unknown words, no names", async () => {
    const items = await pickVocabulary(TEXT, { skip: new Set(), limit: 10, lookup });
    const lemmas = items.map((i) => i.lemma);
    expect(lemmas).toContain("noche");
    expect(lemmas).toContain("estrella");
    expect(lemmas).not.toContain("la");
    expect(lemmas).not.toContain("maría");
    // «noche» и «noches» — одно слово, счётчик общий.
    const noche = items.find((i) => i.lemma === "noche")!;
    expect(noche.count).toBe(3);
    expect(noche.forms).toEqual(expect.arrayContaining(["noche", "noches"]));
    // Частое в тексте — выше.
    expect(lemmas[0]).toBe("noche");
  });

  it("skips words already known — by form and by lemma", async () => {
    const items = await pickVocabulary(TEXT, { skip: new Set(["noche", "ventana"]), limit: 10, lookup });
    expect(items.map((i) => i.lemma)).not.toContain("noche");
    expect(items.map((i) => i.lemma)).not.toContain("ventana");
  });

  it("without a dictionary: drops short words, respects the limit", async () => {
    const items = await pickVocabulary(TEXT, { skip: new Set(), limit: 3 });
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.lemma.length >= 4)).toBe(true);
  });

  it("keeps capitalized German nouns", async () => {
    const items = await pickVocabulary(["Ich sehe den Baum im Garten."], { skip: new Set(), limit: 10, lang: "de" });
    expect(items.map((i) => i.lemma)).toContain("baum");
  });
});

describe("text helpers", () => {
  it("sentenceWith finds the sentence with the word", () => {
    expect(sentenceWith(TEXT[1], "invierno")).toBe("Las noches de invierno son largas.");
    expect(sentenceWith(TEXT[1], "zzz")).toBe(TEXT[1]);
  });

  it("sampleText takes the beginning, middle and end of a long text", () => {
    const paras = Array.from({ length: 300 }, (_, i) => `Paragraph ${i} ${"x".repeat(80)}`);
    const s = sampleText(paras, 3000);
    expect(s.length).toBeLessThan(3100);
    expect(s).toContain("Paragraph 0 ");
    expect(s).toContain("Paragraph 299");
  });
});

const HIT: DictHit = {
  lemma: "noche",
  form: "noches",
  rank: 8,
  senses: [{ p: "noun", d: ["night (period between sunset and sunrise)", "evening"], g: "f", i: "/ˈnot͡ʃe/", t: "Inherited from Old Spanish noche, from Latin noctem." }],
};

describe("offline dictionary", () => {
  it("dictKey ignores case, harakat, niqqud and stress marks", () => {
    expect(dictKey("Noche")).toBe("noche");
    expect(dictKey("كَتَبَ")).toBe("كتب");
    expect(dictKey("שָׁלוֹם")).toBe("שלום");
    expect(dictKey("моло́ко")).toBe("молоко");
  });

  it("short gloss, gender and notes", () => {
    expect(shortGloss(HIT)).toBe("night");
    expect(hitGender(HIT)).toBe("f");
    expect(hitNotes(HIT)).toContain("*noun* — night");
    expect(hitNotes(HIT)).toContain("/ˈnot͡ʃe/");
  });

  it("learnCard builds a card from a book word", () => {
    const c = learnCard({
      id: "noche",
      lang: "es",
      lemma: "noche",
      hit: HIT,
      translation: { lang: "ru", text: "ночь" },
      example: "La noche era fría.",
      tags: ["reader"],
      known: ["ru", "en"],
    });
    expect(c.terms.es).toEqual({ text: "noche", gender: "f" });
    expect(c.terms.ru.text).toBe("ночь");
    expect(c.terms.en.text).toBe("night");
    expect(c.examples[0]).toEqual({ lang: "es", text: "La noche era fría." });
    expect(c.etymologySource).toBe("wiktionary");
    expect(c.srs).toEqual({});
  });

  it("learnCard leaves English out when the learner doesn't know it", () => {
    const c = learnCard({ id: "x", lang: "es", lemma: "noche", hit: HIT, tags: [], known: ["ru"] });
    expect(c.terms.en).toBeUndefined();
  });
});

describe("v0.5 helpers", () => {
  it("findExamples: exact word and short endings, not other words", () => {
    const ex = findExamples("noche", TEXT);
    expect(ex).toEqual(["La noche era fría y las estrellas brillaban.", "Ella miraba las estrellas cada noche.", "Las noches de invierno son largas."]);
    expect(findExamples("la", ["Las casas. La casa."])).toEqual(["La casa."]);
  });

  it("matchCase lowercases a capitalized translation of a lowercase word", () => {
    expect(matchCase("Улица", "calle")).toBe("улица");
    expect(matchCase("Madrid", "Madrid")).toBe("Madrid");
    expect(matchCase("NASA", "nasa")).toBe("NASA");
  });
});
