import { useEffect, useState } from "react";
import { aiReady } from "../ai/config";
import { extractVocabulary } from "../ai/tasks";
import { translateMany } from "../ai/translate";
import { langName } from "../core/languages";
import { parseBookFile, parsePlain } from "../core/reader";
import { pickVocabulary, sampleText, wordStats, type LookupResult, type VocabItem } from "../core/vocab";
import { useT } from "../i18n";
import { FUNCTION_POS, hasDict, lookupOffline, shortGloss } from "../storage/dictionary";
import { pdfParagraphs } from "../storage/documents";
import { LangChip, Modal, pickBinaryFile, useAsync } from "./common";
import { learnCard } from "./saveWord";
import { useApp } from "./state";

export interface TextSource {
  label: string;
  paragraphs: string[];
}

type Method = "ai" | "dict";
type Row = VocabItem & { on: boolean };

/** Офлайн-словарь в форме, которую ждёт отбор слов. */
export const vocabLookup =
  (lang: string) =>
  async (word: string): Promise<LookupResult | null> => {
    const hit = await lookupOffline(word, lang);
    if (!hit) return null;
    // Хоть одно служебное значение — слово служебное: у «de» и «la» есть ещё «название буквы» и «нота ля».
    // Междометие — только если других значений нет: у «patata» есть ещё «скажи сыр».
    const func = hit.senses.some((s) => FUNCTION_POS.has(s.p) && s.p !== "intj") || hit.senses.every((s) => FUNCTION_POS.has(s.p));
    const main = hit.senses.find((s) => !FUNCTION_POS.has(s.p)) ?? hit.senses[0];
    return { lemma: hit.lemma, pos: main?.p ?? "", gloss: main?.d[0] ?? shortGloss(hit), rank: hit.rank, function: func };
  };

/**
 * «Слова из текста»: из книги, PDF, субтитров ролика или вставленного текста
 * отбираются слова, которые стоит учить, — ИИ или офлайн-словарём.
 */
export function ExtractWords({ lang, sources, tag, onClose }: { lang: string; sources?: TextSource[]; tag?: string; onClose(): void }) {
  const { t, lang: ui } = useT();
  const app = useApp();
  const [src, setSrc] = useState(0);
  const [text, setText] = useState("");
  const [file, setFile] = useState<TextSource | null>(null);
  const [dictReady, setDictReady] = useState(false);
  const [method, setMethod] = useState<Method>(() => (aiReady(app.ai) ? "ai" : "dict"));
  const [count, setCount] = useState(20);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [progress, setProgress] = useState("");
  const job = useAsync();
  const nativeLang = app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.uiLang;
  const trLang = nativeLang === lang ? app.profile.uiLang : nativeLang;

  useEffect(() => {
    hasDict(lang).then(setDictReady, () => setDictReady(false));
  }, [lang]);

  const paragraphs = (): string[] => (sources?.length ? sources[src].paragraphs : file ? file.paragraphs : parsePlain(text));

  const skipSet = async () => {
    const saved = app.concepts.map((c) => c.terms[lang]?.text.toLowerCase()).filter((x): x is string => !!x);
    const known = (await app.repo.loadKnownWords(lang)).map((w) => w.toLowerCase());
    return new Set([...saved, ...known]);
  };

  const run = () =>
    job.run(async () => {
      const paras = paragraphs();
      if (!paras.length) return;
      const skip = await skipSet();
      const lookup = dictReady ? vocabLookup(lang) : undefined;
      setProgress(t("extract.scanning"));
      if (method === "dict") {
        const items = await pickVocabulary(paras, { skip, limit: count, lookup, lang });
        setRows(items.map((x) => ({ ...x, on: true })));
      } else {
        if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
        const hints = dictReady ? await pickVocabulary(paras, { skip, limit: 80, lookup, lang }) : [];
        setProgress(t("extract.asking"));
        const words = await extractVocabulary(app.ai, app.profile, lang, sampleText(paras, 12000), {
          count,
          known: [...skip].slice(0, 300),
          candidates: hints.map((h) => `${h.lemma}×${h.count}`),
          translateTo: trLang,
        });
        const stats = new Map(wordStats(paras).map((s) => [s.key, s]));
        // Маленькие модели иногда «находят» слова, которых в тексте нет, — такие отбрасываем.
        const full = paras.join("\n").toLowerCase();
        setRows(
          words
            .filter((w) => full.includes(w.form.toLowerCase()) || full.includes(w.lemma.toLowerCase()))
            .map((w) => {
            const s = stats.get(w.form.toLowerCase());
            const hint = hints.find((h) => h.lemma.toLowerCase() === w.lemma.toLowerCase());
            return {
              lemma: w.lemma,
              forms: [w.form],
              count: hint?.count ?? s?.count ?? 1,
              example: w.example || s?.example || "",
              gloss: hint?.gloss,
              translation: w.translation,
              level: w.level,
              why: w.why,
              on: true,
            };
          }),
        );
      }
      setProgress("");
    }).finally(() => setProgress(""));

  const loadFile = () =>
    job.run(async () => {
      const f = await pickBinaryFile(".pdf,.srt,.vtt,.txt,.md,.epub,.fb2,.zip");
      if (!f) return;
      const paras = f.name.toLowerCase().endsWith(".pdf") ? (await pdfParagraphs(f.bytes)).paragraphs : parseBookFile(f.name, f.bytes).paragraphs;
      if (!paras.length) throw new Error(t("reader.pdfEmpty"));
      setFile({ label: f.name, paragraphs: paras });
    });

  const chosen = rows?.filter((r) => r.on) ?? [];
  const tags = ["import", ...(tag ? [tag] : [])];

  const addWords = () =>
    job.run(async () => {
      // Перевода нет (офлайн-отбор) — пробуем переводчик; не вышло — хватит словаря.
      const need = chosen.filter((r) => !r.translation);
      let tr: string[] = [];
      if (need.length) {
        setProgress(t("extract.translating"));
        tr = await translateMany(app.translator, need.map((r) => r.lemma), lang, trLang).catch(() => []);
      }
      const cards = [];
      for (const r of chosen) {
        const i = need.indexOf(r);
        const translation = r.translation || (i >= 0 ? tr[i] : "") || "";
        const hit = dictReady ? await lookupOffline(r.lemma, lang) : null;
        cards.push(
          learnCard({
            id: app.newId(r.lemma),
            lang,
            lemma: r.lemma,
            hit,
            translation: translation ? { lang: trLang, text: translation } : undefined,
            example: r.example,
            tags,
            known: app.profile.known.map((k) => k.code),
          }),
        );
      }
      await app.addConcepts(cards);
      app.toast(t("extract.added", { n: cards.length }));
      setRows(rows!.filter((r) => !r.on));
    }).finally(() => setProgress(""));

  const toInbox = async () => {
    await app.addToInbox(chosen.map((r) => `${r.lemma} #${lang}`));
    app.toast(t("extract.toInboxDone", { n: chosen.length }));
    setRows(rows!.filter((r) => !r.on));
  };

  const markKnown = async (r: Row) => {
    await app.repo.addKnownWords(lang, [r.lemma]);
    setRows((rs) => rs!.filter((x) => x !== r));
  };

  const toggle = (r: Row) => setRows((rs) => rs!.map((x) => (x === r ? { ...x, on: !x.on } : x)));

  return (
    <Modal title={t("extract.title")} onClose={onClose} wide>
      {!rows ? (
        <div className="stack">
          <p className="muted small">{t("extract.hint", { lang: langName(lang, ui) })}</p>
          {sources?.length ? (
            sources.length > 1 && (
              <div className="segmented">
                {sources.map((s, i) => (
                  <button key={i} className={src === i ? "on" : ""} onClick={() => setSrc(i)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )
          ) : file ? (
            <div className="row gap notice small">
              📄 <span className="grow">{t("extract.file", { name: file.label, n: file.paragraphs.length })}</span>
              <button className="icon-btn" onClick={() => setFile(null)} aria-label={t("common.delete")}>
                ✕
              </button>
            </div>
          ) : (
            <>
              <textarea className="input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("extract.placeholder")} />
              <div className="row gap wrap">
                <button className="btn" onClick={loadFile} disabled={job.busy}>
                  📄 {t("extract.fromFile")}
                </button>
              </div>
              <details className="small">
                <summary>▶ {t("extract.youtube")}</summary>
                <ol className="muted">
                  <li>{t("extract.yt1")}</li>
                  <li>{t("extract.yt2")}</li>
                  <li>{t("extract.yt3")}</li>
                </ol>
                <p className="muted">{t("extract.ytDlp")}</p>
                <code className="path">yt-dlp --write-auto-subs --sub-langs {lang} --skip-download URL</code>
              </details>
            </>
          )}
          <div className="row gap wrap">
            <div className="segmented">
              <button className={method === "ai" ? "on" : ""} onClick={() => setMethod("ai")}>
                ✦ {t("extract.byAi")}
              </button>
              <button className={method === "dict" ? "on" : ""} onClick={() => setMethod("dict")}>
                📖 {t("extract.byDict")}
              </button>
            </div>
            <label className="row gap small">
              {t("extract.count")}
              <select className="input input-sm" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[10, 20, 40, 80].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">{method === "ai" ? (dictReady ? t("extract.aiWithDict") : t("extract.aiNoDict")) : dictReady ? t("extract.dictOn") : t("extract.dictOff")}</p>
          {job.error && <p className="error">{job.error}</p>}
          <div className="row gap end">
            {progress && <span className="muted small">{progress}</span>}
            <button className="btn primary" disabled={job.busy || (!sources?.length && !file && !text.trim())} onClick={run}>
              {job.busy ? t("common.loading") : t("extract.find")}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {rows.length === 0 ? (
            <div className="empty">{t("extract.none")}</div>
          ) : (
            <>
              <div className="row gap between">
                <span className="muted small">{t("extract.found", { n: rows.length, k: chosen.length })}</span>
                <button className="btn small" onClick={() => setRows(rows.map((r) => ({ ...r, on: !chosen.length })))}>
                  {chosen.length ? t("extract.none_") : t("extract.all")}
                </button>
              </div>
              <ul className="extract-list">
                {rows.map((r) => (
                  <li key={r.lemma} className={r.on ? "" : "off"}>
                    <input type="checkbox" checked={r.on} onChange={() => toggle(r)} aria-label={r.lemma} />
                    <div className="grow">
                      <div className="row gap wrap">
                        <strong lang={lang}>{r.lemma}</strong>
                        {r.forms[0] && r.forms[0].toLowerCase() !== r.lemma.toLowerCase() && <span className="muted small">← {r.forms.slice(0, 3).join(", ")}</span>}
                        {r.level && <span className="badge">{r.level}</span>}
                        {r.pos && <span className="muted small">{r.pos}</span>}
                        <span className="muted small">×{r.count}</span>
                      </div>
                      {(r.translation || r.gloss) && (
                        <div>
                          {r.translation && (
                            <>
                              <LangChip code={trLang} /> {r.translation}
                            </>
                          )}
                          {!r.translation && r.gloss && <span className="muted">{r.gloss}</span>}
                        </div>
                      )}
                      {r.example && (
                        <div className="muted small extract-example" lang={lang}>
                          {r.example}
                        </div>
                      )}
                      {r.why && <div className="small">💡 {r.why}</div>}
                    </div>
                    <button className="btn small" title={t("extract.knowHint")} onClick={() => markKnown(r)}>
                      ✓ {t("extract.know")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {job.error && <p className="error">{job.error}</p>}
          <div className="row gap end wrap">
            {progress && <span className="muted small">{progress}</span>}
            <button className="btn" onClick={() => setRows(null)}>
              ← {t("common.back")}
            </button>
            <button className="btn" disabled={!chosen.length} onClick={toInbox}>
              → {t("nav.inbox")}
            </button>
            <button className="btn primary" disabled={!chosen.length || job.busy} onClick={addWords}>
              {job.busy ? t("common.loading") : `★ ${t("extract.add", { n: chosen.length })}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
