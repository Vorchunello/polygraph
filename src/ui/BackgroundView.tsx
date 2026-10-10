import { useEffect, useMemo, useState } from "react";
import { today } from "../core/dates";
import { langName } from "../core/languages";
import { isDue, isNew } from "../core/srs";
import { toucanize } from "../core/toucan";
import type { Concept, LangCode, Profile } from "../core/types";
import { useT } from "../i18n";
import { Native, type OverlayWord } from "../storage/native";
import { platform } from "../storage/platform";
import { useApp } from "./state";
import { Ticker } from "./Ticker";

export interface TickerSettings {
  source: "due" | "new" | "all";
  intervalSec: number;
  askEvery: number;
}

export const TICKER_DEFAULTS: TickerSettings = { source: "all", intervalSec: 6, askEvery: 5 };

export function loadTickerSettings(): TickerSettings {
  try {
    return { ...TICKER_DEFAULTS, ...JSON.parse(localStorage.getItem("polygraph.ticker") ?? "{}") };
  } catch {
    return TICKER_DEFAULTS;
  }
}

export function tickerWords(concepts: Concept[], profile: Profile, target: LangCode, source: TickerSettings["source"]): OverlayWord[] {
  const now = today();
  const known = profile.known.map((k) => k.code).filter((c) => c !== target);
  let list = concepts.filter((c) => c.terms[target]);
  if (source === "due") list = list.filter((c) => isDue(c, target, now) || isNew(c, target));
  if (source === "new") list = list.filter((c) => isNew(c, target));
  // Перемешиваем, чтобы полоска не шла всегда в одном порядке.
  list = [...list].sort(() => Math.random() - 0.5);
  return list.map((c) => {
    const t = c.terms[target];
    return {
      id: c.id,
      tgt: [t.article, t.text].filter(Boolean).join(" "),
      sub: known
        .map((k) => c.terms[k]?.text)
        .filter(Boolean)
        .join(" · "),
    };
  });
}

export function BackgroundView() {
  const { t, lang } = useT();
  const app = useApp();
  const [s, setS] = useState<TickerSettings>(loadTickerSettings);
  const [overlayOn, setOverlayOn] = useState(false);
  const [toucanText, setToucanText] = useState("");
  const [from, setFrom] = useState(app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.known[0]?.code ?? "en");
  const p = platform();

  const words = useMemo(() => tickerWords(app.concepts, app.profile, app.target, s.source), [app.concepts, app.profile, app.target, s.source]);

  const update = (patch: Partial<TickerSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      localStorage.setItem("polygraph.ticker", JSON.stringify(next));
    } catch {
      /* без запоминания */
    }
  };

  useEffect(() => {
    if (p !== "android") return;
    // Вернулись после выдачи разрешения — не нужно жать второй раз.
    const onVisible = () => document.visibilityState === "visible" && Native.canDrawOverlays();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [p]);

  const startOverlay = async () => {
    if (!(await Native.canDrawOverlays()).value) {
      app.toast(t("bg.needPermission"));
      await Native.requestOverlayPermission();
      return;
    }
    await Native.startOverlay({ words: words.slice(0, 300), intervalSec: s.intervalSec, askEvery: s.askEvery });
    setOverlayOn(true);
  };

  const segments = useMemo(() => (toucanText ? toucanize(toucanText, app.concepts, from, app.target, 1) : []), [toucanText, app.concepts, from, app.target]);

  return (
    <section className="view narrow">
      <h1>{t("bg.title")}</h1>
      <p className="muted">{t("bg.hint")}</p>

      <div className="player-settings">
        <label className="field">
          <span>{t("bg.source")}</span>
          <select className="input" value={s.source} onChange={(e) => update({ source: e.target.value as TickerSettings["source"] })}>
            <option value="all">{t("bg.srcAll")}</option>
            <option value="due">{t("bg.srcDue")}</option>
            <option value="new">{t("bg.srcNew")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("bg.interval", { n: s.intervalSec })}</span>
          <input type="range" min={2} max={20} value={s.intervalSec} onChange={(e) => update({ intervalSec: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>{s.askEvery ? t("bg.askEvery", { n: s.askEvery }) : t("bg.askNever")}</span>
          <input type="range" min={0} max={10} value={s.askEvery} onChange={(e) => update({ askEvery: Number(e.target.value) })} />
        </label>
      </div>
      <p className="muted small">{t("bg.askWhy")}</p>

      {words.length === 0 ? (
        <div className="empty">{t("bg.noWords")}</div>
      ) : (
        <>
          <h3>{t("bg.preview")}</h3>
          <Ticker words={words} intervalSec={s.intervalSec} askEvery={s.askEvery} />
          <div className="row gap wrap">
            {p === "electron" && (
              <>
                <button className="btn primary" onClick={() => window.polygraph!.ticker.open()}>
                  ⧉ {t("bg.openWindow")}
                </button>
                <button className="btn" onClick={() => window.polygraph!.ticker.close()}>
                  {t("bg.closeWindow")}
                </button>
              </>
            )}
            {p === "android" &&
              (overlayOn ? (
                <button className="btn" onClick={() => Native.stopOverlay().then(() => setOverlayOn(false))}>
                  {t("bg.stopOverlay")}
                </button>
              ) : (
                <button className="btn primary" onClick={startOverlay}>
                  ⧉ {t("bg.startOverlay")}
                </button>
              ))}
          </div>
          <p className="muted small">{p === "electron" ? t("bg.windowHint") : p === "android" ? t("bg.overlayHint") : t("bg.webHint")}</p>
        </>
      )}

      <h3>{t("bg.toucanTitle")}</h3>
      <p className="muted small">{t("bg.toucanHint", { lang: langName(app.target, lang) })}</p>
      <div className="row gap">
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          {app.profile.known.map((k) => (
            <option key={k.code} value={k.code}>
              {langName(k.code, lang)}
            </option>
          ))}
        </select>
      </div>
      <textarea className="input" rows={5} value={toucanText} onChange={(e) => setToucanText(e.target.value)} placeholder={t("bg.toucanPh")} />
      {segments.length > 0 && (
        <p className="toucan-out">
          {segments.map((seg, i) =>
            seg.swap ? (
              <span key={i} className="w swap" title={seg.swap.original}>
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      )}
    </section>
  );
}
