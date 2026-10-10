import { useMemo, useState } from "react";
import { langName } from "../core/languages";
import type { Concept } from "../core/types";
import { useT } from "../i18n";
import { LangChip, TermText } from "./common";
import { useApp } from "./state";
import { AddWord, WordDetail } from "./WordDetail";

export function WordsView() {
  const { t, lang } = useT();
  const { concepts, profile, target } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "traps" | "unverified" | "unstudied">("all");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<"table" | "cards">(() => (localStorage.getItem("polygraph.wordsMode") as "cards") || "table");
  const [open, setOpen] = useState<Concept | null>(null);
  const [adding, setAdding] = useState(false);

  const langs = [target, ...profile.known.map((k) => k.code).filter((c) => c !== target)];
  const tags = useMemo(() => [...new Set(concepts.flatMap((c) => c.tags))].sort(), [concepts]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts.filter(
      (c) =>
        c.terms[target] &&
        (!tag || c.tags.includes(tag)) &&
        (filter === "all" ||
          (filter === "traps" && c.bridges.some((b) => b.strength === "broken")) ||
          (filter === "unverified" && (c.bridges.some((b) => !b.verified) || (!!c.etymology && !c.etymologyVerified))) ||
          (filter === "unstudied" && !c.srs[target])) &&
        (!q || Object.values(c.terms).some((x) => x.text.toLowerCase().includes(q)) || c.tags.some((x) => x.includes(q))),
    );
  }, [concepts, query, tag, target, filter]);

  const setView = (m: "table" | "cards") => {
    setMode(m);
    try {
      localStorage.setItem("polygraph.wordsMode", m);
    } catch {
      /* без запоминания */
    }
  };

  const bridgeMark = (c: Concept, code: string) => {
    if (code === target) return null;
    const b = c.bridges.filter((x) => x.from === code);
    if (b.some((x) => x.strength === "broken")) return <span className="mark broken" title={t("words.legendBroken")}>⚠</span>;
    if (b.some((x) => x.strength === "strong")) return <span className="mark strong" title={t("words.legendStrong")}>↔</span>;
    if (b.length) return <span className="mark weak">~</span>;
    return null;
  };

  return (
    <section className="view">
      <header className="view-head">
        <h1>{t("nav.words")}</h1>
        <div className="row gap wrap">
          <input className="input" type="search" placeholder={t("common.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          {tags.length > 0 && (
            <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">{t("words.allTags")}</option>
              {tags.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
          <div className="segmented">
            <button className={mode === "table" ? "on" : ""} onClick={() => setView("table")}>
              {t("words.table")}
            </button>
            <button className={mode === "cards" ? "on" : ""} onClick={() => setView("cards")}>
              {t("words.cards")}
            </button>
          </div>
          <button className="btn primary" onClick={() => setAdding(true)}>
            + {t("words.add")}
          </button>
        </div>
      </header>

      <div className="row gap wrap filter-chips">
        {(["all", "traps", "unverified", "unstudied"] as const).map((f) => (
          <button key={f} className={`chip-btn small-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {t(`words.f.${f}`)}
          </button>
        ))}
      </div>

      <p className="muted small">
        {t("words.count", { n: list.length })} · <span className="mark strong">↔</span> {t("words.legendStrong")} ·{" "}
        <span className="mark broken">⚠</span> {t("words.legendBroken")}
      </p>

      {list.length === 0 && <div className="empty">{t("words.empty")}</div>}

      {list.length > 0 && mode === "table" && (
        <div className="table-wrap">
          <table className="words-table">
            <thead>
              <tr>
                {langs.map((code) => (
                  <th key={code} className={code === target ? "target-col" : ""}>
                    <LangChip code={code} /> <span className="th-name">{langName(code, lang)}</span>
                  </th>
                ))}
                <th className="hide-sm">#</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(c)}>
                  {langs.map((code) => (
                    <td key={code} className={code === target ? "target-col" : ""}>
                      <TermText term={c.terms[code]} lang={code} /> {bridgeMark(c, code)}
                    </td>
                  ))}
                  <td className="hide-sm muted small">{c.tags.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.length > 0 && mode === "cards" && (
        <div className="card-grid">
          {list.map((c) => (
            <button key={c.id} className="word-card" onClick={() => setOpen(c)}>
              <TermText term={c.terms[target]} lang={target} big />
              <div className="word-card-others">
                {langs.slice(1).map((code) =>
                  c.terms[code] ? (
                    <div key={code}>
                      <LangChip code={code} /> <TermText term={c.terms[code]} lang={code} /> {bridgeMark(c, code)}
                    </div>
                  ) : null,
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <WordDetail concept={concepts.find((c) => c.id === open.id) ?? open} onClose={() => setOpen(null)} />}
      {adding && <AddWord onClose={() => setAdding(false)} />}
    </section>
  );
}
