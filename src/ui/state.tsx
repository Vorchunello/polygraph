import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_AI, type AiConfig } from "../ai/config";
import type { Concept, LangCode, Profile, Route } from "../core/types";
import { Repo } from "../storage/repo";
import { getSetting, setSetting } from "../storage/settings";
import { Native } from "../storage/native";
import { platform } from "../storage/platform";
import { today } from "../core/dates";

/** «Не знаю» в фоне: слово встаёт на повторение сегодня, интервал не растёт. */
export function markUnknown(c: Concept, lang?: LangCode): Concept {
  if (!lang || !c.terms[lang]) return c;
  const s = c.srs[lang];
  return { ...c, srs: { ...c.srs, [lang]: s ? { ...s, due: today() } : { due: today(), interval: 0, ease: 2.5, reps: 0, lapses: 0 } } };
}

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

interface AppState {
  repo: Repo;
  profile: Profile;
  saveProfile(p: Profile): Promise<void>;
  target: LangCode;
  setTarget(code: LangCode): void;
  concepts: Concept[];
  saveConcept(c: Concept): Promise<void>;
  addConcepts(cs: Concept[]): Promise<void>;
  deleteConcept(id: string): Promise<void>;
  newId(seed: string): string;
  inbox: string[];
  setInbox(items: string[]): Promise<void>;
  routes: Route[];
  routesText: string;
  saveRoutes(text: string): Promise<void>;
  ai: AiConfig;
  setAi(c: AiConfig): void;
  toast(text: string, kind?: Toast["kind"]): void;
  toasts: Toast[];
  reload(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useApp outside AppProvider");
  return s;
}

export function AppProvider({
  repo,
  profile: initialProfile,
  onProfile,
  children,
}: {
  repo: Repo;
  profile: Profile;
  onProfile(p: Profile): void;
  children: ReactNode;
}) {
  const [profile, setProfileState] = useState(initialProfile);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [inbox, setInboxState] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesText, setRoutesText] = useState("");
  const [ai, setAiState] = useState<AiConfig>(DEFAULT_AI);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ids = useRef(new Set<string>());

  const target = profile.target && profile.learning.some((l) => l.code === profile.target) ? profile.target : profile.learning[0]?.code ?? "en";

  const reload = useCallback(async () => {
    const cs = await repo.loadConcepts();
    ids.current = new Set(cs.map((c) => c.id));
    setConcepts(cs);
    setInboxState(await repo.loadInbox());
  }, [repo]);

  useEffect(() => {
    reload();
    getSetting<AiConfig>("polygraph.ai", DEFAULT_AI).then(setAiState);
  }, [reload]);

  // ПК: бегущая строка в своём окне поменяла слова или инбокс — перечитываем.
  useEffect(() => {
    const off = window.polygraph?.onVaultChanged((path) => {
      if (path.startsWith("words/") || path === "inbox.md") reload();
    });
    return off;
  }, [reload]);

  // Android: текст из «Поделиться» — в инбокс; «не знаю» с полоски поверх
  // приложений — слово на повторение сегодня.
  useEffect(() => {
    if (platform() !== "android") return;
    const intake = async () => {
      const shared = (await Native.takeSharedText().catch(() => ({ text: null }))).text;
      if (shared?.trim()) {
        const items = await repo.loadInbox();
        await repo.saveInbox([...items, shared.trim()]);
      }
      const { unknown } = await Native.takeOverlayResults().catch(() => ({ unknown: [] as string[] }));
      if (unknown.length) {
        const cs = await repo.loadConcepts();
        for (const c of cs.filter((x) => unknown.includes(x.id))) await repo.saveConcept(markUnknown(c, profile.target ?? profile.learning[0]?.code));
      }
      if (shared?.trim() || unknown.length) reload();
    };
    intake();
    const sub = Native.addListener("sharedText", intake);
    const onVisible = () => document.visibilityState === "visible" && intake();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sub.then((h) => h.remove());
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [repo, reload, profile.target, profile.learning]);

  useEffect(() => {
    repo.loadRoutes(profile, target).then(({ routes, text }) => {
      setRoutes(routes);
      setRoutesText(text);
    });
  }, [repo, profile, target]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3000);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      repo,
      profile,
      async saveProfile(p) {
        await repo.saveProfile(p);
        setProfileState(p);
        onProfile(p);
      },
      target,
      setTarget(code) {
        const p = { ...profile, target: code };
        repo.saveProfile(p);
        setProfileState(p);
        onProfile(p);
      },
      concepts,
      async saveConcept(c) {
        await repo.saveConcept(c);
        ids.current.add(c.id);
        setConcepts((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [c, ...cs]));
      },
      async addConcepts(list) {
        for (const c of list) await repo.saveConcept(c);
        setConcepts((cs) => [...list, ...cs]);
      },
      async deleteConcept(id) {
        await repo.deleteConcept(id);
        ids.current.delete(id);
        setConcepts((cs) => cs.filter((c) => c.id !== id));
      },
      newId: (seed) => repo.newId(seed, ids.current),
      inbox,
      async setInbox(items) {
        setInboxState(items);
        await repo.saveInbox(items);
      },
      routes,
      routesText,
      async saveRoutes(text) {
        setRoutesText(text);
        setRoutes(await repo.saveRoutesText(target, text));
      },
      ai,
      setAi(c) {
        setAiState(c);
        setSetting("polygraph.ai", c);
      },
      toast,
      toasts,
      reload,
    }),
    [repo, profile, target, concepts, inbox, routes, routesText, ai, toast, toasts, reload, onProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
