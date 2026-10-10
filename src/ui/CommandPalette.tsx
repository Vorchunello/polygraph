import { useEffect, useMemo, useRef, useState } from "react";
import type { Concept } from "../core/types";
import { useT } from "../i18n";
import { NAV_GROUPS, type ViewId } from "./nav";
import { useApp } from "./state";

interface Item {
  key: string;
  icon: string;
  label: string;
  hint?: string;
  run(): void;
}

/**
 * Палитра команд (Ctrl+K): одно поле, через которое можно перейти в любой
 * раздел, открыть слово, отправить фразу в инбокс или завести новое слово.
 */
export function CommandPalette({
  onClose,
  go,
  openWord,
  newWord,
}: {
  onClose(): void;
  go(v: ViewId): void;
  openWord(c: Concept): void;
  newWord(text: string): void;
}) {
  const { t } = useT();
  const app = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const sections: Item[] = NAV_GROUPS.flatMap((g) => g.items).map((i) => ({
      key: `nav-${i.id}`,
      icon: i.icon,
      label: t(i.label),
      run: () => go(i.id),
    }));
    if (!query) return sections;
    const words: Item[] = app.concepts
      .filter((c) => Object.values(c.terms).some((term) => term.text.toLowerCase().includes(query)))
      .slice(0, 8)
      .map((c) => ({
        key: `w-${c.id}`,
        icon: "▦",
        label: c.terms[app.target]?.text ?? Object.values(c.terms)[0]?.text ?? c.id,
        hint: Object.entries(c.terms)
          .filter(([l]) => l !== app.target)
          .map(([, term]) => term.text)
          .join(" · "),
        run: () => openWord(c),
      }));
    const actions: Item[] = [
      {
        key: "inbox",
        icon: "✎",
        label: t("palette.toInbox", { text: q.trim() }),
        run: () => {
          app.addToInbox([q.trim()]);
          app.toast(t("home.captured"));
        },
      },
      { key: "new", icon: "+", label: t("palette.newWord", { text: q.trim() }), run: () => newWord(q.trim()) },
    ];
    return [...sections.filter((s) => s.label.toLowerCase().includes(query)), ...words, ...actions];
  }, [q, app, t, go, openWord, newWord]);

  useEffect(() => setSel(0), [q]);

  const run = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={t("palette.title")}>
        <input
          ref={input}
          className="input palette-input"
          value={q}
          placeholder={t("palette.placeholder")}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(items.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter") run(items[sel]);
            else if (e.key === "Escape") onClose();
          }}
        />
        <ul className="palette-list">
          {items.map((i, k) => (
            <li key={i.key}>
              <button className={k === sel ? "on" : ""} onMouseEnter={() => setSel(k)} onClick={() => run(i)}>
                <span className="nav-icon">{i.icon}</span>
                <span className="grow">{i.label}</span>
                {i.hint && <span className="muted small">{i.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
