import { useCallback, useEffect, useMemo, useState } from "react";
import { today } from "../core/dates";
import { langInfo, langName } from "../core/languages";
import { buildQueue, isDue, isNew, review, type Grade } from "../core/srs";
import type { Concept } from "../core/types";
import { useT } from "../i18n";
import { BridgeBadge, GenderBadge, LangChip, SpeakButton, TermText, speak } from "./common";
import { useApp } from "./state";

type Mode = "recognize" | "recall";

/** Сравнение ответа: без регистра, лишних пробелов, артикля и диакритики. */
export function sameAnswer(given: string, expected: string, article?: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const g = norm(given);
  const e = norm(expected);
  return g === e || (!!article && g === norm(`${article} ${expected}`));
}

export function StudyView() {
  const { t, lang } = useT();
  const app = useApp();
  const { target, concepts, profile } = app;
  const [mode, setMode] = useState<Mode>("recognize");
  const [queue, setQueue] = useState<Concept[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const [done, setDone] = useState(0);

  const now = today();
  const stats = useMemo(() => {
    const withTerm = concepts.filter((c) => c.terms[target]);
    return { due: withTerm.filter((c) => isDue(c, target, now)).length, fresh: withTerm.filter((c) => isNew(c, target)).length };
  }, [concepts, target, now]);

  const known = profile.known.map((k) => k.code).filter((c) => c !== target);
  const card = queue?.[0];

  const start = () => {
    setQueue(buildQueue(concepts, target));
    setDone(0);
    setRevealed(false);
  };

  const grade = useCallback(
    async (g: Grade) => {
      if (!card || !queue) return;
      const updated = { ...card, srs: { ...card.srs, [target]: review(card.srs[target], g) } };
      await app.saveConcept(updated);
      // «Снова» возвращает карточку в конец сегодняшней очереди.
      setQueue(g === "again" ? [...queue.slice(1), updated] : queue.slice(1));
      setDone((d) => d + 1);
      setRevealed(false);
      setTyped("");
      setChecked(null);
    },
    [card, queue, target, app],
  );

  const reveal = useCallback(() => {
    if (!card) return;
    setRevealed(true);
    const term = card.terms[target];
    if (typed.trim()) setChecked(sameAnswer(typed, term.text, term.article));
    if (mode === "recall") speak([term.article, term.text].filter(Boolean).join(" "), target);
  }, [card, target, typed, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        grade((["again", "hard", "good", "easy"] as Grade[])[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, reveal, grade]);

  const targetName = langName(target, lang);

  if (!queue)
    return (
      <section className="view narrow">
        <h1>{t("study.title", { lang: targetName })}</h1>
        <p className="row gap">
          <span className="badge">{t("study.due", { n: stats.due })}</span>
          <span className="badge">{t("study.new", { n: Math.min(stats.fresh, 10) })}</span>
        </p>
        <div className="mode-pick">
          {(["recognize", "recall"] as Mode[]).map((m) => (
            <button key={m} className={`mode-card ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
              <strong>{t(m === "recognize" ? "study.modeRecognize" : "study.modeRecall")}</strong>
              <span className="muted small">{t(m === "recognize" ? "study.modeRecognizeHint" : "study.modeRecallHint", { lang: targetName })}</span>
            </button>
          ))}
        </div>
        <button className="btn primary big" onClick={start} disabled={stats.due + stats.fresh === 0}>
          {t("study.start")}
        </button>
        {stats.due + stats.fresh === 0 && <p className="muted">{t("study.nothing")}</p>}
      </section>
    );

  if (!card)
    return (
      <section className="view narrow center">
        <h1>{t("study.done")}</h1>
        <p className="muted">{t("study.doneHint", { n: done })}</p>
        <button className="btn" onClick={() => setQueue(null)}>
          {t("common.back")}
        </button>
      </section>
    );

  const term = card.terms[target];
  const prompt =
    mode === "recognize" ? (
      <div className="flash-front">
        <TermText term={term} lang={target} big />
        <SpeakButton text={[term.article, term.text].filter(Boolean).join(" ")} lang={target} />
      </div>
    ) : (
      <div className="flash-front multi">
        {known.map((code) =>
          card.terms[code] ? (
            <div key={code} className="cue">
              <LangChip code={code} /> <TermText term={card.terms[code]} lang={code} />
            </div>
          ) : null,
        )}
        {term.gender && <GenderBadge gender={term.gender} />}
      </div>
    );

  return (
    <section className="view narrow">
      <div className="row between">
        <span className="muted small">{t("study.left", { n: queue.length })}</span>
        <span className="muted small hide-sm">{t("study.keys")}</span>
      </div>
      <div className="flashcard">
        {prompt}
        {!revealed && mode === "recall" && (
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              reveal();
            }}
          >
            <input className="input grow" autoFocus dir={langInfo(target).rtl ? "rtl" : "ltr"} placeholder={t("study.typeAnswer")} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn">{t("study.check")}</button>
          </form>
        )}
        {revealed && (
          <div className="flash-back">
            {checked !== null && (
              <p className={checked ? "ok-text" : "error"}>{checked ? t("study.correct") : t("study.wrong", { answer: [term.article, term.text].filter(Boolean).join(" ") })}</p>
            )}
            {mode === "recall" ? (
              <div className="flash-answer">
                <TermText term={term} lang={target} big /> <GenderBadge gender={term.gender} />
              </div>
            ) : (
              known.map((code) =>
                card.terms[code] ? (
                  <div key={code} className="cue">
                    <LangChip code={code} /> <TermText term={card.terms[code]} lang={code} />
                  </div>
                ) : null,
              )
            )}
            {card.bridges.length > 0 && (
              <ul className="bridges compact">
                {card.bridges.map((b, i) => (
                  <li key={i}>
                    <LangChip code={b.from} /> <BridgeBadge bridge={b} /> <span>{b.note}</span>
                  </li>
                ))}
              </ul>
            )}
            {card.examples[0] && (
              <p className="example">
                <span lang={target}>{card.examples[0].text}</span>
                {card.examples[0].tr && <span className="muted"> — {card.examples[0].tr}</span>}
              </p>
            )}
          </div>
        )}
      </div>

      {!revealed ? (
        mode === "recognize" && (
          <button className="btn primary big" onClick={reveal}>
            {t("study.show")}
          </button>
        )
      ) : (
        <div className="grades">
          {(["again", "hard", "good", "easy"] as Grade[]).map((g, i) => (
            <button key={g} className={`btn grade-${g}`} onClick={() => grade(g)}>
              <span>{t(`study.${g}`)}</span>
              <span className="small muted">
                {i + 1} · {review(card.srs[target], g).interval}d
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
