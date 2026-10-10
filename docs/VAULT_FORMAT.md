# Vault format

Polygraph stores everything as Markdown files with YAML frontmatter. The app is an interface to this folder: you can edit the files by hand, keep them in git, open them in Obsidian or generate them with a script, and Polygraph will pick the changes up on the next start.

API keys and other device settings are **not** stored in the vault.

## `profile.md`

```yaml
---
uiLang: ru
known:
  - code: ru
    level: native
  - code: tr
    level: C1
  - code: en
    level: B2
learning:
  - code: es
    level: A2
target: es        # the language currently active in the app
created: 2026-10-10
---
```

Language codes are ISO 639-1 (`es`, `ru`) or 639-3 when there is no two-letter code. Levels: `native`, `C2`, `C1`, `B2`, `B1`, `A2`, `A1`, `A0`.

## `words/<id>.md`

One concept per file. The file name is the id.

```yaml
---
id: noche
terms:
  es: { text: noche, gender: f, article: la }
  ru: { text: ночь, gender: f }
  tr: { text: gece }
  en: { text: night }
bridges:
  - from: ru
    kind: cognate        # cognate | loan | false-friend | gender | grammar | sound | mnemonic
    strength: strong     # strong (reliable) | weak (partial) | broken (a trap)
    note: Same Proto-Indo-European root as Russian ночь.
    verified: false      # true once a human or a dictionary confirmed it
    source: ai           # ai | user | any free text
etymology: Latin nox, noctis → Spanish noche.
etymologyVerified: false
examples:
  - { lang: es, text: Buenas noches., tr: Спокойной ночи. }
tags: [time]
srs:
  es: { due: 2026-10-13, interval: 3, ease: 2.5, reps: 2, lapses: 0, last: 2026-10-10 }
created: 2026-10-10
updated: 2026-10-10
---

Free notes in Markdown. AI explanations you choose to keep are appended here.
```

- `terms` — the word in any number of languages. `gender` is `m`, `f`, `n` or `c` (common); `translit` holds a romanization for non-Latin scripts.
- `srs` — review state per target language, so the same concept can be studied in Spanish and in Arabic independently.

## `routes/<lang>.md`

Which known language explains which topic of a target language. One rule per line:

```markdown
- [gender] Grammatical gender — via ru — [+]
- [articles] Articles (definite/indefinite) — via en — [+]
- [ser-estar] Ser vs estar — via tr — [?]
```

Markers (inherited from Forge): `[+]` always, `[-]` never, `[!]` the AI decides, `[?]` the AI should ask you first. `через` works instead of `via`. Lines in any other format are ignored, so you can write notes around the rules.

## `inbox.md`

```markdown
# Inbox

- echar de menos
- #spanish ojalá
```

Every `- item` line is one entry. `#tag` labels become tags of the concept when the inbox is processed.

## `texts/`

Stories and answers you saved, with `title`, `created`, `kind`, `style` and `lang` in the frontmatter.

## `exports/`

Files produced by Settings → Data → Export.
