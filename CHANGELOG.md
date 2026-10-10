# Changelog

## 0.3.0 — 2026-10-10

Games, a much better reader, text from photos and screens, translation without AI, and three more interface languages.

- **Games.** *Sennaar* — decipher the language from short scenes without a translation (emoji instead of pictures), keep a journal of guesses, add deciphered words to the dictionary. *Bridge or trap?* — similar words in two languages, real cognate or false friend. *Drill builder* — compose workouts from blocks (choose, reverse, type, listen, match, word order, gender), save them as presets. Mistakes send words back to today's review.
- **Reader views.** Page themes (paper, sepia, night, contrast), fonts including a readable one, size, line spacing, column width. Focus aids for ADHD: *anchor letters* (bold word beginnings), *rhythm* (sentences alternate bold / italic / colour), *ruler* (only the current paragraph is bright). Clean distraction-free reading, speed reading word by word (RSVP), reading aloud with paragraph highlighting, progress bar and time left, ←/→ to turn pages.
- **More sources for the reader.** PDF, subtitles (.srt, .vtt), any web article by link (cleaned to text like a browser's reader view), and photos of pages (text recognition on the device).
- **Text recognition (OCR).** Photo or screenshot → tap the words you want → inbox. On the PC: **Ctrl+Alt+I** sends copied text to the inbox from any program, **Ctrl+Alt+O** reads text from the screen (made for games and films).
- **Translator without AI.** MyMemory (no key), DeepL (free key) or LibreTranslate. Used for quick word lookups in the reader, translating book pages when the AI is busy, and the new “Translate (no AI)” button when adding a word.
- **Interface in Spanish, Turkish and Arabic** (right-to-left layout), in addition to English and Russian.
- **Conveniences.** Ctrl+K search and commands; undo after deleting a word; light / dark theme switch and interface size; new-words-per-day limit and automatic pronunciation in Study; filters in the dictionary (traps, unverified, not studied); multi-line paste into the inbox, paste from clipboard.

## 0.2.0 — 2026-10-10

Learning in the background, reading, and a new way to meet a new alphabet.

- **Home and goal.** A home screen with your learning goal, today's numbers and a quick capture field. The goal goes into every AI request, so examples, stories and playlists bend towards it.
- **Free AI out of the box.** Pollinations works without a key or sign-up and is the default. Also new: Groq; providers are marked as free, local or free-tier. Requests are retried on rate limits.
- **Adaptation mode.** A text in your language turns into the target language step by step: right-to-left flip, letters change group by group (vowels last, as harakat for Arabic), then words, constructions, and whole sentences — simple ones first. Also works offline for an alphabet only (Arabic, Hebrew, Greek, Cyrillic, Latin) and for codes: Morse (with sound) and Braille.
- **Reader.** Import .txt, .md, .fb2, .fb2.zip or .epub, or paste a text. Parallel translation made by the AI page by page; tap a word to send it to the inbox.
- **Toucan mode.** Read any text in a language you know with your dictionary words swapped into the target language — in the reader and in a quick paste box.
- **Playlists.** Background listening built as a ladder: basic words, then phrases from them, growing step by step with constant repetition. Built by the AI or from your dictionary; speed, pauses, order and repeats are adjustable.
- **Background (ADHD) mode.** A word strip on top of other apps on Android and an always-on-top window for the second monitor on the PC. Every few words it asks “know / don't know”; missed words come back in Study today.
- **Notes.** Markdown notes with [[wikilinks]] and backlinks; links to dictionary words open the word. Ask the AI about your notes, or let it write a set of linked notes on a topic.
- **Android:** share text from any app straight into the inbox; native text-to-speech.
- Navigation in groups on the desktop; on phones, four main sections and a “More” sheet.

## 0.1.0 — 2026-10-10

First public version.

- Multilingual dictionary: every concept in all your languages at once, as a table or as cards; gender colour-coded; bridges and traps marked.
- AI drafts for new words: translations, gender, articles, bridges to every language you know, etymology, examples. Everything from the AI is marked unverified until you confirm it.
- Routes: choose which known language explains which grammar topic (gender, articles, cases, idioms…).
- Spaced repetition with two modes: recognize, and recall from all your languages at once (with typed answers).
- Inbox for words captured on the go, processed by the AI in one batch.
- Ask: grammar and usage questions answered through your routes.
- Stories from your words: IELTS Reading, dialogue, fairy tale, news, diary, Ilya Frank method, diglot weave.
- AI providers: LM Studio, Ollama, OpenRouter, OpenAI, DeepSeek, Google Gemini, Anthropic Claude, any OpenAI-compatible server.
- Data as plain Markdown files in a folder you choose; import/export CSV, Anki text files, JSON backup.
- 15 first-class languages plus 15 more, any other ISO code accepted. Interface in English and Russian.
- Windows (installer and portable), Linux (AppImage), Android (APK).
