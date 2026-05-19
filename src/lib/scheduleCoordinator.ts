import { isAiCallable, loadAiSettings } from "@/data/aiSettings";
import { loadStoredSchedules, persistSchedules } from "@/data/scheduleStorage";
import { analyzeConversation, type ConversationAnalysisInput } from "@/lib/scheduleAnalysis";
import { applyAnalysisToItems } from "@/lib/scheduleMutations";

export const scheduleAnalysisEvent = "arkme-demo:schedule-analysis";

export type ScheduleAnalysisOutcome = {
  ok: boolean;
  created: number;
  merged: number;
  completed: number;
  error?: string;
};

export type ScheduleAnalysisDetail = {
  trigger: "self" | "private" | "group";
  conversationLabel?: string;
  outcome: ScheduleAnalysisOutcome;
};

function dispatchAnalysisDetail(detail: ScheduleAnalysisDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ScheduleAnalysisDetail>(scheduleAnalysisEvent, { detail })
  );
}

const recentAnalysisIds = new Set<string>();

function shouldSkipDuplicate(key: string) {
  if (recentAnalysisIds.has(key)) return true;
  recentAnalysisIds.add(key);
  if (recentAnalysisIds.size > 200) {
    const first = recentAnalysisIds.values().next().value;
    if (first) recentAnalysisIds.delete(first);
  }
  return false;
}

export async function runConversationAnalysis(
  input: ConversationAnalysisInput
): Promise<ScheduleAnalysisOutcome> {
  const settings = loadAiSettings();
  if (!isAiCallable(settings)) {
    return { ok: false, created: 0, merged: 0, completed: 0, error: "ai-disabled" };
  }

  const dedupeKey = `${input.sourceType}:${input.conversationId ?? ""}:${input.triggerMessageId}`;
  if (shouldSkipDuplicate(dedupeKey)) {
    return { ok: true, created: 0, merged: 0, completed: 0 };
  }

  const existingItems = loadStoredSchedules();
  const result = await analyzeConversation(settings, {
    ...input,
    existingItems,
  });

  if (!result.ok) {
    return {
      ok: false,
      created: 0,
      merged: 0,
      completed: 0,
      error: result.error,
    };
  }

  const noChanges =
    result.creates.length === 0 && result.merges.length === 0 && result.completes.length === 0;
  if (noChanges) {
    return { ok: true, created: 0, merged: 0, completed: 0 };
  }

  const { next, createdUids, mergedUids, completedUids } = applyAnalysisToItems(
    existingItems,
    result
  );
  persistSchedules(next);
  return {
    ok: true,
    created: createdUids.length,
    merged: mergedUids.length,
    completed: completedUids.length,
  };
}

export async function triggerSelfAnalysis(params: {
  selfName: string;
  conversationLabel: string;
  trigger: { id: string; text: string; sentAt: number };
  history: Array<{ id: string; text: string; sentAt: number; senderName?: string; senderIsSelf?: boolean }>;
}): Promise<ScheduleAnalysisOutcome> {
  const settings = loadAiSettings();
  if (!isAiCallable(settings)) return { ok: false, created: 0, merged: 0, completed: 0, error: "ai-disabled" };

  const outcome = await runConversationAnalysis({
    sourceType: "self",
    conversationLabel: params.conversationLabel,
    selfName: params.selfName,
    groupScope: settings.groupScope,
    triggerMessageId: params.trigger.id,
    existingItems: [],
    messages: params.history.map((message) => ({
      id: message.id,
      senderName: message.senderName ?? params.selfName,
      senderIsSelf: message.senderIsSelf ?? true,
      text: message.text,
      sentAt: message.sentAt,
    })),
  });

  dispatchAnalysisDetail({
    trigger: "self",
    conversationLabel: params.conversationLabel,
    outcome,
  });
  return outcome;
}

export async function triggerPrivateAnalysis(params: {
  selfName: string;
  conversationId: string;
  conversationLabel: string;
  trigger: { id: string; text: string; sentAt: number; senderName: string; senderIsSelf: boolean };
  history: Array<{
    id: string;
    text: string;
    sentAt: number;
    senderName: string;
    senderIsSelf: boolean;
  }>;
}): Promise<ScheduleAnalysisOutcome> {
  const settings = loadAiSettings();
  if (!isAiCallable(settings)) return { ok: false, created: 0, merged: 0, completed: 0, error: "ai-disabled" };

  const outcome = await runConversationAnalysis({
    sourceType: "private",
    conversationId: params.conversationId,
    conversationLabel: params.conversationLabel,
    selfName: params.selfName,
    groupScope: settings.groupScope,
    triggerMessageId: params.trigger.id,
    existingItems: [],
    messages: params.history,
  });

  dispatchAnalysisDetail({
    trigger: "private",
    conversationLabel: params.conversationLabel,
    outcome,
  });
  return outcome;
}

export async function triggerGroupAnalysis(params: {
  selfName: string;
  conversationId: string;
  conversationLabel: string;
  trigger: { id: string; text: string; sentAt: number; senderName: string; senderIsSelf: boolean };
  history: Array<{
    id: string;
    text: string;
    sentAt: number;
    senderName: string;
    senderIsSelf: boolean;
  }>;
}): Promise<ScheduleAnalysisOutcome> {
  const settings = loadAiSettings();
  if (!isAiCallable(settings)) return { ok: false, created: 0, merged: 0, completed: 0, error: "ai-disabled" };

  const outcome = await runConversationAnalysis({
    sourceType: "group",
    conversationId: params.conversationId,
    conversationLabel: params.conversationLabel,
    selfName: params.selfName,
    groupScope: settings.groupScope,
    triggerMessageId: params.trigger.id,
    existingItems: [],
    messages: params.history,
  });

  dispatchAnalysisDetail({
    trigger: "group",
    conversationLabel: params.conversationLabel,
    outcome,
  });
  return outcome;
}
