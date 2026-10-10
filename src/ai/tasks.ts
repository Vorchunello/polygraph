import { langInfo, langName } from "../core/languages";
import type { Bridge, Concept, Example, LangCode, Profile, Route, Term } from "../core/types";
import { complete } from "./client";
import type { AiConfig } from "./config";
import { extractJson } from "./json";

// Промпты пишутся по-английски — так их одинаково понимают и облачные,
// и маленькие локальные модели. Ответ — на языке интерфейса ученика.

function learnerContext(profile: Profile, target: LangCode): string {
  const known = profile.known.map((k) => `${langName(k.code, "en")} [${k.code}] (${k.level})`).join(", ");
  const level = profile.learning.find((l) => l.code === target)?.level ?? "A1";
  return `The learner studies ${langName(target, "en")} [${target}] at level ${level}. Languages the learner already knows: ${known}.`;
}

function uiLanguage(profile: Profile): string {
  return langName(profile.uiLang, "en");
}

const HONESTY = [
  "Honesty rules:",
  "- Only claim a connection (cognate, loanword, shared root) that standard etymological dictionaries support. If a language has no real connection, leave it out — never invent one.",
  "- Mark a bridge as \"broken\" when it misleads: false friends, or grammatical gender that differs between the languages.",
  "- If you are not sure about an etymology, say so explicitly in the text.",
].join("\n");

export interface ConceptDraft {
  terms: Record<LangCode, Term>;
  bridges: Bridge[];
  etymology?: string;
  examples: Example[];
  tags: string[];
}

export async function draftConcept(
  cfg: AiConfig,
  profile: Profile,
  target: LangCode,
  word: string,
  hint = "",
): Promise<ConceptDraft> {
  const langs = [target, ...profile.known.map((k) => k.code).filter((c) => c !== target)];
  const level = profile.learning.find((l) => l.code === target)?.level ?? "A1";
  const genderLangs = langs.filter((c) => langInfo(c).gender !== "none");
  const articleLangs = langs.filter((c) => langInfo(c).articles);

  const system = [
    "You are Polygraph, a comparative linguist and language teacher. You connect words of a new language to the languages a learner already knows.",
    learnerContext(profile, target),
    HONESTY,
    `Write every explanation (notes, etymology, translations of examples) in ${uiLanguage(profile)}.`,
    "Reply with a single JSON object and nothing else.",
  ].join("\n\n");

  const prompt = [
    `Input: «${word}»${hint ? ` (context: ${hint})` : ""}.`,
    `It may be written in any language. Identify the concept and give it in ${langName(target, "en")} [${target}] — the main entry — and in every known language.`,
    "",
    "JSON shape:",
    "{",
    `  "terms": { ${langs.map((c) => `"${c}": {"text": "..."}`).join(", ")} },`,
    `  "bridges": [{"from": "<known language code>", "kind": "cognate|loan|false-friend|gender|grammar|sound|mnemonic", "strength": "strong|weak|broken", "note": "1-2 sentences"}],`,
    `  "etymology": "short origin chain, e.g. Latin nox, noctis → Spanish noche; same Proto-Indo-European root as Russian ночь and English night",`,
    `  "examples": [{"lang": "${target}", "text": "...", "tr": "translation"}],`,
    `  "tags": ["1-3 short topic tags in English"]`,
    "}",
    "",
    "Term fields:",
    "- text: the word itself, without the article.",
    genderLangs.length ? `- gender: "m", "f", "n" or "c" — only for ${genderLangs.join(", ")}.` : "",
    articleLangs.length ? `- article: the definite article for nouns — only for ${articleLangs.join(", ")}.` : "",
    "- translit: romanization, only for non-Latin scripts.",
    "",
    `Bridges: one per known language where a real link exists — shared root, loanword (also through a third language, e.g. Arabic words in both Spanish and Turkish), similar sound, or a gender that matches or mismatches the ${target} word.`,
    `Examples: exactly 2, natural, level ${level}.`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const text = await complete(cfg, { system, prompt, maxTokens: 3000 });
  const raw = extractJson<Partial<ConceptDraft>>(text);
  return normalizeDraft(raw, target);
}

const KINDS = new Set(["cognate", "loan", "false-friend", "gender", "grammar", "sound", "mnemonic"]);
const STRENGTHS = new Set(["strong", "weak", "broken"]);

export function normalizeDraft(raw: Partial<ConceptDraft>, target: LangCode): ConceptDraft {
  const terms: Record<LangCode, Term> = {};
  for (const [code, t] of Object.entries(raw.terms ?? {})) {
    const term = typeof t === "string" ? { text: t } : (t as Term);
    if (!term?.text) continue;
    const clean: Term = { text: String(term.text).trim() };
    if (term.gender && ["m", "f", "n", "c"].includes(term.gender)) clean.gender = term.gender;
    if (term.article) clean.article = String(term.article).trim();
    if (term.translit) clean.translit = String(term.translit).trim();
    terms[code.toLowerCase()] = clean;
  }
  if (!terms[target]) throw new Error(`The model did not return a ${target} word`);
  const bridges: Bridge[] = (raw.bridges ?? [])
    .filter((b) => b && b.from && b.note)
    .map((b) => ({
      from: String(b.from).toLowerCase(),
      kind: (KINDS.has(b.kind) ? b.kind : "cognate") as Bridge["kind"],
      strength: (STRENGTHS.has(b.strength) ? b.strength : "weak") as Bridge["strength"],
      note: String(b.note),
      verified: false,
      source: "ai",
    }));
  return {
    terms,
    bridges,
    etymology: raw.etymology ? String(raw.etymology) : undefined,
    examples: (raw.examples ?? []).filter((e) => e?.text).map((e) => ({ lang: e.lang || target, text: e.text, tr: e.tr })),
    tags: (raw.tags ?? []).map(String).slice(0, 3),
  };
}

function routesBlock(routes: Route[]): string {
  const active = routes.filter((r) => r.marker !== "-");
  if (!active.length) return "";
  const m = { "+": "always", "!": "when helpful", "?": "ask the learner first", "-": "never" };
  return [
    "Explanation routes chosen by the learner (topic → explain through this language):",
    ...active.map((r) => `- ${r.topic} → ${langName(r.via, "en")} [${r.via}] (${m[r.marker]})`),
    ...routes.filter((r) => r.marker === "-").map((r) => `- never use ${r.via} for: ${r.topic}`),
  ].join("\n");
}

export async function explain(
  cfg: AiConfig,
  profile: Profile,
  target: LangCode,
  routes: Route[],
  question: string,
  concept?: Concept,
): Promise<string> {
  const system = [
    "You are Polygraph, a language teacher who explains a new language through the languages the learner already knows.",
    learnerContext(profile, target),
    routesBlock(routes),
    "Method: find the closest equivalent structure in a known language and show where the analogy holds and where it breaks. For idioms and set phrases, give matching idioms from each known language when they exist, and say so when none exists. Mention etymology only when it makes the rule easier to remember.",
    HONESTY,
    `Answer in ${uiLanguage(profile)}, in Markdown. Be concise: short sections, examples in ${langName(target, "en")} with translations.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ctx = concept
    ? `\n\nThe question is about this entry: ${Object.entries(concept.terms)
        .map(([c, t]) => `${c}: ${t.article ? t.article + " " : ""}${t.text}`)
        .join("; ")}`
    : "";
  return complete(cfg, { system, prompt: question + ctx, maxTokens: 3000 });
}

export const STORY_STYLES = ["ielts", "dialogue", "fairytale", "news", "diary", "frank", "diglot"] as const;
export type StoryStyle = (typeof STORY_STYLES)[number];

const STYLE_SPEC: Record<StoryStyle, (t: string, ui: string) => string> = {
  ielts: (t) =>
    `an IELTS Academic Reading passage (about 350 words) in ${t}, followed by 5 questions (True / False / Not Given and short answer) and an answer key at the very end`,
  dialogue: (t) => `a natural everyday dialogue in ${t} between two people, 12–20 lines`,
  fairytale: (t) => `a short fairy tale in ${t} (about 250 words)`,
  news: (t) => `a short news article in ${t} (about 250 words) with a headline`,
  diary: (t) => `a personal diary entry in ${t} (about 200 words)`,
  frank: (t, ui) =>
    `a short story in ${t} formatted with Ilya Frank's reading method: first each paragraph sentence by sentence with a literal ${ui} translation and glosses of hard words in parentheses right after the ${t} phrases, then the same paragraph again in clean ${t} without any help`,
  diglot: (t, ui) =>
    `a diglot weave story: written in ${ui}, but every listed word appears in its ${t} form. Start with single ${t} words and increase their share paragraph by paragraph, so the last paragraph is fully in ${t}`,
};

export async function story(
  cfg: AiConfig,
  profile: Profile,
  target: LangCode,
  words: Concept[],
  style: StoryStyle,
  topic: string,
): Promise<string> {
  const t = langName(target, "en");
  const ui = uiLanguage(profile);
  const level = profile.learning.find((l) => l.code === target)?.level ?? "A1";
  const list = words.map((c) => c.terms[target]?.text).filter(Boolean);
  const system = [
    "You are Polygraph, a writer of graded readers for language learners.",
    learnerContext(profile, target),
    `Write in Markdown. Keep vocabulary and grammar at level ${level}, except for the listed words.`,
  ].join("\n\n");
  const prompt = [
    `Write ${STYLE_SPEC[style](t, ui)}.`,
    topic ? `Topic: ${topic}.` : "",
    `Use every one of these words at least once and put each in **bold**: ${list.join(", ")}.`,
    `Finish with a "Glossary" table: ${t} word | ${ui} meaning — only the bold words.`,
  ]
    .filter(Boolean)
    .join("\n");
  return complete(cfg, { system, prompt, maxTokens: 6000 });
}
