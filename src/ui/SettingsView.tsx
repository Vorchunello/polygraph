import { useEffect, useState } from "react";
import { complete, listModels } from "../ai/client";
import { configFromPreset, presetById, PRESETS } from "../ai/config";
import { conceptsFromAnki, conceptsFromCsv, conceptsToAnki, conceptsToCsv } from "../core/exchange";
import { langName } from "../core/languages";
import { parseConcept, serializeConcept } from "../core/markdown";
import { parseRoutes } from "../core/routes";
import { LOCALES, useT } from "../i18n";
import { platform } from "../storage/platform";
import { exportFile, LanguagePicker, pickTextFile, useAsync } from "./common";
import { useApp } from "./state";

type Tab = "profile" | "routes" | "ai" | "data" | "about";

declare const __APP_VERSION__: string;

export function SettingsView() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("profile");
  const tabs: Tab[] = ["profile", "routes", "ai", "data", "about"];
  return (
    <section className="view narrow">
      <h1>{t("nav.settings")}</h1>
      <div className="segmented wide">
        {tabs.map((x) => (
          <button key={x} className={tab === x ? "on" : ""} onClick={() => setTab(x)}>
            {t(`set.${x}`)}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileSettings />}
      {tab === "routes" && <RoutesSettings />}
      {tab === "ai" && <AiSettings />}
      {tab === "data" && <DataSettings />}
      {tab === "about" && <About />}
    </section>
  );
}

function ProfileSettings() {
  const { t, lang } = useT();
  const app = useApp();
  const p = app.profile;
  const save = (patch: Partial<typeof p>) => app.saveProfile({ ...p, ...patch });
  return (
    <div className="stack">
      <label className="field">
        <span>{t("onb.uiLang")}</span>
        <select className="input" value={p.uiLang} onChange={(e) => save({ uiLang: e.target.value })}>
          {Object.keys(LOCALES).map((code) => (
            <option key={code} value={code}>
              {langName(code, code)}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>{t("set.known")}</span>
        <LanguagePicker value={p.known} onChange={(known) => known.length && save({ known })} uiLang={lang} defaultLevel="B1" />
      </div>
      <div className="field">
        <span>{t("set.learning")}</span>
        <LanguagePicker value={p.learning} onChange={(learning) => learning.length && save({ learning })} uiLang={lang} defaultLevel="A1" />
      </div>
    </div>
  );
}

function RoutesSettings() {
  const { t, lang } = useT();
  const app = useApp();
  const [text, setText] = useState(app.routesText);
  useEffect(() => setText(app.routesText), [app.routesText]);
  const parsed = parseRoutes(text);
  return (
    <div className="stack">
      <p className="muted">{t("set.routesHint", { lang: langName(app.target, lang) })}</p>
      <textarea className="input mono" rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="row between">
        <span className="muted small">{t("set.routesParsed", { n: parsed.length })}</span>
        <button
          className="btn primary"
          disabled={text === app.routesText}
          onClick={async () => {
            await app.saveRoutes(text);
            app.toast(t("common.saved"));
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

function AiSettings() {
  const { t } = useT();
  const app = useApp();
  const cfg = app.ai;
  const preset = presetById(cfg.preset);
  const [models, setModels] = useState<string[]>(preset.models ?? []);
  const [status, setStatus] = useState("");
  const job = useAsync();

  useEffect(() => setModels(presetById(cfg.preset).models ?? []), [cfg.preset]);

  const set = (patch: Partial<typeof cfg>) => app.setAi({ ...cfg, ...patch });

  return (
    <div className="stack">
      <label className="field">
        <span>{t("set.provider")}</span>
        <select className="input" value={cfg.preset} onChange={(e) => app.setAi(configFromPreset(presetById(e.target.value), cfg))}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.local ? " · local" : ""}
            </option>
          ))}
        </select>
      </label>
      {preset.local && <p className="notice small">{platform() === "android" ? t("set.lanHint") : t("set.localHint")}</p>}
      <label className="field">
        <span>{t("set.baseUrl")}</span>
        <input className="input mono" value={cfg.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} placeholder="http://localhost:1234/v1" />
      </label>
      {(preset.needsKey || cfg.preset === "custom") && (
        <label className="field">
          <span>
            {t("set.apiKey")}{" "}
            {preset.keyUrl && (
              <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="small">
                {t("set.getKey")} ↗
              </a>
            )}
          </span>
          <input className="input mono" type="password" autoComplete="off" value={cfg.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })} />
          <small className="muted">{t("set.apiKeyHint")}</small>
        </label>
      )}
      <label className="field">
        <span>{t("set.model")}</span>
        <div className="row gap">
          <input className="input grow mono" list="models" value={cfg.model} onChange={(e) => set({ model: e.target.value.trim() })} />
          <datalist id="models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            className="btn"
            disabled={job.busy}
            onClick={() =>
              job.run(async () => {
                const list = await listModels(cfg);
                setModels(list);
                if (!cfg.model && list[0]) set({ model: list[0] });
              })
            }
          >
            {t("set.loadModels")}
          </button>
        </div>
      </label>
      <div className="row gap end">
        <button
          className="btn primary"
          disabled={job.busy || !cfg.model}
          onClick={() =>
            job.run(async () => {
              setStatus("");
              const reply = await complete(cfg, { system: "Reply with one short word.", prompt: "Say hello in Spanish.", maxTokens: 400 });
              setStatus(t("set.testOk", { reply: reply.slice(0, 80) }));
            })
          }
        >
          {job.busy ? t("common.loading") : t("set.test")}
        </button>
      </div>
      {status && <p className="ok-text">{status}</p>}
      {job.error && <p className="error">{job.error}</p>}
    </div>
  );
}

function DataSettings() {
  const { t } = useT();
  const app = useApp();
  const [location, setLocation] = useState("");
  const known = app.profile.known.map((k) => k.code);
  const langs = [app.target, ...known.filter((c) => c !== app.target)];
  const bridge = window.polygraph;
  const job = useAsync();

  useEffect(() => {
    app.repo.vault.location().then(setLocation);
  }, [app.repo]);

  const importWith = (accept: string, parse: (src: string) => ReturnType<typeof conceptsFromCsv>) =>
    job.run(async () => {
      const src = await pickTextFile(accept);
      if (!src) return;
      const list = parse(src);
      await app.addConcepts(list);
      app.toast(t("set.imported", { n: list.length }));
    });

  const exportWith = (name: string, content: string, mime: string) =>
    job.run(async () => {
      const path = await exportFile(app.repo.vault, name, content, mime);
      app.toast(t("set.exported", { path }));
    });

  const stamp = new Date().toISOString().slice(0, 10);
  const words = app.concepts;

  return (
    <div className="stack">
      <div className="field">
        <span>{t("set.vault")}</span>
        <code className="path">{location}</code>
        <small className="muted">{t("set.vaultHint")}</small>
        {bridge && (
          <div className="row gap">
            <button
              className="btn"
              onClick={async () => {
                // Новая папка — новые данные: проще всего перечитать всё с нуля.
                if (await bridge.vault.choose()) window.location.reload();
              }}
            >
              {t("set.chooseFolder")}
            </button>
            <button className="btn" onClick={() => bridge.vault.reveal()}>
              {t("set.openFolder")}
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <span>{t("set.import")}</span>
        <div className="row gap wrap">
          <button className="btn" onClick={() => importWith(".csv,.tsv,.txt", (src) => conceptsFromCsv(src, app.newId))}>
            {t("set.importCsv")}
          </button>
          <button className="btn" onClick={() => importWith(".txt,.tsv", (src) => conceptsFromAnki(src, app.target, known[0] ?? "en", app.newId))}>
            {t("set.importAnki")}
          </button>
          <button
            className="btn"
            onClick={() =>
              importWith(".json", (src) => {
                const files = JSON.parse(src) as Record<string, string>;
                return Object.entries(files)
                  .filter(([p]) => p.startsWith("words/"))
                  .map(([p, body]) => parseConcept(body, p.slice(6, -3)))
                  .filter((c) => !app.concepts.some((x) => x.id === c.id));
              })
            }
          >
            {t("set.restore")}
          </button>
        </div>
      </div>

      <div className="field">
        <span>{t("set.export")}</span>
        <div className="row gap wrap">
          <button className="btn" onClick={() => exportWith(`polygraph-${stamp}.csv`, conceptsToCsv(words, langs), "text/csv")}>
            {t("set.exportCsv")}
          </button>
          <button className="btn" onClick={() => exportWith(`polygraph-${app.target}-anki-${stamp}.txt`, conceptsToAnki(words, app.target, known), "text/plain")}>
            {t("set.exportAnki")}
          </button>
          <button
            className="btn"
            onClick={() => {
              const files: Record<string, string> = {};
              for (const c of words) files[`words/${c.id}.md`] = serializeConcept(c);
              exportWith(`polygraph-backup-${stamp}.json`, JSON.stringify(files, null, 1), "application/json");
            }}
          >
            {t("set.backup")}
          </button>
        </div>
      </div>
      {job.error && <p className="error">{job.error}</p>}
    </div>
  );
}

function About() {
  const { t } = useT();
  return (
    <div className="stack">
      <p>
        <strong>Polygraph</strong> — {t("app.tagline")}
      </p>
      <p className="muted">{t("set.version", { v: __APP_VERSION__ })}</p>
      <p>
        <a href="https://github.com/Vorchunello/polygraph" target="_blank" rel="noreferrer">
          {t("set.source")} ↗
        </a>
      </p>
    </div>
  );
}
