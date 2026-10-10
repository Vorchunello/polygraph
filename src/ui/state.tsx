import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_AI, type AiConfig } from "../ai/config";
import { DEFAULT_TRANSLATOR, type TranslatorConfig } from "../ai/translate";
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
  action?: { label: string; run(): void };
}

/** Настройки устройства: вид и поведение. В хранилище не попадают. */
export interface Prefs {
  theme: "system" | "light" | "dark";
  scale: number;
  newPerDay: number;
  autoplay: boolean;
}

export const DEFAULT_PREFS: Prefs = { theme: "system", scale: 1, newPerDay: 10, autoplay: true };

interface AppState {
  repo: Repo;
  profile: Profile;
  saveProfile(p: Profile): Promise<void>;
  target: LangCode;
  setTarget(code: LangCode): void;
  concepts: Concept[];
  saveConcept(c: Concept): Promise<void>;
  addConcepts(cs: Concept[]): Promise<void>;
  /** Удаляет слово и показывает уведомление с «Отменить». */
  deleteConcept(id: string, undoLabel?: string): Promise<void>;
  newId(seed: string): string;
  inbox: string[];
  setInbox(items: string[]): Promise<void>;
  addToInbox(items: string[]): Promise<void>;
  routes: Route[];
  routesText: string;
  saveRoutes(text: string): Promise<void>;
  ai: AiConfig;
  setAi(c: AiConfig): void;
  translator: TranslatorConfig;
  setTranslator(c: TranslatorConfig): void;
  prefs: Prefs;
  setPrefs(p: Prefs): void;
  /** Снимок экрана с горячей клавиши — ждёт распознавания. */
  screenshot: string | null;
  setScreenshot(img: string | null): void;
  toast(text: string, kind?: Toast["kind"], action?: Toast["action"]): void;
  dismissToast(id: number): void;
  toasts: Toast[];
  reload(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useApp outside AppProvider");
  return s;
}

/** Тема и масштаб применяются к <html>, поэтому их видят и модальные окна. */
export function applyPrefs(p: Prefs) {
  const root = document.documentElement;
  if (p.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.style.fontSize = `${Math.round(p.scale * 100)}%`;
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
  const [translator, setTranslatorState] = useState<TranslatorConfig>(DEFAULT_TRANSLATOR);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [screenshot, setScreenshot] = useState<string | null>(null);
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
    getSetting<TranslatorConfig>("polygraph.translator", DEFAULT_TRANSLATOR).then((t) => setTranslatorState({ ...DEFAULT_TRANSLATOR, ...t }));
    getSetting<Prefs>("polygraph.prefs", DEFAULT_PREFS).then((p) => {
      const merged = { ...DEFAULT_PREFS, ...p };
      setPrefsState(merged);
      applyPrefs(merged);
    });
  }, [reload]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok", action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, kind, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === "error" ? 7000 : action ? 6000 : 3000);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const addToInbox = useCallback(
    async (items: string[]) => {
      const clean = items.map((s) => s.trim()).filter(Boolean);
      if (!clean.length) return;
      const current = await repo.loadInbox();
      const next = [...current, ...clean.filter((x) => !current.includes(x))];
      setInboxState(next);
      await repo.saveInbox(next);
    },
    [repo],
  );

  // ПК: бегущая строка в своём окне поменяла слова или инбокс — перечитываем.
  useEffect(() => {
    const off = window.polygraph?.onVaultChanged((path) => {
      if (path.startsWith("words/") || path === "inbox.md") reload();
    });
    return off;
  }, [reload]);

  // ПК: горячие клавиши из любой программы.
  useEffect(() => {
    const off = window.polygraph?.onCapture((d) => {
      if (d.kind === "clipboard") addToInbox([d.text]);
      else setScreenshot(d.image);
    });
    return off;
  }, [addToInbox]);

  // Android: текст из «Поделиться» — в инбокс; «не знаю» с полоски поверх
  // приложений — слово на повторение сегодня.
  useEffect(() => {
    if (platform() !== "android") return;
    const intake = async () => {
      const shared = (await Native.takeSharedText().catch(() => ({ text: null }))).text;
      if (shared?.trim()) await addToInbox([shared]);
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
  }, [repo, reload, addToInbox, profile.target, profile.learning]);

  useEffect(() => {
    repo.loadRoutes(profile, target).then(({ routes, text }) => {
      setRoutes(routes);
      setRoutesText(text);
    });
  }, [repo, profile, target]);

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
      async deleteConcept(id, undoLabel) {
        const removed = concepts.find((c) => c.id === id);
        await repo.deleteConcept(id);
        ids.current.delete(id);
        setConcepts((cs) => cs.filter((c) => c.id !== id));
        if (removed && undoLabel) {
          toast(`✕ ${Object.values(removed.terms)[0]?.text ?? id}`, "ok", {
            label: undoLabel,
            run: async () => {
              await repo.saveConcept(removed);
              ids.current.add(removed.id);
              setConcepts((cs) => [removed, ...cs]);
            },
          });
        }
      },
      newId: (seed) => repo.newId(seed, ids.current),
      inbox,
      async setInbox(items) {
        setInboxState(items);
        await repo.saveInbox(items);
      },
      addToInbox,
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
      translator,
      setTranslator(c) {
        setTranslatorState(c);
        setSetting("polygraph.translator", c);
      },
      prefs,
      setPrefs(p) {
        setPrefsState(p);
        applyPrefs(p);
        setSetting("polygraph.prefs", p);
      },
      screenshot,
      setScreenshot,
      toast,
      dismissToast,
      toasts,
      reload,
    }),
    [repo, profile, target, concepts, inbox, addToInbox, routes, routesText, ai, translator, prefs, screenshot, toast, dismissToast, toasts, reload, onProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
