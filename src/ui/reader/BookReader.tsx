import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { aiReady } from "../../ai/config";
import { translateParagraphs } from "../../ai/tasks";
import { translateMany, translateText } from "../../ai/translate";
import { isRtl, langName } from "../../core/languages";
import { anchorSplit, minutesLeft, rhythmSentences, type FocusMode } from "../../core/readingModes";
import { pageCount, pageRange, type Book, type Translation } from "../../core/reader";
import { toucanize } from "../../core/toucan";
import type { Concept } from "../../core/types";
import { useT } from "../../i18n";
import { speakAsync, stopSpeaking } from "../../storage/tts";
import { LangChip, Modal, TermText, useAsync } from "../common";
import { useApp } from "../state";
import { Rsvp } from "./Rsvp";

type Mode = "parallel" | "original" | "toucan";
type Engine = "ai" | "translator";

export interface ReaderPrefs {
  theme: "app" | "paper" | "sepia" | "night" | "contrast";
  font: "sans" | "serif" | "readable" | "mono";
  size: number;
  line: number;
  width: number;
  focus: FocusMode;
}

const DEFAULT_PREFS: ReaderPrefs = { theme: "app", font: "serif", size: 19, line: 1.75, width: 760, focus: "none" };

function loadPrefs(): ReaderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("polygraph.reader") ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

const WORD = /(\p{L}[\p{L}\p{M}'’-]*)/u;

export function BookReader({ book: initial, onClose }: { book: Book; onClose(): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const [book, setBook] = useState(initial);
  const nativeLang = app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.uiLang;
  const trLang = book.lang === nativeLang ? app.profile.uiLang : nativeLang;
  const bookIsKnown = app.profile.known.some((k) => k.code === book.lang) && book.lang !== app.target;
  const [mode, setMode] = useState<Mode>(bookIsKnown ? "toucan" : "parallel");
  const [engine, setEngine] = useState<Engine>(() => (aiReady(app.ai) ? "ai" : "translator"));
  const [tr, setTr] = useState<Translation>({});
  const [auto, setAuto] = useState(() => localStorage.getItem("polygraph.autoTranslate") === "1");
  const [density, setDensity] = useState(1);
  const [prefs, setPrefsState] = useState<ReaderPrefs>(loadPrefs);
  const [showPrefs, setShowPrefs] = useState(false);
  const [clean, setClean] = useState(false);
  const [rsvp, setRsvp] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [popup, setPopup] = useState<{ word: string; concept?: Concept; original?: string; translation?: string } | null>(null);
  const reading = useRef(0);
  const job = useAsync();

  const pages = pageCount(book);
  const [from, to] = pageRange(book, book.page);
  const paras = book.paragraphs.slice(from, to);
  const left = useMemo(() => minutesLeft(book.paragraphs.slice(from)), [book.paragraphs, from]);

  const setPrefs = (patch: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    try {
      localStorage.setItem("polygraph.reader", JSON.stringify(next));
    } catch {
      /* без запоминания */
    }
  };

  useEffect(() => {
    app.repo.loadTranslation(book.id, trLang).then(setTr);
  }, [app.repo, book.id, trLang]);

  const missing = useMemo(() => paras.map((_, i) => from + i).filter((i) => !tr[i]), [paras, from, tr]);

  const translatePage = () =>
    job.run(async () => {
      if (!missing.length) return;
      const src = missing.map((i) => book.paragraphs[i]);
      const out =
        engine === "ai" && aiReady(app.ai)
          ? await translateParagraphs(app.ai, app.profile, book.lang, trLang, src)
          : await translateMany(app.translator, src, book.lang, trLang);
      const next = { ...tr };
      missing.forEach((idx, k) => out[k] && (next[idx] = out[k]));
      setTr(next);
      await app.repo.saveTranslation(book, trLang, next);
    });

  useEffect(() => {
    if (auto && mode === "parallel" && missing.length && !job.busy) translatePage();
    // Автоперевод срабатывает только при смене страницы, режима или флажка.
  }, [book.page, mode, auto]);

  const goPage = useCallback(
    async (p: number) => {
      const nb = { ...book, page: Math.max(0, Math.min(pages - 1, p)) };
      if (nb.page === book.page) return;
      setBook(nb);
      setActive(null);
      await app.repo.saveBook(nb);
      document.querySelector(".main")?.scrollTo({ top: 0 });
      document.querySelector(".clean-reader")?.scrollTo({ top: 0 });
    },
    [book, pages, app.repo],
  );

  // ←/→ листают страницы, пока не открыт диалог и фокус не в поле ввода.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rsvp || popup || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "ArrowRight") goPage(book.page + 1);
      else if (e.key === "ArrowLeft") goPage(book.page - 1);
      else if (e.key === "Escape" && clean) setClean(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPage, book.page, rsvp, popup, clean]);

  // Чтение вслух: абзац за абзацем с подсветкой, в конце страницы —
  // перелистывание, и эффект ниже продолжает чтение на новой странице.
  const continuing = useRef(false);
  const readAloud = async () => {
    const id = ++reading.current;
    continuing.current = true;
    for (let i = 0; i < paras.length && reading.current === id; i++) {
      setSpeaking(from + i);
      await speakAsync(paras[i], book.lang, 0.95);
    }
    if (reading.current !== id) return;
    setSpeaking(null);
    if (book.page < pages - 1) goPage(book.page + 1);
    else continuing.current = false;
  };
  const stopReading = () => {
    continuing.current = false;
    reading.current++;
    stopSpeaking();
    setSpeaking(null);
  };
  useEffect(() => () => stopReading(), []);
  useEffect(() => {
    if (continuing.current) readAloud();
  }, [book.page]);

  const dictFor = (word: string) => {
    const w = word.toLowerCase();
    return app.concepts.find((c) => c.terms[book.lang]?.text.toLowerCase() === w);
  };

  const word = (part: string, key: number | string): ReactNode => {
    if (!WORD.test(part)) return part;
    const onClick = () => setPopup({ word: part, concept: dictFor(part) });
    if (prefs.focus === "anchors") {
      const [a, b] = anchorSplit(part);
      return (
        <span key={key} className="w" onClick={onClick}>
          <b>{a}</b>
          {b}
        </span>
      );
    }
    return (
      <span key={key} className="w" onClick={onClick}>
        {part}
      </span>
    );
  };

  const words = (text: string) => text.split(WORD).map((p, i) => word(p, i));

  const renderPara = (text: string, idx: number): ReactNode => {
    if (mode === "toucan")
      return toucanize(text, app.concepts, book.lang, app.target, density).map((s, i) =>
        s.swap ? (
          <span key={i} className="w swap" lang={app.target} onClick={() => setPopup({ word: s.text, concept: s.swap!.concept, original: s.swap!.original })}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      );
    if (prefs.focus === "rhythm")
      return rhythmSentences(text, idx).map((s, i) => (
        <span key={i} className={`rh-${s.style}`}>
          {words(s.text)}{" "}
        </span>
      ));
    return words(text);
  };

  const dir = isRtl(book.lang) ? "rtl" : "ltr";
  const progress = (book.page + 1) / pages;

  const textBlock = (
    <div
      className={`pages theme-${prefs.theme} font-${prefs.font} ${mode === "parallel" ? "parallel" : ""} ${prefs.focus === "ruler" ? "ruler" : ""}`}
      style={{ fontSize: `${prefs.size}px`, lineHeight: prefs.line, maxWidth: mode === "parallel" ? undefined : `${prefs.width}px` }}
    >
      {paras.map((p, i) => {
        const idx = from + i;
        return (
          <div
            key={idx}
            className={`para-row ${speaking === idx ? "speaking-para" : ""} ${active === idx ? "active" : ""}`}
            onMouseEnter={() => prefs.focus === "ruler" && setActive(idx)}
            onClick={() => prefs.focus === "ruler" && setActive(idx)}
          >
            <p dir={dir} lang={book.lang}>
              {renderPara(p, i)}
            </p>
            {mode === "parallel" && (
              <p className="para-tr" lang={trLang} dir={isRtl(trLang) ? "rtl" : "ltr"}>
                {tr[idx] ?? <span className="muted">…</span>}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  const pager = (
    <div className="row gap between pager">
      <button className="btn" disabled={book.page === 0} onClick={() => goPage(book.page - 1)}>
        ←
      </button>
      <span className="muted small">
        {book.page + 1} / {pages} · {t("reader.left", { n: left })}
      </span>
      <button className="btn" disabled={book.page >= pages - 1} onClick={() => goPage(book.page + 1)}>
        →
      </button>
    </div>
  );

  if (clean)
    return (
      <div className={`clean-reader theme-${prefs.theme}`}>
        <button className="clean-exit icon-btn" onClick={() => setClean(false)} title={t("common.close")}>
          ✕
        </button>
        <div className="clean-inner">
          {textBlock}
          {pager}
        </div>
      </div>
    );

  return (
    <section className="view reader">
      <div className="reader-progress" style={{ width: `${progress * 100}%` }} />
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={() => (stopReading(), onClose())}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{book.title}</h1>
        </div>
        <div className="segmented">
          <button className={mode === "parallel" ? "on" : ""} onClick={() => setMode("parallel")}>
            {t("reader.parallel")}
          </button>
          <button className={mode === "original" ? "on" : ""} onClick={() => setMode("original")}>
            {t("reader.original")}
          </button>
          {bookIsKnown && (
            <button className={mode === "toucan" ? "on" : ""} onClick={() => setMode("toucan")}>
              {t("reader.toucan")}
            </button>
          )}
        </div>
      </header>

      <div className="row gap wrap reader-tools">
        <button className={`btn ${showPrefs ? "primary" : ""}`} onClick={() => setShowPrefs(!showPrefs)} title={t("reader.view")}>
          Aa
        </button>
        {speaking === null ? (
          <button className="btn" onClick={readAloud}>
            🔊 {t("reader.readAloud")}
          </button>
        ) : (
          <button className="btn primary" onClick={stopReading}>
            ■ {t("reader.stopReading")}
          </button>
        )}
        <button className="btn" onClick={() => setRsvp(true)}>
          ⚡ {t("reader.speedRead")}
        </button>
        <button className="btn" onClick={() => setClean(true)}>
          ⛶ {t("reader.clean")}
        </button>
        {mode === "parallel" && (
          <>
            <button className="btn" onClick={translatePage} disabled={job.busy || !missing.length}>
              {job.busy ? t("common.loading") : `✦ ${t("reader.translatePage")}`}
            </button>
            <select className="input input-sm" value={engine} onChange={(e) => setEngine(e.target.value as Engine)} aria-label={t("reader.engine")}>
              <option value="ai">{t("reader.engineAi")}</option>
              <option value="translator">{t("reader.engineTranslator")}</option>
            </select>
            <label className="row gap small">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  try {
                    localStorage.setItem("polygraph.autoTranslate", e.target.checked ? "1" : "0");
                  } catch {
                    /* без запоминания */
                  }
                }}
              />
              {t("reader.auto")}
            </label>
          </>
        )}
        {mode === "toucan" && (
          <label className="row gap small">
            {t("reader.density")}
            <input type="range" min={0.1} max={1} step={0.1} value={density} onChange={(e) => setDensity(Number(e.target.value))} />
            {Math.round(density * 100)}%
          </label>
        )}
      </div>

      {showPrefs && (
        <div className="reader-prefs">
          <div className="field">
            <span>{t("reader.theme")}</span>
            <div className="row gap wrap">
              {(["app", "paper", "sepia", "night", "contrast"] as const).map((th) => (
                <button key={th} className={`chip-btn swatch theme-${th} ${prefs.theme === th ? "on" : ""}`} onClick={() => setPrefs({ theme: th })}>
                  {t(`reader.th.${th}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t("reader.font")}</span>
            <div className="row gap wrap">
              {(["serif", "sans", "readable", "mono"] as const).map((f) => (
                <button key={f} className={`chip-btn font-${f} ${prefs.font === f ? "on" : ""}`} onClick={() => setPrefs({ font: f })}>
                  {t(`reader.f.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t("reader.focus")}</span>
            <div className="row gap wrap">
              {(["none", "anchors", "rhythm", "ruler"] as const).map((f) => (
                <button key={f} className={`chip-btn ${prefs.focus === f ? "on" : ""}`} onClick={() => setPrefs({ focus: f })} title={t(`reader.fh.${f}`)}>
                  {t(`reader.fm.${f}`)}
                </button>
              ))}
            </div>
            <small className="muted">{t(`reader.fh.${prefs.focus}`)}</small>
          </div>
          <div className="player-settings">
            <label className="field">
              <span>{t("reader.size", { n: prefs.size })}</span>
              <input type="range" min={14} max={30} value={prefs.size} onChange={(e) => setPrefs({ size: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>{t("reader.line", { n: prefs.line })}</span>
              <input type="range" min={1.3} max={2.4} step={0.05} value={prefs.line} onChange={(e) => setPrefs({ line: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>{t("reader.width", { n: prefs.width })}</span>
              <input type="range" min={480} max={1100} step={20} value={prefs.width} onChange={(e) => setPrefs({ width: Number(e.target.value) })} />
            </label>
          </div>
        </div>
      )}

      {job.error && <p className="error">{job.error}</p>}
      {textBlock}
      {pager}

      {rsvp && <Rsvp text={book.paragraphs.slice(from).join(" ")} lang={book.lang} onClose={() => setRsvp(false)} />}

      {popup && (
        <Modal title={popup.word} onClose={() => setPopup(null)}>
          <div className="stack">
            {popup.original && (
              <p>
                {t("reader.originalWord")}: <strong>{popup.original}</strong>
              </p>
            )}
            {popup.concept ? (
              <div className="terms-list">
                {Object.entries(popup.concept.terms).map(([code, term]) => (
                  <div key={code} className="row gap">
                    <LangChip code={code} /> <TermText term={term} lang={code} />
                  </div>
                ))}
              </div>
            ) : popup.translation ? (
              <p>
                <LangChip code={trLang} /> {popup.translation} <span className="muted small">· {t("reader.machine")}</span>
              </p>
            ) : (
              <p className="muted">{t("reader.notInDict")}</p>
            )}
            <div className="row gap end wrap">
              {!popup.concept && !popup.translation && (
                <button
                  className="btn"
                  disabled={job.busy}
                  onClick={() =>
                    job.run(async () => {
                      const tr = await translateText(app.translator, popup.word, book.lang, trLang);
                      setPopup({ ...popup, translation: tr });
                    })
                  }
                >
                  {t("reader.quickTranslate")} ({langName(trLang, lang)})
                </button>
              )}
              <button
                className="btn primary"
                onClick={async () => {
                  await app.addToInbox([`${popup.original ?? popup.word} #${book.lang}`]);
                  app.toast(t("home.captured"));
                  setPopup(null);
                }}
              >
                → {t("nav.inbox")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
