import { describe, expect, it } from "vitest";
import { extractJson } from "../src/ai/json";
import { normalizeDraft } from "../src/ai/tasks";
import { stripThinking } from "../src/ai/client";
import { conceptsFromAnki, conceptsFromCsv, conceptsToAnki, conceptsToCsv, parseCsv } from "../src/core/exchange";
import { parseConcept, parseInbox, serializeConcept, serializeInbox, slugify } from "../src/core/markdown";
import { defaultRoutes, parseRoutes, serializeRoutes } from "../src/core/routes";
import { buildQueue, review } from "../src/core/srs";
import type { Concept, Profile } from "../src/core/types";
import { renderMarkdown } from "../src/ui/Markdown";
import { sameAnswer } from "../src/ui/StudyView";

const noche: Concept = {
  id: "noche",
  terms: { es: { text: "noche", gender: "f", article: "la" }, ru: { text: "ночь", gender: "f" }, en: { text: "night" } },
  bridges: [{ from: "ru", kind: "cognate", strength: "strong", note: "Общий праиндоевропейский корень *nókʷts", verified: false, source: "ai" }],
  examples: [{ lang: "es", text: "Buenas noches.", tr: "Спокойной ночи." }],
  etymology: "лат. nox, noctis",
  tags: ["time"],
  srs: {},
  created: "2026-10-10",
  updated: "2026-10-10",
  notes: "Род совпадает с русским.",
};

const profile: Profile = {
  uiLang: "ru",
  known: [
    { code: "ru", level: "native" },
    { code: "tr", level: "C1" },
    { code: "en", level: "B2" },
  ],
  learning: [{ code: "es", level: "A2" }],
  created: "2026-10-10",
};

describe("markdown vault format", () => {
  it("round-trips a concept", () => {
    const back = parseConcept(serializeConcept(noche), "x");
    expect({ ...back, updated: noche.updated }).toEqual(noche);
  });

  it("keeps the file readable", () => {
    const md = serializeConcept(noche);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("text: noche");
    expect(md.trimEnd().endsWith("Род совпадает с русским.")).toBe(true);
  });

  it("tolerates a file without frontmatter", () => {
    const c = parseConcept("just notes", "plain");
    expect(c.id).toBe("plain");
    expect(c.notes).toBe("just notes");
  });

  it("round-trips the inbox", () => {
    expect(parseInbox(serializeInbox(["echar de menos", "#spanish ojalá"]))).toEqual(["echar de menos", "#spanish ojalá"]);
  });

  it("slugifies any script", () => {
    expect(slugify("La Noche")).toBe("la-noche");
    expect(slugify("ночь")).toBe("noch");
    expect(slugify("çiçek")).toBe("cicek");
    expect(slugify("ليل")).toBe("word");
  });
});

describe("routes", () => {
  it("builds defaults from the profile", () => {
    const r = defaultRoutes(profile, "es");
    expect(r.find((x) => x.id === "gender")?.via).toBe("ru");
    expect(r.find((x) => x.id === "articles")?.via).toBe("en");
    expect(r.find((x) => x.id === "cases")).toBeUndefined();
  });

  it("parses what it serializes, and Russian «через»", () => {
    const r = defaultRoutes(profile, "es");
    expect(parseRoutes(serializeRoutes("es", r))).toEqual(r);
    expect(parseRoutes("- [ser-estar] Ser и estar — через tr — **[?]**")).toEqual([{ id: "ser-estar", topic: "Ser и estar", via: "tr", marker: "?" }]);
  });

  it("routes Arabic cases through Russian, not Turkish", () => {
    expect(defaultRoutes(profile, "ar").find((x) => x.id === "cases")?.via).toBe("ru");
  });
});

describe("srs", () => {
  it("grows intervals on good answers", () => {
    let s = review(undefined, "good", "2026-10-10");
    expect(s.interval).toBe(1);
    expect(s.due).toBe("2026-10-11");
    s = review(s, "good", "2026-10-11");
    expect(s.interval).toBe(3);
    s = review(s, "good", "2026-10-14");
    expect(s.interval).toBe(8);
  });

  it("resets on again", () => {
    const s = review(review(review(undefined, "good"), "good"), "again", "2026-10-10");
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(1);
    expect(s.ease).toBeCloseTo(2.3);
  });

  it("queues due before new", () => {
    const due = { ...noche, id: "a", srs: { es: review(undefined, "good", "2026-10-01") } };
    const later = { ...noche, id: "b", srs: { es: review(undefined, "easy", "2026-10-10") } };
    const fresh = { ...noche, id: "c" };
    expect(buildQueue([fresh, later, due], "es", 10, "2026-10-10").map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("exchange", () => {
  let n = 0;
  const id = (s: string) => `${slugify(s)}-${n++}`;

  it("parses quoted CSV", () => {
    expect(parseCsv('es,ru\n"hola, amigo",привет\n')).toEqual([
      ["es", "ru"],
      ["hola, amigo", "привет"],
    ]);
  });

  it("imports CSV with gender markers", () => {
    const [c] = conceptsFromCsv("es;ru;tags\nla mesa (f);стол (m);home\n", id);
    expect(c.terms.es).toEqual({ text: "la mesa", gender: "f" });
    expect(c.terms.ru.gender).toBe("m");
    expect(c.tags).toEqual(["home"]);
  });

  it("round-trips CSV", () => {
    const csv = conceptsToCsv([noche], ["es", "ru", "en"]);
    const [c] = conceptsFromCsv(csv, id);
    expect(c.terms.es.text).toBe("noche");
    expect(c.notes).toBe(noche.notes);
  });

  it("writes and reads Anki text", () => {
    const txt = conceptsToAnki([noche], "es", ["ru", "en"]);
    expect(txt).toContain("#separator:tab");
    const [c] = conceptsFromAnki(txt, "es", "ru", id);
    expect(c.terms.es.text).toContain("noche");
    expect(c.tags).toEqual(["time"]);
  });
});

describe("AI output handling", () => {
  it("extracts JSON from chatty, fenced output with trailing commas", () => {
    expect(extractJson('Sure!\n```json\n{"a": [1, 2,],}\n```')).toEqual({ a: [1, 2] });
  });

  it("strips reasoning tags of local models", () => {
    expect(stripThinking("<think>hmm</think>\nHola")).toBe("Hola");
  });

  it("normalizes a sloppy draft", () => {
    const d = normalizeDraft(
      {
        terms: { ES: { text: "noche", gender: "x" as "f" }, ru: "ночь" as never },
        bridges: [{ from: "RU", kind: "weird" as "cognate", strength: "strong", note: "root" }, { from: "en" } as never],
      },
      "es",
    );
    expect(d.terms.es).toEqual({ text: "noche" });
    expect(d.terms.ru.text).toBe("ночь");
    expect(d.bridges).toHaveLength(1);
    expect(d.bridges[0]).toMatchObject({ from: "ru", kind: "cognate", verified: false });
  });

  it("rejects a draft without the target word", () => {
    expect(() => normalizeDraft({ terms: { ru: { text: "ночь" } } }, "es")).toThrow();
  });
});

describe("ui helpers", () => {
  it("compares answers leniently", () => {
    expect(sameAnswer("Noche", "noche")).toBe(true);
    expect(sameAnswer("la noche", "noche", "la")).toBe(true);
    expect(sameAnswer("cancion", "canción")).toBe(true);
    expect(sameAnswer("dia", "noche")).toBe(false);
  });

  it("renders markdown safely", () => {
    const html = renderMarkdown("# T\n\n**bold** <script>x</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<table>");
    expect(html).toContain("<li>two</li>");
  });
});
