import { today } from "./dates";
import { joinFrontmatter, splitFrontmatter } from "./markdown";

// Заметки в духе Obsidian: md-файлы в notes/, ссылки [[Название]] или
// [[Название|подпись]], обратные ссылки считаются на лету.

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  created: string;
  updated: string;
  source?: string;
}

const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function parseNote(src: string, id: string): Note {
  const { data, body } = splitFrontmatter(src);
  const firstHeading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return {
    id,
    title: String(data.title ?? firstHeading ?? id),
    body: body.trim(),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created: String(data.created ?? today()),
    updated: String(data.updated ?? today()),
    source: data.source ? String(data.source) : undefined,
  };
}

export function serializeNote(n: Note): string {
  return joinFrontmatter({ title: n.title, tags: n.tags, created: n.created, updated: today(), source: n.source }, n.body);
}

export function extractLinks(body: string): string[] {
  return [...body.matchAll(LINK)].map((m) => m[1].trim());
}

const norm = (s: string) => s.trim().toLowerCase();

/** Найти заметку по тексту ссылки: по названию или по id. */
export function resolveLink(notes: Note[], target: string): Note | undefined {
  const t = norm(target);
  return notes.find((n) => norm(n.title) === t || norm(n.id) === t);
}

export function backlinks(notes: Note[], note: Note): Note[] {
  const names = new Set([norm(note.title), norm(note.id)]);
  return notes.filter((n) => n.id !== note.id && extractLinks(n.body).some((l) => names.has(norm(l))));
}

function tokens(s: string): string[] {
  return s.toLowerCase().match(/\p{L}[\p{L}\p{M}'-]{2,}/gu) ?? [];
}

/** Простой поиск для контекста ИИ: пересечение слов, название весит втрое. */
export function searchNotes(notes: Note[], query: string, k = 5): Note[] {
  const q = new Set(tokens(query));
  if (!q.size) return [];
  return notes
    .map((n) => {
      let score = 0;
      for (const t of tokens(n.title)) if (q.has(t)) score += 3;
      for (const t of tokens(n.body)) if (q.has(t)) score += 1;
      for (const t of n.tags) if (q.has(t.toLowerCase())) score += 2;
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.n);
}

