import { useEffect, useMemo, useState } from "react";
import { I18nContext, makeT, useT } from "../i18n";
import type { OverlayWord } from "../storage/native";
import { Repo } from "../storage/repo";
import { openVault } from "../storage/vault";
import { loadTickerSettings, tickerWords } from "./BackgroundView";
import { markUnknown } from "./state";

/**
 * Бегущая строка: слово с переводами сменяется само, каждое N-е спрашивает
 * «знаю / не знаю». Пассивный просмотр почти не запоминается — короткий
 * ответ превращает фон в повторение.
 */
export function Ticker({
  words,
  intervalSec,
  askEvery,
  onUnknown,
  compact,
}: {
  words: OverlayWord[];
  intervalSec: number;
  askEvery: number;
  onUnknown?(id: string): void;
  compact?: boolean;
}) {
  const { t } = useT();
  const [n, setN] = useState(0);
  const asking = askEvery > 0 && n > 0 && n % askEvery === 0;

  useEffect(() => {
    if (!words.length) return;
    const ms = (asking ? intervalSec * 3 : intervalSec) * 1000;
    const id = setTimeout(() => setN((x) => x + 1), ms);
    return () => clearTimeout(id);
  }, [n, words.length, intervalSec, asking]);

  if (!words.length) return null;
  const w = words[n % words.length];

  return (
    <div className={`ticker ${compact ? "compact" : ""}`}>
      <div className="ticker-words">
        <div className="ticker-tgt">{w.tgt}</div>
        <div className="ticker-sub">{w.sub}</div>
      </div>
      {asking && (
        <div className="ticker-ask">
          <button className="btn small" onClick={() => setN(n + 1)}>
            ✓ {t("bg.know")}
          </button>
          <button
            className="btn small"
            onClick={() => {
              onUnknown?.(w.id);
              setN(n + 1);
            }}
          >
            ✗ {t("bg.dontKnow")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Отдельное окно Electron (#ticker): само читает хранилище и пишет «не знаю». */
export function TickerWindow() {
  const repo = useMemo(() => new Repo(openVault()), []);
  const [state, setState] = useState<{ words: OverlayWord[]; ui: string; target: string } | null>(null);
  const settings = loadTickerSettings();

  useEffect(() => {
    document.body.classList.add("ticker-body");
    const load = async () => {
      const profile = await repo.loadProfile();
      if (!profile) return;
      const target = profile.target ?? profile.learning[0]?.code ?? "en";
      const concepts = await repo.loadConcepts();
      setState({ words: tickerWords(concepts, profile, target, settings.source), ui: profile.uiLang, target });
    };
    load();
    return window.polygraph?.onVaultChanged((p) => p === "profile.md" && load());
  }, [repo, settings.source]);

  if (!state) return null;
  const t = makeT(state.ui);
  return (
    <I18nContext.Provider value={{ t, lang: state.ui }}>
    <div className="ticker-window">
      <Ticker
        compact
        words={state.words}
        intervalSec={settings.intervalSec}
        askEvery={settings.askEvery}
        onUnknown={async (id) => {
          const c = (await repo.loadConcepts()).find((x) => x.id === id);
          if (c) await repo.saveConcept(markUnknown(c, state.target));
        }}
      />
      <button className="ticker-close" title={t("common.close")} onClick={() => window.polygraph?.ticker.close()}>
        ✕
      </button>
    </div>
    </I18nContext.Provider>
  );
}
