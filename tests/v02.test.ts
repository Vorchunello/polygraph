import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildStages, chunkOrder, DEFAULT_ADAPT_SETTINGS, plainDoc, renderDoc, type AdaptDoc } from "../src/core/adapt";
import { backlinks, extractLinks, parseNote, resolveLink, searchNotes, serializeNote } from "../src/core/notes";
import { estimateMinutes, offlinePlaylist, parsePlaylist, schedule, serializePlaylist } from "../src/core/playlist";
import { pageCount, parseBook, parseBookFile, parseFb2, parsePlain, parseTranslation, serializeBook, serializeTranslation } from "../src/core/reader";
import { detectCyrillic, glyphTable, morphWord, scriptOfLang } from "../src/core/scripts";
import { matchesInflected, toucanize } from "../src/core/toucan";
import type { Concept } from "../src/core/types";

const flat = (doc: AdaptDoc, i: number) =>
  renderDoc(doc, buildStages(doc)[i])
    .map((p) => p.map((s) => s.segments.map((x) => x.text).join("")).join(" "))
    .join("\n");

describe("scripts", () => {
  it("writes Arabic vowels as long letters by default, like real transliteration", () => {
    const t = glyphTable("arabic", true)!;
    const all = new Set(Object.keys(t));
    expect(morphWord("москва", t, all, false)).toBe("موسكفا");
    expect(morphWord("иван", t, all, false)).toBe("إيفان");
  });

  it("can write vowels as harakat instead", () => {
    const t = glyphTable("arabic", true, "harakat")!;
    const all = new Set(Object.keys(t));
    expect(morphWord("мама", t, all, false)).toBe("مَمَ");
    expect(morphWord("утро", t, all, false)).toBe("أُترُ");
    expect(morphWord("он", t, all, false)).toBe("أُن");
  });

  it("does not turn е/я after a consonant into «йе»/«йа»", () => {
    const t = glyphTable("arabic", true, "harakat")!;
    const all = new Set(Object.keys(t));
    // «вечером»: в-е-ч-е-р-о-м, без лишних «й».
    expect(morphWord("вечером", t, all, false)).toBe("فِتشِرُم");
    // В начале слова и после гласной «я» остаётся йотированной.
    expect(morphWord("яма", t, all, false)).toBe("يَمَ");
  });

  it("spells Morse letter by letter", () => {
    const t = glyphTable("morse", false)!;
    expect(morphWord("sos", t, new Set(Object.keys(t)), true)).toBe("... --- ...");
    expect(morphWord("сос", glyphTable("morse", true)!, new Set(["с", "о"]), true)).toBe("... --- ...");
  });

  it("knows which script a language uses", () => {
    expect(scriptOfLang("ar")).toBe("arabic");
    expect(scriptOfLang("ru")).toBe("cyrillic");
    expect(detectCyrillic("Привет, world")).toBe(true);
  });
});

describe("adaptation", () => {
  const doc: AdaptDoc = {
    id: "d",
    title: "t",
    srcLang: "ru",
    tgtLang: "ar",
    script: "arabic",
    created: "2026-10-10",
    sentences: [
      { src: "Я иду в школу.", tgt: "أَنَا ذَاهِبٌ إِلَى الْمَدْرَسَةِ.", level: 1, para: 0, chunks: [{ src: "школу", tgt: "الْمَدْرَسَةِ" }, { src: "иду в", tgt: "ذَاهِبٌ إِلَى" }] },
      { src: "Потом я пойду в магазин, потому что дома нет хлеба.", tgt: "ثُمَّ سَأَذْهَبُ إِلَى الْمَتْجَرِ لِأَنَّهُ لَا يُوجَدُ خُبْزٌ فِي الْبَيْتِ.", level: 3, para: 1, chunks: [{ src: "магазин", tgt: "الْمَتْجَرِ" }, { src: "хлеба", tgt: "خُبْزٌ" }] },
    ],
  };

  it("goes original → words right-to-left → letters → words → sentences one by one", () => {
    const kinds = buildStages(doc).map((s) => s.kind);
    expect(kinds[0]).toBe("original");
    expect(kinds[1]).toBe("flip");
    expect(kinds).not.toContain("mirror");
    expect(kinds.filter((k) => k === "words")).toHaveLength(2); // 4 куска по 2 за шаг
    expect(kinds.filter((k) => k === "sentences")).toHaveLength(2); // по одному
  });

  it("gets smoother with smaller steps", () => {
    const coarse = buildStages({ ...doc, settings: { ...DEFAULT_ADAPT_SETTINGS, lettersPerStep: 6, wordsPerStep: 4 } });
    const fine = buildStages({ ...doc, settings: { ...DEFAULT_ADAPT_SETTINGS, lettersPerStep: 1, wordsPerStep: 1 } });
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(fine.filter((s) => s.kind === "words")).toHaveLength(4);
  });

  it("can add a mirrored-letters stage and skip the flip", () => {
    const kinds = buildStages({ ...doc, settings: { ...DEFAULT_ADAPT_SETTINGS, flipWords: false, mirrorLetters: true } }).map((s) => s.kind);
    expect(kinds).toContain("mirror");
    expect(kinds).not.toContain("flip");
  });

  it("keeps the text intact at the start and fully Arabic at the end", () => {
    const stages = buildStages(doc);
    expect(flat(doc, 0)).toBe("Я иду в школу.\nПотом я пойду в магазин, потому что дома нет хлеба.");
    const last = flat(doc, stages.length - 1);
    expect(last).not.toMatch(/[а-яё]/i);
    expect(last).toContain("الْمَدْرَسَةِ");
  });

  it("has no Cyrillic left once all letters are replaced", () => {
    const stages = buildStages(doc);
    const lettersDone = stages.findLastIndex((s) => s.kind === "letters");
    expect(flat(doc, lettersDone)).not.toMatch(/[а-яё]/i);
  });

  it("swaps words one by one across the whole text, single words before constructions", () => {
    const order = chunkOrder(doc).map((c) => c.chunk.src);
    expect(order.at(-1)).toBe("иду в");
    const stages = buildStages({ ...doc, settings: { ...DEFAULT_ADAPT_SETTINGS, wordsPerStep: 1 } });
    const first = stages.findIndex((s) => s.kind === "words");
    const text = flat({ ...doc, settings: { ...DEFAULT_ADAPT_SETTINGS, wordsPerStep: 1 } }, first);
    // Ровно одно слово на арабском — плавный шаг, а не по слову в каждом предложении.
    expect([text.includes("الْمَدْرَسَةِ"), text.includes("الْمَتْجَرِ"), text.includes("خُبْزٌ")].filter(Boolean)).toHaveLength(1);
  });

  it("switches simple sentences to the target first", () => {
    const stages = buildStages(doc);
    const s1 = stages.findIndex((s) => s.kind === "sentences");
    const text = flat(doc, s1).split("\n");
    expect(text[0]).toBe(doc.sentences[0].tgt);
    expect(text[1]).not.toBe(doc.sentences[1].tgt);
  });

  it("marks source words so the UI can lay them out right to left", () => {
    const stages = buildStages(doc);
    const segs = renderDoc(doc, stages[1])[0][0].segments;
    expect(segs.filter((s) => s.word).map((s) => s.text)).toEqual(["Я", "иду", "в", "школу"]);
  });

  it("codes have only letter stages", () => {
    const morse = plainDoc("m", "m", "SOS. Help!", "en", "morse", "2026-10-10");
    const stages = buildStages(morse);
    expect(stages.every((s) => s.kind === "original" || s.kind === "letters")).toBe(true);
    expect(flat(morse, stages.length - 1)).toContain("... --- ...");
    // Знак не прилипает к последней букве: «s» (...) + «.» не должно дать «....» (h).
    expect(flat(morse, stages.length - 1)).toContain("... --- ... .-.-.-");
    expect(flat(morse, stages.length - 1)).toContain(".--. -.-.--");
    expect(flat(morse, stages.length - 1)).not.toMatch(/[a-z]/i);
  });
});

describe("toucan", () => {
  const night = { id: "noche", terms: { es: { text: "noche" }, ru: { text: "ночь" } } } as unknown as Concept;
  const table = { id: "mesa", terms: { es: { text: "mesa" }, ru: { text: "стол" } } } as unknown as Concept;

  it("matches inflected forms", () => {
    expect(matchesInflected("ночью", "ночь", "ru")).toBe(true);
    expect(matchesInflected("столом", "стол", "ru")).toBe(true);
    expect(matchesInflected("столица", "стол", "ru")).toBe(false);
    expect(matchesInflected("nights", "night", "en")).toBe(true);
  });

  it("swaps known words and remembers the original", () => {
    const segs = toucanize("Ночью на столе лежала книга.", [night, table], "ru", "es");
    expect(segs.map((s) => s.text).join("")).toBe("noche на mesa лежала книга.");
    expect(segs.filter((s) => s.swap).map((s) => s.swap!.original)).toEqual(["Ночью", "столе"]);
  });

  it("density 0 swaps nothing", () => {
    expect(toucanize("Ночью", [night], "ru", "es", 0).some((s) => s.swap)).toBe(false);
  });
});

describe("notes", () => {
  const a = parseNote("---\ntitle: Ser и estar\ntags: [grammar]\n---\nСм. [[Subjuntivo]] и [[noche|ночь]].", "ser-estar");
  const b = parseNote("# Subjuntivo\n\nСослагательное наклонение.", "subjuntivo");

  it("parses titles and links", () => {
    expect(a.title).toBe("Ser и estar");
    expect(b.title).toBe("Subjuntivo");
    expect(extractLinks(a.body)).toEqual(["Subjuntivo", "noche"]);
  });

  it("resolves links and backlinks", () => {
    expect(resolveLink([a, b], "subjuntivo")?.id).toBe("subjuntivo");
    expect(backlinks([a, b], b).map((n) => n.id)).toEqual(["ser-estar"]);
  });

  it("round-trips and searches", () => {
    expect(parseNote(serializeNote(a), a.id).body).toBe(a.body);
    expect(searchNotes([a, b], "что такое subjuntivo?")[0].id).toBe("subjuntivo");
  });
});

describe("reader", () => {
  it("splits plain text into paragraphs", () => {
    expect(parsePlain("Один.\n\nДва\nстроки.\n\n\nТри.")).toEqual(["Один.", "Два строки.", "Три."]);
    expect(parsePlain("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  const fb2 = `<?xml version="1.0" encoding="utf-8"?><FictionBook><description><title-info><author><first-name>Лев</first-name><last-name>Толстой</last-name></author><book-title>Рассказ</book-title></title-info></description><body><section><title><p>Глава 1</p></title><p>Первый &amp; абзац.</p><p>Второй <emphasis>абзац</emphasis>.</p></section></body><body name="notes"><p>Примечание</p></body></FictionBook>`;

  it("reads FB2 without footnotes", () => {
    const r = parseFb2(fb2);
    expect(r.title).toBe("Рассказ");
    expect(r.author).toBe("Лев Толстой");
    expect(r.paragraphs).toEqual(["Глава 1", "Первый & абзац.", "Второй абзац."]);
  });

  it("reads zipped FB2 and EPUB", () => {
    const zip = zipSync({ "book.fb2": strToU8(fb2) });
    expect(parseBookFile("book.fb2.zip", zip).paragraphs).toHaveLength(3);
    const epub = zipSync({
      "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
      "OEBPS/content.opf": strToU8(
        '<package><metadata><dc:title>Tale</dc:title><dc:creator>Anon</dc:creator></metadata><manifest><item id="c1" href="ch1.xhtml"/><item id="c2" href="ch2.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
      ),
      "OEBPS/ch1.xhtml": strToU8("<html><body><h1>One</h1><p>First.</p></body></html>"),
      "OEBPS/ch2.xhtml": strToU8("<html><body><p>Second.</p></body></html>"),
    });
    const r = parseBookFile("tale.epub", epub);
    expect(r).toMatchObject({ title: "Tale", author: "Anon", paragraphs: ["One", "First.", "Second."] });
  });

  it("round-trips a book and its translation", () => {
    const book = { id: "b", title: "T", lang: "es", page: 1, created: "2026-10-10", paragraphs: ["Uno.", "Dos."] };
    expect(parseBook(serializeBook(book), "b")).toEqual(book);
    expect(pageCount(book)).toBe(1);
    expect(parseTranslation(serializeTranslation("ru", { 1: "Два." }, book))).toEqual({ 1: "Два." });
  });
});

describe("playlists", () => {
  const steps = ["a", "b", "c", "d", "e", "f"].map((x) => ({ tgt: x, native: x.toUpperCase() }));

  it("revisits earlier steps", () => {
    const s = schedule(steps, 3);
    expect(s.filter((x) => !x.review).map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(s.some((x) => x.review)).toBe(true);
    expect(s.filter((x) => x.review).every((x) => x.index < 6)).toBe(true);
    expect(estimateMinutes(s, 2, 2)).toBeGreaterThanOrEqual(0);
  });

  it("builds a playlist from the dictionary and round-trips it", () => {
    const c = {
      id: "noche",
      terms: { es: { text: "noche", article: "la" }, ru: { text: "ночь" } },
      examples: [{ lang: "es", text: "Buenas noches.", tr: "Спокойной ночи." }],
    } as unknown as Concept;
    const st = offlinePlaylist([c], "es", "ru");
    expect(st).toEqual([
      { tgt: "la noche", native: "ночь" },
      { tgt: "Buenas noches.", native: "Спокойной ночи." },
    ]);
    const p = { id: "p", title: "Noche", lang: "es", nativeLang: "ru", steps: st, created: "2026-10-10" };
    expect(parsePlaylist(serializePlaylist(p), "p")).toEqual(p);
  });
});
