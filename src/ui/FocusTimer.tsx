import { useEffect, useRef, useState } from "react";
import { today } from "../core/dates";
import { useT } from "../i18n";

// Таймер фокуса в духе «Кузницы»: 25 минут работы, 5 отдыха. Считает по
// системным часам, поэтому вкладку можно свернуть. Сколько «помидоров»
// сделано сегодня — хранится на устройстве.

type Phase = "work" | "break";

const KEY = "polygraph.focus";

function loadCount(): number {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return d.day === today() ? Number(d.count) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveCount(n: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: today(), count: n }));
  } catch {
    /* без запоминания */
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.2);
  } catch {
    /* без звука */
  }
}

export function FocusTimer() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>("work");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(25 * 60);
  const [count, setCount] = useState(loadCount);
  const tick = useRef<number>();

  const length = (p: Phase) => (p === "work" ? 25 : 5) * 60;

  useEffect(() => {
    if (!endsAt) return;
    tick.current = window.setInterval(() => {
      const sec = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(sec);
      if (sec === 0) {
        clearInterval(tick.current);
        beep();
        if (phase === "work") {
          const n = count + 1;
          setCount(n);
          saveCount(n);
        }
        const next: Phase = phase === "work" ? "break" : "work";
        setPhase(next);
        setLeft(length(next));
        setEndsAt(null);
      }
    }, 500);
    return () => clearInterval(tick.current);
  }, [endsAt, phase, count]);

  const running = endsAt !== null;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className={`focus-timer ${phase}`}>
      <div className="focus-time">
        {mm}:{ss}
      </div>
      <div className="stack-tight grow">
        <strong>{phase === "work" ? t("focus.work") : t("focus.break")}</strong>
        <span className="muted small">{t("focus.today", { n: count })}</span>
      </div>
      {running ? (
        <button
          className="btn"
          onClick={() => {
            setEndsAt(null);
          }}
        >
          ⏸
        </button>
      ) : (
        <button className="btn primary" onClick={() => setEndsAt(Date.now() + left * 1000)}>
          ▶
        </button>
      )}
      <button
        className="icon-btn"
        title={t("focus.reset")}
        onClick={() => {
          setEndsAt(null);
          setPhase("work");
          setLeft(length("work"));
        }}
      >
        ↺
      </button>
    </div>
  );
}
