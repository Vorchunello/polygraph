import Anthropic from "@anthropic-ai/sdk";
import { platformFetch } from "../storage/platform";
import type { AiConfig } from "./config";

export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

/**
 * Ошибка ИИ. code — причина, которую интерфейс переводит в понятный совет:
 *   limit   — модель не успела ответить (лимит токенов бесплатного сервиса);
 *   payment — сервис требует ключ или оплату;
 *   json    — ответ так и не стал корректным JSON.
 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code?: "limit" | "payment" | "json",
  ) {
    super(message);
  }
}

export async function complete(cfg: AiConfig, req: CompletionRequest): Promise<string> {
  const text = cfg.kind === "anthropic" ? await completeAnthropic(cfg, req) : await completeOpenAI(cfg, req);
  return stripThinking(text);
}

/** Локальные «думающие» модели (Qwen3, DeepSeek-R1) пишут рассуждение в теги. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

function base(url: string): string {
  return url.replace(/\/+$/, "");
}

async function completeOpenAI(cfg: AiConfig, req: CompletionRequest): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.preset === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/Vorchunello/polygraph";
    headers["X-Title"] = "Polygraph";
  }
  const body = JSON.stringify({
    model: cfg.model,
    // Pollinations без ключа отвечает 402 на любой запрос с max_tokens.
    ...(cfg.preset === "free" ? {} : { max_tokens: req.maxTokens ?? 4000 }),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ],
  });
  let res: Response;
  // Бесплатные API ограничивают частоту: на 429/503 ждём и пробуем ещё раз.
  for (let attempt = 0; ; attempt++) {
    try {
      res = await platformFetch(`${base(cfg.baseUrl)}/chat/completions`, { method: "POST", headers, body });
    } catch (e) {
      throw new AiError(`Network error: ${(e as Error).message}. Is the server running at ${cfg.baseUrl}?`);
    }
    if ((res.status !== 429 && res.status !== 503) || attempt >= 3) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, (retryAfter > 0 ? Math.min(retryAfter, 30) : 3 * (attempt + 1)) * 1000));
  }
  const raw = await res.text();
  if (res.status === 402) throw new AiError(`HTTP 402: ${raw.slice(0, 200)}`, "payment");
  if (!res.ok) throw new AiError(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
  let data: { choices?: { message?: { content?: unknown }; finish_reason?: string }[] };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new AiError(`Unexpected response: ${raw.slice(0, 400)}`);
  }
  const choice = data.choices?.[0];
  const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
  // «Думающие» модели могут потратить весь лимит на рассуждение и не написать ответ.
  if (!content.trim()) throw new AiError("The model returned an empty answer", choice?.finish_reason === "length" ? "limit" : undefined);
  return content;
}

// Модели, у которых есть серверный откат при отказе классификатора.
const FALLBACK_MODELS = /^claude-(opus-5|fable-5)/;

async function completeAnthropic(cfg: AiConfig, req: CompletionRequest): Promise<string> {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: base(cfg.baseUrl) || undefined,
    dangerouslyAllowBrowser: true, // ключ пользователя, хранится только на его устройстве
    fetch: platformFetch,
  });
  const params = {
    model: cfg.model,
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    messages: [{ role: "user" as const, content: req.prompt }],
  };
  try {
    const msg = FALLBACK_MODELS.test(cfg.model)
      ? await client.beta.messages.create({
          ...params,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)
      : await client.messages.create(params);
    if (msg.stop_reason === "refusal") throw new AiError("The model declined this request.");
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Anthropic: invalid API key.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Anthropic: rate limit, try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic ${e.status ?? ""}: ${e.message}`);
    throw new AiError((e as Error).message);
  }
}

/** Список моделей сервера — чтобы не вводить имя модели руками. */
export async function listModels(cfg: AiConfig): Promise<string[]> {
  if (cfg.kind === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, fetch: platformFetch });
    const out: string[] = [];
    for await (const m of client.models.list()) out.push(m.id);
    return out;
  }
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await platformFetch(`${base(cfg.baseUrl)}/models`, { headers });
  if (!res.ok) throw new AiError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const list: { id: string }[] = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  return list.map((m) => String(m.id).replace(/^models\//, "")).sort();
}
