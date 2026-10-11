import { langInfo } from "../core/languages";
import { hitEtymology, lookupOffline } from "./dictionary";
import { platformFetch } from "./platform";

// Английский Викисловарь как источник фактов: этимология и значения слова
// в разделе нужного языка. ИИ дальше только объясняет — так меньше выдумок.
// Тексты Викисловаря — CC BY-SA, поэтому рядом всегда ссылка на статью.

export interface WiktionaryEntry {
  etymology?: string;
  definitions: string[];
  url: string;
  /** Взято из скачанного офлайн-словаря, а не из сети. */
  offline?: boolean;
}

// Названия разделов, которые отличаются от английского названия языка.
const SECTION: Record<string, string> = { zh: "Chinese", fa: "Persian", el: "Greek", ar: "Arabic", he: "Hebrew", la: "Latin" };

function sectionName(lang: string): string {
  return SECTION[lang] ?? langInfo(lang).name.replace(/\s*\(.*\)$/, "");
}

/** Огласовки и никуд не входят в заголовки статей — их убираем перед поиском. */
function pageTitle(word: string, lang: string): string {
  const w = word.trim();
  if (lang === "ar" || lang === "fa" || lang === "ur") return w.replace(/[ً-ْٰ]/g, "");
  if (lang === "he") return w.replace(/[֑-ׇ]/g, "");
  return lang === "de" ? w : w.toLowerCase();
}

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseWiktionaryHtml(html: string, lang: string): Omit<WiktionaryEntry, "url"> | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".mw-parser-output") ?? doc.body;
  const name = sectionName(lang);
  // Новая разметка: <div class="mw-heading mw-heading2"><h2 id="Spanish">; старая — голый <h2>.
  const blocks = [...root.children];
  const isH2 = (el: Element) => el.matches(".mw-heading2") || el.tagName === "H2";
  const startIdx = blocks.findIndex((el) => isH2(el) && (el.querySelector("h2")?.id ?? el.id ?? el.textContent ?? "").replace(/_/g, " ").trim() === name);
  if (startIdx < 0) return null;
  const section: Element[] = [];
  for (let i = startIdx + 1; i < blocks.length && !isH2(blocks[i]); i++) section.push(blocks[i]);

  const headingText = (el: Element) => (el.matches(".mw-heading") ? el.textContent : /^H[3-6]$/.test(el.tagName) ? el.textContent : null);

  let etymology: string | undefined;
  const definitions: string[] = [];
  for (let i = 0; i < section.length; i++) {
    const h = headingText(section[i]);
    if (!h) continue;
    if (!etymology && /^Etymology/i.test(h.trim())) {
      const parts: string[] = [];
      for (let j = i + 1; j < section.length && !headingText(section[j]); j++) if (section[j].tagName === "P") parts.push(clean(section[j].textContent));
      etymology = parts.filter(Boolean).join(" ") || undefined;
    }
    if (!definitions.length && /^(Noun|Verb|Adjective|Adverb|Pronoun|Preposition|Conjunction|Interjection|Phrase|Proper noun|Numeral|Particle)/i.test(h.trim())) {
      for (let j = i + 1; j < section.length && !headingText(section[j]); j++) {
        if (section[j].tagName !== "OL") continue;
        for (const li of section[j].querySelectorAll(":scope > li")) {
          // Примеры и цитаты лежат во вложенных списках — их отбрасываем.
          const copy = li.cloneNode(true) as Element;
          copy.querySelectorAll("ul, ol, dl, .HQToggle, .nyms").forEach((x) => x.remove());
          const text = clean(copy.textContent);
          if (text) definitions.push(text);
        }
        break;
      }
    }
  }
  if (!etymology && !definitions.length) return null;
  return { etymology, definitions: definitions.slice(0, 4) };
}

export async function lookupWiktionary(word: string, lang: string): Promise<WiktionaryEntry | null> {
  const title = pageTitle(word, lang);
  if (!title) return null;
  const url = new URL("https://en.wiktionary.org/w/api.php");
  url.search = new URLSearchParams({ action: "parse", page: title, prop: "text", format: "json", formatversion: "2", origin: "*", redirects: "1" }).toString();
  const res = await platformFetch(url.href);
  if (!res.ok) return null;
  const data = (await res.json()) as { parse?: { text?: string; title?: string }; error?: unknown };
  if (!data.parse?.text) return null;
  const parsed = parseWiktionaryHtml(data.parse.text, lang);
  if (!parsed) return null;
  const page = encodeURIComponent((data.parse.title ?? title).replace(/ /g, "_"));
  return { ...parsed, url: `https://en.wiktionary.org/wiki/${page}#${encodeURIComponent(sectionName(lang).replace(/ /g, "_"))}` };
}

/** Сначала офлайн-словарь (быстро и без сети), потом Викисловарь онлайн. */
export async function lookupDictionary(word: string, lang: string): Promise<WiktionaryEntry | null> {
  const hit = await lookupOffline(word, lang).catch(() => null);
  if (hit) {
    const page = encodeURIComponent(hit.lemma.replace(/ /g, "_"));
    return {
      etymology: hitEtymology(hit),
      definitions: hit.senses.map((s) => `(${s.p}) ${s.d.join("; ")}`),
      url: `https://en.wiktionary.org/wiki/${page}#${encodeURIComponent(sectionName(lang).replace(/ /g, "_"))}`,
      offline: true,
    };
  }
  return lookupWiktionary(word, lang);
}

/** Короткая сводка для промпта ИИ. */
export function wiktionaryContext(e: WiktionaryEntry): string {
  return [e.etymology ? `Etymology: ${e.etymology}` : "", e.definitions.length ? `Senses: ${e.definitions.join(" | ")}` : ""].filter(Boolean).join("\n");
}
