import { useState } from "react";
import { aiReady } from "../ai/config";
import { explain } from "../ai/tasks";
import { langName } from "../core/languages";
import { useT } from "../i18n";
import { LangChip, useAsync } from "./common";
import { Markdown } from "./Markdown";
import { ReportAi } from "./ReportAi";
import { useApp } from "./state";

export function AskView() {
  const { t, lang } = useT();
  const app = useApp();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const job = useAsync();

  const ask = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      setAnswer(await explain(app.ai, app.profile, app.target, app.routes, q.trim()));
    });

  return (
    <section className="view narrow">
      <h1>{t("ask.title", { lang: langName(app.target, lang) })}</h1>
      <p className="muted">{t("ask.hint")}</p>
      {app.routes.length > 0 && (
        <div className="routes-chips">
          <span className="small muted">{t("ask.routes")}:</span>
          {app.routes
            .filter((r) => r.marker !== "-")
            .map((r) => (
              <span key={r.id} className="route-chip" title={r.topic}>
                {r.id} → <LangChip code={r.via} />
              </span>
            ))}
        </div>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask();
        }}
      >
        <textarea
          className="input"
          rows={3}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ask.placeholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && q.trim()) ask();
          }}
        />
        <div className="row end">
          <button className="btn primary" disabled={!q.trim() || job.busy}>
            {job.busy ? t("common.loading") : `✦ ${t("ask.send")}`}
          </button>
        </div>
      </form>
      {job.error && <p className="error">{job.error}</p>}
      {answer && (
        <div className="ai-answer">
          <Markdown text={answer} />
          <div className="row gap end">
            <ReportAi kind="ask" content={answer} onReported={() => setAnswer("")} />
            <button
              className="btn"
              onClick={async () => {
                const path = await app.repo.saveText(q.slice(0, 60), `> ${q}\n\n${answer}`, { kind: "answer", lang: app.target });
                app.toast(t("set.exported", { path }));
              }}
            >
              {t("ask.saveText")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
