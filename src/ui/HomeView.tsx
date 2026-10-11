import { useMemo, useState } from "react";
import { presetById } from "../ai/config";
import { today } from "../core/dates";
import { langName } from "../core/languages";
import { isDue, isNew, studyStreak } from "../core/srs";
import { useT } from "../i18n";
import { FocusTimer } from "./FocusTimer";
import type { ViewId } from "./nav";
import { useApp } from "./state";

export function HomeView({ go }: { go(v: ViewId): void }) {
  const { t, lang } = useT();
  const app = useApp();
  const { profile, target, concepts } = app;
  const [editing, setEditing] = useState(!profile.goal);
  const [goal, setGoal] = useState(profile.goal ?? "");
  const [capture, setCapture] = useState("");

  const stats = useMemo(() => {
    const now = today();
    const mine = concepts.filter((c) => c.terms[target]);
    return {
      total: mine.length,
      due: mine.filter((c) => isDue(c, target, now)).length,
      fresh: mine.filter((c) => isNew(c, target)).length,
      traps: mine.filter((c) => c.bridges.some((b) => b.strength === "broken")).length,
    };
  }, [concepts, target]);

  const preset = presetById(app.ai.preset);
  const streak = useMemo(() => studyStreak(concepts), [concepts]);

  return (
    <section className="view narrow">
      <div className="goal-card">
        <div className="goal-label">{t("home.goal")}</div>
        {editing ? (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              await app.saveProfile({ ...profile, goal: goal.trim() || undefined });
              setEditing(false);
            }}
          >
            <textarea className="input" rows={2} autoFocus value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t("home.goalPlaceholder")} />
            <p className="muted small">{t("home.goalHint")}</p>
            <div className="row gap end">
              {profile.goal && (
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </button>
              )}
              <button className="btn primary">{t("common.save")}</button>
            </div>
          </form>
        ) : (
          <button className="goal-text" onClick={() => setEditing(true)} title={t("common.edit")}>
            {profile.goal}
          </button>
        )}
      </div>

      <div className="row gap between wrap">
        <h1>{langName(target, lang)}</h1>
        <span className={`streak ${streak.today ? "on" : ""}`} title={streak.today ? t("home.streakToday") : t("home.streakKeep")}>
          🔥 {t("home.streak", { n: streak.days })}
        </span>
      </div>
      <div className="stat-row">
        <button className="stat" onClick={() => go("study")}>
          <span className="stat-num">{stats.due}</span>
          <span className="stat-label">{t("home.due")}</span>
        </button>
        <button className="stat" onClick={() => go("study")}>
          <span className="stat-num">{stats.fresh}</span>
          <span className="stat-label">{t("home.new")}</span>
        </button>
        <button className="stat" onClick={() => go("words")}>
          <span className="stat-num">{stats.total}</span>
          <span className="stat-label">{t("home.words")}</span>
        </button>
        <button className="stat" onClick={() => go("words")}>
          <span className="stat-num">{stats.traps}</span>
          <span className="stat-label">{t("home.traps")}</span>
        </button>
      </div>

      <FocusTimer />

      <form
        className="row gap capture"
        onSubmit={(e) => {
          e.preventDefault();
          if (!capture.trim()) return;
          app.setInbox([...app.inbox, capture.trim()]);
          setCapture("");
          app.toast(t("home.captured"));
        }}
      >
        <input className="input grow" value={capture} onChange={(e) => setCapture(e.target.value)} placeholder={t("inbox.placeholder")} />
        <button className="btn">{t("nav.inbox")} +</button>
      </form>

      <div className="quick-grid">
        {(
          [
            ["study", "◉", "home.qStudy"],
            ["playlists", "♫", "home.qPlaylists"],
            ["reader", "❏", "home.qReader"],
            ["adapt", "⇄", "home.qAdapt"],
            ["background", "≋", "home.qBackground"],
            ["notes", "✦", "home.qNotes"],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className="quick" onClick={() => go(id)}>
            <span className="quick-icon">{icon}</span>
            <span>{t(label)}</span>
          </button>
        ))}
      </div>

      {preset.free === "nokey" && (
        <p className="notice small">
          {t("home.aiTip")}{" "}
          <button className="btn-link" onClick={() => go("settings")}>
            {t("nav.settings")} →
          </button>
        </p>
      )}
      <p className="muted small">
        {t("home.ai", { name: preset.label })}
        {preset.free === "nokey" && ` · ${t("set.freeNoKey")}`}
      </p>
    </section>
  );
}
