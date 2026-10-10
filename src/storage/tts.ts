import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { platform } from "./platform";

// Озвучка. В Android WebView нет speechSynthesis, поэтому там — нативный
// движок через плагин. Обе ветки возвращают промис, который завершается,
// когда фраза договорена: на этом держится последовательность плейлиста.

export function canSpeak(): boolean {
  return platform() === "android" || (typeof window !== "undefined" && "speechSynthesis" in window);
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase() === lang) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang));
}

export async function speakAsync(text: string, lang: string, rate = 1): Promise<void> {
  if (!text.trim()) return;
  if (platform() === "android") {
    await TextToSpeech.speak({ text, lang, rate, category: "playback" });
    return;
  }
  if (!("speechSynthesis" in window)) return;
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export async function stopSpeaking(): Promise<void> {
  if (platform() === "android") await TextToSpeech.stop().catch(() => undefined);
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** Есть ли голос для языка. На ПК без языкового пакета чтение будет с акцентом. */
export async function hasVoice(lang: string): Promise<boolean> {
  if (platform() === "android") {
    try {
      const { languages } = await TextToSpeech.getSupportedLanguages();
      return languages.some((l) => l.toLowerCase().startsWith(lang));
    } catch {
      return true;
    }
  }
  if (!("speechSynthesis" in window)) return false;
  return !!pickVoice(lang);
}
