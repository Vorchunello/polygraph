import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { recognize } from "../storage/ocr";
import { Modal } from "./common";
import { useApp } from "./state";

/**
 * Распознать текст с картинки и выбрать из него слова для инбокса. Используется
 * для фото страницы, снимка экрана по Ctrl+Alt+O и кнопки в инбоксе.
 */
export function OcrDialog({ image, onClose, onUseText }: { image: Blob | string; onClose(): void; onUseText?(text: string): void }) {
  const { t } = useT();
  const app = useApp();
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const preview = useMemo(() => (typeof image === "string" ? image : URL.createObjectURL(image)), [image]);

  useEffect(() => {
    const langs = [app.target, ...app.profile.known.map((k) => k.code)];
    recognize(image, langs, setProgress).then(setText, (e) => setError((e as Error).message));
    return () => {
      if (typeof image !== "string") URL.revokeObjectURL(preview);
    };
  }, [image, app.target, app.profile.known, preview]);

  const words = useMemo(() => [...new Set(text?.match(/\p{L}[\p{L}\p{M}'’-]+/gu) ?? [])], [text]);

  const toggle = (w: string) => {
    const s = new Set(picked);
    if (s.has(w)) s.delete(w);
    else s.add(w);
    setPicked(s);
  };

  return (
    <Modal title={t("ocr.title")} onClose={onClose} wide>
      <div className="stack">
        <img src={preview} alt="" className="ocr-preview" />
        {text === null && !error && (
          <div className="stack-tight">
            <span className="muted small">{t("ocr.working", { n: Math.round(progress * 100) })}</span>
            <progress value={progress} max={1} />
            <span className="muted small">{t("ocr.firstTime")}</span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {text !== null && (
          <>
            {words.length === 0 ? (
              <p className="muted">{t("ocr.nothing")}</p>
            ) : (
              <>
                <p className="muted small">{t("ocr.pick")}</p>
                <div className="word-checks">
                  {words.map((w) => (
                    <button key={w} className={`word-check ${picked.has(w) ? "on" : ""}`} onClick={() => toggle(w)}>
                      {w}
                    </button>
                  ))}
                </div>
              </>
            )}
            <details>
              <summary className="small muted">{t("ocr.fullText")}</summary>
              <pre className="ocr-text">{text}</pre>
            </details>
            <div className="row gap end wrap">
              {onUseText && text && (
                <button className="btn" onClick={() => onUseText(text)}>
                  {t("ocr.useText")}
                </button>
              )}
              <button
                className="btn primary"
                disabled={!picked.size}
                onClick={async () => {
                  await app.addToInbox([...picked]);
                  app.toast(t("home.captured"));
                  onClose();
                }}
              >
                → {t("nav.inbox")} ({picked.size})
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
