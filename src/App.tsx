import { useEffect, useMemo, useState } from "react";
import { langName } from "./core/languages";
import type { Profile } from "./core/types";
import { detectUiLang, I18nContext, makeT, useT } from "./i18n";
import type { MessageKey } from "./i18n/en";
import { Repo } from "./storage/repo";
import { openVault } from "./storage/vault";
import { AskView } from "./ui/AskView";
import { InboxView } from "./ui/InboxView";
import { Onboarding } from "./ui/Onboarding";
import { SettingsView } from "./ui/SettingsView";
import { AppProvider, useApp } from "./ui/state";
import { StudyView } from "./ui/StudyView";
import { TextsView } from "./ui/TextsView";
import { WordsView } from "./ui/WordsView";

type ViewId = "words" | "study" | "inbox" | "ask" | "texts" | "settings";

const NAV: { id: ViewId; icon: string; label: MessageKey }[] = [
  { id: "words", icon: "▦", label: "nav.words" },
  { id: "study", icon: "◉", label: "nav.study" },
  { id: "inbox", icon: "✎", label: "nav.inbox" },
  { id: "ask", icon: "?", label: "nav.ask" },
  { id: "texts", icon: "¶", label: "nav.texts" },
  { id: "settings", icon: "⚙", label: "nav.settings" },
];

export function App() {
  const repo = useMemo(() => new Repo(openVault()), []);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    repo.loadProfile().then(setProfile, () => setProfile(null));
  }, [repo]);

  if (profile === undefined) return <div className="splash">Polygraph</div>;

  if (!profile)
    return (
      <Onboarding
        initialUi={detectUiLang()}
        onDone={async (p) => {
          await repo.saveProfile(p);
          setProfile(p);
        }}
      />
    );

  return (
    <I18nContext.Provider value={{ t: makeT(profile.uiLang), lang: profile.uiLang }}>
      <AppProvider repo={repo} profile={profile} onProfile={setProfile}>
        <Shell />
      </AppProvider>
    </I18nContext.Provider>
  );
}

function Shell() {
  const { t, lang } = useT();
  const app = useApp();
  const [view, setView] = useState<ViewId>("words");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo">P</span>
          <span className="brand-name">Polygraph</span>
        </div>
        {app.profile.learning.length > 0 && (
          <label className="target-pick">
            <select value={app.target} onChange={(e) => app.setTarget(e.target.value)} aria-label="target">
              {app.profile.learning.map((l) => (
                <option key={l.code} value={l.code}>
                  {langName(l.code, lang)} · {l.level}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="nav">
          {NAV.map((n) => (
            <li key={n.id}>
              <button className={view === n.id ? "on" : ""} onClick={() => setView(n.id)}>
                <span className="nav-icon" aria-hidden>
                  {n.icon}
                </span>
                <span className="nav-label">{t(n.label)}</span>
                {n.id === "inbox" && app.inbox.length > 0 && <span className="count">{app.inbox.length}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="main">
        {view === "words" && <WordsView />}
        {view === "study" && <StudyView />}
        {view === "inbox" && <InboxView />}
        {view === "ask" && <AskView />}
        {view === "texts" && <TextsView />}
        {view === "settings" && <SettingsView />}
      </main>
      <div className="toasts" aria-live="polite">
        {app.toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>
    </div>
  );
}
