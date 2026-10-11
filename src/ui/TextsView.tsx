import { useMemo, useState } from "react";
import { aiReady } from "../ai/config";
import { story, STORY_STYLES, type StoryStyle } from "../ai/tasks";
import { today } from "../core/dates";
import { isDue } from "../core/srs";
import { useT } from "../i18n";
import { TermText, useAsync } from "./common";
import { Markdown } from "./Markdown";
import { ReportAi } from "./ReportAi";
import { useApp } from "./state";

export function TextsView() {
  const { t } = useT();
  const app = useApp();
  const { target } = app;
  const words = useMemo(() => app.concepts.filter((c) => c.terms[target]), [app.concepts, target]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(words.slice(0, 8).map((c) => c.id)));
  const [style, setStyle] = useState<StoryStyle>("ielts");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const job = useAsync();

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const generate = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      const chosen = words.filter((c) => selected.has(c.id));
      setText(await story(app.ai, app.profile, target, chosen, style, topic.trim()));
    });

  return (
    <section className="view">
      <h1>{t("texts.title")}</h1>
      <p className="muted">{t("texts.hint")}</p>
      <div className="texts-layout">
        <div className="stack">
          <label className="field">
            <span>{t("texts.style")}</span>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value as StoryStyle)}>
              {STORY_STYLES.map((s) => (
                <option key={s} value={s}>
                  {t(`style.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("texts.topic")}</span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <div className="field">
            <span>{t("texts.words", { n: selected.size })}</span>
            <div className="row gap wrap small">
              <button className="btn-link" onClick={() => setSelected(new Set(words.slice(0, 10).map((c) => c.id)))}>
                {t("texts.pickRecent")}
              </button>
              <button className="btn-link" onClick={() => setSelected(new Set(words.filter((c) => isDue(c, target, today())).map((c) => c.id)))}>
                {t("texts.pickDue")}
              </button>
              <button className="btn-link" onClick={() => setSelected(new Set())}>
                {t("texts.pickNone")}
              </button>
            </div>
            <div className="word-checks">
              {words.map((c) => (
                <label key={c.id} className={`word-check ${selected.has(c.id) ? "on" : ""}`}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <TermText term={c.terms[target]} lang={target} />
                </label>
              ))}
            </div>
          </div>
          {selected.size < 3 && <p className="muted small">{t("texts.needWords")}</p>}
          <button className="btn primary" onClick={generate} disabled={selected.size < 3 || job.busy}>
            {job.busy ? t("common.loading") : `✦ ${t("texts.generate")}`}
          </button>
          {job.error && <p className="error">{job.error}</p>}
        </div>
        <div>
          {text && (
            <div className="ai-answer story">
              <Markdown text={text} />
              <div className="row gap end">
                <ReportAi kind="story" content={text} onReported={() => setText("")} />
                <button
                  className="btn"
                  onClick={async () => {
                    const path = await app.repo.saveText(`${style} ${topic || target}`, text, { kind: "story", style, lang: target });
                    app.toast(t("set.exported", { path }));
                  }}
                >
                  {t("ask.saveText")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
