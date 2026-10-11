// Насколько произнесённое похоже на ожидаемое: расстояние Левенштейна по
// буквам после нормализации (регистр, диакритика, знаки препинания).

export function normalizeSpeech(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ْٰ֑-ׇ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** 0..1, где 1 — совпадение. */
export function speechScore(heard: string, expected: string): number {
  const h = normalizeSpeech(heard);
  const e = normalizeSpeech(expected);
  if (!e) return 0;
  if (h === e) return 1;
  // Распознаватель часто добавляет артикль или окружение — ищем слово внутри.
  if (h.split(" ").includes(e)) return 0.95;
  return Math.max(0, 1 - levenshtein(h, e) / Math.max(h.length, e.length));
}
