import { CapacitorHttp } from "@capacitor/core";
import { Gunzip } from "fflate";
import { platform } from "./platform";

// Офлайн-словари: компактные выгрузки английского Викисловаря (CC BY-SA),
// собранные scripts/build-dict.mjs и выложенные в релиз «dicts» на GitHub.
// Скачиваются один раз и дальше работают без интернета.
//
// Хранение: IndexedDB, словарь разбит на части по первым двум буквам ключа.
// Ищется одно слово — читается одна маленькая часть, а не весь словарь.

export const DICTS_BASE = "https://github.com/Vorchunello/polygraph/releases/download/dicts";
export const DICTS_PAGE = "https://github.com/Vorchunello/polygraph/releases/tag/dicts";

export interface DictSense {
  /** Часть речи (noun, verb…). */
  p: string;
  /** Значения — на английском, как в английском Викисловаре. */
  d: string[];
  g?: string;
  /** Произношение (IPA). */
  i?: string;
  /** Этимология, коротко. */
  t?: string;
}

export interface DictEntry {
  w: string;
  /** Полнота статьи 0–10 — грубая замена частотности. */
  r?: number;
  e: DictSense[];
}

export interface DictHit {
  /** Начальная форма (если искали словоформу — то, к чему она ведёт). */
  lemma: string;
  /** Слово как его искали, если это словоформа. */
  form?: string;
  senses: DictSense[];
  rank: number;
}

export interface DictInfo {
  lang: string;
  size: number;
  entries: number;
  built: string;
}

/** Ключ поиска — тот же, что в scripts/build-dict.mjs: без регистра и огласовок. */
export function dictKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[֑-ׇ]/g, "")
    .replace(/́/g, "")
    .trim();
}

const shardOf = (key: string) => [...key].slice(0, 2).join("");

// ——— IndexedDB ———

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("polygraph-dicts", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("shards");
      req.result.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function installedDicts(): Promise<DictInfo[]> {
  return (await tx<DictInfo[]>("meta", "readonly", (s) => s.getAll() as IDBRequest<DictInfo[]>)) ?? [];
}

export async function hasDict(lang: string): Promise<boolean> {
  return !!(await tx("meta", "readonly", (s) => s.get(lang)));
}

export async function removeDict(lang: string): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction(["shards", "meta"], "readwrite");
    t.objectStore("shards").delete(IDBKeyRange.bound(`${lang}:`, `${lang}:￿`));
    t.objectStore("meta").delete(lang);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  cache.clear();
}

// ——— Скачивание ———

/** Каталог готовых словарей (размеры и число статей). */
export async function dictCatalog(): Promise<Record<string, DictInfo>> {
  const bytes = await download(`${DICTS_BASE}/index.json`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function download(url: string, onProgress?: (p: number) => void): Promise<Uint8Array> {
  switch (platform()) {
    case "electron":
      return new Uint8Array(await window.polygraph!.download(url));
    case "android": {
      // Нативный HTTP: GitHub отдаёт файлы релиза без CORS-заголовков.
      const res = await CapacitorHttp.get({ url, responseType: "arraybuffer" });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const bin = atob(res.data as string);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    default: {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (total) onProgress?.(got / total);
      }
      const out = new Uint8Array(got);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    }
  }
}

/**
 * Скачать и установить словарь. Распаковка потоковая: строки раскладываются
 * по частям сразу, без одной огромной строки на десятки мегабайт.
 */
export async function installDict(lang: string, onProgress?: (stage: "download" | "install", p: number) => void): Promise<DictInfo> {
  const gz = await download(`${DICTS_BASE}/dict-${lang}.jsonl.gz`, (p) => onProgress?.("download", p));
  return installDictFile(gz, (p) => onProgress?.("install", p));
}

/** Установить словарь из уже скачанного файла dict-xx.jsonl.gz (язык — из заголовка). */
export async function installDictFile(gz: Uint8Array, onProgress?: (p: number) => void): Promise<DictInfo> {
  onProgress?.(0);
  const shards = new Map<string, string[]>();
  const formShards = new Map<string, string[]>();
  let header: { lang?: string; built?: string; entries?: number } = {};
  let rest = "";
  let lines = 0;
  const decoder = new TextDecoder();
  const handle = (line: string) => {
    if (!line) return;
    lines++;
    if (lines === 1) {
      header = JSON.parse(line);
      return;
    }
    const entry = JSON.parse(line) as DictEntry & { x?: string[] };
    const key = dictKey(entry.w);
    const lineOut = JSON.stringify({ w: entry.w, r: entry.r, e: entry.e });
    const sk = shardOf(key);
    (shards.get(sk) ?? shards.set(sk, []).get(sk)!).push(`${key}\t${lineOut}`);
    for (const f of entry.x ?? []) {
      const fk = `f:${shardOf(f)}`;
      (formShards.get(fk) ?? formShards.set(fk, []).get(fk)!).push(`${f}\t${entry.w}`);
    }
  };
  await new Promise<void>((resolve, reject) => {
    const gunzip = new Gunzip((chunk, final) => {
      try {
        rest += decoder.decode(chunk, { stream: !final });
        const parts = rest.split("\n");
        rest = parts.pop() ?? "";
        for (const p of parts) handle(p);
        if (final) {
          handle(rest);
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    // Отдаём сжатые данные кусками, чтобы интерфейс не замирал надолго.
    const STEP = 1 << 18;
    let off = 0;
    const pump = () => {
      try {
        const end = Math.min(gz.length, off + STEP);
        gunzip.push(gz.subarray(off, end), end === gz.length);
        off = end;
        onProgress?.((off / gz.length) * 0.6);
        if (off < gz.length) setTimeout(pump, 0);
      } catch (e) {
        reject(e);
      }
    };
    pump();
  });

  const lang = header.lang;
  if (!lang || lines < 2) throw new Error("Not a Polygraph dictionary");
  await removeDict(lang).catch(() => undefined);
  const all = [...shards.entries(), ...formShards.entries()];
  const d = await db();
  for (let i = 0; i < all.length; i += 200) {
    const batch = all.slice(i, i + 200);
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("shards", "readwrite");
      const s = t.objectStore("shards");
      for (const [k, v] of batch) s.put(v.join("\n"), `${lang}:${k}`);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    onProgress?.(0.6 + 0.4 * ((i + batch.length) / all.length));
  }
  const info: DictInfo = { lang, size: gz.length, entries: header.entries ?? shards.size, built: header.built ?? "" };
  await tx("meta", "readwrite", (s) => s.put(info, lang));
  return info;
}

// ——— Поиск ———

const cache = new Map<string, Map<string, string>>();

async function shard(lang: string, id: string): Promise<Map<string, string>> {
  const key = `${lang}:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = (await tx<string | undefined>("shards", "readonly", (s) => s.get(key) as IDBRequest<string | undefined>)) ?? "";
  const map = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const k = line.slice(0, tab);
    // Словоформа может вести к нескольким начальным формам — копим через «|».
    map.set(k, map.has(k) ? `${map.get(k)}|${line.slice(tab + 1)}` : line.slice(tab + 1));
  }
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, map);
  return map;
}

async function entry(lang: string, key: string): Promise<DictEntry | null> {
  const raw = (await shard(lang, shardOf(key))).get(key);
  return raw ? (JSON.parse(raw.split("|")[0]) as DictEntry) : null;
}

/** Найти слово: сначала как начальную форму, потом как словоформу. */
export async function lookupOffline(word: string, lang: string): Promise<DictHit | null> {
  const key = dictKey(word.replace(/[^\p{L}\p{M}'’-]/gu, ""));
  if (!key || !(await hasDict(lang))) return null;
  const direct = await entry(lang, key);
  if (direct) return { lemma: direct.w, senses: direct.e, rank: direct.r ?? 0 };
  const lemmas = (await shard(lang, `f:${shardOf(key)}`)).get(key);
  if (!lemmas) return null;
  // Форма может вести к нескольким словам («calles» — calle и callar). Сильнее всего
  // тянет слово, которое целиком стоит в начале формы (calle+s), дальше — полнота
  // статьи, и при равенстве — длина общего начала.
  const prefix = (a: string) => {
    let i = 0;
    while (i < a.length && i < key.length && a[i] === key[i]) i++;
    return i;
  };
  let best: DictHit | null = null;
  let bestScore = -1;
  for (const lemma of new Set(lemmas.split("|"))) {
    const e = await entry(lang, dictKey(lemma));
    if (!e) continue;
    const lk = dictKey(e.w);
    const score = (e.r ?? 0) * 100 + (key.startsWith(lk) ? 350 : 0) + prefix(lk);
    if (score > bestScore) {
      best = { lemma: e.w, form: word, senses: e.e, rank: e.r ?? 0 };
      bestScore = score;
    }
  }
  return best;
}

/** Короткий перевод для подсказок: первое значение без пояснений в скобках. */
export function shortGloss(hit: DictHit): string {
  const d = hit.senses[0]?.d[0] ?? "";
  return d.replace(/\s*\([^)]*\)/g, "").split(/[;:,]/)[0].trim() || d;
}

const GENDERS = new Set(["m", "f", "n", "c"]);

/** Род для карточки слова — только если словарь его знает. */
export function hitGender(hit: DictHit): "m" | "f" | "n" | "c" | undefined {
  const g = hit.senses.find((s) => s.g)?.g;
  return g && GENDERS.has(g) ? (g as "m" | "f" | "n" | "c") : undefined;
}

export const hitEtymology = (hit: DictHit) => hit.senses.find((s) => s.t)?.t;
export const hitIpa = (hit: DictHit) => hit.senses.find((s) => s.i)?.i;

/** Значения словаря в markdown — в заметки карточки. */
export function hitNotes(hit: DictHit): string {
  const ipa = hitIpa(hit);
  return [
    ipa ? `/${ipa.replace(/^\/|\/$/g, "")}/` : "",
    ...hit.senses.map((s) => `- *${s.p}* — ${s.d.join("; ")}`),
    "",
    "_Wiktionary, CC BY-SA_",
  ]
    .filter((x, i) => x || i > 0)
    .join("\n");
}

/** Части речи, которые не стоит учить отдельными карточками. */
export const FUNCTION_POS = new Set(["article", "det", "pron", "prep", "conj", "particle", "num", "contraction", "interfix", "prep_phrase", "postp", "intj"]);
