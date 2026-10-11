import { useState } from "react";
import { speechScore } from "../core/similarity";
import { useT } from "../i18n";
import { isSilent, record, transcribe } from "../storage/speech";

/** «Скажи слово»: запись → распознавание на устройстве → оценка похожести. */
export function PronounceButton({ text, lang, seconds = 3 }: { text: string; lang: string; seconds?: number }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "rec" | "load" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [heard, setHeard] = useState("");
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");

  const go = async () => {
    setError("");
    try {
      setState("rec");
      const audio = await record(seconds);
      if (isSilent(audio)) {
        setError(t("speak.silence"));
        setState("error");
        return;
      }
      setState("load");
      const h = await transcribe(audio, lang, setProgress);
      setHeard(h);
      setScore(speechScore(h, text));
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const pct = Math.round(score * 100);
  return (
    <span className="pronounce">
      <button className={`btn small ${state === "rec" ? "recording" : ""}`} onClick={go} disabled={state === "rec" || state === "load"}>
        🎤 {state === "rec" ? t("speak.listening") : state === "load" ? t("speak.thinking", { n: Math.round(progress * 100) }) : t("speak.say")}
      </button>
      {state === "done" && (
        <span className={`small ${pct >= 80 ? "ok-text" : pct >= 50 ? "warn-text" : "error-text"}`}>
          {t("speak.heard", { text: heard || "…", n: pct })}
        </span>
      )}
      {state === "error" && <span className="error-text small">{error}</span>}
    </span>
  );
}
