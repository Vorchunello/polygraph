import type { Level } from "./languages";

export type LangCode = string;

export interface Term {
  text: string;
  gender?: "m" | "f" | "n" | "c";
  article?: string;
  translit?: string;
  note?: string;
}

/**
 * Мост — связь слова изучаемого языка с языком, который ученик уже знает.
 * strength говорит, можно ли на мост опираться:
 *   strong — опирайся смело (родственное слово, тот же род);
 *   weak   — похоже, но с оговорками;
 *   broken — ловушка: ложный друг, род не совпадает и т.п.
 */
export type BridgeKind =
  | "cognate"
  | "loan"
  | "false-friend"
  | "gender"
  | "grammar"
  | "sound"
  | "mnemonic";

export interface Bridge {
  from: LangCode;
  kind: BridgeKind;
  strength: "strong" | "weak" | "broken";
  note: string;
  /** Подтверждено человеком или источником. ИИ-мосты приходят с false. */
  verified?: boolean;
  source?: string;
}

export interface Example {
  lang: LangCode;
  text: string;
  tr?: string;
}

export interface SrsState {
  due: string; // ГГГГ-ММ-ДД
  interval: number; // дни
  ease: number;
  reps: number;
  lapses: number;
  last?: string;
}

export interface Concept {
  id: string;
  terms: Record<LangCode, Term>;
  bridges: Bridge[];
  examples: Example[];
  etymology?: string;
  etymologyVerified?: boolean;
  tags: string[];
  srs: Record<LangCode, SrsState>;
  created: string;
  updated: string;
  /** Свободные заметки — markdown-тело файла. */
  notes: string;
}

export interface LanguageSkill {
  code: LangCode;
  level: Level;
}

export interface Profile {
  name?: string;
  uiLang: string;
  known: LanguageSkill[];
  learning: LanguageSkill[];
  /** Какой из изучаемых языков сейчас активен. */
  target?: LangCode;
  created: string;
}

export interface Route {
  id: string;
  topic: string;
  via: LangCode;
  marker: "+" | "-" | "!" | "?";
}
