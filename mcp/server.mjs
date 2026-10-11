#!/usr/bin/env node
// MCP-сервер Polygraph: отдаёт хранилище (md-файлы) ИИ-агентам вроде Claude
// Code. Работает напрямую с папкой — приложение для этого запускать не нужно.
//
//   claude mcp add polygraph -- node /путь/к/polygraph/mcp/server.mjs
//
// Папка хранилища: POLYGRAPH_VAULT, иначе та, что выбрана в приложении на ПК,
// иначе Документы/Polygraph.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

async function vaultRoot() {
  if (process.env.POLYGRAPH_VAULT) return path.resolve(process.env.POLYGRAPH_VAULT);
  // Настройки приложения на ПК: userData/Polygraph/polygraph.json → vault.
  const appData =
    process.platform === "win32"
      ? process.env.APPDATA
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(appData ?? "", "Polygraph", "polygraph.json"), "utf8"));
    if (cfg.vault) return path.resolve(cfg.vault);
  } catch {
    /* приложение не настраивали — берём папку по умолчанию */
  }
  return path.join(os.homedir(), "Documents", "Polygraph");
}

const ROOT = await vaultRoot();

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function split(src) {
  const m = FM.exec(src);
  if (!m) return { data: {}, body: src };
  return { data: YAML.parse(m[1]) ?? {}, body: m[2].trim() };
}

function join(data, body) {
  return `---\n${YAML.stringify(JSON.parse(JSON.stringify(data)), { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

async function readDir(dir) {
  try {
    const files = (await fs.readdir(path.join(ROOT, dir))).filter((f) => f.endsWith(".md"));
    return Promise.all(files.map(async (f) => ({ id: f.slice(0, -3), ...split(await fs.readFile(path.join(ROOT, dir, f), "utf8")) })));
  } catch {
    return [];
  }
}

async function profile() {
  try {
    return split(await fs.readFile(path.join(ROOT, "profile.md"), "utf8")).data;
  } catch {
    return null;
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Короткое описание слова: все языки, род, мосты с пометкой надёжности. */
function describe(w, target) {
  const terms = Object.entries(w.data.terms ?? {})
    .map(([l, t]) => `${l}: ${[t.article, t.text].filter(Boolean).join(" ")}${t.gender ? ` (${t.gender})` : ""}`)
    .join("; ");
  const bridges = (w.data.bridges ?? []).map((b) => `  - ${b.from} ${b.kind} [${b.strength}${b.verified ? ", verified" : ""}]: ${b.note}`).join("\n");
  const srs = w.data.srs?.[target];
  return [`- ${w.id} — ${terms}`, srs ? `  review: due ${srs.due}, interval ${srs.interval}d, lapses ${srs.lapses}` : "  review: new", bridges].filter(Boolean).join("\n");
}

const text = (s) => ({ content: [{ type: "text", text: s }] });

const server = new McpServer({ name: "polygraph", version: "0.4.0" });

server.registerTool(
  "polygraph_profile",
  { description: "The learner's profile: languages they know (bridges), languages they learn, the active target language and their learning goal." },
  async () => {
    const p = await profile();
    return text(p ? YAML.stringify(p) : `No profile.md in ${ROOT}. Open Polygraph once or set POLYGRAPH_VAULT.`);
  },
);

server.registerTool(
  "polygraph_due",
  {
    description: "Words due for spaced-repetition review today (plus a few new ones) in the target language, with translations and bridges to known languages.",
    inputSchema: { lang: z.string().optional().describe("Target language code; default is the active one"), limit: z.number().int().min(1).max(200).optional() },
  },
  async ({ lang, limit }) => {
    const p = (await profile()) ?? {};
    const target = lang ?? p.target ?? p.learning?.[0]?.code;
    const words = (await readDir("words")).filter((w) => w.data.terms?.[target]);
    const now = today();
    const due = words.filter((w) => w.data.srs?.[target]?.due <= now);
    const fresh = words.filter((w) => !w.data.srs?.[target]).slice(0, 10);
    const list = [...due, ...fresh].slice(0, limit ?? 50);
    return text(list.length ? `Target: ${target}. Due: ${due.length}, new shown: ${Math.min(fresh.length, 10)}.\n${list.map((w) => describe(w, target)).join("\n")}` : `Nothing due in ${target}.`);
  },
);

server.registerTool(
  "polygraph_search",
  { description: "Find words in the learner's dictionary by any spelling, in any language, or by tag.", inputSchema: { query: z.string() } },
  async ({ query }) => {
    const q = query.toLowerCase();
    const p = (await profile()) ?? {};
    const hits = (await readDir("words")).filter(
      (w) => Object.values(w.data.terms ?? {}).some((t) => String(t.text).toLowerCase().includes(q)) || (w.data.tags ?? []).some((t) => String(t).toLowerCase() === q),
    );
    return text(hits.length ? hits.slice(0, 40).map((w) => describe(w, p.target)).join("\n") : "No matches.");
  },
);

server.registerTool(
  "polygraph_word",
  { description: "The full Markdown file of one word (frontmatter with terms, bridges, etymology, examples, review state, plus notes).", inputSchema: { id: z.string() } },
  async ({ id }) => {
    try {
      return text(await fs.readFile(path.join(ROOT, "words", `${path.basename(id)}.md`), "utf8"));
    } catch {
      return text(`No word ${id}.`);
    }
  },
);

server.registerTool(
  "polygraph_add_word",
  {
    description: "Add a word to the learner's dictionary. Give the word in the target language and translations in the languages they know. Bridges you are not sure about should be left out.",
    inputSchema: {
      terms: z.record(z.string(), z.string()).describe("Language code → word, e.g. {\"es\": \"noche\", \"ru\": \"ночь\"}"),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
  },
  async ({ terms, tags, notes }) => {
    const p = (await profile()) ?? {};
    const target = p.target ?? p.learning?.[0]?.code;
    const main = terms[target] ?? Object.values(terms)[0];
    if (!main) return text("No word given.");
    const base = main.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "word";
    await fs.mkdir(path.join(ROOT, "words"), { recursive: true });
    let id = base;
    for (let i = 2; ; i++) {
      try {
        await fs.access(path.join(ROOT, "words", `${id}.md`));
        id = `${base}-${i}`;
      } catch {
        break;
      }
    }
    const now = today();
    const data = {
      id,
      terms: Object.fromEntries(Object.entries(terms).map(([l, t]) => [l, { text: t }])),
      bridges: [],
      examples: [],
      tags: [...(tags ?? []), "mcp"],
      srs: {},
      created: now,
      updated: now,
    };
    await fs.writeFile(path.join(ROOT, "words", `${id}.md`), join(data, notes ?? ""), "utf8");
    return text(`Added words/${id}.md`);
  },
);

server.registerTool(
  "polygraph_inbox",
  { description: "Words and questions the learner captured on the go and has not processed yet." },
  async () => {
    try {
      const items = (await fs.readFile(path.join(ROOT, "inbox.md"), "utf8"))
        .split(/\r?\n/)
        .map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1])
        .filter(Boolean);
      return text(items.length ? items.map((i) => `- ${i}`).join("\n") : "Inbox is empty.");
    } catch {
      return text("Inbox is empty.");
    }
  },
);

server.registerTool(
  "polygraph_add_to_inbox",
  { description: "Add items to the learner's inbox so they can process them in Polygraph later.", inputSchema: { items: z.array(z.string()).min(1) } },
  async ({ items }) => {
    const file = path.join(ROOT, "inbox.md");
    let current = "";
    try {
      current = await fs.readFile(file, "utf8");
    } catch {
      current = "# Inbox\n\n";
    }
    await fs.writeFile(file, `${current.trimEnd()}\n${items.map((i) => `- ${i.trim()}`).join("\n")}\n`, "utf8");
    return text(`Added ${items.length} item(s) to the inbox.`);
  },
);

server.registerTool(
  "polygraph_notes",
  { description: "Search the learner's Markdown notes (title and text). Without a query, lists all note titles.", inputSchema: { query: z.string().optional() } },
  async ({ query }) => {
    const notes = await readDir("notes");
    if (!query) return text(notes.map((n) => `- ${n.id}: ${n.data.title ?? n.id}`).join("\n") || "No notes.");
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = notes.filter((n) => words.every((w) => `${n.data.title ?? ""}\n${n.body}`.toLowerCase().includes(w)));
    return text(hits.map((n) => `## ${n.data.title ?? n.id} (${n.id})\n${n.body.slice(0, 1200)}`).join("\n\n") || "No matches.");
  },
);

server.registerTool(
  "polygraph_stats",
  { description: "Progress overview: words per language, due today, traps (false bridges), study streak." },
  async () => {
    const p = (await profile()) ?? {};
    const words = await readDir("words");
    const now = today();
    const days = new Set(words.flatMap((w) => Object.values(w.data.srs ?? {}).map((s) => s.last)).filter(Boolean));
    let streak = 0;
    for (let d = new Date(); ; d.setDate(d.getDate() - 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (days.has(key)) streak++;
      else if (key !== now) break;
    }
    const lines = (p.learning ?? []).map((l) => {
      const mine = words.filter((w) => w.data.terms?.[l.code]);
      const due = mine.filter((w) => w.data.srs?.[l.code]?.due <= now).length;
      const traps = mine.filter((w) => (w.data.bridges ?? []).some((b) => b.strength === "broken")).length;
      return `- ${l.code} (${l.level}): ${mine.length} words, ${due} due today, ${traps} traps`;
    });
    return text([`Vault: ${ROOT}`, p.goal ? `Goal: ${p.goal}` : "", `Study streak: ${streak} day(s)`, ...lines].filter(Boolean).join("\n"));
  },
);

await server.connect(new StdioServerTransport());
