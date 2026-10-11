import { useEffect, useState } from "react";
import { today } from "../../core/dates";
import { langName } from "../../core/languages";
import { pageCount, parseBookFile, parsePlain, type Book } from "../../core/reader";
import { useT } from "../../i18n";
import { pdfParagraphs, webArticle } from "../../storage/documents";
import { LangChip, LangFilter, Modal, pickBinaryFile, pickImage, useAsync } from "../common";
import { OcrDialog } from "../OcrDialog";
import { useApp } from "../state";
import { BookReader } from "./BookReader";

interface Draft {
  title: string;
  author?: string;
  paragraphs: string[];
}

export function ReaderView() {
  const { t } = useT();
  const app = useApp();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [open, setOpen] = useState<Book | null>(null);
  const [importing, setImporting] = useState<Draft | null>(null);
  const [pasting, setPasting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [allLangs, setAllLangs] = useState(false);
  const job = useAsync();

  const load = () => app.repo.loadBooks().then(setBooks);
  useEffect(() => {
    load();
  }, [app.repo]);

  if (open)
    return (
      <BookReader
        book={open}
        onClose={() => {
          setOpen(null);
          load();
        }}
      />
    );

  const importFile = () =>
    job.run(async () => {
      const f = await pickBinaryFile(".txt,.md,.fb2,.zip,.epub,.pdf,.srt,.vtt");
      if (!f) return;
      if (f.name.toLowerCase().endsWith(".pdf")) {
        const r = await pdfParagraphs(f.bytes);
        if (!r.paragraphs.length) throw new Error(t("reader.pdfEmpty"));
        setImporting({ title: r.title ?? f.name.replace(/\.pdf$/i, ""), paragraphs: r.paragraphs });
      } else setImporting(parseBookFile(f.name, f.bytes));
    });

  return (
    <section className="view narrow">
      <header className="view-head">
        <h1>{t("reader.title")}</h1>
        <div className="row gap wrap">
          <button className="btn" onClick={() => setPasting(true)}>
            {t("reader.paste")}
          </button>
          <button className="btn" onClick={() => setLinking(true)}>
            🔗 {t("reader.link")}
          </button>
          <button
            className="btn"
            onClick={async () => {
              const f = await pickImage();
              if (f) setPhoto(f);
            }}
          >
            📷 {t("reader.photo")}
          </button>
          <button className="btn primary" onClick={importFile} disabled={job.busy}>
            + {t("reader.import")}
          </button>
        </div>
      </header>
      <p className="muted">{t("reader.hint")}</p>
      {job.busy && <p className="muted small">{t("common.loading")}</p>}
      {job.error && <p className="error">{job.error}</p>}
      <LangFilter all={allLangs} onChange={setAllLangs} lang={app.target} />
      {books && books.length === 0 && <div className="empty">{t("reader.empty")}</div>}
      <ul className="list">
        {books
          // Книги на изучаемом языке и на знакомых (для режима тукана); остальное — по переключателю.
          ?.filter((b) => allLangs || b.lang === app.target || app.profile.known.some((k) => k.code === b.lang))
          .map((b) => (
          <li key={b.id} className="row gap">
            <button className="list-item" onClick={() => setOpen(b)}>
              <LangChip code={b.lang} />
              <span className="grow">
                <strong>{b.title}</strong>
                {b.author && <span className="muted"> · {b.author}</span>}
              </span>
              <span className="book-progress" title={`${b.page + 1} / ${pageCount(b)}`}>
                <span style={{ width: `${((b.page + 1) / pageCount(b)) * 100}%` }} />
              </span>
            </button>
            <button
              className="icon-btn"
              aria-label={t("common.delete")}
              onClick={async () => {
                if (!confirm(t("common.confirmDelete", { name: b.title }))) return;
                await app.repo.deleteBook(b.id, [...app.profile.known.map((k) => k.code), app.profile.uiLang]);
                load();
              }}
            >
              ✕
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
      {linking && (
        <LinkBook
          onDone={(d) => {
            setLinking(false);
            if (d) setImporting(d);
          }}
        />
      )}
      {photo && (
        <OcrDialog
          image={photo}
          onClose={() => setPhoto(null)}
          onUseText={(text) => {
            setPhoto(null);
            setImporting({ title: text.split(/\s+/).slice(0, 5).join(" "), paragraphs: parsePlain(text) });
          }}
        />
      )}
    </section>
  );
}

function PasteBook({ onDone }: { onDone(d: Draft | null): void }) {
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

function LinkBook({ onDone }: { onDone(d: Draft | null): void }) {
  const { t } = useT();
  const [url, setUrl] = useState("");
  const job = useAsync();
  return (
    <Modal title={t("reader.link")} onClose={() => onDone(null)}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          job.run(async () => {
            const r = await webArticle(url.trim());
            onDone(r);
          });
        }}
      >
        <p className="muted small">{t("reader.linkHint")}</p>
        <input className="input" type="url" autoFocus required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        {job.error && <p className="error">{job.error}</p>}
        <div className="row end">
          <button className="btn primary" disabled={job.busy || !url.trim()}>
            {job.busy ? t("common.loading") : t("common.next")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportBook({ draft, onDone }: { draft: Draft; onDone(b: Book | null): void }) {
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
