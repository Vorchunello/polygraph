import { Capacitor } from "@capacitor/core";

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** API, которое Electron отдаёт в окно через preload (electron/preload.cjs). */
export interface ElectronBridge {
  vault: {
    root(): Promise<string>;
    choose(): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    read(path: string): Promise<string | null>;
    write(path: string, content: string): Promise<void>;
    remove(path: string): Promise<void>;
    reveal(): Promise<void>;
  };
  http(req: HttpRequest): Promise<HttpResponse>;
}

declare global {
  interface Window {
    polygraph?: ElectronBridge;
  }
}

export type Platform = "electron" | "android" | "web";

export function platform(): Platform {
  if (window.polygraph) return "electron";
  if (Capacitor.isNativePlatform()) return "android";
  return "web";
}

/**
 * fetch без CORS-ограничений. В Electron запрос уходит через главный процесс
 * (локальные LM Studio и Ollama часто не отдают CORS-заголовки), на Android
 * fetch и так нативный — его подменяет CapacitorHttp.
 */
export const platformFetch: typeof fetch = async (input, init) => {
  const bridge = window.polygraph;
  if (!bridge) return fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
  const res = await bridge.http({
    url,
    method: init?.method ?? "GET",
    headers,
    body: typeof init?.body === "string" ? init.body : undefined,
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
};
