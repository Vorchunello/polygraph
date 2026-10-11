#!/usr/bin/env node
// Сборщик офлайн-словарей Polygraph из выгрузок Викисловаря (kaikki.org).
//
//   node scripts/build-dict.mjs <код> <путь-или-URL kaikki .jsonl.gz> [выход]
//   node scripts/build-dict.mjs es https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz
//
// На выходе dicts/dict-<код>.jsonl.gz — компактный словарь: значения (на
// английском, из английского Викисловаря), род, произношение, короткая
// этимология и словоформы → начальная форма. Лицензия данных — CC BY-SA,
// как у Викисловаря; она записывается в первую строку файла.

import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import https from "node:https";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import zlib from "node:zlib";

const [lang, source, outDir = "dicts"] = process.argv.slice(2);
if (!lang || !source) {
  console.error("usage: build-dict.mjs <lang> <kaikki .jsonl.gz path or URL> [outDir]");
  process.exit(1);
}

// Для огромных словарей (английский) — потолок: оставляем самые «полные» статьи.
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES ?? 150000);
const SKIP_POS = new Set(["name", "proper noun", "character", "symbol", "punct", "romanization", "abbrev", "prefix", "suffix", "infix", "affix"]);
const SKIP_SENSE = new Set(["obsolete", "archaic", "rare", "dated"]);
const SKIP_FORM = new Set(["alternative", "obsolete", "romanization", "table-tags", "inflection-template", "class", "archaic", "misspelling", "abbreviation"]);
const GENDER = { masculine: "m", feminine: "f", neuter: "n", common: "c" };

/** Ключ поиска: регистр и огласовки (арабские, еврейские) не важны. */
export function dictKey(word) {
  return word
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[֑-ׇ]/g, "")
    .replace(/́/g, "")
    .trim();
}

function open(src) {
  if (/^https?:/.test(src)) {
    return new Promise((resolve, reject) => {
      const get = (url) =>
        https
          .get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(res.headers.location);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            resolve(res);
          })
          .on("error", reject);
      get(src);
    });
  }
  return Promise.resolve(createReadStream(src));
}

const ETY_START = /\b(Inherited|Borrowed|Learned|Semi-learned|Derived|From|Calque|Compound|Clipping|Back-formation|Uncertain|Unknown|Onomatopoeic|Ultimately|Probably|Possibly|Univerbation|Blend)\b/;

/** В выгрузке этимология иногда начинается с текста схемы «Etymology tree …». */
function cleanEtymology(text) {
  if (!text) return undefined;
  if (!text.startsWith("Etymology tree")) return text;
  const m = ETY_START.exec(text.slice("Etymology tree".length));
  return m ? text.slice("Etymology tree".length + m.index) : undefined;
}

const clip = (s, n) => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const dot = cut.lastIndexOf(". ");
  return (dot > n * 0.5 ? cut.slice(0, dot + 1) : `${cut.trimEnd()}…`).trim();
};

const lemmas = new Map(); // key → { w, e: [...] , score }
const forms = new Map(); // key → Set(lemma words)

function addForm(form, lemma) {
  const k = dictKey(form);
  if (!k || k === dictKey(lemma)) return;
  if (!forms.has(k)) forms.set(k, new Set());
  forms.get(k).add(lemma);
}

const input = (await open(source)).pipe(zlib.createGunzip());
const rl = readline.createInterface({ input, crlfDelay: Infinity });
let lines = 0;
for await (const line of rl) {
  lines++;
  if (!line) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  const word = e.word;
  if (!word || SKIP_POS.has(e.pos) || word.split(/\s+/).length > 3 || word.length > 40) continue;
  const senses = e.senses ?? [];
  const real = senses.filter((s) => !s.form_of && !(s.tags ?? []).includes("form-of") && s.glosses?.length);
  // Словоформа («noches» → «noche»): только запоминаем, куда она ведёт.
  if (!real.length) {
    for (const s of senses) for (const f of s.form_of ?? []) if (f.word) addForm(word, f.word);
    continue;
  }
  const preferred = real.filter((s) => !(s.tags ?? []).some((t) => SKIP_SENSE.has(t)));
  const use = (preferred.length ? preferred : real).slice(0, 3);
  const glosses = [...new Set(use.map((s) => clip(s.glosses.at(-1), 120)).filter(Boolean))];
  if (!glosses.length) continue;
  const tags = [...(e.tags ?? []), ...(use[0].tags ?? [])];
  const g = tags.map((t) => GENDER[t]).find(Boolean);
  const ipa = e.sounds?.find((s) => s.ipa)?.ipa;
  const entry = { p: e.pos, d: glosses };
  if (g) entry.g = g;
  if (ipa) entry.i = ipa;
  const ety = clip(cleanEtymology(e.etymology_text), 220);
  if (ety) entry.t = ety;
  const k = dictKey(word);
  const prev = lemmas.get(k);
  // Чем полнее статья, тем вероятнее слово частое: произношение, этимология, смыслы.
  const score = (ipa ? 2 : 0) + (ety ? 1 : 0) + Math.min(real.length, 5) * 0.5;
  if (prev) {
    if (prev.e.length < 4) prev.e.push(entry);
    prev.score = Math.max(prev.score, score);
  } else lemmas.set(k, { w: word, e: [entry], score });
  for (const f of e.forms ?? []) {
    if (!f.form || (f.tags ?? []).some((t) => SKIP_FORM.has(t))) continue;
    addForm(f.form, word);
  }
}

let kept = [...lemmas.values()];
if (kept.length > MAX_ENTRIES) kept = kept.sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
const keptKeys = new Set(kept.map((x) => dictKey(x.w)));

await fs.mkdir(outDir, { recursive: true });
const file = path.join(outDir, `dict-${lang}.jsonl.gz`);
const gz = zlib.createGzip({ level: 9 });
const out = gz.pipe(createWriteStream(file));
const write = (obj) => gz.write(`${JSON.stringify(obj)}\n`);
let formCount = 0;
const header = {
  lang,
  source: "English Wiktionary via kaikki.org",
  license: "CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/",
  built: new Date().toISOString().slice(0, 10),
  entries: kept.length,
};
write(header);
// Формы раскладываем по статьям начальных форм: «noches» попадает в список x у «noche».
const byLemma = new Map();
for (const [k, set] of forms) {
  if (keptKeys.has(k)) continue;
  for (const l of [...set].slice(0, 3)) {
    const lk = dictKey(l);
    if (!keptKeys.has(lk)) continue;
    if (!byLemma.has(lk)) byLemma.set(lk, []);
    byLemma.get(lk).push(k);
    formCount++;
  }
}
for (const x of kept.sort((a, b) => a.w.localeCompare(b.w))) {
  const xs = byLemma.get(dictKey(x.w));
  // r — полнота статьи (0–10): грубая замена частотности при отборе слов из текста.
  const r = Math.min(10, Math.round(x.score * 2));
  write(xs ? { w: x.w, r, e: x.e, x: xs } : { w: x.w, r, e: x.e });
}
gz.end();
await new Promise((r) => out.on("finish", r));
const size = (await fs.stat(file)).size;
console.log(JSON.stringify({ lang, lines, entries: kept.length, forms: formCount, size }));
