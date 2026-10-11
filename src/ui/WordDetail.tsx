import { useState } from "react";
import { aiReady } from "../ai/config";
import { draftConcept, explain, type ConceptDraft } from "../ai/tasks";
import { translateText } from "../ai/translate";
import { hasDict, lookupOffline } from "../storage/dictionary";
import { lookupDictionary, wiktionaryContext, type WiktionaryEntry } from "../storage/wiktionary";
import { learnCard } from "./saveWord";
import { today } from "../core/dates";
import { langInfo, langName } from "../core/languages";
import type { Bridge, BridgeKind, Concept, Example, Term } from "../core/types";
import { useT } from "../i18n";
import { BridgeBadge, GenderBadge, LangChip, Modal, SpeakButton, TermText, useAsync } from "./common";
import { Markdown } from "./Markdown";
import { PronounceButton } from "./PronounceButton";
import { findExamples } from "../core/vocab";
import { useApp } from "./state";

export function conceptFromDraft(d: ConceptDraft, id: string): Concept {
  const now = today();
  return { id, terms: d.terms, bridges: d.bridges, examples: d.examples, etymology: d.etymology, etymologyVerified: false, tags: d.tags, srs: {}, created: now, updated: now, notes: "" };
}

export function WordDetail({ concept, onClose }: { concept: Concept; onClose(): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const { target, profile } = app;
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [wiki, setWiki] = useState<WiktionaryEntry | "none" | null>(null);
  const wikiJob = useAsync();
  const lookWiki = () =>
    wikiJob.run(async () => {
      const term = concept.terms[app.target];
      setWiki(term ? (await lookupDictionary(term.text, app.target)) ?? "none" : "none");
    });
  const ai = useAsync();
  const langs = [target, ...profile.known.map((k) => k.code).filter((c) => c !== target)];
  const extra = Object.keys(concept.terms).filter((c) => !langs.includes(c));
  const main = concept.terms[target];
  const srs = concept.srs[target];

  if (editing)
    return (
      <Modal title={t("common.edit")} onClose={() => setEditing(false)} wide>
        <WordForm
          initial={concept}
          onCancel={() => setEditing(false)}
          onSave={async (c) => {
            await app.saveConcept(c);
            setEditing(false);
          }}
        />
      </Modal>
    );

  const runExplain = () =>
    ai.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      setAnswer(
        await explain(
          app.ai,
          profile,
          target,
          app.routes,
          `Explain the ${langName(target, "en")} word «${main?.text}»: meaning and nuances, typical collocations, how it connects to the languages I know, and the mistakes speakers of my languages usually make with it.`,
          concept,
        ),
      );
    });

  const verify = (i: number) => app.saveConcept({ ...concept, bridges: concept.bridges.map((b, j) => (j === i ? { ...b, verified: true } : b)) });

  return (
    <Modal title={main?.text ?? concept.id} onClose={onClose} wide>
      <div className="detail-hero">
        <TermText term={main} lang={target} big />
        <GenderBadge gender={main?.gender} />
        {main && <SpeakButton text={[main.article, main.text].filter(Boolean).join(" ")} lang={target} />}
        {main && <PronounceButton text={main.text} lang={target} />}
      </div>

      <h3>{t("word.terms")}</h3>
      <div className="terms-list">
        {[...langs.slice(1), ...extra].map((code) =>
          concept.terms[code] ? (
            <div key={code} className="term-row">
              <LangChip code={code} />
              <span className="muted small term-lang">{langName(code, lang)}</span>
              <TermText term={concept.terms[code]} lang={code} />
              <GenderBadge gender={concept.terms[code].gender} />
            </div>
          ) : null,
        )}
      </div>

      <h3>{t("word.bridges")}</h3>
      {concept.bridges.length === 0 && <p className="muted">{t("word.noBridges")}</p>}
      <ul className="bridges">
        {concept.bridges.map((b, i) => (
          <li key={i} className={`bridge strength-${b.strength}-border`}>
            <div className="row gap wrap">
              <LangChip code={b.from} />
              <BridgeBadge bridge={b} />
              {b.verified ? (
                <span className="badge ok">✓ {t("word.verified")}</span>
              ) : (
                <button className="badge warn as-btn" title={t("word.markVerified")} onClick={() => verify(i)}>
                  {t("word.unverified")}
                </button>
              )}
            </div>
            <p>{b.note}</p>
          </li>
        ))}
      </ul>

      <h3>
        {t("word.etymology")}{" "}
        {concept.etymologyVerified ? (
          <span className="badge ok">✓ {t("word.verified")}</span>
        ) : concept.etymologySource === "wiktionary" ? (
          <span className="badge ok">{t("wiki.based")}</span>
        ) : (
          concept.etymology && <span className="badge warn">{t("word.unverified")}</span>
        )}
      </h3>
      {concept.etymology && <p>{concept.etymology}</p>}
      {!wiki && (
        <button className="btn small" disabled={wikiJob.busy} onClick={lookWiki}>
          {wikiJob.busy ? t("common.loading") : `📖 ${t("wiki.check")}`}
        </button>
      )}
      {wikiJob.error && <p className="error small">{wikiJob.error}</p>}
      {wiki === "none" && <p className="muted small">{t("wiki.notFound")}</p>}
      {wiki && wiki !== "none" && (
        <div className="wiki-card">
          {wiki.etymology && (
            <p>
              <span className="muted small">{t("word.etymology")}: </span>
              {wiki.etymology}
            </p>
          )}
          {wiki.definitions.length > 0 && (
            <ol className="small">
              {wiki.definitions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ol>
          )}
          <div className="row gap wrap">
            <a href={wiki.url} target="_blank" rel="noreferrer" className="small">
              Wiktionary (CC BY-SA) ↗
            </a>
            {wiki.offline && <span className="badge">{t("wiki.offline")}</span>}
            <span className="grow" />
            {wiki.etymology && (
              <button
                className="btn small"
                onClick={() => app.saveConcept({ ...concept, etymology: wiki.etymology, etymologyVerified: true, etymologySource: "wiktionary" })}
              >
                {t("wiki.use")}
              </button>
            )}
            {concept.etymology && !concept.etymologyVerified && (
              <button className="btn small primary" onClick={() => app.saveConcept({ ...concept, etymologyVerified: true })}>
                ✓ {t("wiki.matches")}
              </button>
            )}
          </div>
        </div>
      )}

      {concept.examples.length > 0 && (
        <>
          <h3>{t("word.examples")}</h3>
          <ul className="examples">
            {concept.examples.map((e, i) => (
              <li key={i}>
                <span dir={langInfo(e.lang).rtl ? "rtl" : "ltr"} lang={e.lang}>
                  {e.text}
                </span>
                <SpeakButton text={e.text} lang={e.lang} />
                {e.tr && <div className="muted">{e.tr}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {main && <BookExamples concept={concept} />}

      {concept.notes && (
        <>
          <h3>{t("word.notes")}</h3>
          <Markdown text={concept.notes} />
        </>
      )}

      <p className="muted small">
        {srs ? t("word.review", { date: srs.due, n: srs.interval }) : t("word.notStudied")}
        {concept.tags.length > 0 && ` · #${concept.tags.join(" #")}`}
      </p>

      {answer && (
        <div className="ai-answer">
          <Markdown text={answer} />
          <button
            className="btn"
            onClick={async () => {
              await app.saveConcept({ ...concept, notes: [concept.notes, answer].filter(Boolean).join("\n\n---\n\n") });
              setAnswer("");
              app.toast(t("common.saved"));
            }}
          >
            {t("common.save")} → {t("word.notes")}
          </button>
        </div>
      )}
      {ai.error && <p className="error">{ai.error}</p>}

      <div className="row gap end modal-actions">
        <button
          className="btn danger"
          onClick={async () => {
            // Без подтверждения: ошибку исправляет «Отменить» в уведомлении.
            await app.deleteConcept(concept.id, t("common.undo"));
            onClose();
          }}
        >
          {t("common.delete")}
        </button>
        <button className="btn" onClick={runExplain} disabled={ai.busy}>
          {ai.busy ? t("common.loading") : `✦ ${t("word.explain")}`}
        </button>
        <button className="btn primary" onClick={() => setEditing(true)}>
          {t("common.edit")}
        </button>
      </div>
    </Modal>
  );
}

/** Примеры из своих книг: живые предложения со словом, одно нажатие — в карточку. */
function BookExamples({ concept }: { concept: Concept }) {
  const { t } = useT();
  const app = useApp();
  const [found, setFound] = useState<{ text: string; book: string }[] | null>(null);
  const job = useAsync();
  const term = concept.terms[app.target];
  const search = () =>
    job.run(async () => {
      const books = (await app.repo.loadBooks()).filter((b) => b.lang === app.target);
      const out: { text: string; book: string }[] = [];
      for (const b of books) {
        for (const s of findExamples(term.text, b.paragraphs, 6 - out.length)) {
          if (!concept.examples.some((e) => e.text === s)) out.push({ text: s, book: b.title });
        }
        if (out.length >= 6) break;
      }
      setFound(out);
    });
  if (!found)
    return (
      <button className="btn small" disabled={job.busy} onClick={search}>
        {job.busy ? t("common.loading") : `📚 ${t("word.bookExamples")}`}
      </button>
    );
  return (
    <>
      <h3>{t("word.bookExamples")}</h3>
      {found.length === 0 && <p className="muted small">{t("word.noBookExamples")}</p>}
      <ul className="examples">
        {found.map((f) => (
          <li key={f.text} className="row gap">
            <span className="grow" lang={app.target} dir={langInfo(app.target).rtl ? "rtl" : "ltr"}>
              {f.text} <span className="muted small">· {f.book}</span>
            </span>
            <button
              className="btn small"
              onClick={async () => {
                await app.saveConcept({ ...concept, examples: [...concept.examples, { lang: app.target, text: f.text }] });
                setFound(found.filter((x) => x !== f));
              }}
            >
              + {t("word.addExample")}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AddWord({ onClose, initialText = "", onSaved }: { onClose(): void; initialText?: string; onSaved?(): void }) {
  const { t } = useT();
  const app = useApp();
  const [text, setText] = useState(initialText);
  const [hint, setHint] = useState("");
  const [draft, setDraft] = useState<Concept | null>(null);
  const [fromAi, setFromAi] = useState(false);
  const ai = useAsync();

  const fill = () =>
    ai.run(async () => {
      if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
      // Сначала словарь: если слово есть в Викисловаре, ИИ пересказывает его, а не вспоминает.
      const dict = await Promise.race([
        lookupDictionary(text.trim(), app.target).catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
      const d = await draftConcept(app.ai, app.profile, app.target, text.trim(), hint.trim(), dict ? wiktionaryContext(dict) : "");
      const c = conceptFromDraft(d, app.newId(d.terms[app.target].text));
      if (dict?.etymology && c.etymology) c.etymologySource = "wiktionary";
      setDraft(c);
      setFromAi(true);
    });

  // Вручную: если есть офлайн-словарь — он сразу подставит начальную форму, род, значения и этимологию.
  const manual = async () => {
    const word = text.trim();
    const hit = (await hasDict(app.target).catch(() => false)) ? await lookupOffline(word, app.target).catch(() => null) : null;
    if (hit) setDraft(learnCard({ id: "", lang: app.target, lemma: hit.lemma, hit, tags: [], known: app.profile.known.map((k) => k.code) }));
    else {
      const now = today();
      setDraft({ id: "", terms: { [app.target]: { text: word } }, bridges: [], examples: [], tags: [], srs: {}, created: now, updated: now, notes: "" });
    }
    setFromAi(false);
  };

  // Без ИИ: машинный переводчик заполняет слово на всех известных языках.
  // Мостов и этимологии он не даёт — это работа ИИ или твоя.
  const viaTranslator = () =>
    ai.run(async () => {
      const word = text.trim();
      const known = app.profile.known.map((k) => k.code).filter((c) => c !== app.target);
      const terms: Concept["terms"] = { [app.target]: { text: word } };
      for (const k of known) {
        const tr = await translateText(app.translator, word, app.target, k);
        if (tr.trim()) terms[k] = { text: tr.trim() };
      }
      const now = today();
      setDraft({ id: "", terms, bridges: [], examples: [], tags: [], srs: {}, created: now, updated: now, notes: "" });
      setFromAi(false);
    });

  return (
    <Modal title={t("word.new")} onClose={onClose} wide>
      {!draft ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) fill();
          }}
        >
          <label className="field">
            <span>{t("word.input")}</span>
            <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="noche / ночь / night…" />
          </label>
          <label className="field">
            <span>{t("word.hint")}</span>
            <input className="input" value={hint} onChange={(e) => setHint(e.target.value)} />
          </label>
          {ai.error && <p className="error">{ai.error}</p>}
          <div className="row gap end">
            <button type="button" className="btn" onClick={manual} disabled={!text.trim()}>
              {t("word.manual")}
            </button>
            <button type="button" className="btn" onClick={viaTranslator} disabled={!text.trim() || ai.busy}>
              {t("word.viaTranslator")}
            </button>
            <button type="submit" className="btn primary" disabled={!text.trim() || ai.busy}>
              {ai.busy ? t("common.loading") : `✦ ${t("word.fillAi")}`}
            </button>
          </div>
        </form>
      ) : (
        <>
          {fromAi && <p className="notice">{t("word.aiDraftNote")}</p>}
          <WordForm
            initial={draft}
            onCancel={() => setDraft(null)}
            onSave={async (c) => {
              await app.saveConcept({ ...c, id: c.id || app.newId(c.terms[app.target]?.text ?? "word") });
              app.toast(t("common.saved"));
              onSaved?.();
              onClose();
            }}
          />
        </>
      )}
    </Modal>
  );
}

const KINDS: BridgeKind[] = ["cognate", "loan", "false-friend", "gender", "grammar", "sound", "mnemonic"];

export function WordForm({ initial, onSave, onCancel }: { initial: Concept; onSave(c: Concept): void; onCancel(): void }) {
  const { t, lang } = useT();
  const { target, profile } = useApp();
  const [c, setC] = useState<Concept>(initial);
  const [tags, setTags] = useState(initial.tags.join(" "));
  const known = profile.known.map((k) => k.code).filter((x) => x !== target);
  const langs = [target, ...known, ...Object.keys(initial.terms).filter((x) => x !== target && !known.includes(x))];

  const setTerm = (code: string, patch: Partial<Term>) => {
    const cur = c.terms[code] ?? { text: "" };
    setC({ ...c, terms: { ...c.terms, [code]: { ...cur, ...patch } } });
  };
  const setBridge = (i: number, patch: Partial<Bridge>) => setC({ ...c, bridges: c.bridges.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setExample = (i: number, patch: Partial<Example>) => setC({ ...c, examples: c.examples.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  const submit = () => {
    const terms: Record<string, Term> = {};
    for (const [code, term] of Object.entries(c.terms)) {
      if (!term.text?.trim()) continue;
      const clean: Term = { text: term.text.trim() };
      if (term.article?.trim()) clean.article = term.article.trim();
      if (term.gender) clean.gender = term.gender;
      if (term.translit?.trim()) clean.translit = term.translit.trim();
      terms[code] = clean;
    }
    if (!terms[target]) return;
    onSave({
      ...c,
      terms,
      tags: tags.split(/[\s,]+/).filter(Boolean),
      bridges: c.bridges.filter((b) => b.note.trim()),
      examples: c.examples.filter((e) => e.text.trim()),
    });
  };

  return (
    <form
      className="stack word-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="terms-edit">
        {langs.map((code) => {
          const info = langInfo(code);
          const term = c.terms[code];
          return (
            <div key={code} className={`term-edit ${code === target ? "target" : ""}`}>
              <div className="term-edit-lang">
                <LangChip code={code} /> <span className="small muted">{langName(code, lang)}</span>
              </div>
              <div className="row gap wrap">
                {info.articles && (
                  <input className="input input-xs" placeholder={t("word.article")} value={term?.article ?? ""} onChange={(e) => setTerm(code, { article: e.target.value })} />
                )}
                <input
                  className="input grow"
                  placeholder={t("word.text")}
                  required={code === target}
                  dir={info.rtl ? "rtl" : "ltr"}
                  value={term?.text ?? ""}
                  onChange={(e) => setTerm(code, { text: e.target.value })}
                />
                {info.gender !== "none" && (
                  <select className="input input-xs" value={term?.gender ?? ""} onChange={(e) => setTerm(code, { gender: (e.target.value || undefined) as Term["gender"] })} aria-label={t("word.gender")}>
                    <option value="">{t("word.gender")}</option>
                    {(info.gender === "common" ? ["c", "n"] : info.gender === "mfn" ? ["m", "f", "n"] : ["m", "f"]).map((g) => (
                      <option key={g} value={g}>
                        {t(`gender.${g as "m"}`)}
                      </option>
                    ))}
                  </select>
                )}
                {info.script !== "Latin" && (code === target || term?.translit) && (
                  <input className="input input-sm" placeholder={t("word.translit")} value={term?.translit ?? ""} onChange={(e) => setTerm(code, { translit: e.target.value })} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3>{t("word.bridges")}</h3>
      {c.bridges.map((b, i) => (
        <div key={i} className="bridge-edit">
          <div className="row gap wrap">
            <select className="input input-xs" value={b.from} onChange={(e) => setBridge(i, { from: e.target.value })} aria-label={t("word.bridgeFrom")}>
              {[...new Set([...known, b.from])].map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
            <select className="input input-sm" value={b.kind} onChange={(e) => setBridge(i, { kind: e.target.value as BridgeKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>
            <select className="input input-sm" value={b.strength} onChange={(e) => setBridge(i, { strength: e.target.value as Bridge["strength"] })}>
              {(["strong", "weak", "broken"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`strength.${s}`)}
                </option>
              ))}
            </select>
            <label className="row gap small">
              <input type="checkbox" checked={!!b.verified} onChange={(e) => setBridge(i, { verified: e.target.checked })} /> {t("word.verified")}
            </label>
            <button type="button" className="icon-btn" onClick={() => setC({ ...c, bridges: c.bridges.filter((_, j) => j !== i) })} aria-label={t("common.delete")}>
              ✕
            </button>
          </div>
          <input className="input" placeholder={t("word.bridgeNote")} value={b.note} onChange={(e) => setBridge(i, { note: e.target.value })} />
        </div>
      ))}
      <button
        type="button"
        className="btn-link"
        disabled={!known.length}
        onClick={() => setC({ ...c, bridges: [...c.bridges, { from: known[0], kind: "cognate", strength: "strong", note: "", verified: true, source: "user" }] })}
      >
        + {t("word.addBridge")}
      </button>

      <label className="field">
        <span>
          {t("word.etymology")}{" "}
          <label className="small muted">
            <input type="checkbox" checked={!!c.etymologyVerified} onChange={(e) => setC({ ...c, etymologyVerified: e.target.checked })} /> {t("word.verified")}
          </label>
        </span>
        <textarea className="input" rows={2} value={c.etymology ?? ""} onChange={(e) => setC({ ...c, etymology: e.target.value || undefined })} />
      </label>

      <h3>{t("word.examples")}</h3>
      {c.examples.map((ex, i) => (
        <div key={i} className="row gap wrap">
          <input className="input grow" value={ex.text} dir={langInfo(ex.lang).rtl ? "rtl" : "ltr"} onChange={(e) => setExample(i, { text: e.target.value })} />
          <input className="input grow" value={ex.tr ?? ""} onChange={(e) => setExample(i, { tr: e.target.value })} />
          <button type="button" className="icon-btn" onClick={() => setC({ ...c, examples: c.examples.filter((_, j) => j !== i) })} aria-label={t("common.delete")}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-link" onClick={() => setC({ ...c, examples: [...c.examples, { lang: target, text: "", tr: "" }] })}>
        + {t("common.add")}
      </button>

      <label className="field">
        <span>{t("word.tags")}</span>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="field">
        <span>{t("word.notes")}</span>
        <textarea className="input" rows={4} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} />
      </label>

      <div className="row gap end modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn primary">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
