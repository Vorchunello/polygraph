import { useEffect, useMemo, useRef, useState } from "react";
import { rsvpDelay, rsvpTokens } from "../../core/readingModes";
import { useT } from "../../i18n";

/**
 * Скорочтение: слова показываются по одному в одной точке, глазу не нужно
 * бегать по строке. Буква, на которой фокусируется взгляд, выделена.
 */
export function Rsvp({ text, lang, onClose }: { text: string; lang: string; onClose(): void }) {
  const { t } = useT();
  const tokens = useMemo(() => rsvpTokens(text), [text]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [wpm, setWpm] = useState(() => Number(localStorage.getItem("polygraph.wpm")) || 250);
  const timer = useRef<number>();

  useEffect(() => {
    if (!playing || i >= tokens.length) return;
    timer.current = window.setTimeout(() => setI((x) => x + 1), rsvpDelay(tokens[i], wpm));
    return () => clearTimeout(timer.current);
  }, [i, playing, wpm, tokens]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 10));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tok = tokens[Math.min(i, tokens.length - 1)];
  const letters = tok ? [...tok.word] : [];

  return (
    <div className="rsvp" role="dialog">
      <div className="rsvp-word" lang={lang}>
        {i >= tokens.length ? (
          <span className="muted">{t("rsvp.done")}</span>
        ) : (
          <>
            <span className="rsvp-left">{letters.slice(0, tok.pivot).join("")}</span>
            <span className="rsvp-pivot">{letters[tok.pivot]}</span>
            <span className="rsvp-right">{letters.slice(tok.pivot + 1).join("")}</span>
          </>
        )}
      </div>
      <progress value={i} max={tokens.length} className="rsvp-progress" />
      <div className="row gap wrap center-row">
        <button className="btn" onClick={() => setI((x) => Math.max(0, x - 10))}>
          ⟲ 10
        </button>
        <button className="btn primary" onClick={() => (i >= tokens.length ? (setI(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing && i < tokens.length ? "⏸" : "▶"}
        </button>
        <label className="row gap small">
          {t("rsvp.speed", { n: wpm })}
          <input
            type="range"
            min={100}
            max={700}
            step={25}
            value={wpm}
            onChange={(e) => {
              setWpm(Number(e.target.value));
              try {
                localStorage.setItem("polygraph.wpm", e.target.value);
              } catch {
                /* без запоминания */
              }
            }}
          />
        </label>
        <button className="btn" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      <p className="muted small">{t("rsvp.keys")}</p>
    </div>
  );
}
