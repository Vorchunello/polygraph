import { langInfo } from "./languages";
import type { LangCode, Profile, Route } from "./types";

// Маршруты объяснений: какая тема изучаемого языка объясняется через какой
// известный язык. Формат строки унаследован от Forge:
//   - [gender] Grammatical gender — via ru — [+]
// Маркеры: [+] строго, [-] не использовать, [!] на усмотрение ИИ, [?] спросить.

const LINE = /^\s*-\s*\[([^\]]+)\]\s*(.+?)\s*[—–-]+\s*(?:via|через)\s+([a-z]{2,3})(?:\s*[—–-]+\s*\**\[([+\-!?])\]\**)?\s*$/i;

export function parseRoutes(src: string): Route[] {
  const out: Route[] = [];
  for (const line of src.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    out.push({ id: m[1].trim(), topic: m[2].trim(), via: m[3].toLowerCase(), marker: (m[4] as Route["marker"]) ?? "!" });
  }
  return out;
}

export function serializeRoutes(target: LangCode, routes: Route[]): string {
  return [
    `# Routes for ${target}`,
    "",
    "Which language you already know explains which topic.",
    "Format: `- [id] topic — via <code> — [marker]`. Markers: [+] always, [-] never, [!] AI decides, [?] ask me.",
    "",
    ...routes.map((r) => `- [${r.id}] ${r.topic} — via ${r.via} — [${r.marker}]`),
    "",
  ].join("\n");
}

/** Первые маршруты по умолчанию — из грамматических свойств языков профиля. */
export function defaultRoutes(profile: Profile, target: LangCode): Route[] {
  const known = profile.known.map((k) => k.code).filter((c) => c !== target);
  const t = langInfo(target);
  const first = (pred: (c: LangCode) => boolean, prefer: LangCode[] = []) =>
    [...prefer.filter((p) => known.includes(p)), ...known].find(pred);
  const routes: Route[] = [];

  if (t.gender !== "none") {
    const via = first((c) => langInfo(c).gender !== "none", t.gender === "mf" ? ["ru", "fr", "es", "it", "pt", "ar"] : ["de", "ru"]);
    if (via) routes.push({ id: "gender", topic: "Grammatical gender", via, marker: "+" });
  }
  if (t.articles) {
    const via = first((c) => langInfo(c).articles, ["en", "de", "fr", "es"]);
    if (via) routes.push({ id: "articles", topic: "Articles (definite/indefinite)", via, marker: "+" });
  }
  if (t.cases) {
    const via = first((c) => langInfo(c).cases, ["ru", "de", "tr", "pl"]);
    if (via) routes.push({ id: "cases", topic: "Cases and declension", via, marker: "+" });
  }
  const native = profile.known.find((k) => k.level === "native")?.code ?? known[0];
  if (native) {
    routes.push({ id: "idioms", topic: "Idioms — find matching idioms in every known language", via: native, marker: "!" });
    routes.push({ id: "default", topic: "Everything else", via: native, marker: "!" });
  }
  return routes;
}
