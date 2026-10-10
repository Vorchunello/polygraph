import { today } from "./dates";
import { langInfo } from "./languages";
import type { Concept, LangCode, Term } from "./types";

// Импорт и экспорт: CSV (колонки = коды языков) и текстовый формат Anki.

export function parseCsv(src: string, delimiter = detectDelimiter(src)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function detectDelimiter(src: string): string {
  const first = src.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function csvCell(v: string): string {
  return /[",;\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const META = new Set(["tags", "notes", "etymology"]);

/** Шапка CSV — коды языков (es, ru, en…), плюс необязательные tags и notes.
 *  Род можно указать прямо в ячейке: «la noche (f)». */
export function conceptsFromCsv(src: string, newId: (seed: string) => string): Concept[] {
  const rows = parseCsv(src);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const now = today();
  return rows.slice(1).flatMap((r) => {
    const terms: Record<LangCode, Term> = {};
    header.forEach((h, i) => {
      const v = r[i]?.trim();
      if (!v || META.has(h) || !/^[a-z]{2,3}$/.test(h)) return;
      terms[h] = parseTermCell(v);
    });
    const first = Object.values(terms)[0];
    if (!first) return [];
    const col = (name: string) => {
      const i = header.indexOf(name);
      return i >= 0 ? r[i]?.trim() ?? "" : "";
    };
    return [
      {
        id: newId(first.text),
        terms,
        bridges: [],
        examples: [],
        etymology: col("etymology") || undefined,
        tags: col("tags").split(/[\s,]+/).filter(Boolean),
        srs: {},
        created: now,
        updated: now,
        notes: col("notes"),
      },
    ];
  });
}

export function parseTermCell(v: string): Term {
  const t: Term = { text: v };
  const g = /\s*\((m|f|n|c)\)\s*$/i.exec(v);
  if (g) {
    t.gender = g[1].toLowerCase() as Term["gender"];
    t.text = v.slice(0, g.index).trim();
  }
  return t;
}

function termCell(t?: Term): string {
  if (!t) return "";
  return t.gender ? `${t.text} (${t.gender})` : t.text;
}

export function conceptsToCsv(concepts: Concept[], langs: LangCode[]): string {
  const lines = [[...langs, "tags", "notes"].join(",")];
  for (const c of concepts) {
    lines.push([...langs.map((l) => termCell(c.terms[l])), c.tags.join(" "), c.notes].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function displayTerm(t: Term): string {
  return [t.article, t.text].filter(Boolean).join(" ") + (t.gender ? ` (${t.gender})` : "");
}

/** Текстовый файл для Anki (Файл → Импорт): лицо — слово изучаемого языка,
 *  оборот — все известные языки и мосты. Шапка «#…» понятна Anki 2.1.54+. */
export function conceptsToAnki(concepts: Concept[], target: LangCode, known: LangCode[]): string {
  const lines = ["#separator:tab", "#html:true", "#tags column:3"];
  for (const c of concepts) {
    const t = c.terms[target];
    if (!t) continue;
    const back = [
      ...known.filter((k) => c.terms[k]).map((k) => `<b>${k}</b>: ${esc(displayTerm(c.terms[k]))}`),
      ...c.bridges.map((b) => `${b.strength === "broken" ? "⚠" : "↔"} <i>${b.from}</i>: ${esc(b.note)}`),
      c.etymology ? `<small>${esc(c.etymology)}</small>` : "",
    ]
      .filter(Boolean)
      .join("<br>");
    const front = `<span dir="${langInfo(target).rtl ? "rtl" : "ltr"}">${esc(displayTerm(t))}</span>`;
    const tags = ["polygraph", ...c.tags].map((x) => x.replace(/\s+/g, "_")).join(" ");
    lines.push([front, back, tags].map((x) => x.replace(/[\t\n]/g, " ")).join("\t"));
  }
  return lines.join("\n") + "\n";
}

/** Импорт из Anki: экспорт «Notes in Plain Text». Первое поле — изучаемый
 *  язык, второе — перевод на язык by. HTML вычищается. */
export function conceptsFromAnki(src: string, target: LangCode, by: LangCode, newId: (seed: string) => string): Concept[] {
  const now = today();
  const strip = (s: string) =>
    s.replace(/<br\s*\/?>/gi, "; ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
  return src
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .flatMap((l) => {
      const [front, back, tags] = l.split("\t");
      const f = strip(front ?? "");
      if (!f) return [];
      const terms: Record<LangCode, Term> = { [target]: parseTermCell(f) };
      if (back && strip(back)) terms[by] = { text: strip(back) };
      return [
        {
          id: newId(f),
          terms,
          bridges: [],
          examples: [],
          tags: (tags ?? "").split(/\s+/).filter((t) => t && t !== "polygraph"),
          srs: {},
          created: now,
          updated: now,
          notes: "",
        },
      ];
    });
}
