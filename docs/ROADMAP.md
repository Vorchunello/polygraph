# Roadmap

Releases every 2–3 weeks. Each version has to be usable on its own; nothing ships half-built.

## v0.2 — learning in the background (ADHD mode)

- **Android overlay**: a small floating strip over any app (TikTok, games) — `noche · ночь · night`. Every N words it asks for a tap — *know / don't know* — which goes into spaced repetition. Passive watching alone does not stick; a micro-action does.
- **Desktop ticker**: a tiny always-on-top, click-through window for the second monitor.
- **Share to Polygraph**: Android "Share" from any app lands in the inbox.
- More interface languages (Spanish, Turkish, Arabic first).

## v0.3 — games

- **Diglot weave reader**: any text in your language; target-language words replace yours paragraph by paragraph, starting with the ones that have reliable bridges.
- **Script morph**: for a new alphabet (Arabic, Greek, Georgian, kana…) a familiar text whose letters turn into the new script one at a time. For Turkish → Arabic this is literally Ottoman orthography.
- **Sennaar mode** (after *Chants of Sennaar*): a text in the target language with no translation; you keep a journal of guesses, a word is confirmed after three contexts.
- **Bridge or trap?**: decide whether a pair is a real bridge or a false friend.
- **Game builder**: combine blocks (matching, typing, listening, ordering) into your own drill.

## v0.4 — grounded AI and the Forge loop

- **RAG over Wiktionary** (kaikki.org dumps): etymology and cognates come from a dictionary, the AI only explains them. Bridges with a source are marked verified automatically.
- **RAG over your own books and notes**: examples taken from what you actually read.
- **MCP server**: Claude Code and other agents can read your words, errors and review queue — a tutor session that knows exactly where you are.
- **External-model prompts**: Polygraph assembles a self-contained prompt for any model and accepts the result back for checking.

## v0.5 — space and integrations

- **Memory palace** (desktop): place words along a route through your own flat or street — a 2D plan first, a 3D walk later.
- **Yomitan**: dictionary export, and an AnkiConnect-compatible endpoint so Yomitan's "add card" button adds straight to Polygraph.
- **Anki `.apkg`** import and export.

## Ideas being explored

- **"You already know X %"** — before you start, Polygraph checks the 5,000 most frequent words of the target language against your languages and shows how much is already reachable through reliable bridges. The number is different for every combination of languages, and it is a strong reason to start.
- **Sound-law keys** — learn the rule instead of the word: Latin *f-* → Spanish *h-* (*facere → hacer*, *filius → hijo*, *ferrum → hierro*), *-tion ↔ -ción ↔ -ция*, German *t* ↔ English *d*. One key unlocks hundreds of words and becomes its own review card. For Arabic: three-letter roots — *k-t-b* gives *kitap*, *mektup*, *kâtip* in Turkish.
- **Sound bridges** — pronunciation through sounds you already have: Spanish *j* is Russian *х*; Arabic *ع* has no match anywhere, and Polygraph says so.
- **Teacher mode** — the AI plays a learner making the mistakes a speaker of *your* language typically makes; you correct them.
- **Babel sentence** — a sentence mixing all your languages plus one target word; training the switch between languages.
- **Community bridge packs** — since everything is Markdown, a pack is a folder in a GitHub repo; human-verified bridges flow back to everyone.
- **Screen capture for gamers** — a hotkey that OCRs the game screen and drops unknown words into the inbox.
