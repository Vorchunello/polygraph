import { platformFetch } from "../storage/platform";

// Машинный перевод без ИИ — когда модель недоступна или нужен быстрый
// перевод слова. MyMemory работает без ключа (качество черновое: короткие
// фразы иногда берутся из чужой памяти переводов), DeepL — лучший по
// качеству, бесплатный ключ даёт 500 000 знаков в месяц, LibreTranslate —
// свой или публичный сервер.

export type TranslatorId = "mymemory" | "deepl" | "libre";

export interface TranslatorConfig {
  id: TranslatorId;
  deeplKey: string;
  libreUrl: string;
  libreKey: string;
  /** Почта для MyMemory поднимает дневной лимит с 5 000 до 50 000 знаков. */
  email: string;
}

export const DEFAULT_TRANSLATOR: TranslatorConfig = { id: "mymemory", deeplKey: "", libreUrl: "", libreKey: "", email: "" };

export class TranslateError extends Error {}

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) throw new TranslateError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new TranslateError(`Unexpected response: ${text.slice(0, 200)}`);
  }
}

// MyMemory принимает до 500 байт за запрос — длинный текст режем по предложениям.
function chunks(text: string, max = 450): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of text.split(/(?<=[.!?…])\s+/)) {
    if (new TextEncoder().encode(cur + " " + s).length > max && cur) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number;
  responseDetails?: string;
  matches?: { translation: string; "created-by"?: string; quality?: number | string }[];
}

async function myMemory(cfg: TranslatorConfig, text: string, from: string, to: string): Promise<string> {
  const parts: string[] = [];
  for (const piece of chunks(text)) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", piece);
    url.searchParams.set("langpair", `${from}|${to}`);
    url.searchParams.set("mt", "1");
    if (cfg.email) url.searchParams.set("de", cfg.email);
    const r = (await json(await platformFetch(url.href))) as MyMemoryResponse;
    if (r.responseStatus && r.responseStatus !== 200) throw new TranslateError(r.responseDetails || `MyMemory ${r.responseStatus}`);
    // Машинный вариант надёжнее случайного совпадения из памяти переводов.
    const mt = r.matches?.find((m) => m["created-by"] === "MT!")?.translation;
    parts.push(mt || r.responseData?.translatedText || "");
  }
  return parts.join(" ");
}

// DeepL ждёт свои коды: EN-US вместо en, PT-BR вместо pt.
function deeplTarget(lang: string): string {
  const map: Record<string, string> = { en: "EN-US", pt: "PT-BR", zh: "ZH-HANS" };
  return map[lang] ?? lang.toUpperCase();
}

async function deepl(cfg: TranslatorConfig, texts: string[], from: string, to: string): Promise<string[]> {
  if (!cfg.deeplKey) throw new TranslateError("DeepL: no API key");
  const host = cfg.deeplKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const r = (await json(
    await platformFetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${cfg.deeplKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts, source_lang: from.toUpperCase(), target_lang: deeplTarget(to) }),
    }),
  )) as { translations?: { text: string }[] };
  return texts.map((_, i) => r.translations?.[i]?.text ?? "");
}

async function libre(cfg: TranslatorConfig, texts: string[], from: string, to: string): Promise<string[]> {
  if (!cfg.libreUrl) throw new TranslateError("LibreTranslate: no server URL");
  const r = (await json(
    await platformFetch(`${cfg.libreUrl.replace(/\/+$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: from, target: to, format: "text", api_key: cfg.libreKey || undefined }),
    }),
  )) as { translatedText?: string | string[] };
  const t = r.translatedText;
  return Array.isArray(t) ? t : [t ?? ""];
}

export async function translateMany(cfg: TranslatorConfig, texts: string[], from: string, to: string): Promise<string[]> {
  if (from === to) return texts;
  switch (cfg.id) {
    case "deepl":
      return deepl(cfg, texts, from, to);
    case "libre":
      return libre(cfg, texts, from, to);
    default: {
      const out: string[] = [];
      for (const t of texts) out.push(t.trim() ? await myMemory(cfg, t, from, to) : "");
      return out;
    }
  }
}

export async function translateText(cfg: TranslatorConfig, text: string, from: string, to: string): Promise<string> {
  return (await translateMany(cfg, [text], from, to))[0];
}
