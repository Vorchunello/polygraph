import { strFromU8, unzipSync } from "fflate";
import { today } from "./dates";
import { joinFrontmatter, splitFrontmatter } from "./markdown";

// Читалка: книга — это список абзацев. Перевод хранится отдельно и
// привязан к номеру абзаца, поэтому переводить можно по странице, по мере чтения.

export interface Book {
  id: string;
  title: string;
  author?: string;
  lang: string;
  paragraphs: string[];
  page: number;
  created: string;
}

export const PAGE_SIZE = 8;

export function pageCount(b: Book): number {
  return Math.max(1, Math.ceil(b.paragraphs.length / PAGE_SIZE));
}

export function pageRange(b: Book, page: number): [number, number] {
  const start = page * PAGE_SIZE;
  return [start, Math.min(b.paragraphs.length, start + PAGE_SIZE)];
}

export function parsePlain(text: string): string[] {
  const t = text.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const blocks = t.split(/\n\s*\n/);
  // Текст без пустых строк между абзацами: тогда абзац — каждая строка.
  const parts = blocks.length > 1 ? blocks.map((b) => b.replace(/\s*\n\s*/g, " ")) : t.split("\n");
  return parts.map((p) => p.trim()).filter(Boolean);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", laquo: "«", raquo: "»" };

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function blocksFromXml(xml: string): string[] {
  return [...xml.matchAll(/<(p|h[1-6]|subtitle|v)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => stripTags(m[2])).filter(Boolean);
}

export function parseFb2(xml: string): { title?: string; author?: string; paragraphs: string[] } {
  const info = /<title-info>([\s\S]*?)<\/title-info>/.exec(xml)?.[1] ?? "";
  const title = stripTags(/<book-title>([\s\S]*?)<\/book-title>/.exec(info)?.[1] ?? "") || undefined;
  const a = /<author>([\s\S]*?)<\/author>/.exec(info)?.[1] ?? "";
  const author =
    ["first-name", "last-name"].map((tag) => stripTags(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(a)?.[1] ?? "")).filter(Boolean).join(" ") ||
    undefined;
  // Только основные body: примечания (body name="notes") не нужны в тексте.
  const bodies = [...xml.matchAll(/<body(\s[^>]*)?>([\s\S]*?)<\/body>/g)].filter((m) => !/name="notes"/.test(m[1] ?? ""));
  return { title, author, paragraphs: bodies.flatMap((m) => blocksFromXml(m[2])) };
}

function decodeXml(bytes: Uint8Array): string {
  const head = strFromU8(bytes.slice(0, 200), true);
  const enc = /encoding="([^"]+)"/i.exec(head)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function parseEpub(bytes: Uint8Array): { title?: string; author?: string; paragraphs: string[] } {
  const files = unzipSync(bytes);
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : "");
  const container = text("META-INF/container.xml");
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1] ?? "";
  const opf = text(opfPath);
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map([...opf.matchAll(/<item\b[^>]*>/g)].map((m) => [/id="([^"]+)"/.exec(m[0])?.[1], /href="([^"]+)"/.exec(m[0])?.[1]]));
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => manifest.get(m[1])).filter(Boolean) as string[];
  const title = stripTags(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1] ?? "") || undefined;
  const author = stripTags(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/.exec(opf)?.[1] ?? "") || undefined;
  const paragraphs = spine.flatMap((href) => blocksFromXml(text(decodeURIComponent(base + href))));
  return { title, author, paragraphs };
}

/** Разобрать файл по расширению. Поддержка: txt, md, fb2, fb2.zip, epub. */
export function parseBookFile(name: string, bytes: Uint8Array): { title: string; author?: string; paragraphs: string[] } {
  const lower = name.toLowerCase();
  const baseName = name.replace(/\.(fb2\.zip|fb2|epub|txt|md)$/i, "");
  if (lower.endsWith(".epub")) {
    const r = parseEpub(bytes);
    return { ...r, title: r.title ?? baseName };
  }
  if (lower.endsWith(".fb2.zip") || lower.endsWith(".zip")) {
    const files = unzipSync(bytes);
    const fb2 = Object.keys(files).find((f) => f.toLowerCase().endsWith(".fb2"));
    if (!fb2) throw new Error("No .fb2 file inside the archive");
    const r = parseFb2(decodeXml(files[fb2]));
    return { ...r, title: r.title ?? baseName };
  }
  if (lower.endsWith(".fb2")) {
    const r = parseFb2(decodeXml(bytes));
    return { ...r, title: r.title ?? baseName };
  }
  return { title: baseName, paragraphs: parsePlain(new TextDecoder("utf-8").decode(bytes)) };
}

export function serializeBook(b: Book): string {
  const { paragraphs, ...meta } = b;
  return joinFrontmatter(meta as unknown as Record<string, unknown>, paragraphs.join("\n\n"));
}

export function parseBook(src: string, id: string): Book {
  const { data, body } = splitFrontmatter(src);
  return {
    id,
    title: String(data.title ?? id),
    author: data.author ? String(data.author) : undefined,
    lang: String(data.lang ?? "en"),
    page: Number(data.page ?? 0),
    created: String(data.created ?? today()),
    paragraphs: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
  };
}

/** Перевод книги: номер абзаца → перевод. В теле — для чтения глазами. */
export type Translation = Record<number, string>;

export function serializeTranslation(lang: string, tr: Translation, b: Book): string {
  const keys = Object.keys(tr)
    .map(Number)
    .sort((a, z) => a - z);
  const body = keys.map((k) => `${b.paragraphs[k] ?? ""}\n\n> ${tr[k]}`).join("\n\n");
  return joinFrontmatter({ book: b.id, lang, paragraphs: Object.fromEntries(keys.map((k) => [k, tr[k]])) }, body);
}

export function parseTranslation(src: string): Translation {
  const { data } = splitFrontmatter(src);
  const p = (data.paragraphs ?? {}) as Record<string, string>;
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [Number(k), String(v)]));
}
