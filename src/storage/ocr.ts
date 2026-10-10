import { createWorker, type Worker } from "tesseract.js";

// Распознавание текста с фото и скриншотов (Tesseract, работает в WebAssembly
// прямо на устройстве). Модели языков скачиваются один раз при первом
// распознавании и дальше лежат в кэше браузера.

const TESS: Record<string, string> = {
  en: "eng", ru: "rus", es: "spa", fr: "fra", de: "deu", it: "ita", pt: "por", tr: "tur", ar: "ara", zh: "chi_sim",
  ja: "jpn", ko: "kor", hi: "hin", bn: "ben", id: "ind", uk: "ukr", pl: "pol", fa: "fas", ur: "urd", vi: "vie",
  nl: "nld", sv: "swe", el: "ell", he: "heb", kk: "kaz", az: "aze", uz: "uzb", th: "tha", sw: "swa", la: "lat",
};

export function ocrSupported(lang: string): boolean {
  return lang in TESS;
}

let cached: { key: string; worker: Promise<Worker> } | null = null;

function workerFor(langs: string[], onProgress?: (p: number) => void): Promise<Worker> {
  const codes = [...new Set(langs.map((l) => TESS[l]).filter(Boolean))];
  const key = codes.join("+") || "eng";
  if (cached?.key !== key) {
    cached?.worker.then((w) => w.terminate());
    cached = {
      key,
      worker: createWorker(codes.length ? codes : ["eng"], 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") onProgress?.(m.progress);
        },
      }),
    };
  }
  return cached.worker;
}

/** Текст с картинки (Blob, data URL или URL). langs — ожидаемые языки текста. */
export async function recognize(image: Blob | string, langs: string[], onProgress?: (p: number) => void): Promise<string> {
  const worker = await workerFor(langs, onProgress);
  const { data } = await worker.recognize(image);
  return data.text.trim();
}
