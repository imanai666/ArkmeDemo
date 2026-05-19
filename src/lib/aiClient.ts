import type { AiSettings } from "@/data/aiSettings";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiChatResult = {
  ok: boolean;
  content: string;
  error?: string;
};

const REQUEST_TIMEOUT_MS = 30000;

async function callOpenAiCompatible(
  settings: AiSettings,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<AiChatResult> {
  const url = settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, content: "", error: `${response.status} ${errorText}`.slice(0, 400) };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return { ok: true, content };
  } catch (error) {
    return {
      ok: false,
      content: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function callAnthropic(
  settings: AiSettings,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<AiChatResult> {
  const url = settings.baseUrl.replace(/\/+$/, "") + "/v1/messages";
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const nonSystemMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 1024,
        system: systemMessages,
        messages: nonSystemMessages,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, content: "", error: `${response.status} ${errorText}`.slice(0, 400) };
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const content = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("");
    return { ok: true, content };
  } catch (error) {
    return {
      ok: false,
      content: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function callAiChat(
  settings: AiSettings,
  messages: AiChatMessage[]
): Promise<AiChatResult> {
  if (settings.provider === "demo-mock") {
    return { ok: true, content: "" };
  }
  if (!settings.apiKey.trim()) {
    return { ok: false, content: "", error: "missing-api-key" };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (settings.provider === "anthropic") {
      return await callAnthropic(settings, messages, controller.signal);
    }
    return await callOpenAiCompatible(settings, messages, controller.signal);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function extractJsonObject(content: string): unknown {
  if (!content) return null;
  const trimmed = content.trim();
  const directParse = safeJsonParse(trimmed);
  if (directParse !== undefined) return directParse;

  const fenceMatch = /```json\s*([\s\S]*?)```/i.exec(trimmed) || /```\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenceMatch) {
    const fenceParse = safeJsonParse(fenceMatch[1].trim());
    if (fenceParse !== undefined) return fenceParse;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return safeJsonParse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
