import { createServerFn } from "@tanstack/react-start";

/**
 * Agent Brain — multi-provider LLM layer.
 *
 * Free-first design: stack Google Gemini + Groq + OpenRouter free tiers and
 * auto-rotate when a provider rate-limits. xAI (Grok) is optional passthrough
 * for accounts that have promo credits or paid credits. Keys are pasted by the
 * user in-app and stored only in this browser (localStorage); they are never
 * logged, and never accepted through chat.
 */

export type LlmProvider = "gemini" | "groq" | "openrouter" | "xai" | "openai";

export type LlmProviderInfo = {
  id: LlmProvider;
  label: string;
  keyUrl: string;
  keyHint: string;
  defaultModel: string;
  freeNote: string;
};

export const LLM_PROVIDER_ORDER: LlmProvider[] = ["gemini", "groq", "openrouter", "xai", "openai"];

/** Server-side env var that can carry each provider's key (see `.env`). */
export const LLM_ENV_KEYS: Record<LlmProvider, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  openai: "OPENAI_API_KEY",
};

export const LLM_PROVIDERS: Record<LlmProvider, LlmProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AI Studio → API keys",
    defaultModel: "gemini-2.5-flash",
    freeNote: "Free tier: ~1,500 requests/day on Flash. No credit card.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    keyUrl: "https://console.groq.com/keys",
    keyHint: "Console → API Keys",
    defaultModel: "openai/gpt-oss-20b",
    freeNote: "Free tier: fast open models. No credit card.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "Keys → Create Key",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    freeNote: "Free tier: 25+ ':free' models. No credit card.",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    keyUrl: "https://console.x.ai",
    keyHint: "Console → API Keys",
    defaultModel: "grok-4.7",
    freeNote:
      "No permanent free tier — new accounts may get ~$25 promo credits (a card may be required to activate). Optional.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "Platform → API keys",
    defaultModel: "gpt-4o-mini",
    freeNote: "Paid credits (no free tier) — kept last in the rotation to protect the balance.",
  },
};

/* --------------------------- Browser-side key vault --------------------------- */

export const BRAIN_STORE_KEY = "chainscout.brain.v1";

export type BrainProviderConfig = {
  apiKey: string;
  model: string;
  enabled: boolean;
};

export type BrainConfig = Record<LlmProvider, BrainProviderConfig>;

export function defaultBrainConfig(): BrainConfig {
  return {
    gemini: {
      apiKey: "",
      model: LLM_PROVIDERS.gemini.defaultModel,
      enabled: true,
    },
    groq: { apiKey: "", model: LLM_PROVIDERS.groq.defaultModel, enabled: true },
    openrouter: {
      apiKey: "",
      model: LLM_PROVIDERS.openrouter.defaultModel,
      enabled: true,
    },
    xai: {
      apiKey: "",
      model: LLM_PROVIDERS.xai.defaultModel,
      enabled: true,
    },
    openai: {
      apiKey: "",
      model: LLM_PROVIDERS.openai.defaultModel,
      enabled: true,
    },
  };
}

export function loadBrainConfig(): BrainConfig {
  const fallback = defaultBrainConfig();
  try {
    const raw = localStorage.getItem(BRAIN_STORE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<LlmProvider, Partial<BrainProviderConfig>>>;
    const next = defaultBrainConfig();
    for (const id of LLM_PROVIDER_ORDER) {
      const entry = parsed?.[id];
      if (!entry || typeof entry !== "object") continue;
      next[id] = {
        apiKey: typeof entry.apiKey === "string" ? entry.apiKey.trim() : "",
        model:
          typeof entry.model === "string" && entry.model.trim()
            ? entry.model.trim()
            : fallback[id].model,
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : fallback[id].enabled,
      };
    }
    return next;
  } catch {
    return fallback;
  }
}

export function saveBrainConfig(config: BrainConfig): void {
  try {
    localStorage.setItem(BRAIN_STORE_KEY, JSON.stringify(config));
  } catch {
    // Storage full or blocked — the in-memory config still works for this session.
  }
}

export type ServerKeyStatus = Partial<Record<LlmProvider, boolean>>;

export function readyProviders(config: BrainConfig, serverKeys?: ServerKeyStatus): LlmProvider[] {
  return LLM_PROVIDER_ORDER.filter(
    (id) => config[id].enabled && (config[id].apiKey.length > 0 || serverKeys?.[id] === true),
  );
}

/* ------------------------------ Error taxonomy ------------------------------ */

export type LlmErrorCode =
  "auth" | "model" | "rate-limit" | "upstream" | "network" | "bad-response";

export function classifyHttpError(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "upstream";
  return "bad-response";
}

export function isRetryableLlmCode(code: LlmErrorCode): boolean {
  return code === "rate-limit" || code === "upstream" || code === "network";
}

export const LLM_ERROR_HINT: Record<LlmErrorCode, string> = {
  auth: "Key rejected — check the key was pasted correctly and is active.",
  model: "Model not found for this key — edit the model name for this provider.",
  "rate-limit": "Rate limit reached — moving to the next provider in the stack.",
  upstream: "Provider had a hiccup — trying the next provider.",
  network: "Network error reaching the provider — trying the next provider.",
  "bad-response": "Unexpected provider response — trying the next provider.",
};

/* ------------------------------- Server bridge ------------------------------- */

export type LlmRequest = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
};

export type LlmResult =
  | { ok: true; provider: LlmProvider; model: string; text: string }
  | { ok: false; provider: LlmProvider; code: LlmErrorCode; error: string };

function cleanText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const content = (candidates[0] as { content?: { parts?: unknown[] } }).content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => cleanText((part as { text?: unknown }).text, 8000))
    .filter(Boolean)
    .join("\n");
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return cleanText(message?.content, 8000);
}

/** Which providers have a server-side env key configured (booleans only — never the values). */
export const brainEnvStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<ServerKeyStatus> => {
    const status: ServerKeyStatus = {};
    for (const id of LLM_PROVIDER_ORDER) {
      status[id] = Boolean((process.env[LLM_ENV_KEYS[id]] ?? "").trim());
    }
    return status;
  },
);

export const askLlm = createServerFn({ method: "POST" })
  .validator((input: unknown): LlmRequest => {
    const data = (input ?? {}) as Partial<LlmRequest>;
    const provider = String(data.provider ?? "") as LlmProvider;
    if (!LLM_PROVIDER_ORDER.includes(provider)) {
      throw new Error("Unknown LLM provider.");
    }
    const apiKey = cleanText(data.apiKey, 300);
    // Empty key is allowed: the handler falls back to the server-side env key.
    return {
      provider,
      apiKey,
      model: cleanText(data.model, 120) || LLM_PROVIDERS[provider].defaultModel,
      system: cleanText(data.system, 4000),
      prompt: cleanText(data.prompt, 8000),
      maxTokens: Math.min(Math.max(Number(data.maxTokens) || 600, 64), 2000),
    };
  })
  .handler(async (ctx): Promise<LlmResult> => {
    const req = ctx.data;
    const apiKey = req.apiKey || (process.env[LLM_ENV_KEYS[req.provider]] ?? "").trim();
    if (!apiKey) {
      return {
        ok: false,
        provider: req.provider,
        code: "auth",
        error: `No API key for ${LLM_PROVIDERS[req.provider].label} — paste one in Agent Brain or set ${LLM_ENV_KEYS[req.provider]} on the server.`,
      };
    }
    const timeout = AbortSignal.timeout(45_000);
    try {
      let response: Response;
      let payload: unknown;

      if (req.provider === "gemini") {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: timeout,
            body: JSON.stringify({
              systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
              contents: [{ role: "user", parts: [{ text: req.prompt }] }],
              generationConfig: { maxOutputTokens: req.maxTokens },
            }),
          },
        );
        payload = await response.json().catch(() => null);
        if (!response.ok) {
          const code = classifyHttpError(response.status);
          return { ok: false, provider: req.provider, code, error: LLM_ERROR_HINT[code] };
        }
        const text = extractGeminiText(payload);
        if (!text) {
          return {
            ok: false,
            provider: req.provider,
            code: "bad-response",
            error: "Gemini returned an empty response.",
          };
        }
        return { ok: true, provider: req.provider, model: req.model, text };
      }

      const base =
        req.provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : req.provider === "openrouter"
            ? "https://openrouter.ai/api/v1/chat/completions"
            : "https://api.x.ai/v1/chat/completions";

      response = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${req.apiKey}`,
        },
        signal: timeout,
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens,
          messages: [
            ...(req.system ? [{ role: "system", content: req.system }] : []),
            { role: "user", content: req.prompt },
          ],
        }),
      });
      payload = await response.json().catch(() => null);
      if (!response.ok) {
        const code = classifyHttpError(response.status);
        return { ok: false, provider: req.provider, code, error: LLM_ERROR_HINT[code] };
      }
      const text = extractOpenAiText(payload);
      if (!text) {
        return {
          ok: false,
          provider: req.provider,
          code: "bad-response",
          error: "Provider returned an empty response.",
        };
      }
      return { ok: true, provider: req.provider, model: req.model, text };
    } catch {
      return {
        ok: false,
        provider: req.provider,
        code: "network",
        error: LLM_ERROR_HINT.network,
      };
    }
  });

/* --------------------------- Client-side auto-rotate --------------------------- */

export type BrainAttempt = {
  provider: LlmProvider;
  code: LlmErrorCode;
  error: string;
};

export type BrainOutcome =
  | {
      ok: true;
      provider: LlmProvider;
      model: string;
      text: string;
      attempts: BrainAttempt[];
    }
  | { ok: false; attempts: BrainAttempt[] };

export type BrainPrompt = {
  system?: string;
  prompt: string;
  maxTokens?: number;
};

/** In-memory cooldowns so a rate-limited provider is skipped for a while. */
const cooldownUntil = new Map<LlmProvider, number>();

export function providerOrder(config: BrainConfig, serverKeys?: ServerKeyStatus): LlmProvider[] {
  const now = Date.now();
  const ready = readyProviders(config, serverKeys);
  const hot = ready.filter((id) => (cooldownUntil.get(id) ?? 0) <= now);
  const cooling = ready.filter((id) => (cooldownUntil.get(id) ?? 0) > now);
  return [...hot, ...cooling];
}

export function noteProviderFailure(provider: LlmProvider, code: LlmErrorCode): void {
  if (isRetryableLlmCode(code)) {
    cooldownUntil.set(provider, Date.now() + 90_000);
  }
}

export function noteProviderSuccess(provider: LlmProvider): void {
  cooldownUntil.delete(provider);
}

/**
 * Try each configured provider in turn (free stack first), rotating away from
 * rate limits and transient failures. Returns the first good completion plus a
 * log of every attempt, so the UI can show honest stack health.
 */
export async function brainComplete(
  config: BrainConfig,
  input: BrainPrompt,
  serverKeys?: ServerKeyStatus,
): Promise<BrainOutcome> {
  const attempts: BrainAttempt[] = [];
  for (const provider of providerOrder(config, serverKeys)) {
    const cfg = config[provider];
    const result = await askLlm({
      data: {
        provider,
        apiKey: cfg.apiKey,
        model: cfg.model,
        system: input.system ?? "",
        prompt: input.prompt,
        maxTokens: input.maxTokens ?? 600,
      },
    });
    if (result.ok) {
      noteProviderSuccess(provider);
      return {
        ok: true,
        provider,
        model: result.model,
        text: result.text,
        attempts,
      };
    }
    attempts.push({ provider, code: result.code, error: result.error });
    noteProviderFailure(provider, result.code);
    if (result.code === "auth" || result.code === "model") {
      // Misconfigured provider: keep trying the rest of the stack, no cooldown.
      continue;
    }
  }
  return { ok: false, attempts };
}

/** Quick connectivity test used by the Agent Brain settings screen. */
export async function testBrainProvider(
  provider: LlmProvider,
  config: BrainConfig,
): Promise<LlmResult> {
  const cfg = config[provider];
  return askLlm({
    data: {
      provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      system: "You are a connectivity check. Reply with exactly: OK. Do not add anything else.",
      prompt: "ping",
      maxTokens: 16,
    },
  });
}
