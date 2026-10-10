import { useEffect, useState, type ReactNode } from "react";
import { isRtl, langName, LANGUAGES, LEVELS, type Level } from "../core/languages";
import type { Bridge, LanguageSkill, Term } from "../core/types";
import { useT } from "../i18n";
import { platform } from "../storage/platform";
import { canSpeak, speakAsync, stopSpeaking } from "../storage/tts";
import type { Vault } from "../storage/vault";

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TermText({ term, lang, big }: { term?: Term; lang: string; big?: boolean }) {
  if (!term) return <span className="muted">—</span>;
  return (
    <span className={`term ${big ? "term-big" : ""}`} dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
      {term.article && <span className="article">{term.article} </span>}
      <span className={term.gender ? `g-${term.gender}` : ""}>{term.text}</span>
      {term.translit && <span className="translit"> [{term.translit}]</span>}
    </span>
  );
}

export function GenderBadge({ gender }: { gender?: Term["gender"] }) {
  const { t } = useT();
  if (!gender) return null;
  return <span className={`badge badge-${gender}`}>{t(`gender.${gender}`)}</span>;
}

export function BridgeBadge({ bridge }: { bridge: Bridge }) {
  const { t } = useT();
  return (
    <span className={`badge strength-${bridge.strength}`}>
      {bridge.strength === "broken" ? "⚠ " : ""}
      {t(`kind.${bridge.kind}`)} · {t(`strength.${bridge.strength}`)}
    </span>
  );
}

export function LangChip({ code }: { code: string }) {
  return <span className="lang-chip">{code.toUpperCase()}</span>;
}

export function speak(text: string, lang: string) {
  stopSpeaking().then(() => speakAsync(text, lang));
}

export function SpeakButton({ text, lang }: { text: string; lang: string }) {
  const { t } = useT();
  if (!canSpeak()) return null;
  return (
    <button className="icon-btn" title={t("common.listen")} onClick={() => speak(text, lang)}>
      🔊
    </button>
  );
}

/**
 * Сохранить файл: всегда кладём копию в exports/ хранилища (на Android это
 * единственный способ), а в браузере и на ПК ещё и отдаём на скачивание.
 */
export async function exportFile(vault: Vault, name: string, content: string, mime: string): Promise<string> {
  const path = `exports/${name}`;
  await vault.write(path, content);
  if (platform() !== "android") {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return path;
}

export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}

/** Выбор языков с уровнями — для онбординга и настроек. */
export function LanguagePicker({
  value,
  onChange,
  exclude = [],
  uiLang,
  defaultLevel,
}: {
  value: LanguageSkill[];
  onChange(v: LanguageSkill[]): void;
  exclude?: string[];
  uiLang: string;
  defaultLevel: Level;
}) {
  const { t } = useT();
  const [more, setMore] = useState(false);
  const [custom, setCustom] = useState("");
  const selected = new Set(value.map((v) => v.code));
  const shown = LANGUAGES.filter((l) => (more || l.tier === 1 || selected.has(l.code)) && !exclude.includes(l.code));
  const extra = value.filter((v) => !LANGUAGES.some((l) => l.code === v.code));

  const toggle = (code: string) =>
    onChange(selected.has(code) ? value.filter((v) => v.code !== code) : [...value, { code, level: defaultLevel }]);
  const setLevel = (code: string, level: Level) => onChange(value.map((v) => (v.code === code ? { ...v, level } : v)));

  return (
    <div className="lang-picker">
      <div className="lang-grid">
        {[...shown.map((l) => l.code), ...extra.map((e) => e.code)].map((code) => {
          const on = selected.has(code);
          const info = LANGUAGES.find((l) => l.code === code);
          return (
            <div key={code} className={`lang-option ${on ? "on" : ""}`}>
              <button type="button" onClick={() => toggle(code)}>
                <span className="lang-native">{info?.native ?? code}</span>
                <span className="lang-local">{langName(code, uiLang)}</span>
              </button>
              {on && (
                <select value={value.find((v) => v.code === code)?.level} onChange={(e) => setLevel(code, e.target.value as Level)} aria-label={t("common.level")}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="row gap wrap">
        {!more && (
          <button type="button" className="btn-link" onClick={() => setMore(true)}>
            {t("onb.more")}
          </button>
        )}
        <form
          className="row gap"
          onSubmit={(e) => {
            e.preventDefault();
            const code = custom.trim().toLowerCase();
            if (/^[a-z]{2,3}$/.test(code) && !selected.has(code)) onChange([...value, { code, level: defaultLevel }]);
            setCustom("");
          }}
        >
          <input className="input-sm" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t("onb.custom")} maxLength={3} />
        </form>
      </div>
    </div>
  );
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
