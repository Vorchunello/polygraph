import { useEffect, useState } from "react";
import { langName, LANGUAGES } from "../core/languages";
import { useT } from "../i18n";
import { platform } from "../storage/platform";
import { DICTS_PAGE, dictCatalog, installDict, installDictFile, installedDicts, removeDict, type DictInfo } from "../storage/dictionary";
import { pickBinaryFile, useAsync } from "./common";
import { useApp } from "./state";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * Офлайн-словари: скачать один раз — и значения, начальные формы, род,
 * произношение и этимология доступны без интернета (читалка, карточки, отбор слов).
 */
export function OfflineSettings() {
  const { t, lang: ui } = useT();
  const app = useApp();
  const [installed, setInstalled] = useState<DictInfo[]>([]);
  const [catalog, setCatalog] = useState<Record<string, DictInfo> | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [busy, setBusy] = useState<{ lang: string; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const job = useAsync();

  const refresh = () => installedDicts().then(setInstalled, () => setInstalled([]));
  useEffect(() => {
    refresh();
    dictCatalog().then(setCatalog, () => setCatalogError(true));
  }, []);

  const mine = [...new Set([...app.profile.learning.map((l) => l.code), ...app.profile.known.map((k) => k.code)])];
  const available = catalog ? Object.keys(catalog) : [];
  const others = LANGUAGES.map((l) => l.code).filter((c) => !mine.includes(c) && (available.includes(c) || installed.some((d) => d.lang === c)));
  const rows = showAll ? [...mine, ...others] : mine;

  const progressText = (stage: "download" | "install", p: number) =>
    `${stage === "download" ? t("offline.downloading") : t("offline.installing")} ${Math.round(p * 100)}%`;

  const install = (code: string) =>
    job.run(async () => {
      setBusy({ lang: code, text: t("offline.downloading") });
      try {
        await installDict(code, (stage, p) => setBusy({ lang: code, text: progressText(stage, p) }));
        await refresh();
        app.toast(t("offline.installed", { lang: langName(code, ui) }));
      } finally {
        setBusy(null);
      }
    });

  const fromFile = () =>
    job.run(async () => {
      const f = await pickBinaryFile(".gz");
      if (!f) return;
      setBusy({ lang: "file", text: t("offline.installing") });
      try {
        const info = await installDictFile(f.bytes, (p) => setBusy({ lang: "file", text: progressText("install", p) }));
        await refresh();
        app.toast(t("offline.installed", { lang: langName(info.lang, ui) }));
      } finally {
        setBusy(null);
      }
    });

  const remove = async (code: string) => {
    if (!confirm(t("offline.confirmRemove", { lang: langName(code, ui) }))) return;
    await removeDict(code);
    await refresh();
  };

  const total = installed.reduce((s, d) => s + d.size, 0);

  return (
    <div className="stack">
      <p className="muted">{t("offline.hint")}</p>
      {platform() === "web" ? (
        <p className="notice small">
          {t("offline.web")}{" "}
          <a href={DICTS_PAGE} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </p>
      ) : (
        catalogError && <p className="notice small">{t("offline.noCatalog")}</p>
      )}
      <ul className="list offline-list">
        {rows.map((code) => {
          const have = installed.find((d) => d.lang === code);
          const remote = catalog?.[code];
          const update = have && remote && remote.built > have.built;
          const status = have
            ? t("offline.have", { n: have.entries.toLocaleString(ui), size: mb(have.size), date: have.built })
            : remote
              ? t("offline.available", { n: remote.entries.toLocaleString(ui), size: mb(remote.size) })
              : catalog
                ? t("offline.missing")
                : "";
          return (
            <li key={code} className="row gap">
              <span className="grow">
                <strong>{langName(code, ui)}</strong>
                {status && <span className="muted small"> · {status}</span>}
                {busy?.lang === code && <span className="small"> · {busy.text}</span>}
              </span>
              {(!have || update) && remote && (
                <button className="btn small primary" disabled={!!busy} onClick={() => install(code)}>
                  {update ? t("offline.update") : t("offline.install")}
                </button>
              )}
              {have && (
                <button className="btn small" disabled={!!busy} onClick={() => remove(code)}>
                  {t("common.delete")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="row gap wrap between">
        {others.length > 0 && (
          <button className="btn small" onClick={() => setShowAll(!showAll)}>
            {showAll ? t("offline.mine") : t("offline.all", { n: others.length })}
          </button>
        )}
        <button className="btn small" disabled={!!busy} onClick={fromFile}>
          📄 {t("offline.fromFile")}
        </button>
      </div>
      {busy?.lang === "file" && <p className="small">{busy.text}</p>}
      {installed.length > 0 && <p className="muted small">{t("offline.total", { size: mb(total) })}</p>}
      {job.error && <p className="error">{job.error}</p>}
      <p className="muted small">
        {t("offline.license")}{" "}
        <a href="https://kaikki.org/" target="_blank" rel="noreferrer">
          kaikki.org ↗
        </a>
      </p>
    </div>
  );
}
