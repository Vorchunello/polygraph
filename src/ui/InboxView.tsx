import { useState } from "react";
import { aiReady } from "../ai/config";
import { draftConcept } from "../ai/tasks";
import { useT } from "../i18n";
import { useAsync } from "./common";
import { useApp } from "./state";
import { AddWord, conceptFromDraft } from "./WordDetail";

export function InboxView() {
  const { t } = useT();
  const app = useApp();
  const [text, setText] = useState("");
  const [making, setMaking] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const job = useAsync();

  const add = () => {
    const v = text.trim();
    if (!v) return;
    app.setInbox([...app.inbox, v]);
    setText("");
  };

  const remove = (item: string) => app.setInbox(app.inbox.filter((x) => x !== item));

  // Пометка «#tag слово» из Кузницы: тег уходит в теги понятия.
  const splitTags = (item: string) => {
    const tags = [...item.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]);
    return { word: item.replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/^[!?]\s*/, "").trim(), tags };
  };

  const processAll = () =>
    job.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      const items = [...app.inbox];
      const failed: string[] = [];
      let left = items;
      const known = new Map(app.concepts.map((c) => [c.terms[app.target]?.text.toLowerCase(), c]));
      for (let i = 0; i < items.length; i++) {
        setProgress(t("inbox.progress", { i: i + 1, n: items.length }));
        const { word, tags } = splitTags(items[i]);
        try {
          const d = await draftConcept(app.ai, app.profile, app.target, word);
          const text = d.terms[app.target].text.toLowerCase();
          const existing = known.get(text);
          if (existing) {
            // Слово уже в словаре — не плодим дубль, только добавляем теги.
            const merged = { ...existing, tags: [...new Set([...existing.tags, ...tags])] };
            known.set(text, merged);
            await app.saveConcept(merged);
          } else {
            const c = conceptFromDraft(d, app.newId(d.terms[app.target].text));
            c.tags = [...new Set([...c.tags, ...tags, "inbox"])];
            known.set(text, c);
            await app.saveConcept(c);
          }
          left = left.filter((x) => x !== items[i]);
          await app.setInbox(left);
        } catch {
          failed.push(items[i]);
        }
      }
      setProgress("");
      if (failed.length) throw new Error(t("inbox.failed", { items: failed.join(", ") }));
    });

  return (
    <section className="view narrow">
      <h1>{t("inbox.title")}</h1>
      <p className="muted">{t("inbox.hint")}</p>
      <form
        className="row gap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input grow" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("inbox.placeholder")} />
        <button className="btn primary">{t("common.add")}</button>
      </form>

      {app.inbox.length === 0 ? (
        <div className="empty">{t("inbox.empty")}</div>
      ) : (
        <>
          <ul className="inbox-list">
            {app.inbox.map((item) => (
              <li key={item}>
                <span className="grow">{item}</span>
                <button className="btn small" onClick={() => setMaking(item)}>
                  {t("inbox.toWord")}
                </button>
                <button className="icon-btn" onClick={() => remove(item)} aria-label={t("common.delete")}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="row gap end">
            {progress && <span className="muted small">{progress}</span>}
            <button className="btn primary" onClick={processAll} disabled={job.busy}>
              {job.busy ? t("common.loading") : `✦ ${t("inbox.processAll")}`}
            </button>
          </div>
        </>
      )}
      {job.error && <p className="error">{job.error}</p>}

      {making && <AddWord initialText={splitTags(making).word} onClose={() => setMaking(null)} onSaved={() => remove(making)} />}
    </section>
  );
}
