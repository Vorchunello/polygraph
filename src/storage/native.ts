import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// Свой Android-плагин (android/app/src/main/java/.../PolygraphNativePlugin.java):
// плавающая полоска со словами поверх других приложений и приём текста
// через «Поделиться».

export interface OverlayWord {
  id: string;
  tgt: string;
  sub: string;
}

interface PolygraphNative {
  canDrawOverlays(): Promise<{ value: boolean }>;
  requestOverlayPermission(): Promise<void>;
  startOverlay(opts: { words: OverlayWord[]; intervalSec: number; askEvery: number }): Promise<void>;
  stopOverlay(): Promise<void>;
  /** id слов, на которых нажали «не знаю», с прошлого вызова. */
  takeOverlayResults(): Promise<{ unknown: string[] }>;
  takeSharedText(): Promise<{ text?: string | null }>;
  addListener(event: "sharedText", fn: (d: { text: string }) => void): Promise<PluginListenerHandle>;
}

export const Native = registerPlugin<PolygraphNative>("PolygraphNative");
