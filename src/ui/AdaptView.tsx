import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { aiReady } from "../ai/config";
import { analyzeForAdaptation } from "../ai/tasks";
import { buildStages, letterOrder, plainDoc, renderDoc, settingsOf, splitSentences, type AdaptDoc, type AdaptSettings, type Stage } from "../core/adapt";
import { today } from "../core/dates";
import { isRtl, langName } from "../core/languages";
import { detectCyrillic, glyphTable, scriptInfo, scriptOfLang, type ScriptId } from "../core/scripts";
import { useT, type T } from "../i18n";
import { LangChip, LangFilter, Modal, useAsync } from "./common";
import { playMorse, stopMorse } from "./morseAudio";
import { useApp } from "./state";

const ALPHABETS: ScriptId[] = ["arabic", "hebrew", "greek", "cyrillic", "latin"];
const CODES: ScriptId[] = ["morse", "braille"];

/** Какой из известных языков подходит по алфавиту вставленного текста. */
export function guessKnownLang(text: string, known: string[]): string | null {
  const counts = { cyrillic: 0, latin: 0, arabic: 0, hebrew: 0, greek: 0 };
  for (const ch of text) {
    if (/\p{Script=Cyrillic}/u.test(ch)) counts.cyrillic++;
    else if (/\p{Script=Latin}/u.test(ch)) counts.latin++;
    else if (/\p{Script=Arabic}/u.test(ch)) counts.arabic++;
    else if (/\p{Script=Hebrew}/u.test(ch)) counts.hebrew++;
    else if (/\p{Script=Greek}/u.test(ch)) counts.greek++;
  }
  const best = (Object.entries(counts) as [ScriptId, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 3) return null;
  return known.find((k) => scriptOfLang(k) === best[0]) ?? null;
}

function stageLabel(t: T, s: Stage): string {
  switch (s.kind) {
    case "original":
      return t("adapt.stOriginal");
    case "flip":
      return t("adapt.stFlip");
    case "mirror":
      return t("adapt.stMirror");
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
  const [allLangs, setAllLangs] = useState(false);

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
      <LangFilter all={allLangs} onChange={setAllLangs} lang={app.target} />
      {docs && docs.length === 0 && <div className="empty">{t("adapt.empty")}</div>}
      <ul className="list">
        {docs
          // Тексты под алфавит или код не привязаны к языку — их видно всегда.
          ?.filter((d) => allLangs || !d.tgtLang || d.tgtLang === app.target)
          .map((d) => (
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
  const [srcTouched, setSrcTouched] = useState(false);
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
        // Порции по 5 предложений: маленьким и бесплатным моделям не хватает длины ответа на большие.
        for (let i = 0; i < sents.length; i += 5) {
          setProgress(t("adapt.progress", { i: Math.min(i + 5, sents.length), n: sents.length }));
          const batch = sents.slice(i, i + 5);
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
        <textarea
          className="input"
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Язык текста угадываем по алфавиту, пока его не выбрали вручную.
            if (!srcTouched) {
              const guess = guessKnownLang(e.target.value, app.profile.known.map((k) => k.code));
              if (guess) setSrcLang(guess);
            }
          }}
          placeholder={t("adapt.textPlaceholder")}
        />
        <div className="row gap wrap">
          <label className="field grow">
            <span>{t("adapt.from")}</span>
            <select className="input" value={srcLang} onChange={(e) => (setSrcLang(e.target.value), setSrcTouched(true))}>
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

/** Слово целиком на письме цели (без кириллицы и латиницы) — его читают справа налево. */
const fullyTarget = (s: string) => !/[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(s);

interface Challenge {
  unlocked: number;
  hinted: boolean;
  startedAt: number;
  best: Record<number, number>;
}

function AdaptReader({ doc: initial, onClose }: { doc: AdaptDoc; onClose(): void }) {
  const { t } = useT();
  const app = useApp();
  const [doc, setDoc] = useState(initial);
  const settings = settingsOf(doc);
  const stages = useMemo(() => buildStages(doc), [doc]);
  const key = `polygraph.adapt.${doc.id}`;
  const [i, setI] = useState(() => Math.min(stages.length - 1, Number(localStorage.getItem(key) ?? 0) || 0));
  const stage = stages[Math.min(i, stages.length - 1)];
  const paras = useMemo(() => renderDoc(doc, stage), [doc, stage]);
  const info = scriptInfo(doc.script);
  const order = useMemo(() => letterOrder(doc), [doc]);
  const table = useMemo(() => glyphTable(doc.script, detectCyrillic(doc.sentences.map((s) => s.src).join(" ")), settings.vowels), [doc, settings.vowels]);
  const learned = order.slice(0, stage.letters);
  const [showSettings, setShowSettings] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [challengeOn, setChallengeOn] = useState(false);
  const [ch, setCh] = useState<Challenge>(() => {
    try {
      return { hinted: false, startedAt: Date.now(), best: {}, unlocked: 0, ...JSON.parse(localStorage.getItem(`${key}.challenge`) ?? "{}") };
    } catch {
      return { unlocked: 0, hinted: false, startedAt: Date.now(), best: {} };
    }
  });
  const [verdict, setVerdict] = useState<"ok" | "again" | null>(null);

  const saveCh = (next: Challenge) => {
    setCh(next);
    try {
      localStorage.setItem(`${key}.challenge`, JSON.stringify({ unlocked: next.unlocked, best: next.best }));
    } catch {
      /* без запоминания */
    }
  };

  const set = (n: number) => {
    const max = challengeOn ? Math.min(stages.length - 1, ch.unlocked) : stages.length - 1;
    const v = Math.max(0, Math.min(max, n));
    setI(v);
    setShown(null);
    setVerdict(null);
    if (challengeOn) saveCh({ ...ch, hinted: false, startedAt: Date.now() });
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* без запоминания */
    }
  };

  const updateSettings = async (patch: Partial<AdaptSettings>) => {
    const next = { ...doc, settings: { ...settings, ...patch } };
    setDoc(next);
    await app.repo.saveAdaptDoc(next);
  };

  // Испытание: «прочитал» засчитывается, только если на этой стадии не было подсказок.
  const finishStage = () => {
    if (ch.hinted) {
      setVerdict("again");
      saveCh({ ...ch, hinted: false, startedAt: Date.now() });
      return;
    }
    const sec = Math.round((Date.now() - ch.startedAt) / 1000);
    const best = { ...ch.best, [i]: Math.min(ch.best[i] ?? Infinity, sec) };
    const unlocked = Math.max(ch.unlocked, i + 1);
    saveCh({ ...ch, best, unlocked, hinted: false, startedAt: Date.now() });
    setVerdict("ok");
  };

  const showOriginal = (index: number) => {
    setShown(shown === index ? null : index);
    if (challengeOn && shown !== index) setCh({ ...ch, hinted: true });
  };

  useEffect(() => () => stopMorse(), []);

  const targetRtl = !!doc.tgtLang && isRtl(doc.tgtLang);

  // Слово исходника: в зеркальной стадии буквы идут справа налево, иначе
  // слово читается как обычно, пока целиком не станет словом цели.
  const wordStyle = (text: string): CSSProperties => {
    if (!stage.rtl) return {};
    if (stage.mirror) return { unicodeBidi: "isolate-override", direction: "rtl" };
    return { unicodeBidi: "isolate", direction: info.rtl && fullyTarget(text) ? "rtl" : "ltr" };
  };

  const sentenceShown = shown !== null ? doc.sentences[shown] : null;

  return (
    <section className="view narrow">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={onClose}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{doc.title}</h1>
        </div>
        <div className="row gap">
          <button className={`btn ${showSettings ? "primary" : ""}`} onClick={() => setShowSettings(!showSettings)} title={t("adapt.settings")}>
            ⚙
          </button>
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
        </div>
      </header>

      {showSettings && (
        <div className="reader-prefs">
          {info.rtl && (
            <>
              <label className="row gap">
                <input type="checkbox" checked={settings.flipWords} onChange={(e) => updateSettings({ flipWords: e.target.checked })} />
                {t("adapt.setFlip")}
              </label>
              <label className="row gap">
                <input type="checkbox" checked={settings.mirrorLetters} onChange={(e) => updateSettings({ mirrorLetters: e.target.checked })} />
                {t("adapt.setMirror")}
              </label>
              <div className="field">
                <span>{t("adapt.setVowels")}</span>
                <div className="segmented">
                  {(["letters", "harakat"] as const).map((v) => (
                    <button key={v} className={settings.vowels === v ? "on" : ""} onClick={() => updateSettings({ vowels: v })}>
                      {t(`adapt.vowels.${v}`)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="player-settings">
            <label className="field">
              <span>{t("adapt.setLetters", { n: settings.lettersPerStep })}</span>
              <input type="range" min={1} max={8} value={settings.lettersPerStep} onChange={(e) => updateSettings({ lettersPerStep: Number(e.target.value) })} />
            </label>
            {doc.tgtLang && (
              <label className="field">
                <span>{t("adapt.setWords", { n: settings.wordsPerStep })}</span>
                <input type="range" min={1} max={10} value={settings.wordsPerStep} onChange={(e) => updateSettings({ wordsPerStep: Number(e.target.value) })} />
              </label>
            )}
          </div>
          {doc.tgtLang && (
            <div className="field">
              <span>{t("adapt.setSentences")}</span>
              <div className="segmented">
                {(["one", "level", "off"] as const).map((v) => (
                  <button key={v} className={settings.sentences === v ? "on" : ""} onClick={() => updateSettings({ sentences: v })}>
                    {t(`adapt.sent.${v}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="muted small">{t("adapt.settingsHint", { n: stages.length })}</p>
        </div>
      )}

      <div className="stage-bar">
        <button className="btn" onClick={() => set(i - 1)} disabled={i === 0}>
          ←
        </button>
        <div className="grow stack-tight">
          <input
            type="range"
            min={0}
            max={stages.length - 1}
            value={i}
            onChange={(e) => set(Number(e.target.value))}
            aria-label={t("adapt.stage")}
          />
          <span className="small">
            {i + 1}/{stages.length} · <strong>{stageLabel(t, stage)}</strong>
            {challengeOn && ch.best[i] !== undefined && <span className="muted"> · {t("adapt.best", { n: ch.best[i] })}</span>}
          </span>
        </div>
        <button className="btn primary" onClick={() => set(i + 1)} disabled={i === stages.length - 1 || (challengeOn && i >= ch.unlocked)}>
          →
        </button>
      </div>

      <div className="row gap wrap challenge-bar">
        <label className="row gap small">
          <input
            type="checkbox"
            checked={challengeOn}
            onChange={(e) => {
              setChallengeOn(e.target.checked);
              setVerdict(null);
              saveCh({ ...ch, hinted: false, startedAt: Date.now() });
            }}
          />
          {t("adapt.challenge")}
        </label>
        {challengeOn && (
          <button className="btn small primary" onClick={finishStage}>
            ✓ {t("adapt.readIt")}
          </button>
        )}
        {verdict === "ok" && <span className="ok-text small">{t("adapt.unlocked")}</span>}
        {verdict === "again" && <span className="error small">{t("adapt.again")}</span>}
        {!challengeOn && <span className="muted small">{t("adapt.tapHint")}</span>}
      </div>

      <div className={`adapt-text ${info.code ? "code" : ""}`} dir={stage.rtl ? "rtl" : "ltr"}>
        {paras.map((sentences, p) => (
          <p key={p}>
            {sentences.map(({ index, segments }) => (
              <span key={index} className={`adapt-sentence ${shown === index ? "shown" : ""}`} onClick={() => showOriginal(index)}>
                {segments.map((seg, k) =>
                  seg.word ? (
                    <span key={k} className={`seg-${seg.kind}`} style={wordStyle(seg.text)}>
                      {seg.text}
                    </span>
                  ) : seg.kind === "tgt" ? (
                    <span key={k} className="seg-tgt" dir={targetRtl ? "rtl" : "ltr"} style={{ unicodeBidi: "isolate" }} lang={doc.tgtLang}>
                      {seg.text}
                    </span>
                  ) : (
                    <span key={k} className={`seg-${seg.kind}`}>
                      {seg.text}
                    </span>
                  ),
                )}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>

      {sentenceShown && (
        <div className="original-card">
          <div>
            <span className="muted small">{t("adapt.originalLabel")}</span>
            <p lang={doc.srcLang}>{sentenceShown.src}</p>
          </div>
          {sentenceShown.tgt && (
            <div>
              <span className="muted small">{t("adapt.translationLabel")}</span>
              <p lang={doc.tgtLang} dir={targetRtl ? "rtl" : "ltr"}>
                {sentenceShown.tgt}
              </p>
            </div>
          )}
        </div>
      )}

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
              const shownGlyph = /^[ً-ְْ-ּ]$/.test(glyph) ? `◌${glyph}` : glyph || "∅";
              return (
                <div key={l} className="letter-cell">
                  <span className="letter-src">{l}</span>
                  <span className="letter-dst" dir={info.rtl ? "rtl" : "ltr"}>
                    {shownGlyph}
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
