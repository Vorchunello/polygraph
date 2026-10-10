import { today } from "../core/dates";
import {
  joinFrontmatter,
  parseConcept,
  parseInbox,
  parseProfile,
  serializeConcept,
  serializeInbox,
  serializeProfile,
  slugify,
} from "../core/markdown";
import { defaultRoutes, parseRoutes, serializeRoutes } from "../core/routes";
import type { Concept, LangCode, Profile, Route } from "../core/types";
import type { Vault } from "./vault";

// Раскладка хранилища:
//   profile.md          — кто ты и какие языки знаешь
//   words/<id>.md       — по файлу на понятие
//   routes/<lang>.md    — через какой язык объяснять темы
//   inbox.md            — незнакомое, записанное на ходу
//   texts/<date>-…md    — рассказы и объяснения ИИ, сохранённые тобой

const VAULT_README = `# Polygraph vault

This folder is your Polygraph data — plain Markdown, readable without the app.
Open it in Obsidian, keep it in git, sync it with Syncthing or any cloud drive.

- \`profile.md\` — languages you know and learn
- \`words/\` — one file per concept: terms in every language, bridges, review state
- \`routes/\` — which known language explains which topic of a target language
- \`inbox.md\` — words captured on the go
- \`texts/\` — stories and explanations you saved

Format reference: https://github.com/Vorchunello/polygraph/blob/main/docs/VAULT_FORMAT.md
`;

export class Repo {
  constructor(readonly vault: Vault) {}

  async loadProfile(): Promise<Profile | null> {
    const src = await this.vault.read("profile.md");
    return src ? parseProfile(src) : null;
  }

  async saveProfile(p: Profile): Promise<void> {
    await this.vault.write("profile.md", serializeProfile(p));
    if (!(await this.vault.read("README.md"))) await this.vault.write("README.md", VAULT_README);
  }

  async loadConcepts(): Promise<Concept[]> {
    const files = (await this.vault.list("words")).filter((f) => f.endsWith(".md"));
    const out: Concept[] = [];
    for (const f of files) {
      const src = await this.vault.read(`words/${f}`);
      if (src == null) continue;
      try {
        out.push(parseConcept(src, f.replace(/\.md$/, "")));
      } catch (e) {
        console.warn(`Skipped broken file words/${f}`, e);
      }
    }
    return out.sort((a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id));
  }

  async saveConcept(c: Concept): Promise<void> {
    await this.vault.write(`words/${c.id}.md`, serializeConcept({ ...c, updated: today() }));
  }

  async deleteConcept(id: string): Promise<void> {
    await this.vault.remove(`words/${id}.md`);
  }

  async loadRoutes(profile: Profile, target: LangCode): Promise<{ routes: Route[]; text: string }> {
    let text = await this.vault.read(`routes/${target}.md`);
    if (text == null) {
      text = serializeRoutes(target, defaultRoutes(profile, target));
      await this.vault.write(`routes/${target}.md`, text);
    }
    return { routes: parseRoutes(text), text };
  }

  async saveRoutesText(target: LangCode, text: string): Promise<Route[]> {
    await this.vault.write(`routes/${target}.md`, text);
    return parseRoutes(text);
  }

  async loadInbox(): Promise<string[]> {
    return parseInbox((await this.vault.read("inbox.md")) ?? "");
  }

  async saveInbox(items: string[]): Promise<void> {
    await this.vault.write("inbox.md", serializeInbox(items));
  }

  async saveText(title: string, body: string, meta: Record<string, unknown>): Promise<string> {
    const path = `texts/${today()}-${slugify(title)}.md`;
    await this.vault.write(path, joinFrontmatter({ title, created: today(), ...meta }, body));
    return path;
  }

  /** Уникальный id файла: слово → slug, при совпадении — суффикс. */
  newId(seed: string, taken: Set<string>): string {
    const base = slugify(seed);
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    taken.add(id);
    return id;
  }
}
