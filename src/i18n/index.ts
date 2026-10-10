import { createContext, useContext } from "react";
import { en, type MessageKey, type Messages } from "./en";
import { ru } from "./ru";

// Чтобы добавить язык интерфейса: скопируй ru.ts, переведи строки
// и добавь его сюда. Подробнее — docs/TRANSLATING.md.
export const LOCALES: Record<string, Messages> = { en, ru };

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: string): T {
  const dict = LOCALES[lang] ?? en;
  return (key, vars) => {
    let s: string = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export function detectUiLang(): string {
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return LOCALES[nav] ? nav : "en";
}

export const I18nContext = createContext<{ t: T; lang: string }>({ t: makeT("en"), lang: "en" });

export function useT() {
  return useContext(I18nContext);
}
