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

## What v0.1 does

- **Multilingual dictionary** — a table or cards, every word in all your languages at once, gender colour-coded, bridges and traps marked.
- **AI-drafted entries** — type a word in any language; the AI fills in the translations, gender, articles, bridges, etymology and examples. AI output is marked *unverified* until you confirm it.
- **Routes** — you decide which known language explains which topic: grammatical gender through Russian, articles through English, idioms with matching idioms from every language you know.
- **Spaced repetition** — *recognize* (see the word, recall the meaning) or *recall* (see it in all your languages at once, produce it in the target one).
- **Inbox** — write down unknown words on the go, let the AI process them in one batch.
- **Ask** — grammar and usage questions answered through your routes.
- **Stories from your words** — IELTS Reading passage, dialogue, fairy tale, news, diary, Ilya Frank bilingual reading, or *diglot weave* (a text in your language where target-language words take over paragraph by paragraph).
- **Any AI** — local models on your PC (LM Studio, Ollama) or an API (OpenRouter, OpenAI, DeepSeek, Gemini, Anthropic Claude). On a phone you can also use the LM Studio running on your PC over Wi-Fi.
- **Your data is Markdown** — one `.md` file per word in a folder you choose. Open it in Obsidian, keep it in git, sync it with Syncthing. Nothing is locked inside the app.
- **Import / export** — CSV (columns are language codes), Anki text files, JSON backup.
- **15 first-class languages** with grammar-aware hints (English, Chinese, Hindi, Spanish, French, Arabic, Bengali, Portuguese, Russian, Japanese, German, Turkish, Korean, Italian, Indonesian) plus 15 more — and any other ISO code, because the AI does the heavy lifting. Interface: English and Russian, more coming ([help translate](docs/TRANSLATING.md)).

## Install

Download from [Releases](https://github.com/Vorchunello/polygraph/releases):

| Platform | File |
|---|---|
| Windows | `Polygraph Setup x.y.z.exe` (installer) or `Polygraph x.y.z.exe` (portable) |
| Linux | `Polygraph-x.y.z.AppImage` |
| Android | `Polygraph-x.y.z.apk` — allow installing from unknown sources |

The builds are not code-signed yet, so Windows SmartScreen will warn on first launch: *More info → Run anyway*.

## Set up AI

Settings → AI:

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
