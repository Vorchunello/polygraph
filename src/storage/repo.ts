import { today } from "../core/dates";
import {
  joinFrontmatter,
  splitFrontmatter,
  parseConcept,
  parseInbox,
  parseProfile,
  serializeConcept,
  serializeInbox,
  serializeProfile,
  slugify,
} from "../core/markdown";
import { defaultRoutes, parseRoutes, serializeRoutes } from "../core/routes";
import type { AdaptDoc } from "../core/adapt";
import { parseNote, serializeNote, type Note } from "../core/notes";
import { parsePlaylist, serializePlaylist, type Playlist } from "../core/playlist";
import { parseBook, parseTranslation, serializeBook, serializeTranslation, type Book, type Translation } from "../core/reader";
import type { Concept, LangCode, Profile, Route } from "../core/types";
import type { Vault } from "./vault";

// Раскладка хранилища:
//   profile.md          — кто ты и какие языки знаешь
//   words/<id>.md       — по файлу на понятие
//   routes/<lang>.md    — через какой язык объяснять темы
//   inbox.md            — незнакомое, записанное на ходу
//   texts/<date>-…md    — рассказы и объяснения ИИ, сохранённые тобой
//   notes/<id>.md       — заметки со [[ссылками]]
//   library/<id>.md     — книги; library/<id>.<lang>.md — их переводы
//   adapt/<id>.md       — тексты для режима адаптации
//   playlists/<id>.md   — плейлисты для фонового прослушивания

const VAULT_README = `# Polygraph vault

This folder is your Polygraph data — plain Markdown, readable without the app.
Open it in Obsidian, keep it in git, sync it with Syncthing or any cloud drive.

- \`profile.md\` — languages you know and learn
- \`words/\` — one file per concept: terms in every language, bridges, review state
- \`routes/\` — which known language explains which topic of a target language
- \`inbox.md\` — words captured on the go
- \`texts/\` — stories and explanations you saved
- \`notes/\` — your notes, linked with [[wikilinks]]
- \`library/\` — books for the reader and their translations
- \`adapt/\` — texts for the adaptation mode
- \`playlists/\` — background listening playlists

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

  private async loadDir<T>(dir: string, parse: (src: string, id: string) => T, filter = (_f: string) => true): Promise<T[]> {
    const files = (await this.vault.list(dir)).filter((f) => f.endsWith(".md") && filter(f));
    const out: T[] = [];
    for (const f of files) {
      const src = await this.vault.read(`${dir}/${f}`);
      if (src == null) continue;
      try {
        out.push(parse(src, f.replace(/\.md$/, "")));
      } catch (e) {
        console.warn(`Skipped broken file ${dir}/${f}`, e);
      }
    }
    return out;
  }

  loadNotes(): Promise<Note[]> {
    return this.loadDir("notes", parseNote);
  }

  async saveNote(n: Note): Promise<void> {
    await this.vault.write(`notes/${n.id}.md`, serializeNote(n));
  }

  async deleteNote(id: string): Promise<void> {
    await this.vault.remove(`notes/${id}.md`);
  }

  // Переводы лежат рядом как <id>.<lang>.md — в список книг их не берём.
  async loadBooks(): Promise<Book[]> {
    const books = await this.loadDir("library", parseBook, (f) => !/\.[a-z]{2,3}\.md$/.test(f));
    return books.sort((a, b) => b.created.localeCompare(a.created));
  }

  async saveBook(b: Book): Promise<void> {
    await this.vault.write(`library/${b.id}.md`, serializeBook(b));
  }

  async deleteBook(id: string, langs: LangCode[]): Promise<void> {
    await this.vault.remove(`library/${id}.md`);
    for (const l of langs) await this.vault.remove(`library/${id}.${l}.md`);
  }

  async loadTranslation(id: string, lang: LangCode): Promise<Translation> {
    const src = await this.vault.read(`library/${id}.${lang}.md`);
    return src ? parseTranslation(src) : {};
  }

  async saveTranslation(b: Book, lang: LangCode, tr: Translation): Promise<void> {
    await this.vault.write(`library/${b.id}.${lang}.md`, serializeTranslation(lang, tr, b));
  }

  loadAdaptDocs(): Promise<AdaptDoc[]> {
    return this.loadDir("adapt", (src, id) => ({ ...(splitFrontmatter(src).data as unknown as AdaptDoc), id }));
  }

  async saveAdaptDoc(d: AdaptDoc): Promise<void> {
    const body = d.sentences.map((s) => (s.tgt ? `${s.src}\n> ${s.tgt}` : s.src)).join("\n\n");
    await this.vault.write(`adapt/${d.id}.md`, joinFrontmatter(d as unknown as Record<string, unknown>, `# ${d.title}\n\n${body}`));
  }

  async deleteAdaptDoc(id: string): Promise<void> {
    await this.vault.remove(`adapt/${id}.md`);
  }

  loadPlaylists(): Promise<Playlist[]> {
    return this.loadDir("playlists", parsePlaylist);
  }

  async savePlaylist(p: Playlist): Promise<void> {
    await this.vault.write(`playlists/${p.id}.md`, serializePlaylist(p));
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.vault.remove(`playlists/${id}.md`);
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
