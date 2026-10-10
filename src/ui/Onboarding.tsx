import { useState } from "react";
import { langName } from "../core/languages";
import { today } from "../core/dates";
import type { LanguageSkill, Profile } from "../core/types";
import { I18nContext, LOCALES, makeT } from "../i18n";
import { LanguagePicker } from "./common";

export function Onboarding({ initialUi, onDone }: { initialUi: string; onDone(p: Profile): void }) {
  const [step, setStep] = useState(0);
  const [uiLang, setUiLang] = useState(initialUi);
  const [known, setKnown] = useState<LanguageSkill[]>([{ code: uiLang, level: "native" }]);
  const [learning, setLearning] = useState<LanguageSkill[]>([]);
  const t = makeT(uiLang);

  const canNext = step === 0 || (step === 1 && known.length > 0) || (step === 2 && learning.length > 0);

  const finish = () =>
    onDone({
      uiLang,
      known,
      learning,
      target: learning[0]?.code,
      created: today(),
    });

  return (
    <I18nContext.Provider value={{ t, lang: uiLang }}>
      <div className="onboarding">
        <div className="onb-card">
          <div className="brand">
            <span className="logo">P</span> Polygraph
          </div>
          <div className="steps">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`step-dot ${i <= step ? "on" : ""}`} />
            ))}
          </div>

          {step === 0 && (
            <>
              <h1>{t("onb.welcome")}</h1>
              <p className="lead">{t("onb.intro")}</p>
              <label className="field">
                <span>{t("onb.uiLang")}</span>
                <div className="row gap wrap">
                  {Object.keys(LOCALES).map((code) => (
                    <button
                      key={code}
                      className={`chip-btn ${uiLang === code ? "on" : ""}`}
                      onClick={() => {
                        setUiLang(code);
                        if (known.length === 1 && known[0].level === "native") setKnown([{ code, level: "native" }]);
                      }}
                    >
                      {langName(code, code)}
                    </button>
                  ))}
                </div>
              </label>
              <p className="muted small">{t("onb.uiMore")}</p>
            </>
          )}

          {step === 1 && (
            <>
              <h1>{t("onb.known")}</h1>
              <p className="muted">{t("onb.knownHint")}</p>
              <LanguagePicker value={known} onChange={setKnown} uiLang={uiLang} defaultLevel="B1" />
            </>
          )}

          {step === 2 && (
            <>
              <h1>{t("onb.learning")}</h1>
              <p className="muted">{t("onb.learningHint")}</p>
              <LanguagePicker
                value={learning}
                onChange={setLearning}
                exclude={known.filter((k) => k.level === "native").map((k) => k.code)}
                uiLang={uiLang}
                defaultLevel="A1"
              />
            </>
          )}

          <div className="row gap end onb-actions">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                {t("common.back")}
              </button>
            )}
            {!canNext && <span className="muted small">{t("onb.pickOne")}</span>}
            <button className="btn primary" disabled={!canNext} onClick={() => (step < 2 ? setStep(step + 1) : finish())}>
              {step < 2 ? t("common.next") : t("onb.finish")}
            </button>
          </div>
        </div>
      </div>
    </I18nContext.Provider>
  );
}
