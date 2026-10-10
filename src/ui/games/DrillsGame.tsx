import { useEffect, useMemo, useState } from "react";
import { buildDrill, DRILL_KINDS, type DrillKind, type DrillPreset, type DrillSource, type Exercise } from "../../core/games";
import { langInfo } from "../../core/languages";
import { useT } from "../../i18n";
import { canSpeak, speakAsync } from "../../storage/tts";
import { sameAnswer } from "../StudyView";
import { markUnknown, useApp } from "../state";

const DEFAULT_PRESETS: DrillPreset[] = [
  { id: "quick", name: "", kinds: ["choose", "reverse", "type"], count: 15, source: "all" },
  { id: "ear", name: "", kinds: ["listen", "match"], count: 12, source: "all" },
  { id: "traps", name: "", kinds: ["gender", "reverse", "type"], count: 10, source: "traps" },
];

function loadPresets(): DrillPreset[] {
  try {
    const saved = JSON.parse(localStorage.getItem("polygraph.drills") ?? "null");
    return Array.isArray(saved) ? saved : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

function savePresets(p: DrillPreset[]) {
  try {
    localStorage.setItem("polygraph.drills", JSON.stringify(p));
  } catch {
    /* без запоминания */
  }
}

export function DrillsGame({ onClose }: { onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const [presets, setPresets] = useState<DrillPreset[]>(loadPresets);
  const [draft, setDraft] = useState<DrillPreset>({ id: "", name: "", kinds: ["choose", "type"], count: 15, source: "all" });
  const [session, setSession] = useState<Exercise[] | null>(null);
  const known = app.profile.known.map((k) => k.code).filter((c) => c !== app.target);
  const speak = canSpeak();

  const run = (p: DrillPreset) => {
    const kinds = p.kinds.filter((k) => k !== "listen" || speak);
    setSession(buildDrill(app.concepts, app.target, known, { ...p, kinds }));
  };

  const presetName = (p: DrillPreset) => p.name || t(`drills.preset.${p.id as "quick"}`);

  if (session) return <DrillSession exercises={session} onClose={() => setSession(null)} />;

  const toggleKind = (k: DrillKind) =>
    setDraft({ ...draft, kinds: draft.kinds.includes(k) ? draft.kinds.filter((x) => x !== k) : [...draft.kinds, k] });

  return (
    <section className="view narrow">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{t("games.drills")}</h1>
        </div>
      </header>

      <h3>{t("drills.presets")}</h3>
      <div className="list">
        {presets.map((p) => (
          <div key={p.id} className="row gap">
            <button className="list-item" onClick={() => run(p)}>
              <span className="grow">
                <strong>{presetName(p)}</strong>
                <span className="muted small"> · {p.kinds.map((k) => t(`drills.k.${k}`)).join(", ")} · {p.count}</span>
              </span>
              ▶
            </button>
            <button
              className="icon-btn"
              aria-label={t("common.delete")}
              onClick={() => {
                const next = presets.filter((x) => x.id !== p.id);
                setPresets(next);
                savePresets(next);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <h3>{t("drills.build")}</h3>
      <div className="stack">
        <div className="row gap wrap">
          {DRILL_KINDS.map((k) => (
            <button
              key={k}
              className={`chip-btn ${draft.kinds.includes(k) ? "on" : ""}`}
              disabled={(k === "listen" && !speak) || (k === "gender" && langInfo(app.target).gender === "none")}
              onClick={() => toggleKind(k)}
              title={t(`drills.kh.${k}`)}
            >
              {t(`drills.k.${k}`)}
            </button>
          ))}
        </div>
        <div className="player-settings">
          <label className="field">
            <span>{t("drills.count", { n: draft.count })}</span>
            <input type="range" min={5} max={50} step={5} value={draft.count} onChange={(e) => setDraft({ ...draft, count: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>{t("bg.source")}</span>
            <select className="input" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as DrillSource })}>
              <option value="all">{t("bg.srcAll")}</option>
              <option value="due">{t("drills.srcDue")}</option>
              <option value="new">{t("bg.srcNew")}</option>
              <option value="traps">{t("drills.srcTraps")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("drills.name")}</span>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
        </div>
        <div className="row gap end">
          <button
            className="btn"
            disabled={!draft.kinds.length || !draft.name.trim()}
            onClick={() => {
              const next = [...presets, { ...draft, id: `d${Date.now()}`, name: draft.name.trim() }];
              setPresets(next);
              savePresets(next);
            }}
          >
            {t("drills.save")}
          </button>
          <button className="btn primary" disabled={!draft.kinds.length} onClick={() => run(draft)}>
            ▶ {t("study.start")}
          </button>
        </div>
      </div>
    </section>
  );
}

function DrillSession({ exercises, onClose }: { exercises: Exercise[]; onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const ex = exercises[i];

  const finish = async (ok: boolean) => {
    setResult(ok);
    if (ok) setScore((s) => s + 1);
    else if ("concept" in ex) await app.saveConcept(markUnknown(ex.concept, app.target));
  };
  const next = () => {
    setResult(null);
    setI(i + 1);
  };

  if (!exercises.length)
    return (
      <section className="view narrow center">
        <p className="muted">{t("drills.noWords")}</p>
        <button className="btn" onClick={onClose}>
          {t("common.back")}
        </button>
      </section>
    );

  if (!ex)
    return (
      <section className="view narrow center">
        <h1>{t("study.done")}</h1>
        <p className="muted">{t("traps.done", { n: score, of: exercises.length })}</p>
        <button className="btn primary" onClick={onClose}>
          {t("common.back")}
        </button>
      </section>
    );

  return (
    <section className="view narrow">
      <div className="row between">
        <button className="btn" onClick={onClose}>
          ✕
        </button>
        <span className="muted small">
          {i + 1} / {exercises.length} · ✓ {score}
        </span>
      </div>
      <progress className="drill-progress" value={i} max={exercises.length} />
      <div className="flashcard">
        <ExerciseView key={i} ex={ex} done={result !== null} onResult={finish} />
        {result !== null && (
          <div className="stack">
            <p className={result ? "ok-text" : "error"}>{result ? t("study.correct") : t("drills.wrong")}</p>
            <button className="btn primary" autoFocus onClick={next}>
              {t("common.next")} →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ExerciseView({ ex, done, onResult }: { ex: Exercise; done: boolean; onResult(ok: boolean): void }) {
  const { t } = useT();
  const app = useApp();
  const target = app.target;
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [matchSel, setMatchSel] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const rightNatives = useMemo(() => (ex.kind === "match" ? [...ex.pairs].sort(() => Math.random() - 0.5) : []), [ex]);

  useEffect(() => {
    if (ex.kind === "listen") speakAsync(ex.prompt, target);
  }, [ex, target]);

  const choose = (label: string, correct: boolean) => {
    if (done) return;
    setPicked(label);
    onResult(correct);
  };

  const optionButtons = (opts: { label: string; correct: boolean }[], lang?: string) => (
    <div className="options">
      {opts.map((o) => (
        <button
          key={o.label}
          lang={lang}
          className={`btn option ${done && o.correct ? "right" : ""} ${done && picked === o.label && !o.correct ? "wrong" : ""}`}
          onClick={() => choose(o.label, o.correct)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  switch (ex.kind) {
    case "choose":
      return (
        <>
          <div className="drill-prompt" lang={target}>
            {ex.prompt}
          </div>
          {optionButtons(ex.options)}
        </>
      );
    case "listen":
      return (
        <>
          <button className="btn big-round listen-btn" onClick={() => speakAsync(ex.prompt, target)}>
            🔊
          </button>
          {done && <div className="drill-prompt small-prompt">{ex.prompt}</div>}
          {optionButtons(ex.options)}
        </>
      );
    case "reverse":
      return (
        <>
          <div className="drill-prompt">{ex.prompt}</div>
          {optionButtons(ex.options, target)}
        </>
      );
    case "gender":
      return (
        <>
          <div className="drill-prompt" lang={target}>
            {ex.prompt}
          </div>
          <p className="muted small">{t("drills.k.gender")}</p>
          <div className="options">
            {ex.options.map((o) => (
              <button
                key={o.label}
                className={`btn option ${done && o.correct ? "right" : ""} ${done && picked === o.label && !o.correct ? "wrong" : ""}`}
                onClick={() => choose(o.label, o.correct)}
              >
                {t(`gender.${o.label as "m"}`)}
              </button>
            ))}
          </div>
        </>
      );
    case "type":
      return (
        <>
          <div className="drill-prompt">{ex.prompt}</div>
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              if (!done && typed.trim()) onResult(sameAnswer(typed, ex.answer, ex.article));
            }}
          >
            <input className="input grow" autoFocus dir={langInfo(target).rtl ? "rtl" : "ltr"} value={typed} disabled={done} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn" disabled={done}>
              {t("study.check")}
            </button>
          </form>
          {done && (
            <p lang={target}>
              {[ex.article, ex.answer].filter(Boolean).join(" ")}
            </p>
          )}
        </>
      );
    case "order": {
      const rest = [...ex.shuffled];
      for (const w of order) rest.splice(rest.indexOf(w), 1);
      return (
        <>
          {ex.translation && <div className="drill-prompt small-prompt">{ex.translation}</div>}
          <div className="order-line" lang={target}>
            {order.map((w, k) => (
              <button key={k} className="chip-btn on" disabled={done} onClick={() => setOrder(order.filter((_, j) => j !== k))}>
                {w}
              </button>
            ))}
            {!order.length && <span className="muted small">{t("drills.orderHint")}</span>}
          </div>
          <div className="row gap wrap" lang={target}>
            {rest.map((w, k) => (
              <button key={k} className="chip-btn" disabled={done} onClick={() => setOrder([...order, w])}>
                {w}
              </button>
            ))}
          </div>
          {!done && order.length === ex.answer.length && (
            <button className="btn primary" onClick={() => onResult(order.join(" ") === ex.answer.join(" "))}>
              {t("study.check")}
            </button>
          )}
          {done && <p lang={target}>{ex.answer.join(" ")}</p>}
        </>
      );
    }
    case "match":
      return (
        <>
          <p className="muted small">{t("drills.matchHint")}</p>
          <div className="match-grid">
            <div className="stack-tight">
              {ex.pairs.map((p) => (
                <button
                  key={p.id}
                  lang={target}
                  className={`btn option ${matched.has(p.id) ? "right" : ""} ${matchSel === p.id ? "selected" : ""}`}
                  disabled={matched.has(p.id) || done}
                  onClick={() => setMatchSel(p.id)}
                >
                  {p.tgt}
                </button>
              ))}
            </div>
            <div className="stack-tight">
              {rightNatives.map((p) => (
                <button
                  key={p.id}
                  className={`btn option ${matched.has(p.id) ? "right" : ""}`}
                  disabled={matched.has(p.id) || done}
                  onClick={() => {
                    if (!matchSel) return;
                    if (matchSel === p.id) {
                      const m = new Set(matched).add(p.id);
                      setMatched(m);
                      setMatchSel(null);
                      if (m.size === ex.pairs.length) onResult(mistakes === 0);
                    } else {
                      setMistakes((x) => x + 1);
                      setMatchSel(null);
                    }
                  }}
                >
                  {p.native}
                </button>
              ))}
            </div>
          </div>
        </>
      );
  }
}
