import { useMemo, useState } from "react";
import { aiReady } from "../../ai/config";
import { makeSennaar, type SennaarSet } from "../../ai/tasks";
import { today } from "../../core/dates";
import { guessMatches } from "../../core/games";
import { useT } from "../../i18n";
import { useAsync } from "../common";
import { useApp } from "../state";

interface Entry {
  guesses: string[];
  solved: boolean;
  revealed: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}'’-]/gu, "");

/**
 * Дешифровка в духе Chants of Sennaar: сцены на изучаемом языке без перевода,
 * эмодзи вместо картинок. Значение слова выводишь из контекста и записываешь
 * в журнал; верная догадка подтверждает слово.
 */
export function SennaarGame({ onClose }: { onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const [set, setSet] = useState<SennaarSet | null>(null);
  const [journal, setJournal] = useState<Record<string, Entry>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<"ok" | "no" | null>(null);
  const job = useAsync();

  const start = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      const known = app.concepts.map((c) => c.terms[app.target]?.text).filter(Boolean);
      const s = await makeSennaar(app.ai, app.profile, app.target, known);
      setSet(s);
      setJournal(Object.fromEntries(s.words.map((w) => [norm(w.word), { guesses: [], solved: false, revealed: false }])));
    });

  const byNorm = useMemo(() => new Map(set?.words.map((w) => [norm(w.word), w]) ?? []), [set]);
  const solved = Object.values(journal).filter((e) => e.solved).length;

  const submit = () => {
    if (!current || !guess.trim()) return;
    const w = byNorm.get(current)!;
    const ok = guessMatches(guess, w.meaning, w.accept);
    setJournal((j) => ({ ...j, [current]: { ...j[current], guesses: [...j[current].guesses, guess.trim()], solved: j[current].solved || ok } }));
    setFeedback(ok ? "ok" : "no");
    setGuess("");
  };

  const addSolved = async () => {
    const ui = app.profile.uiLang;
    const now = today();
    const fresh = set!.words
      .filter((w) => journal[norm(w.word)]?.solved || journal[norm(w.word)]?.revealed)
      .filter((w) => !app.concepts.some((c) => c.terms[app.target]?.text.toLowerCase() === w.word.toLowerCase()))
      .map((w) => ({
        id: app.newId(w.word),
        terms: { [app.target]: { text: w.word }, [ui]: { text: w.meaning } },
        bridges: [],
        examples: set!.scenes.filter((s) => norm(s.text).includes(norm(w.word))).slice(0, 2).map((s) => ({ lang: app.target, text: s.text })),
        tags: ["sennaar"],
        srs: {},
        created: now,
        updated: now,
        notes: "",
      }));
    await app.addConcepts(fresh);
    app.toast(t("set.imported", { n: fresh.length }));
  };

  const renderScene = (text: string) =>
    text.split(/(\p{L}[\p{L}\p{M}'’-]*)/u).map((part, i) => {
      const key = norm(part);
      const entry = journal[key];
      if (!entry) return <span key={i}>{part}</span>;
      return (
        <button
          key={i}
          className={`glyph ${entry.solved ? "solved" : entry.revealed ? "revealed" : ""} ${current === key ? "current" : ""}`}
          onClick={() => {
            setCurrent(key);
            setFeedback(null);
          }}
        >
          {part}
        </button>
      );
    });

  const cur = current ? byNorm.get(current) : undefined;
  const curEntry = current ? journal[current] : undefined;

  return (
    <section className="view">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{set?.title ?? t("games.sennaar")}</h1>
        </div>
        {set && (
          <span className="badge ok">
            {t("sennaar.progress", { n: solved, of: set.words.length })}
          </span>
        )}
      </header>

      {!set ? (
        <div className="narrow-block stack">
          <p className="muted">{t("sennaar.intro")}</p>
          {job.error && <p className="error">{job.error}</p>}
          <button className="btn primary big" onClick={start} disabled={job.busy}>
            {job.busy ? t("common.loading") : `✦ ${t("sennaar.start")}`}
          </button>
        </div>
      ) : (
        <div className="sennaar-layout">
          <div className="scenes">
            {set.scenes.map((s, i) => (
              <div key={i} className="scene">
                <div className="scene-emoji" aria-hidden>
                  {s.emoji}
                </div>
                <p lang={app.target}>{renderScene(s.text)}</p>
              </div>
            ))}
          </div>
          <aside className="journal">
            <h3>{t("sennaar.journal")}</h3>
            {cur && curEntry ? (
              <div className="stack">
                <div className="journal-word">{cur.word}</div>
                {curEntry.solved || curEntry.revealed ? (
                  <p className={curEntry.solved ? "ok-text" : "muted"}>
                    {curEntry.solved ? "✓ " : ""}
                    {cur.meaning}
                  </p>
                ) : (
                  <form
                    className="row gap"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit();
                    }}
                  >
                    <input className="input grow" autoFocus value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={t("sennaar.guess")} />
                    <button className="btn primary">{t("study.check")}</button>
                  </form>
                )}
                {feedback === "no" && !curEntry.solved && <p className="error small">{t("sennaar.notYet")}</p>}
                {feedback === "ok" && <p className="ok-text small">{t("sennaar.yes")}</p>}
                {curEntry.guesses.length > 0 && <p className="muted small">{t("sennaar.tried", { list: curEntry.guesses.join(", ") })}</p>}
                {!curEntry.solved && !curEntry.revealed && curEntry.guesses.length >= 3 && (
                  <button className="btn-link" onClick={() => setJournal((j) => ({ ...j, [current!]: { ...j[current!], revealed: true } }))}>
                    {t("sennaar.reveal")}
                  </button>
                )}
              </div>
            ) : (
              <p className="muted small">{t("sennaar.pickWord")}</p>
            )}
            <ul className="journal-list">
              {set.words.map((w) => {
                const e = journal[norm(w.word)];
                return (
                  <li key={w.word}>
                    <button className={current === norm(w.word) ? "on" : ""} onClick={() => setCurrent(norm(w.word))}>
                      <span>{w.word}</span>
                      <span className={e?.solved ? "ok-text" : "muted"}>{e?.solved || e?.revealed ? w.meaning : "?"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="btn" onClick={addSolved} disabled={!Object.values(journal).some((e) => e.solved || e.revealed)}>
              + {t("sennaar.addWords")}
            </button>
            <button className="btn-link" onClick={start} disabled={job.busy}>
              ↻ {t("sennaar.another")}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
