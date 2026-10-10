import { useEffect, useMemo, useRef, useState } from "react";
import { aiReady } from "../ai/config";
import { buildLadder } from "../ai/tasks";
import { today } from "../core/dates";
import { langName } from "../core/languages";
import { estimateMinutes, offlinePlaylist, schedule, type Playlist } from "../core/playlist";
import { useT } from "../i18n";
import { canSpeak, hasVoice, speakAsync, stopSpeaking } from "../storage/tts";
import { LangChip, Modal, useAsync } from "./common";
import { useApp } from "./state";

interface PlayerSettings {
  order: "native-first" | "target-first" | "target-only";
  repeats: number;
  pause: number;
  rate: number;
  loop: boolean;
}

const DEFAULTS: PlayerSettings = { order: "native-first", repeats: 2, pause: 1.5, rate: 0.9, loop: true };

export function PlaylistsView() {
  const { t } = useT();
  const app = useApp();
  const [lists, setLists] = useState<Playlist[] | null>(null);
  const [open, setOpen] = useState<Playlist | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => app.repo.loadPlaylists().then((l) => setLists(l.sort((a, b) => b.created.localeCompare(a.created))));
  useEffect(() => {
    load();
  }, [app.repo]);

  if (open) return <Player list={open} onClose={() => (setOpen(null), load())} />;

  return (
    <section className="view narrow">
      <header className="view-head">
        <h1>{t("pl.title")}</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + {t("pl.new")}
        </button>
      </header>
      <p className="muted">{t("pl.hint")}</p>
      {!canSpeak() && <p className="error">{t("pl.noTts")}</p>}
      {lists && lists.length === 0 && <div className="empty">{t("pl.empty")}</div>}
      <ul className="list">
        {lists?.map((p) => (
          <li key={p.id}>
            <button className="list-item" onClick={() => setOpen(p)}>
              <LangChip code={p.lang} />
              <span className="grow">
                <strong>{p.title}</strong>
              </span>
              <span className="muted small">{t("pl.steps", { n: p.steps.length })}</span>
            </button>
          </li>
        ))}
      </ul>
      {creating && (
        <NewPlaylist
          onDone={async (p) => {
            setCreating(false);
            if (p) {
              await load();
              setOpen(p);
            }
          }}
        />
      )}
    </section>
  );
}

function NewPlaylist({ onDone }: { onDone(p: Playlist | null): void }) {
  const { t } = useT();
  const app = useApp();
  const native = app.profile.known.find((k) => k.level === "native")?.code ?? app.profile.uiLang;
  const [topic, setTopic] = useState("");
  const [size, setSize] = useState(80);
  const [useWords, setUseWords] = useState(true);
  const job = useAsync();

  const save = async (title: string, steps: Playlist["steps"]) => {
    const p: Playlist = { id: app.newId(title), title, lang: app.target, nativeLang: native, steps, created: today() };
    await app.repo.savePlaylist(p);
    onDone(p);
  };

  return (
    <Modal title={t("pl.new")} onClose={() => onDone(null)}>
      <div className="stack">
        <label className="field">
          <span>{t("texts.topic")}</span>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("pl.topicPlaceholder")} />
        </label>
        <label className="field">
          <span>{t("pl.size", { n: size })}</span>
          <input type="range" min={30} max={150} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label className="row gap small">
          <input type="checkbox" checked={useWords} onChange={(e) => setUseWords(e.target.checked)} /> {t("pl.useWords")}
        </label>
        {job.error && <p className="error">{job.error}</p>}
        <div className="row gap end wrap">
          <button
            className="btn"
            onClick={() => {
              const steps = offlinePlaylist(app.concepts, app.target, native);
              if (steps.length) save(t("pl.fromDict"), steps);
              else job.setError(t("pl.dictEmpty"));
            }}
          >
            {t("pl.fromDict")}
          </button>
          <button
            className="btn primary"
            disabled={job.busy}
            onClick={() =>
              job.run(async () => {
                if (!aiReady(app.ai)) throw new Error(t("common.aiNotReady"));
                const words = useWords ? app.concepts.map((c) => c.terms[app.target]?.text).filter(Boolean).slice(0, 40) : [];
                const r = await buildLadder(app.ai, app.profile, app.target, native, topic.trim(), words, size);
                await save(r.title, r.steps);
              })
            }
          >
            {job.busy ? t("common.loading") : `✦ ${t("pl.generate")}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Player({ list, onClose }: { list: Playlist; onClose(): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const [s, setS] = useState<PlayerSettings>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("polygraph.player") ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  });
  const items = useMemo(() => schedule(list.steps), [list]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<"native" | "target" | "idle">("idle");
  const [voiceOk, setVoiceOk] = useState(true);
  const run = useRef(0);

  useEffect(() => {
    hasVoice(list.lang).then(setVoiceOk);
    return () => {
      run.current++;
      stopSpeaking();
    };
  }, [list.lang]);

  const update = (patch: Partial<PlayerSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      localStorage.setItem("polygraph.player", JSON.stringify(next));
    } catch {
      /* без запоминания */
    }
  };

  const wait = (sec: number, id: number) => new Promise<boolean>((r) => setTimeout(() => r(run.current === id), sec * 1000));

  // Цикл проигрывания. Каждое нажатие «пауза»/«дальше» увеличивает run,
  // и старый цикл тихо завершается на ближайшей проверке.
  const play = async (from: number) => {
    const id = ++run.current;
    setPlaying(true);
    let i = from;
    while (run.current === id) {
      if (i >= items.length) {
        if (!s.loop) break;
        i = 0;
      }
      setPos(i);
      const step = items[i].step;
      const target = async () => {
        for (let r = 0; r < s.repeats && run.current === id; r++) {
          setPhase("target");
          await speakAsync(step.tgt, list.lang, s.rate);
          if (!(await wait(0.6, id))) return;
        }
      };
      if (s.order === "native-first") {
        setPhase("native");
        await speakAsync(step.native, list.nativeLang, s.rate);
        if (!(await wait(s.pause, id))) break;
        await target();
      } else if (s.order === "target-first") {
        await target();
        if (run.current !== id) break;
        setPhase("native");
        await speakAsync(step.native, list.nativeLang, s.rate);
      } else {
        await target();
      }
      if (!(await wait(s.pause, id))) break;
      i++;
    }
    if (run.current === id) {
      setPlaying(false);
      setPhase("idle");
    }
  };

  const pause = () => {
    run.current++;
    stopSpeaking();
    setPlaying(false);
    setPhase("idle");
  };

  const jump = (n: number) => {
    const target = Math.max(0, Math.min(items.length - 1, n));
    pause();
    setPos(target);
    if (playing) setTimeout(() => play(target), 50);
  };

  const cur = items[pos];
  const minutes = estimateMinutes(items, s.repeats, s.pause, s.rate);

  return (
    <section className="view narrow">
      <header className="view-head">
        <div className="row gap">
          <button className="btn" onClick={() => (pause(), onClose())}>
            ← {t("common.back")}
          </button>
          <h1 className="reader-title">{list.title}</h1>
        </div>
        <button
          className="btn danger"
          onClick={async () => {
            if (confirm(t("common.confirmDelete", { name: list.title }))) {
              pause();
              await app.repo.deletePlaylist(list.id);
              onClose();
            }
          }}
        >
          {t("common.delete")}
        </button>
      </header>

      {!voiceOk && <p className="notice small">{t("pl.noVoice", { lang: langName(list.lang, lang) })}</p>}

      <div className={`player-card ${cur?.review ? "review" : ""}`}>
        <div className={`player-native ${phase === "native" ? "speaking" : ""}`}>{cur?.step.native}</div>
        <div className={`player-target ${phase === "target" ? "speaking" : ""}`} lang={list.lang}>
          {cur?.step.tgt}
        </div>
        <div className="muted small">
          {pos + 1} / {items.length}
          {cur?.review && ` · ${t("pl.review")}`} · ≈ {t("pl.minutes", { n: minutes })}
        </div>
      </div>

      <div className="row gap center-row">
        <button className="btn" onClick={() => jump(pos - 1)}>
          ⏮
        </button>
        {playing ? (
          <button className="btn primary big-round" onClick={pause}>
            ⏸
          </button>
        ) : (
          <button className="btn primary big-round" onClick={() => play(pos)} disabled={!canSpeak()}>
            ▶
          </button>
        )}
        <button className="btn" onClick={() => jump(pos + 1)}>
          ⏭
        </button>
      </div>

      <div className="player-settings">
        <label className="field">
          <span>{t("pl.order")}</span>
          <select className="input" value={s.order} onChange={(e) => update({ order: e.target.value as PlayerSettings["order"] })}>
            <option value="native-first">{t("pl.nativeFirst")}</option>
            <option value="target-first">{t("pl.targetFirst")}</option>
            <option value="target-only">{t("pl.targetOnly")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("pl.repeats", { n: s.repeats })}</span>
          <input type="range" min={1} max={4} value={s.repeats} onChange={(e) => update({ repeats: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>{t("pl.pause", { n: s.pause })}</span>
          <input type="range" min={0.5} max={5} step={0.5} value={s.pause} onChange={(e) => update({ pause: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>{t("pl.rate", { n: s.rate })}</span>
          <input type="range" min={0.5} max={1.5} step={0.1} value={s.rate} onChange={(e) => update({ rate: Number(e.target.value) })} />
        </label>
        <label className="row gap small">
          <input type="checkbox" checked={s.loop} onChange={(e) => update({ loop: e.target.checked })} /> {t("pl.loop")}
        </label>
      </div>
      <p className="muted small">{t("pl.backgroundNote")}</p>
    </section>
  );
}
