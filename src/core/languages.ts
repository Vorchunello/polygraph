// Справочник языков. Первые 15 — «первого класса»: под них подобраны подсказки
// маршрутов (род, артикли, падежи) и они показываются первыми в выборе.
// Учить можно любой язык с ISO-кодом: остальное делает ИИ.

export type Gender = "none" | "mf" | "mfn" | "common";

export interface LanguageInfo {
  code: string;
  name: string; // английское название — запасное, если нет Intl.DisplayNames
  native: string;
  rtl?: boolean;
  script: string;
  gender: Gender;
  articles: boolean;
  cases: boolean;
  tier: 1 | 2;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", native: "English", script: "Latin", gender: "none", articles: true, cases: false, tier: 1 },
  { code: "zh", name: "Chinese (Mandarin)", native: "中文", script: "Han", gender: "none", articles: false, cases: false, tier: 1 },
  { code: "hi", name: "Hindi", native: "हिन्दी", script: "Devanagari", gender: "mf", articles: false, cases: true, tier: 1 },
  { code: "es", name: "Spanish", native: "Español", script: "Latin", gender: "mf", articles: true, cases: false, tier: 1 },
  { code: "fr", name: "French", native: "Français", script: "Latin", gender: "mf", articles: true, cases: false, tier: 1 },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true, script: "Arabic", gender: "mf", articles: true, cases: true, tier: 1 },
  { code: "bn", name: "Bengali", native: "বাংলা", script: "Bengali", gender: "none", articles: false, cases: true, tier: 1 },
  { code: "pt", name: "Portuguese", native: "Português", script: "Latin", gender: "mf", articles: true, cases: false, tier: 1 },
  { code: "ru", name: "Russian", native: "Русский", script: "Cyrillic", gender: "mfn", articles: false, cases: true, tier: 1 },
  { code: "ja", name: "Japanese", native: "日本語", script: "Kana/Kanji", gender: "none", articles: false, cases: false, tier: 1 },
  { code: "de", name: "German", native: "Deutsch", script: "Latin", gender: "mfn", articles: true, cases: true, tier: 1 },
  { code: "tr", name: "Turkish", native: "Türkçe", script: "Latin", gender: "none", articles: false, cases: true, tier: 1 },
  { code: "ko", name: "Korean", native: "한국어", script: "Hangul", gender: "none", articles: false, cases: false, tier: 1 },
  { code: "it", name: "Italian", native: "Italiano", script: "Latin", gender: "mf", articles: true, cases: false, tier: 1 },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", script: "Latin", gender: "none", articles: false, cases: false, tier: 1 },
  { code: "uk", name: "Ukrainian", native: "Українська", script: "Cyrillic", gender: "mfn", articles: false, cases: true, tier: 2 },
  { code: "pl", name: "Polish", native: "Polski", script: "Latin", gender: "mfn", articles: false, cases: true, tier: 2 },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true, script: "Arabic", gender: "none", articles: false, cases: false, tier: 2 },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true, script: "Arabic", gender: "mf", articles: false, cases: true, tier: 2 },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", script: "Latin", gender: "none", articles: false, cases: false, tier: 2 },
  { code: "nl", name: "Dutch", native: "Nederlands", script: "Latin", gender: "common", articles: true, cases: false, tier: 2 },
  { code: "sv", name: "Swedish", native: "Svenska", script: "Latin", gender: "common", articles: true, cases: false, tier: 2 },
  { code: "el", name: "Greek", native: "Ελληνικά", script: "Greek", gender: "mfn", articles: true, cases: true, tier: 2 },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true, script: "Hebrew", gender: "mf", articles: true, cases: false, tier: 2 },
  { code: "kk", name: "Kazakh", native: "Қазақша", script: "Cyrillic", gender: "none", articles: false, cases: true, tier: 2 },
  { code: "az", name: "Azerbaijani", native: "Azərbaycanca", script: "Latin", gender: "none", articles: false, cases: true, tier: 2 },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha", script: "Latin", gender: "none", articles: false, cases: true, tier: 2 },
  { code: "th", name: "Thai", native: "ไทย", script: "Thai", gender: "none", articles: false, cases: false, tier: 2 },
  { code: "sw", name: "Swahili", native: "Kiswahili", script: "Latin", gender: "none", articles: false, cases: false, tier: 2 },
  { code: "la", name: "Latin", native: "Latina", script: "Latin", gender: "mfn", articles: false, cases: true, tier: 2 },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function langInfo(code: string): LanguageInfo {
  return (
    byCode.get(code) ?? {
      code,
      name: code,
      native: code,
      script: "?",
      gender: "none",
      articles: false,
      cases: false,
      tier: 2,
    }
  );
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** Название языка на языке интерфейса: Intl знает сотни языков, поэтому
 *  список языков локализован даже там, где интерфейс ещё не переведён. */
export function langName(code: string, uiLang: string): string {
  if (!displayNames.has(uiLang)) {
    try {
      displayNames.set(uiLang, new Intl.DisplayNames([uiLang], { type: "language" }));
    } catch {
      displayNames.set(uiLang, null);
    }
  }
  const dn = displayNames.get(uiLang);
  const name = dn?.of(code);
  if (name && name !== code) return name.charAt(0).toLocaleUpperCase(uiLang) + name.slice(1);
  return langInfo(code).name;
}

export function isRtl(code: string): boolean {
  return !!langInfo(code).rtl;
}

export const LEVELS = ["native", "C2", "C1", "B2", "B1", "A2", "A1", "A0"] as const;
export type Level = (typeof LEVELS)[number];
