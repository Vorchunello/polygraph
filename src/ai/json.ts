/** Достаёт JSON из ответа модели: снимает ```-ограждения, режет болтовню
 *  до и после объекта, прощает висячие запятые (частая ошибка локальных моделей). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  let s = fenced ? fenced[1] : text;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the model response");
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")) as T;
  }
}
