export type AiProvider = "openai" | "anthropic" | "demo-mock";

export type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  groupScope: "self-only" | "all";
};

export const aiSettingsStorageKey = "arkme-demo.aiSettings";
export const aiSettingsEvent = "arkme-demo:ai-settings-changed";

export const defaultAiSettings: AiSettings = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  enabled: false,
  groupScope: "self-only",
};

function normalizeProvider(value: unknown): AiProvider {
  return value === "anthropic" || value === "demo-mock" ? value : "openai";
}

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return defaultAiSettings;

  try {
    const raw = window.localStorage.getItem(aiSettingsStorageKey);
    if (!raw) return defaultAiSettings;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultAiSettings;
    const partial = parsed as Partial<AiSettings>;
    return {
      provider: normalizeProvider(partial.provider),
      apiKey: typeof partial.apiKey === "string" ? partial.apiKey : "",
      baseUrl:
        typeof partial.baseUrl === "string" && partial.baseUrl.trim().length > 0
          ? partial.baseUrl
          : defaultAiSettings.baseUrl,
      model:
        typeof partial.model === "string" && partial.model.trim().length > 0
          ? partial.model
          : defaultAiSettings.model,
      enabled: typeof partial.enabled === "boolean" ? partial.enabled : false,
      groupScope: partial.groupScope === "all" ? "all" : "self-only",
    };
  } catch {
    return defaultAiSettings;
  }
}

export function persistAiSettings(settings: AiSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(aiSettingsStorageKey, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(aiSettingsEvent));
  } catch {
    /* ignore */
  }
}

export function isAiCallable(settings: AiSettings): boolean {
  if (!settings.enabled) return false;
  if (settings.provider === "demo-mock") return true;
  return settings.apiKey.trim().length > 0;
}
