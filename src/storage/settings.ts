import { Preferences } from "@capacitor/preferences";
import { platform } from "./platform";

// Локальные настройки устройства — ключи API и выбор модели. В хранилище
// (md-папку) они намеренно не попадают: папка синхронизируется и может уйти
// в git, а ключ не должен.

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = platform() === "android" ? (await Preferences.get({ key })).value : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const raw = JSON.stringify(value);
  try {
    if (platform() === "android") await Preferences.set({ key, value: raw });
    else localStorage.setItem(key, raw);
  } catch {
    /* приватный режим браузера — настройка проживёт до перезагрузки */
  }
}
