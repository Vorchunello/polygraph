import { useEffect, useMemo, useState } from "react";
import { langName } from "./core/languages";
import type { Profile } from "./core/types";
import { detectUiLang, I18nContext, makeT, useT } from "./i18n";
import { Repo } from "./storage/repo";
import { openVault } from "./storage/vault";
import { AdaptView } from "./ui/AdaptView";
import { AskView } from "./ui/AskView";
import { BackgroundView } from "./ui/BackgroundView";
import { HomeView } from "./ui/HomeView";
import { InboxView } from "./ui/InboxView";
import { NAV_GROUPS, PRIMARY, type ViewId } from "./ui/nav";
import { NotesView } from "./ui/NotesView";
import { Onboarding } from "./ui/Onboarding";
import { PlaylistsView } from "./ui/PlaylistsView";
import { ReaderView } from "./ui/ReaderView";
import { SettingsView } from "./ui/SettingsView";
import { AppProvider, useApp } from "./ui/state";
import { StudyView } from "./ui/StudyView";
import { TextsView } from "./ui/TextsView";
import { TickerWindow } from "./ui/Ticker";
import { WordsView } from "./ui/WordsView";

export function App() {
  // Окно бегущей строки Electron открывает тот же билд с #ticker.
  if (window.location.hash === "#ticker") return <TickerWindow />;
  return <MainApp />;
}

function MainApp() {
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

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function Shell() {
  const { t, lang } = useT();
  const app = useApp();
  const [view, setView] = useState<ViewId>("home");
  const [more, setMore] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const go = (v: ViewId) => {
    setView(v);
    setMore(false);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };

  const navButton = (id: ViewId, extraClass = "") => {
    const item = ALL_ITEMS.find((i) => i.id === id)!;
    return (
      <button className={`${view === id ? "on" : ""} ${extraClass}`} onClick={() => go(id)}>
        <span className="nav-icon" aria-hidden>
          {item.icon}
        </span>
        <span className="nav-label">{t(item.label)}</span>
        {id === "inbox" && app.inbox.length > 0 && <span className="count">{app.inbox.length}</span>}
      </button>
    );
  };

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
        <div className="nav-groups">
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi} className="nav-group">
              {g.label && <div className="nav-group-label">{t(g.label)}</div>}
              <ul className="nav">
                {g.items.map((i) => (
                  <li key={i.id}>{navButton(i.id)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Телефон: четыре главных раздела и «Ещё». */}
        <ul className="nav nav-mobile">
          {PRIMARY.map((id) => (
            <li key={id}>{navButton(id)}</li>
          ))}
          <li>
            <button className={more || !PRIMARY.includes(view) ? "on" : ""} onClick={() => setMore(!more)}>
              <span className="nav-icon" aria-hidden>
                ☰
              </span>
              <span className="nav-label">{t("nav.more")}</span>
            </button>
          </li>
        </ul>
      </nav>
      <main className="main">
        {view === "home" && <HomeView go={go} />}
        {view === "words" && <WordsView />}
        {view === "study" && <StudyView />}
        {view === "playlists" && <PlaylistsView />}
        {view === "adapt" && <AdaptView />}
        {view === "reader" && <ReaderView />}
        {view === "texts" && <TextsView />}
        {view === "background" && <BackgroundView />}
        {view === "inbox" && <InboxView />}
        {view === "notes" && <NotesView />}
        {view === "ask" && <AskView />}
        {view === "settings" && <SettingsView />}
      </main>
      {more && (
        <div className="more-sheet" onClick={() => setMore(false)}>
          <div className="more-panel" onClick={(e) => e.stopPropagation()}>
            {ALL_ITEMS.filter((i) => !PRIMARY.includes(i.id)).map((i) => (
              <button key={i.id} className={`more-item ${view === i.id ? "on" : ""}`} onClick={() => go(i.id)}>
                <span className="nav-icon">{i.icon}</span>
                {t(i.label)}
              </button>
            ))}
          </div>
        </div>
      )}
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
