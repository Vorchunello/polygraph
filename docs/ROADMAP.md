# Roadmap

Releases every 2–3 weeks. Each version has to be usable on its own; nothing ships half-built.

## Done

- **v0.1** — multilingual dictionary with bridges, AI drafts, routes, spaced repetition, inbox, Ask, stories, Markdown vault, Windows / Linux / Android.
- **v0.2** — home screen and goal, free AI by default, adaptation mode (scripts, Morse, Braille), reader with parallel translation, Toucan mode, playlists, background (ADHD) mode on Android and PC, notes with wikilinks, share-to-inbox on Android.
- **v0.3** — games (Sennaar, Bridge or trap?, drill builder), reader views and ADHD focus aids, speed reading, read aloud, PDF / subtitles / web articles / photos in the reader, on-device OCR and desktop hotkeys, translator without AI, interface in Spanish, Turkish and Arabic, Ctrl+K command palette.

## v0.4 — grounded AI, the Forge loop and speaking

- **Pronunciation practice**: record yourself and compare with the model voice; speech recognition on the device (Whisper in WebAssembly).
- **Adaptation as a game**: each stage unlocks when you read the previous one without help.
- More interface languages (Chinese, Hindi, French, Portuguese, German).
- **RAG over Wiktionary** (kaikki.org dumps): etymology and cognates come from a dictionary, the AI only explains them. Bridges with a source are marked verified automatically.
- **RAG over your own books and notes**: examples taken from what you actually read.
- **MCP server**: Claude Code and other agents can read your words, notes, errors and review queue.
- **External-model prompts**: Polygraph assembles a self-contained prompt for any model and accepts the result back for checking.

## v0.5 — space, video and integrations

- **Memory palace** (desktop): place words along a route through your own flat or street — a 2D plan first, a 3D walk later.
- **Clips**: short videos and scenes from films you own; learn the words of a scene and repeat its lines after the actors (shadowing).
- **Yomitan**: dictionary export, and an AnkiConnect-compatible endpoint so Yomitan's "add card" button adds straight to Polygraph.
- **Anki `.apkg`** import and export.
- **Browser extension** for Toucan mode on any website.

## Ideas being explored

- **Sign languages** — basic fingerspelling and frequent signs. Needs properly licensed video or illustrations; it will not ship with home-made drawings that could teach wrong hand shapes.
- **"You already know X %"** — before you start, Polygraph checks the 5,000 most frequent words of the target language against your languages and shows how much is already reachable through reliable bridges.
- **Sound-law keys** — learn the rule instead of the word: Latin *f-* → Spanish *h-* (*facere → hacer*, *filius → hijo*), *-tion ↔ -ción ↔ -ция*, German *t* ↔ English *d*. For Arabic: three-letter roots — *k-t-b* gives *kitap*, *mektup*, *kâtip* in Turkish.
- **Sound bridges** — pronunciation through sounds you already have: Spanish *j* is Russian *х*; Arabic *ع* has no match anywhere, and Polygraph says so.
- **Teacher mode** — the AI plays a learner making the mistakes a speaker of *your* language typically makes; you correct them.
- **Community bridge packs** — since everything is Markdown, a pack is a folder in a GitHub repo; human-verified bridges flow back to everyone.
- **Screen capture for gamers** — a hotkey that OCRs the game screen and drops unknown words into the inbox.
