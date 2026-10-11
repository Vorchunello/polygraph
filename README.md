# Polygraph

**Learn a new language through the languages you already know.**

[Русская версия](README.ru.md) · [Download](https://github.com/Vorchunello/polygraph/releases) · [Roadmap](docs/ROADMAP.md)

Most apps teach a language as if you knew only one other. But if you speak Russian, Turkish and English and you are learning Spanish, half of the work is already done: *noche* is a cousin of *ночь* and *night*; *aceite* (oil) and Turkish *zeytin* (olive) both go back to Arabic — *az-zayt* and *zaytūn*; *la mesa* is feminine even though *стол* is masculine — and that is exactly the trap worth remembering.

Polygraph keeps every word as a **concept with bridges**: the word in each of your languages, plus the links between them — shared roots, loanwords, matching or mismatching gender, false friends — each marked as *reliable*, *partial* or *a trap*.

| Concept | 🇪🇸 ES | 🇷🇺 RU | 🇹🇷 TR | 🇬🇧 EN | Bridge |
|---|---|---|---|---|---|
| night | la noche | ночь (f) | gece | night | RU, EN ↔ same Proto-Indo-European root, gender matches RU |
| oil | el aceite | масло | zeytinyağı | oil | TR ↔ both go back to Arabic *zayt / zaytūn* |
| table | la mesa | стол (m) | masa | table | TR ↔ same word · RU ⚠ gender trap |

## What it does

**Learn**

- **Your goal on the home screen** — write why you learn the language; it stays in front of you and goes into every AI request.
- **Multilingual dictionary** — a table or cards, every word in all your languages at once, gender colour-coded, bridges and traps marked.
- **AI-drafted entries** — type a word in any language; the AI fills in the translations, gender, articles, bridges, etymology and examples. AI output is marked *unverified* until you confirm it.
- **Routes** — you decide which known language explains which topic: grammatical gender through Russian, articles through English, idioms with matching idioms from every language you know.
- **Spaced repetition** — *recognize* (see the word, recall the meaning) or *recall* (see it in all your languages at once, produce it in the target one).
- **Adaptation mode** — a text in your language turns into the target language step by step: word order flips to right-to-left, letters change a few at a time (Arabic follows real transliteration: *Москва* → موسكفا; vowels as letters or harakat), then words one by one, then constructions, then whole sentences, simple ones first. Every step is adjustable, and a challenge mode unlocks the next stage only when you read the current one without peeking. Works offline for an alphabet alone (Arabic, Hebrew, Greek, Cyrillic, Latin) and for codes: Morse (with sound) and Braille.
- **Playlists** — background listening built as a ladder: *go, leave, school, shop → go to school → leave the shop and go to school…*, growing step by step with constant repetition. 30–40 minutes you can leave running while you walk or play.
- **Games** — *Sennaar* (decipher the language from scenes without a translation, like in Chants of Sennaar), *Bridge or trap?* (cognate or false friend), and a *drill builder* to assemble your own workouts: choose, type, listen, match, word order, gender.

**Read and listen**

- **Reader** — your own books and texts: .txt, .md, .fb2, .fb2.zip, .epub, PDF, subtitles (.srt/.vtt), a web article by link (cleaned to text) or a photo of a page. Parallel translation by the AI or a machine translator, page by page. Page themes and fonts, ADHD focus aids (*anchor letters* — bold word beginnings, *rhythm*, *ruler*), clean distraction-free reading, speed reading word by word, reading aloud. Tap a word to look it up or send it to the inbox.
- **Toucan mode** — read a text in a language you know with your dictionary words swapped into the target language.
- **Background (ADHD) mode** — a word strip on top of TikTok or a game on Android, a small always-on-top window for the second monitor on the PC. Every few words it asks *know / don't know*; missed words come back in Study today.
- **Stories from your words** — IELTS Reading passage, dialogue, fairy tale, news, diary, Ilya Frank bilingual reading, or *diglot weave* (a text in your language where target-language words take over paragraph by paragraph).

**Capture and think**

- **Inbox** — write down unknown words on the go (or share them from any Android app), let the AI process them in one batch. Made for not breaking the flow of a film or a book.
- **Text from photos and screens** — on-device text recognition: photograph a page or capture the screen, tap the words you want. On the PC, **Ctrl+Alt+I** sends copied text to the inbox from any program and **Ctrl+Alt+O** reads text from the screen — handy in games and films.
- **Notes** — Markdown notes with `[[wikilinks]]` and backlinks, Obsidian-style. Ask the AI about your notes, or let it write a set of linked notes on a topic.
- **Ask** — grammar and usage questions answered through your routes.
- **Pronunciation** — “Say it” on every word: speech is recognised on the device (Whisper), you see what was heard and a similarity score.
- **Wiktionary** — new words are drafted from the dictionary entry, and any etymology can be checked and marked verified.
- **For AI agents** — an MCP server lets Claude Code and other agents read your words, traps, inbox and notes ([docs/MCP.md](docs/MCP.md)).

**Everywhere**

- **Free AI out of the box** — Pollinations works without a key or sign-up. For privacy, local models on your PC (LM Studio, Ollama); for quality, any API (OpenRouter, Groq, Gemini, OpenAI, DeepSeek, Anthropic Claude). On a phone you can also use the LM Studio running on your PC over Wi-Fi.
- **Translation without AI** — MyMemory (no key), DeepL (free key) or LibreTranslate, for quick lookups and when the AI is busy.
- **Ctrl+K** — search and commands from anywhere; light and dark themes, interface size.
- **Your data is Markdown** — one `.md` file per word in a folder you choose. Open it in Obsidian, keep it in git, sync it with Syncthing. Nothing is locked inside the app.
- **Import / export** — CSV (columns are language codes), Anki text files, JSON backup.
- **15 first-class languages** with grammar-aware hints (English, Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese, Russian, Japanese, German, Turkish, Korean, Italian, Indonesian) plus 15 more — and any other ISO code, because the AI does the heavy lifting. Interface: English, Russian, Spanish, Turkish and Arabic (right-to-left), more coming ([help translate](docs/TRANSLATING.md)).

## Install

Download from [Releases](https://github.com/Vorchunello/polygraph/releases):

| Platform | File |
|---|---|
| Windows | `Polygraph.Setup.x.y.z.exe` (installer) or `Polygraph.x.y.z.exe` (portable) |
| Linux | `Polygraph-x.y.z.AppImage` |
| Android | `Polygraph-x.y.z.apk` — allow installing from unknown sources |

The builds are not code-signed yet, so Windows SmartScreen will warn on first launch: *More info → Run anyway*.

## Set up AI

Settings → AI:

- **Free, no setup (default):** Pollinations — works right away, but only for short requests; longer tasks hit its limit, and texts go to its public server.
- **Free and reliable:** a free key from [Groq](https://console.groq.com/keys) or [Google Gemini](https://aistudio.google.com/apikey) — one minute to get.
- **Local, free, private:** install [LM Studio](https://lmstudio.ai), download a model (Qwen 3 8B, Gemma 3 12B or bigger if your GPU allows), *Developer → Start server*. Choose *LM Studio* in Polygraph and press *Load list*.
- **API:** pick a provider, paste a key, load the model list. Keys stay on the device and never go into the vault.

Small local models make more mistakes with etymology — that is why every AI bridge starts as *unverified*.

## Your vault

```
Polygraph/
  profile.md        languages you know and learn
  words/noche.md    one concept per file
  routes/es.md      which language explains which topic
  inbox.md          captured words
  texts/            saved stories and answers
  notes/            your notes, linked with [[wikilinks]]
  library/          books for the reader and their translations
  adapt/            texts for the adaptation mode
  playlists/        background listening playlists
```

See [docs/VAULT_FORMAT.md](docs/VAULT_FORMAT.md). On Windows the default folder is `Documents\Polygraph` (change it in Settings → Data); on Android it is `Documents/Polygraph`.

## Develop

```bash
npm install
npm run dev            # web version at http://127.0.0.1:5173
npm run electron:dev   # desktop window against the dev server
npm test
npm run dist:win       # Windows installer into release/
npm run android:sync   # copy the web build into android/, then open it in Android Studio
```

Node 20+ is required for Electron tooling. Releases are built by GitHub Actions when a `v*` tag is pushed.

Stack: React + TypeScript + Vite, Electron for desktop, Capacitor for Android.

## License

MIT
