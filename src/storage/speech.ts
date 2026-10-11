import { langInfo } from "../core/languages";

// Распознавание речи на устройстве: Whisper (tiny, ~40 МБ) в WebAssembly
// через transformers.js. Библиотека и модель скачиваются при первом
// использовании и кэшируются браузером, поэтому не раздувают установщик
// и APK; звук никуда не уходит.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
type Pipeline = (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;

let asr: Promise<Asr> | null = null;

export function loadAsr(onProgress?: (p: number) => void): Promise<Asr> {
  asr ??= (import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<{ pipeline: Pipeline }>).then(
    ({ pipeline }) =>
      pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        progress_callback: (e: { status?: string; progress?: number }) => {
          if (e.status === "progress" && typeof e.progress === "number") onProgress?.(e.progress / 100);
        },
      }) as unknown as Promise<Asr>,
  );
  asr.catch(() => (asr = null));
  return asr;
}

/** Записать звук с микрофона и вернуть моно 16 кГц — так ждёт Whisper. */
export async function record(seconds: number): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    rec.stop();
    await done;
    const buf = await new Blob(chunks).arrayBuffer();
    const ctx = new AudioContext({ sampleRate: 16000 });
    const audio = await ctx.decodeAudioData(buf);
    await ctx.close();
    return audio.getChannelData(0);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * В записи нет речи. На тишине Whisper «слышит» выдуманные фразы, поэтому
 * такую запись лучше не распознавать вовсе.
 */
export function isSilent(audio: Float32Array, threshold = 0.01): boolean {
  let sum = 0;
  for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / Math.max(1, audio.length)) < threshold;
}

export async function transcribe(audio: Float32Array, lang: string, onProgress?: (p: number) => void): Promise<string> {
  const run = await loadAsr(onProgress);
  const out = await run(audio, { language: langInfo(lang).name.toLowerCase().replace(/\s*\(.*\)$/, ""), task: "transcribe" });
  return (Array.isArray(out) ? out[0]?.text : out.text)?.trim() ?? "";
}
