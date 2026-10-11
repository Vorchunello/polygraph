/** Достаёт JSON из ответа модели: снимает ```-ограждения, режет болтовню
 *  до и после объекта, прощает висячие запятые (частая ошибка локальных моделей)
 *  и чинит ответ, оборванный на полуслове по лимиту токенов. */
export function extractJson<T = unknown>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(text);
  let s = fenced ? fenced[1] : text;
  const start = s.indexOf("{");
  if (start < 0) throw new Error("No JSON object in the model response");
  s = s.slice(start);
  const end = s.lastIndexOf("}");
  const whole = end > 0 ? s.slice(0, end + 1) : s;
  for (const candidate of [whole, whole.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* пробуем дальше */
    }
  }
  return JSON.parse(repairTruncated(s)) as T;
}

/**
 * Оборванный JSON: закрываем недописанную строку, выбрасываем недописанный
 * последний элемент и закрываем все открытые скобки. Лучше получить 8 из 10
 * предложений, чем ничего.
 */
export function repairTruncated(src: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // Позиция, после которой обрезаем: конец последнего целого значения.
  let lastSafe = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      lastSafe = i + 1;
    } else if (ch === ",") lastSafe = i;
  }
  let s = src.slice(0, lastSafe).replace(/,\s*$/, "");
  // Пересчитываем незакрытые скобки для обрезанного куска.
  const open: string[] = [];
  inString = false;
  escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") open.pop();
  }
  s = s.replace(/,\s*$/, "").replace(/:\s*$/, ': ""');
  return s + open.reverse().join("");
}
