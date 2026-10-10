// Провайдеры ИИ. Почти все говорят на OpenAI-совместимом API, поэтому
// один клиент покрывает и локальные модели на ПК, и облачные на телефоне.

export type AiKind = "openai" | "anthropic";

export interface AiConfig {
  preset: string;
  kind: AiKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Preset {
  id: string;
  label: string;
  kind: AiKind;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  local: boolean;
  /** Можно пользоваться бесплатно: без ключа, локально или на бесплатном тарифе. */
  free?: "nokey" | "local" | "tier";
  models?: string[];
  keyUrl?: string;
}

export const PRESETS: Preset[] = [
  // Работает сразу, без ключа и регистрации. Тексты уходят на сервер Pollinations.
  { id: "free", label: "Pollinations", kind: "openai", baseUrl: "https://text.pollinations.ai/openai", model: "openai", needsKey: false, local: false, free: "nokey" },
  { id: "lmstudio", label: "LM Studio", kind: "openai", baseUrl: "http://localhost:1234/v1", model: "", needsKey: false, local: true, free: "local" },
  { id: "ollama", label: "Ollama", kind: "openai", baseUrl: "http://localhost:11434/v1", model: "", needsKey: false, local: true, free: "local" },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "", needsKey: true, local: false, free: "tier", keyUrl: "https://openrouter.ai/keys" },
  { id: "groq", label: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "", needsKey: true, local: false, free: "tier", keyUrl: "https://console.groq.com/keys" },
  { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "", needsKey: true, local: false, keyUrl: "https://platform.openai.com/api-keys" },
  { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true, local: false, keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "gemini", label: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "", needsKey: true, local: false, free: "tier", keyUrl: "https://aistudio.google.com/apikey" },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    needsKey: true,
    local: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  { id: "custom", label: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "", model: "", needsKey: false, local: false },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}

export function configFromPreset(p: Preset, prev?: AiConfig): AiConfig {
  return { preset: p.id, kind: p.kind, baseUrl: p.baseUrl, model: p.model, apiKey: prev?.preset === p.id ? prev.apiKey : "" };
}

// По умолчанию — бесплатный провайдер без ключа: ИИ работает с первой минуты.
export const DEFAULT_AI: AiConfig = configFromPreset(PRESETS[0]);

export function aiReady(c: AiConfig): boolean {
  const p = presetById(c.preset);
  return !!c.baseUrl && !!c.model && (!p.needsKey || !!c.apiKey);
}
