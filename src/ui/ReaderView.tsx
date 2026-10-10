import { useEffect, useMemo, useState } from "react";
import { aiReady } from "../ai/config";
import { translateParagraphs } from "../ai/tasks";
import { today } from "../core/dates";
import { isRtl, langName } from "../core/languages";
import { pageCount, pageRange, parseBookFile, parsePlain, type Book, type Translation } from "../core/reader";
import { toucanize } from "../core/toucan";
import type { Concept } from "../core/types";
import { useT } from "../i18n";
import { LangChip, Modal, pickBinaryFile, TermText, useAsync } from "./common";
import { useApp } from "./state";

type Mode = "parallel" | "original" | "toucan";

export function ReaderView() {
  const { t } = useT();
  const app = useApp();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [open, setOpen] = useState<Book | null>(null);
  const [importing, setImporting] = useState<{ title: string; author?: string; paragraphs: string[] } | null>(null);
  const [pasting, setPasting] = useState(false);
  const job = useAsync();

  useEffect(() => {
    app.repo.loadBooks().then(setBooks);
  }, [app.repo]);

  if (open)
    return (
      <BookReader
        book={open}
        onClose={() => {
          setOpen(null);
          app.repo.loadBooks().then(setBooks);
        }}
      />
    );

  return (
    <section className="view narrow">
      <header className="view-head">
        <h1>{t("reader.title")}</h1>
        <div className="row gap">
          <button className="btn" onClick={() => setPasting(true)}>
            {t("reader.paste")}
          </button>
          <button
            className="btn primary"
            onClick={() =>
              job.run(async () => {
                const f = await pickBinaryFile(".txt,.md,.fb2,.zip,.epub");
                if (f) setImporting(parseBookFile(f.name, f.bytes));
              })
            }
          >
            + {t("reader.import")}
          </button>
        </div>
      </header>
      <p className="muted">{t("reader.hint")}</p>
      {job.error && <p className="error">{job.error}</p>}
      {books && books.length === 0 && <div className="empty">{t("reader.empty")}</div>}
      <ul className="list">
        {books?.map((b) => (
          <li key={b.id}>
            <button className="list-item" onClick={() => setOpen(b)}>
              <LangChip code={b.lang} />
              <span className="grow">
                <strong>{b.title}</strong>
                {b.author && <span className="muted"> · {b.author}</span>}
              </span>
              <span className="muted small">
                {b.page + 1} / {pageCount(b)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {importing && <ImportBook draft={importing} onDone={(b) => (setImporting(null), b && setOpen(b))} />}
      {pasting && (
        <PasteBook
          onDone={(d) => {
            setPasting(false);
            if (d) setImporting(d);
          }}
        />
      )}
    </section>
  );
}

function PasteBook({ onDone }: { onDone(d: { title: string; paragraphs: string[] } | null): void }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return (
    <Modal title={t("reader.paste")} onClose={() => onDone(null)} wide>
      <div className="stack">
        <input className="input" placeholder={t("reader.bookTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("reader.pastePlaceholder")} />
        <div className="row end">
          <button className="btn primary" disabled={!text.trim()} onClick={() => onDone({ title: title.trim() || text.trim().slice(0, 40), paragraphs: parsePlain(text) })}>
            {t("common.next")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImportBook({ draft, onDone }: { draft: { title: string; author?: string; paragraphs: string[] }; onDone(b: Book | null): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const langs = [...new Set([app.target, ...app.profile.learning.map((l) => l.code), ...app.profile.known.map((k) => k.code)])];
  const [bookLang, setBookLang] = useState(app.target);
  const [title, setTitle] = useState(draft.title);
  return (
    <Modal title={t("reader.import")} onClose={() => onDone(null)}>
      <div className="stack">
        <label className="field">
          <span>{t("reader.bookTitle")}</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("reader.bookLang")}</span>
          <select className="input" value={bookLang} onChange={(e) => setBookLang(e.target.value)}>
            {langs.map((l) => (
              <option key={l} value={l}>
                {langName(l, lang)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{t("reader.paragraphs", { n: draft.paragraphs.length })}</p>
        <p className="muted small">{t("reader.copyright")}</p>
        <div className="row end">
          <button
            className="btn primary"
            disabled={!draft.paragraphs.length}
            onClick={async () => {
              const b: Book = { id: app.newId(title || "book"), title: title || "Book", author: draft.author, lang: bookLang, paragraphs: draft.paragraphs, page: 0, created: today() };
              await app.repo.saveBook(b);
              onDone(b);
            }}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const WORD = /(\p{L}[\p{L}\p{M}'’-]*)/u;

function BookReader({ book: initial, onClose }: { book: Book; onClose(): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const [book, setBook] = useState(initial);
  const nativeLang = app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.uiLang;
  const trLang = book.lang === nativeLang ? app.profile.uiLang : nativeLang;
  const bookIsKnown = app.profile.known.some((k) => k.code === book.lang) && book.lang !== app.target;
  const [mode, setMode] = useState<Mode>(bookIsKnown ? "toucan" : "parallel");
  const [tr, setTr] = useState<Translation>({});
  const [auto, setAuto] = useState(() => localStorage.getItem("polygraph.autoTranslate") === "1");
  const [density, setDensity] = useState(1);
  const [popup, setPopup] = useState<{ word: string; concept?: Concept; original?: string } | null>(null);
  const job = useAsync();

  const pages = pageCount(book);
  const [from, to] = pageRange(book, book.page);
  const paras = book.paragraphs.slice(from, to);

  useEffect(() => {
    app.repo.loadTranslation(book.id, trLang).then(setTr);
  }, [app.repo, book.id, trLang]);

  const missing = useMemo(() => paras.map((_, i) => from + i).filter((i) => !tr[i]), [paras, from, tr]);

  const translatePage = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      if (!missing.length) return;
      const out = await translateParagraphs(app.ai, app.profile, book.lang, trLang, missing.map((i) => book.paragraphs[i]));
      const next = { ...tr };
      missing.forEach((idx, k) => out[k] && (next[idx] = out[k]));
      setTr(next);
      await app.repo.saveTranslation(book, trLang, next);
    });

  useEffect(() => {
    if (auto && mode === "parallel" && missing.length && !job.busy) translatePage();
    // Автоперевод срабатывает только при смене страницы, режима или флажка.
  }, [book.page, mode, auto]);

  const goPage = async (p: number) => {
    const nb = { ...book, page: Math.max(0, Math.min(pages - 1, p)) };
    setBook(nb);
    await app.repo.saveBook(nb);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  const dictFor = (word: string) => {
    const w = word.toLowerCase();
    return app.concepts.find((c) => c.terms[book.lang]?.text.toLowerCase() === w);
  };

  const words = (text: string) =>
    text.split(WORD).map((part, i) =>
      WORD.test(part) ? (
        <span key={i} className="w" onClick={() => setPopup({ word: part, concept: dictFor(part) })}>
          {part}
        </span>
      ) : (
        part
      ),
    );

  const toucanPara = (text: string) =>
    toucanize(text, app.concepts, book.lang, app.target, density).map((s, i) =>
      s.swap ? (
        <span key={i} className="w swap" lang={app.target} onClick={() => setPopup({ word: s.text, concept: s.swap!.concept, original: s.swap!.original })}>
          {s.text}
        </span>
      ) : (
        <span key={i}>{s.text}</span>
      ),
    );

  const dir = isRtl(book.lang) ? "rtl" : "ltr";

  return (
    <section className="view reader">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
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
        {mode === "parallel" && (
          <>
            <button className="btn" onClick={translatePage} disabled={job.busy || !missing.length}>
              {job.busy ? t("common.loading") : `✦ ${t("reader.translatePage")}`}
            </button>
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
            <span className="muted small">
              {langName(book.lang, lang)} → {langName(trLang, lang)}
            </span>
          </>
        )}
        {mode === "toucan" && (
          <label className="row gap small">
            {t("reader.density")}
            <input type="range" min={0.1} max={1} step={0.1} value={density} onChange={(e) => setDensity(Number(e.target.value))} />
            {Math.round(density * 100)}%
          </label>
        )}
        <span className="muted small">{t("reader.tapHint")}</span>
      </div>
      {job.error && <p className="error">{job.error}</p>}

      <div className={`pages ${mode === "parallel" ? "parallel" : ""}`}>
        {paras.map((p, i) => (
          <div key={from + i} className="para-row">
            <p dir={dir} lang={book.lang}>
              {mode === "toucan" ? toucanPara(p) : words(p)}
            </p>
            {mode === "parallel" && (
              <p className="para-tr" lang={trLang} dir={isRtl(trLang) ? "rtl" : "ltr"}>
                {tr[from + i] ?? <span className="muted">…</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="row gap between pager">
        <button className="btn" disabled={book.page === 0} onClick={() => goPage(book.page - 1)}>
          ←
        </button>
        <span className="muted">
          {book.page + 1} / {pages}
        </span>
        <button className="btn" disabled={book.page >= pages - 1} onClick={() => goPage(book.page + 1)}>
          →
        </button>
      </div>

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
            ) : (
              <p className="muted">{t("reader.notInDict")}</p>
            )}
            <div className="row gap end">
              <button
                className="btn primary"
                onClick={() => {
                  app.setInbox([...app.inbox, `${popup.original ?? popup.word} #${book.lang}`]);
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
