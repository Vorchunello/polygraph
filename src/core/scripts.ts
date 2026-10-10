// Системы письма и коды для режима адаптации: каждая — таблица «буква
// исходного текста → знак цели». Исходник бывает кириллицей или латиницей,
// цель — другим алфавитом (арабский, иврит, греческий…) или кодом (Морзе, Брайль).

export type ScriptId = "arabic" | "hebrew" | "greek" | "cyrillic" | "latin" | "morse" | "braille";

export interface ScriptInfo {
  id: ScriptId;
  rtl?: boolean;
  /** Код, а не письмо: знаки разделяются пробелами, слова — « / ». */
  code?: boolean;
  /** Язык, для которого эта система письма родная, — по нему подбирается цель. */
  langs: string[];
}

export const SCRIPTS: ScriptInfo[] = [
  { id: "arabic", rtl: true, langs: ["ar", "fa", "ur"] },
  { id: "hebrew", rtl: true, langs: ["he", "yi"] },
  { id: "greek", langs: ["el"] },
  { id: "cyrillic", langs: ["ru", "uk", "be", "bg", "sr", "kk", "mn"] },
  { id: "latin", langs: ["en", "es", "fr", "de", "it", "pt", "tr", "pl", "nl", "id", "vi", "az", "uz", "sv", "sw", "la"] },
  { id: "morse", code: true, langs: [] },
  { id: "braille", code: true, langs: [] },
];

export function scriptInfo(id: ScriptId): ScriptInfo {
  return SCRIPTS.find((s) => s.id === id)!;
}

export function scriptOfLang(lang: string): ScriptId | null {
  return SCRIPTS.find((s) => s.langs.includes(lang))?.id ?? null;
}

const FATHA = "َ";
const KASRA = "ِ";
const DAMMA = "ُ";

// Гласные в арабском — огласовки над согласной, а в начале слова — на алифе.
// Поэтому значение гласной — пара [после согласной, в начале слова].
type Glyph = string | [string, string];

const CYR_ARABIC: Record<string, Glyph> = {
  б: "ب", в: "و", г: "غ", д: "د", ж: "ج", з: "ز", й: "ي", к: "ك", л: "ل", м: "م", н: "ن", п: "ب", р: "ر",
  с: "س", т: "ت", ф: "ف", х: "خ", ц: "تس", ч: "تش", ш: "ش", щ: "شش", ъ: "", ь: "",
  а: [FATHA, "أَ"], о: [DAMMA, "أُ"], у: [DAMMA, "أُ"], ы: [KASRA, "إِ"], и: [KASRA, "إِ"], э: [KASRA, "إِ"],
  е: ["ي" + KASRA, "يِ"], ё: ["ي" + DAMMA, "يُ"], ю: ["ي" + DAMMA, "يُ"], я: ["ي" + FATHA, "يَ"],
};

const LAT_ARABIC: Record<string, Glyph> = {
  b: "ب", c: "ك", ç: "تش", d: "د", f: "ف", g: "ج", ğ: "غ", h: "ه", j: "ج", k: "ك", l: "ل", m: "م", n: "ن",
  ñ: "ني", p: "ب", q: "ق", r: "ر", s: "س", ş: "ش", t: "ت", v: "ف", w: "و", x: "كس", y: "ي", z: "ز",
  a: [FATHA, "أَ"], e: [KASRA, "إِ"], i: [KASRA, "إِ"], ı: [KASRA, "إِ"], o: [DAMMA, "أُ"], ö: [DAMMA, "أُ"],
  u: [DAMMA, "أُ"], ü: [DAMMA, "أُ"],
};

const PATAH = "ַ";
const HIRIQ = "ִ";
const HOLAM = "ֹ";
const QUBUTS = "ֻ";

const CYR_HEBREW: Record<string, Glyph> = {
  б: "ב", в: "ו", г: "ג", д: "ד", ж: "ז׳", з: "ז", й: "י", к: "ק", л: "ל", м: "מ", н: "נ", п: "פ", р: "ר",
  с: "ס", т: "ט", ф: "פ׳", х: "ח", ц: "צ", ч: "צ׳", ш: "ש", щ: "ש", ъ: "", ь: "",
  а: [PATAH, "אַ"], о: [HOLAM, "אֹ"], у: [QUBUTS, "אֻ"], ы: [HIRIQ, "אִ"], и: [HIRIQ, "אִ"], э: [HIRIQ, "אִ"],
  е: ["י" + HIRIQ, "יִ"], ё: ["י" + HOLAM, "יֹ"], ю: ["י" + QUBUTS, "יֻ"], я: ["י" + PATAH, "יַ"],
};

const LAT_HEBREW: Record<string, Glyph> = {
  b: "ב", c: "ק", ç: "צ׳", d: "ד", f: "פ", g: "ג", ğ: "ג", h: "ה", j: "ג׳", k: "ק", l: "ל", m: "מ", n: "נ",
  ñ: "ני", p: "פ", q: "ק", r: "ר", s: "ס", ş: "ש", t: "ט", v: "ו", w: "ו", x: "קס", y: "י", z: "ז",
  a: [PATAH, "אַ"], e: [HIRIQ, "אִ"], i: [HIRIQ, "אִ"], ı: [HIRIQ, "אִ"], o: [HOLAM, "אֹ"], ö: [HOLAM, "אֹ"],
  u: [QUBUTS, "אֻ"], ü: [QUBUTS, "אֻ"],
};

const CYR_GREEK: Record<string, Glyph> = {
  а: "α", б: "μπ", в: "β", г: "γ", д: "ντ", е: "ε", ё: "ιο", ж: "ζ", з: "ζ", и: "ι", й: "ι", к: "κ", л: "λ",
  м: "μ", н: "ν", о: "ο", п: "π", р: "ρ", с: "σ", т: "τ", у: "ου", ф: "φ", х: "χ", ц: "τσ", ч: "τσ", ш: "σ",
  щ: "σ", ъ: "", ы: "ι", ь: "", э: "ε", ю: "ιου", я: "ια",
};

const LAT_GREEK: Record<string, Glyph> = {
  a: "α", b: "μπ", c: "κ", ç: "τσ", d: "ντ", e: "ε", f: "φ", g: "γκ", ğ: "γ", h: "χ", i: "ι", ı: "ι", j: "τζ",
  k: "κ", l: "λ", m: "μ", n: "ν", ñ: "νι", o: "ο", ö: "ο", p: "π", q: "κ", r: "ρ", s: "σ", ş: "σ", t: "τ",
  u: "ου", ü: "ου", v: "β", w: "ου", x: "ξ", y: "ι", z: "ζ",
};

const LAT_CYR: Record<string, Glyph> = {
  a: "а", b: "б", c: "к", ç: "ч", d: "д", e: "е", f: "ф", g: "г", ğ: "г", h: "х", i: "и", ı: "ы", j: "дж",
  k: "к", l: "л", m: "м", n: "н", ñ: "нь", o: "о", ö: "ё", p: "п", q: "к", r: "р", s: "с", ş: "ш", t: "т",
  u: "у", ü: "ю", v: "в", w: "в", x: "кс", y: "й", z: "з",
};

const CYR_LAT: Record<string, Glyph> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "'", э: "e", ю: "yu", я: "ya",
};

export const MORSE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-",
  l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-",
  w: ".--", x: "-..-", y: "-.--", z: "--..",
  а: ".-", б: "-...", в: ".--", г: "--.", д: "-..", е: ".", ё: ".", ж: "...-", з: "--..", и: "..", й: ".---",
  к: "-.-", л: ".-..", м: "--", н: "-.", о: "---", п: ".--.", р: ".-.", с: "...", т: "-", у: "..-", ф: "..-.",
  х: "....", ц: "-.-.", ч: "---.", ш: "----", щ: "--.-", ъ: "--.--", ы: "-.--", ь: "-..-", э: "..-..",
  ю: "..--", я: ".-.-",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....",
  "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--",
};

export const BRAILLE: Record<string, string> = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚", k: "⠅", l: "⠇", m: "⠍",
  n: "⠝", o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞", u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
  а: "⠁", б: "⠃", в: "⠺", г: "⠛", д: "⠙", е: "⠑", ё: "⠡", ж: "⠚", з: "⠵", и: "⠊", й: "⠯", к: "⠅", л: "⠇",
  м: "⠍", н: "⠝", о: "⠕", п: "⠏", р: "⠗", с: "⠎", т: "⠞", у: "⠥", ф: "⠋", х: "⠓", ц: "⠉", ч: "⠟", ш: "⠱",
  щ: "⠭", ъ: "⠷", ы: "⠮", ь: "⠾", э: "⠪", ю: "⠳", я: "⠫",
};

const isCyr = (ch: string) => /[Ѐ-ӿ]/.test(ch);

/** Таблица для пары «буква исходника → цель». null — пары нет. */
export function glyphTable(target: ScriptId, sourceIsCyrillic: boolean): Record<string, Glyph> | null {
  switch (target) {
    case "arabic":
      return sourceIsCyrillic ? CYR_ARABIC : LAT_ARABIC;
    case "hebrew":
      return sourceIsCyrillic ? CYR_HEBREW : LAT_HEBREW;
    case "greek":
      return sourceIsCyrillic ? CYR_GREEK : LAT_GREEK;
    case "cyrillic":
      return sourceIsCyrillic ? null : LAT_CYR;
    case "latin":
      return sourceIsCyrillic ? CYR_LAT : null;
    case "morse":
      return MORSE;
    case "braille":
      return BRAILLE;
  }
}

export function detectCyrillic(text: string): boolean {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (isCyr(ch)) cyr++;
    else if (/[a-z]/i.test(ch)) lat++;
  }
  return cyr >= lat;
}

const VOWELS = new Set("аеёиоуыэюяaeiıouöüy");

/**
 * Порядок замены букв: сначала согласные от частых к редким — так эффект
 * виден сразу, — гласные в самом конце (в арабском и иврите они становятся
 * огласовками над уже заменёнными согласными).
 */
export function morphOrder(text: string, table: Record<string, Glyph>, vowelsLast: boolean): string[] {
  const freq = new Map<string, number>();
  for (const ch of text.toLowerCase()) if (ch in table) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const letters = [...freq.keys()].sort((a, b) => freq.get(b)! - freq.get(a)!);
  if (!vowelsLast) return letters;
  return [...letters.filter((l) => !VOWELS.has(l)), ...letters.filter((l) => VOWELS.has(l))];
}

/** Переписать слово: буквы из набора replaced меняются на знаки цели. */
export function morphWord(word: string, table: Record<string, Glyph>, replaced: Set<string>, code: boolean): string {
  const out: string[] = [];
  const chars = [...word];
  chars.forEach((ch, i) => {
    const low = ch.toLowerCase();
    if (!replaced.has(low) || !(low in table)) {
      out.push(ch);
      return;
    }
    const g = table[low];
    // Гласная в начале слова в арабском и иврите садится на алиф.
    out.push(Array.isArray(g) ? (i === 0 ? g[1] : g[0]) : g);
  });
  // Коды: каждый знак отдельно, иначе «.-» и «-...» сольются в нечитаемое.
  return code ? out.filter(Boolean).join(" ") : out.join("");
}
