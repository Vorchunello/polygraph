// Подключить Google Форму для жалоб на ответы ИИ (см. docs/GOOGLE_PLAY.md).
//
//   node scripts/report-form.mjs https://docs.google.com/forms/d/e/<id>/viewform
//
// В форме — шесть вопросов именно в таком порядке (любые названия, тип «Текст»
// или «Абзац»): где, причина, комментарий, ответ ИИ, модель, версия приложения.
// Скрипт читает id полей со страницы формы и вписывает их в src/storage/report.ts.

import fs from "node:fs/promises";

const url = process.argv[2];
if (!url || !/^https:\/\/docs\.google\.com\/forms\/.+\/viewform/.test(url)) {
  console.error("Usage: node scripts/report-form.mjs https://docs.google.com/forms/d/e/<id>/viewform");
  process.exit(1);
}

const html = await (await fetch(url)).text();
const m = /FB_PUBLIC_LOAD_DATA_ = (\[.*?\]);<\/script>/s.exec(html);
if (!m) throw new Error("Form data not found — is the form public (no sign-in required)?");
const data = JSON.parse(m[1]);
// data[1][1] — вопросы; у каждого [id, title, …, type, [[entryId, …]]].
const questions = (data[1][1] ?? []).filter((q) => Array.isArray(q[4]) && q[4][0]);
if (questions.length < 6) throw new Error(`The form needs 6 text questions, found ${questions.length}`);
const ids = questions.slice(0, 6).map((q) => `entry.${q[4][0][0]}`);
const names = ["kind", "reason", "comment", "content", "model", "app"];
questions.slice(0, 6).forEach((q, i) => console.log(`${names[i].padEnd(8)} ← «${q[1]}» ${ids[i]}`));

const post = url.replace(/\/viewform.*$/, "/formResponse");
const file = new URL("../src/storage/report.ts", import.meta.url);
let src = await fs.readFile(file, "utf8");
src = src.replace(/url: "[^"]*",\n  fields: \{[^}]*\}/, `url: "${post}",\n  fields: { ${names.map((n, i) => `${n}: "${ids[i]}"`).join(", ")} }`);
await fs.writeFile(file, src);
console.log(`\nsrc/storage/report.ts → ${post}`);
