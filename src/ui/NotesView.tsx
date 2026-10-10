import { useEffect, useMemo, useState } from "react";
import { aiReady } from "../ai/config";
import { askWithNotes, makeNotes } from "../ai/tasks";
import { today } from "../core/dates";
import { slugify } from "../core/markdown";
import { backlinks, resolveLink, searchNotes, type Note } from "../core/notes";
import { useT } from "../i18n";
import { useAsync } from "./common";
import { Markdown } from "./Markdown";
import { useApp } from "./state";
import { WordDetail } from "./WordDetail";

export function NotesView() {
  const { t } = useT();
  const app = useApp();
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [wordId, setWordId] = useState<string | null>(null);
  const job = useAsync();

  const load = async () => {
    const list = await app.repo.loadNotes();
    list.sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
    setNotes(list);
    return list;
  };
  useEffect(() => {
    load();
  }, [app.repo]);

  const filtered = useMemo(() => {
    // Каждое слово запроса должно встретиться в названии или тексте — порядок не важен.
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return notes;
    return notes.filter((n) => {
      const hay = `${n.title}\n${n.body}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [notes, query]);

  const newId = (title: string) => {
    const base = slugify(title);
    let id = base;
    for (let i = 2; notes.some((n) => n.id === id); i++) id = `${base}-${i}`;
    return id;
  };

  const startNew = (title = "") => {
    setCurrent(null);
    setDraft({ title, body: "" });
    setEditing(true);
  };

  const save = async () => {
    const title = draft.title.trim() || t("notes.untitled");
    const note: Note = current
      ? { ...current, title, body: draft.body, updated: today() }
      : { id: newId(title), title, body: draft.body, tags: [], created: today(), updated: today() };
    await app.repo.saveNote(note);
    await load();
    setCurrent(note);
    setEditing(false);
  };

  // [[ссылка]] ведёт в заметку, в слово словаря или создаёт новую заметку.
  const follow = (target: string) => {
    const n = resolveLink(notes, target);
    if (n) {
      setCurrent(n);
      setEditing(false);
      return;
    }
    const w = target.toLowerCase();
    const c = app.concepts.find((x) => x.id === w || Object.values(x.terms).some((term) => term.text.toLowerCase() === w));
    if (c) setWordId(c.id);
    else startNew(target);
  };

  const ask = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      const ctx = searchNotes(notes, query, 6);
      setAnswer(await askWithNotes(app.ai, app.profile, app.target, query, ctx));
    });

  const multi = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      const made = await makeNotes(app.ai, app.profile, app.target, query, notes.map((n) => n.title));
      const taken = new Set(notes.map((n) => n.id));
      let first: Note | null = null;
      for (const m of made) {
        let id = slugify(m.title);
        for (let i = 2; taken.has(id); i++) id = `${slugify(m.title)}-${i}`;
        taken.add(id);
        const n: Note = { id, title: m.title, body: m.body, tags: ["ai"], created: today(), updated: today(), source: "ai" };
        await app.repo.saveNote(n);
        first ??= n;
      }
      await load();
      setCurrent(first);
      setEditing(false);
      setQuery("");
      app.toast(t("notes.made", { n: made.length }));
    });

  const back = current ? backlinks(notes, current) : [];
  const word = wordId ? app.concepts.find((c) => c.id === wordId) : undefined;

  return (
    <section className="view notes-layout">
      <aside className="notes-side">
        <div className="row gap">
          <h1 className="grow">{t("nav.notes")}</h1>
          <button className="btn primary" onClick={() => startNew()}>
            +
          </button>
        </div>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("notes.search")} />
        {query.trim() && (
          <div className="row gap wrap">
            <button className="btn small" onClick={ask} disabled={job.busy}>
              ✦ {t("notes.ask")}
            </button>
            <button className="btn small" onClick={multi} disabled={job.busy}>
              ✦ {t("notes.multi")}
            </button>
          </div>
        )}
        {job.busy && <p className="muted small">{t("common.loading")}</p>}
        {job.error && <p className="error small">{job.error}</p>}
        <ul className="note-list">
          {filtered.map((n) => (
            <li key={n.id}>
              <button
                className={current?.id === n.id ? "on" : ""}
                onClick={() => {
                  setCurrent(n);
                  setEditing(false);
                  setAnswer("");
                }}
              >
                {n.title}
                {n.source === "ai" && <span className="badge warn">AI</span>}
              </button>
            </li>
          ))}
          {!filtered.length && <li className="muted small">{t("notes.empty")}</li>}
        </ul>
      </aside>

      <div className="notes-main">
        {answer && (
          <div className="ai-answer">
            <Markdown text={answer} onLink={follow} />
            <div className="row gap end">
              <button
                className="btn"
                onClick={() => {
                  setCurrent(null);
                  setDraft({ title: query.trim(), body: answer });
                  setEditing(true);
                  setAnswer("");
                }}
              >
                {t("notes.saveAsNote")}
              </button>
            </div>
          </div>
        )}

        {editing ? (
          <div className="stack">
            <input className="input note-title-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("notes.titlePh")} />
            <textarea className="input mono note-editor" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder={t("notes.bodyPh")} />
            <div className="row gap end">
              <button className="btn" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" onClick={save}>
                {t("common.save")}
              </button>
            </div>
          </div>
        ) : current ? (
          <article>
            <div className="row gap between">
              <h2>{current.title}</h2>
              <div className="row gap">
                <button className="btn" onClick={() => (setDraft({ title: current.title, body: current.body }), setEditing(true))}>
                  {t("common.edit")}
                </button>
                <button
                  className="btn danger"
                  onClick={async () => {
                    if (!confirm(t("common.confirmDelete", { name: current.title }))) return;
                    await app.repo.deleteNote(current.id);
                    setCurrent(null);
                    load();
                  }}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
            <Markdown text={current.body} onLink={follow} />
            {back.length > 0 && (
              <>
                <h3>{t("notes.backlinks")}</h3>
                <div className="row gap wrap">
                  {back.map((b) => (
                    <button key={b.id} className="route-chip as-btn" onClick={() => setCurrent(b)}>
                      ← {b.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </article>
        ) : (
          !answer && <div className="empty">{t("notes.hint")}</div>
        )}
      </div>
      {word && <WordDetail concept={word} onClose={() => setWordId(null)} />}
    </section>
  );
}
