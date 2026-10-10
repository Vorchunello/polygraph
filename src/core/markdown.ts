import YAML from "yaml";
import { today } from "./dates";
import type { Concept, Profile } from "./types";

// Формат хранилища — обычные md-файлы с YAML-фронтматтером. Их можно открыть
// в Obsidian, положить в git, синхронизировать Syncthing'ом. Приложение —
// интерфейс к папке, а не закрытая база.

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function splitFrontmatter(src: string): { data: Record<string, unknown>; body: string } {
  const m = FM.exec(src);
  if (!m) return { data: {}, body: src };
  const data = YAML.parse(m[1]);
  return { data: data && typeof data === "object" ? data : {}, body: m[2] };
}

export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = JSON.parse(JSON.stringify(data)); // выкидывает undefined
  const yaml = YAML.stringify(clean, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

export function parseConcept(src: string, fallbackId: string): Concept {
  const { data, body } = splitFrontmatter(src);
  const d = data as Partial<Concept>;
  return {
    id: String(d.id ?? fallbackId),
    terms: d.terms ?? {},
    bridges: Array.isArray(d.bridges) ? d.bridges : [],
    examples: Array.isArray(d.examples) ? d.examples : [],
    etymology: d.etymology,
    etymologyVerified: d.etymologyVerified,
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    srs: d.srs ?? {},
    created: String(d.created ?? today()),
    updated: String(d.updated ?? today()),
    notes: body.trim(),
  };
}

export function serializeConcept(c: Concept): string {
  const { notes, ...data } = c;
  return joinFrontmatter(data as unknown as Record<string, unknown>, notes);
}

export function parseProfile(src: string): Profile | null {
  const { data } = splitFrontmatter(src);
  const d = data as Partial<Profile>;
  if (!d.uiLang || !Array.isArray(d.known)) return null;
  return {
    name: d.name,
    uiLang: d.uiLang,
    known: d.known,
    learning: Array.isArray(d.learning) ? d.learning : [],
    target: d.target,
    goal: d.goal ? String(d.goal) : undefined,
    created: String(d.created ?? today()),
  };
}

export function serializeProfile(p: Profile): string {
  const body = [
    "# Profile",
    "",
    "Languages you know are bridges; Polygraph explains new words and grammar through them.",
    "Edit this file by hand or in Settings — both work.",
  ].join("\n");
  return joinFrontmatter(p as unknown as Record<string, unknown>, body);
}

// Инбокс — список строк «- …» под заголовком. Пишешь на ходу, разбираешь потом.
export function parseInbox(src: string): string[] {
  return src
    .split(/\r?\n/)
    .map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x);
}

export function serializeInbox(items: string[]): string {
  return ["# Inbox", "", "Unknown words and questions — capture now, process later.", "", ...items.map((i) => `- ${i}`), ""].join("\n");
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ı: "i", ş: "s", ğ: "g", ç: "c", ö: "o", ü: "u",
};

/** Имя файла из слова: латиница и цифры, остальное — транслит или «-». */
export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "word";
}
