import { callAiChat } from "@/lib/aiClient";
import type { AiSettings } from "@/data/aiSettings";
import type { ScheduleItem } from "@/types/schedule";

export type ScheduleExecutionResult = {
  ok: boolean;
  result: string;
  error?: string;
};

export async function executeScheduleWithAi(
  settings: AiSettings,
  item: ScheduleItem
): Promise<ScheduleExecutionResult> {
  if (settings.provider === "demo-mock") {
    return {
      ok: true,
      result: `（演示模式）已模拟完成：${item.title}。后续接入真实 LLM 时，本字段会替换为模型实际输出。`,
    };
  }

  if (!settings.apiKey.trim()) {
    return {
      ok: false,
      result: "",
      error: "missing-api-key",
    };
  }

  const callResult = await callAiChat(settings, [
    {
      role: "system",
      content:
        "你是「即我」App 中安排模块的 AI 执行助手。用户给你一条「ai-auto」类型的安排，请尽量直接给出完成结果（如查询结果、起草内容、摘要等）。只返回结果文本，不要 JSON。",
    },
    {
      role: "user",
      content: [
        `安排标题：${item.title}`,
        item.note ? `备注：${item.note}` : "",
        item.people ? `相关人：${item.people}` : "",
        item.location ? `相关地点：${item.location}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  if (!callResult.ok) {
    return { ok: false, result: "", error: callResult.error };
  }

  return { ok: true, result: callResult.content.trim() };
}
