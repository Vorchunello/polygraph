import { useEffect, useMemo, useState } from "react";
import { aiReady } from "../ai/config";
import { analyzeForAdaptation } from "../ai/tasks";
import { buildStages, letterOrder, plainDoc, renderDoc, splitSentences, type AdaptDoc, type Stage } from "../core/adapt";
import { today } from "../core/dates";
import { langName } from "../core/languages";
import { detectCyrillic, glyphTable, scriptInfo, scriptOfLang, type ScriptId } from "../core/scripts";
import { useT, type T } from "../i18n";
import { LangChip, Modal, useAsync } from "./common";
import { playMorse, stopMorse } from "./morseAudio";
import { useApp } from "./state";

const ALPHABETS: ScriptId[] = ["arabic", "hebrew", "greek", "cyrillic", "latin"];
const CODES: ScriptId[] = ["morse", "braille"];

function stageLabel(t: T, s: Stage): string {
  switch (s.kind) {
    case "original":
      return t("adapt.stOriginal");
    case "flip":
      return t("adapt.stFlip");
    case "letters":
      return t("adapt.stLetters", { step: s.step, of: s.of });
    case "words":
      return t("adapt.stWords", { step: s.step, of: s.of });
    case "sentences":
      return t("adapt.stSentences", { step: s.step, of: s.of });
  }
}

export function AdaptView() {
  const { t } = useT();
  const app = useApp();
  const [docs, setDocs] = useState<AdaptDoc[] | null>(null);
  const [open, setOpen] = useState<AdaptDoc | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => app.repo.loadAdaptDocs().then((d) => setDocs(d.sort((a, b) => b.created.localeCompare(a.created))));
  useEffect(() => {
    load();
  }, [app.repo]);

  if (open) return <AdaptReader doc={open} onClose={() => setOpen(null)} />;

  return (
    <section className="view narrow">
      <header className="view-head">
        <h1>{t("adapt.title")}</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + {t("adapt.new")}
        </button>
      </header>
      <p className="muted">{t("adapt.hint")}</p>
      {docs && docs.length === 0 && <div className="empty">{t("adapt.empty")}</div>}
      <ul className="list">
        {docs?.map((d) => (
          <li key={d.id}>
            <button className="list-item" onClick={() => setOpen(d)}>
              <LangChip code={d.tgtLang ?? d.script.slice(0, 3)} />
              <span className="grow">
                <strong>{d.title}</strong>
              </span>
              <span className="muted small">{t(`script.${d.script}`)}</span>
            </button>
          </li>
        ))}
      </ul>
      {creating && (
        <NewAdapt
          onDone={async (d) => {
            setCreating(false);
            if (d) {
              await load();
              setOpen(d);
            }
          }}
        />
      )}
    </section>
  );
}

function NewAdapt({ onDone }: { onDone(d: AdaptDoc | null): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const native = app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.uiLang;
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [srcLang, setSrcLang] = useState(native);
  const [target, setTarget] = useState(`lang:${app.target}`);
  const [progress, setProgress] = useState("");
  const job = useAsync();

  const create = () =>
    job.run(async () => {
      const [kind, value] = target.split(":");
      const id = app.newId(title || text.slice(0, 30) || "text");
      const name = title.trim() || text.trim().slice(0, 40);
      let doc: AdaptDoc;
      if (kind === "lang") {
        if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
        const script = scriptOfLang(value) ?? (detectCyrillic(text) ? "cyrillic" : "latin");
        const sents = splitSentences(text);
        const out: AdaptDoc["sentences"] = [];
        for (let i = 0; i < sents.length; i += 10) {
          setProgress(t("adapt.progress", { i: Math.min(i + 10, sents.length), n: sents.length }));
          const batch = sents.slice(i, i + 10);
          const res = await analyzeForAdaptation(app.ai, app.profile, srcLang, value, batch.map((s) => s.src));
          batch.forEach((s, k) => out.push({ src: s.src, para: s.para, tgt: res[k].tgt, level: res[k].level, chunks: res[k].chunks }));
        }
        doc = { id, title: name, srcLang, tgtLang: value, script, sentences: out, created: today() };
      } else {
        doc = plainDoc(id, name, text, srcLang, value as ScriptId, today());
      }
      setProgress("");
      await app.repo.saveAdaptDoc(doc);
      onDone(doc);
    });

  return (
    <Modal title={t("adapt.new")} onClose={() => onDone(null)} wide>
      <div className="stack">
        <input className="input" placeholder={t("reader.bookTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("adapt.textPlaceholder")} />
        <div className="row gap wrap">
          <label className="field grow">
            <span>{t("adapt.from")}</span>
            <select className="input" value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
              {app.profile.known.map((k) => (
                <option key={k.code} value={k.code}>
                  {langName(k.code, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>{t("adapt.to")}</span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <optgroup label={t("adapt.toLang")}>
                {app.profile.learning.map((l) => (
                  <option key={l.code} value={`lang:${l.code}`}>
                    {langName(l.code, lang)} ✦
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("adapt.toScript")}>
                {ALPHABETS.map((s) => (
                  <option key={s} value={`script:${s}`}>
                    {t(`script.${s}`)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("adapt.toCode")}>
                {CODES.map((s) => (
                  <option key={s} value={`code:${s}`}>
                    {t(`script.${s}`)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        </div>
        <p className="muted small">{target.startsWith("lang:") ? t("adapt.aiNote") : t("adapt.offlineNote")}</p>
        {progress && <p className="muted small">{progress}</p>}
        {job.error && <p className="error">{job.error}</p>}
        <div className="row end">
          <button className="btn primary" disabled={!text.trim() || job.busy} onClick={create}>
            {job.busy ? t("common.loading") : t("adapt.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AdaptReader({ doc, onClose }: { doc: AdaptDoc; onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const stages = useMemo(() => buildStages(doc), [doc]);
  const key = `polygraph.adapt.${doc.id}`;
  const [i, setI] = useState(() => Math.min(stages.length - 1, Number(localStorage.getItem(key) ?? 0) || 0));
  const stage = stages[i];
  const paras = useMemo(() => renderDoc(doc, stage), [doc, stage]);
  const info = scriptInfo(doc.script);
  const order = useMemo(() => letterOrder(doc), [doc]);
  const table = useMemo(() => glyphTable(doc.script, detectCyrillic(doc.sentences.map((s) => s.src).join(" "))), [doc]);
  const learned = order.slice(0, stage.letters);

  const set = (n: number) => {
    const v = Math.max(0, Math.min(stages.length - 1, n));
    setI(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* без запоминания */
    }
  };

  useEffect(() => () => stopMorse(), []);

  return (
    <section className="view narrow">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{doc.title}</h1>
        </div>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirm(t("common.confirmDelete", { name: doc.title }))) {
              await app.repo.deleteAdaptDoc(doc.id);
              onClose();
            }
          }}
        >
          {t("common.delete")}
        </button>
      </header>

      <div className="stage-bar">
        <button className="btn" onClick={() => set(i - 1)} disabled={i === 0}>
          ←
        </button>
        <div className="grow stack-tight">
          <input type="range" min={0} max={stages.length - 1} value={i} onChange={(e) => set(Number(e.target.value))} aria-label={t("adapt.stage")} />
          <span className="small">
            {i + 1}/{stages.length} · <strong>{stageLabel(t, stage)}</strong>
          </span>
        </div>
        <button className="btn primary" onClick={() => set(i + 1)} disabled={i === stages.length - 1}>
          →
        </button>
      </div>

      <div className={`adapt-text ${stage.rtl ? "flipped" : ""} ${info.code ? "code" : ""}`}>
        {paras.map((sentences, p) => (
          <p key={p}>
            {sentences.map((segs, s) => (
              <span key={s}>
                {segs.map((seg, k) => (
                  <span key={k} className={`seg-${seg.kind}`}>
                    {seg.text}
                  </span>
                ))}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      {doc.script === "morse" && (
        <div className="row gap">
          <button className="btn" onClick={() => playMorse(doc.sentences.map((s) => s.src).join(" "))}>
            ▶ {t("adapt.listenMorse")}
          </button>
          <button className="btn" onClick={stopMorse}>
            ■
          </button>
        </div>
      )}

      {table && learned.length > 0 && (
        <>
          <h3>{t("adapt.letters", { n: learned.length, of: order.length })}</h3>
          <div className="letter-grid">
            {learned.map((l) => {
              const g = table[l];
              const glyph = Array.isArray(g) ? g[0] : g;
              const shown = /^[ً-ְْ-ּ]$/.test(glyph) ? `◌${glyph}` : glyph || "∅";
              return (
                <div key={l} className="letter-cell">
                  <span className="letter-src">{l}</span>
                  <span className="letter-dst" dir={info.rtl ? "rtl" : "ltr"}>
                    {shown}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
