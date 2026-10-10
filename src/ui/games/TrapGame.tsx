import { useState } from "react";
import { aiReady } from "../../ai/config";
import { makeTrapPairs } from "../../ai/tasks";
import { trapPairsFromDictionary, type TrapPair } from "../../core/games";
import { useT } from "../../i18n";
import { LangChip, useAsync } from "../common";
import { markUnknown, useApp } from "../state";

/** «Мост или ловушка?»: похожие слова двух языков — значит ли это одно и то же? */
export function TrapGame({ onClose }: { onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const [pairs, setPairs] = useState<TrapPair[] | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const job = useAsync();

  const fromDict = () => {
    const p = trapPairsFromDictionary(app.concepts, app.target).sort(() => Math.random() - 0.5);
    if (!p.length) return job.setError(t("traps.dictEmpty"));
    begin(p);
  };

  const fromAi = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      begin(await makeTrapPairs(app.ai, app.profile, app.target));
    });

  const begin = (p: TrapPair[]) => {
    setPairs(p);
    setI(0);
    setScore(0);
    setAnswer(null);
  };

  const pair = pairs?.[i];
  const choose = async (trap: boolean) => {
    if (!pair || answer !== null) return;
    setAnswer(trap);
    if (trap === pair.trap) setScore((s) => s + 1);
    else if (pair.conceptId) {
      const c = app.concepts.find((x) => x.id === pair.conceptId);
      if (c) await app.saveConcept(markUnknown(c, app.target));
    }
  };

  return (
    <section className="view narrow">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{t("games.traps")}</h1>
        </div>
        {pairs && <span className="badge ok">{t("traps.score", { n: score, of: pairs.length })}</span>}
      </header>

      {!pairs ? (
        <div className="stack">
          <p className="muted">{t("traps.intro")}</p>
          <div className="row gap wrap">
            <button className="btn" onClick={fromDict}>
              {t("traps.fromDict")}
            </button>
            <button className="btn primary" onClick={fromAi} disabled={job.busy}>
              {job.busy ? t("common.loading") : `✦ ${t("traps.fromAi")}`}
            </button>
          </div>
          {job.error && <p className="error">{job.error}</p>}
        </div>
      ) : !pair ? (
        <div className="stack center">
          <h2>{t("traps.done", { n: score, of: pairs.length })}</h2>
          <button className="btn primary" onClick={() => setPairs(null)}>
            {t("common.back")}
          </button>
        </div>
      ) : (
        <>
          <div className="trap-card">
            <div className="trap-word">
              <LangChip code={pair.a.lang} /> <span lang={pair.a.lang}>{pair.a.text}</span>
            </div>
            <div className="trap-vs">≟</div>
            <div className="trap-word">
              <LangChip code={pair.b.lang} /> <span lang={pair.b.lang}>{pair.b.text}</span>
            </div>
          </div>
          {answer === null ? (
            <div className="grades two">
              <button className="btn grade-good" onClick={() => choose(false)}>
                ↔ {t("traps.bridge")}
              </button>
              <button className="btn grade-again" onClick={() => choose(true)}>
                ⚠ {t("traps.trap")}
              </button>
            </div>
          ) : (
            <div className="stack">
              <p className={answer === pair.trap ? "ok-text" : "error"}>
                {answer === pair.trap ? t("study.correct") : pair.trap ? t("traps.wasTrap") : t("traps.wasBridge")}
              </p>
              {pair.explain && <p>{pair.explain}</p>}
              <button className="btn primary" onClick={() => (setI(i + 1), setAnswer(null))}>
                {t("common.next")} →
              </button>
            </div>
          )}
          <p className="muted small">
            {i + 1} / {pairs.length}
          </p>
        </>
      )}
    </section>
  );
}
