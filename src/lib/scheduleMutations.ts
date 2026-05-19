import { createScheduleUid } from "@/data/scheduleStorage";
import type { ScheduleAnalysisResult } from "@/lib/scheduleAnalysis";
import type {
  ScheduleDraft,
  ScheduleItem,
  ScheduleSourceContext,
  ScheduleSourceType,
} from "@/types/schedule";

export function applyAnalysisToItems(
  current: ScheduleItem[],
  result: ScheduleAnalysisResult
): { next: ScheduleItem[]; createdUids: string[]; mergedUids: string[]; completedUids: string[] } {
  const byUid = new Map(current.map((item) => [item.uid, item]));
  const createdUids: string[] = [];
  const mergedUids: string[] = [];
  const completedUids: string[] = [];

  for (const merge of result.merges) {
    const existing = byUid.get(merge.uid);
    if (!existing) continue;
    if (alreadyHasSource(existing, merge.source.id)) continue;
    const note = merge.appendNote
      ? existing.note
        ? `${existing.note}\n${merge.appendNote}`
        : merge.appendNote
      : existing.note;
    const next: ScheduleItem = {
      ...existing,
      note,
      sources: [...existing.sources, merge.source],
      updatedAt: Date.now(),
    };
    byUid.set(merge.uid, next);
    mergedUids.push(merge.uid);
  }

  for (const complete of result.completes) {
    const existing = byUid.get(complete.uid);
    if (!existing) continue;
    if (existing.status === "done") continue;
    const now = Date.now();
    const next: ScheduleItem = {
      ...existing,
      status: "done",
      completedAt: now,
      completedBy: "ai",
      completionEvidence: complete.evidence,
      sources: alreadyHasSource(existing, complete.source.id)
        ? existing.sources
        : [...existing.sources, complete.source],
      updatedAt: now,
    };
    byUid.set(complete.uid, next);
    completedUids.push(complete.uid);
  }

  const newItems: ScheduleItem[] = [];
  for (const create of result.creates) {
    const now = Date.now();
    const newItem: ScheduleItem = {
      uid: createScheduleUid(),
      title: create.title,
      note: create.note,
      location: create.location,
      people: create.people,
      timeKind: create.timeKind,
      dueAt: create.dueAt,
      startAt: create.startAt,
      endAt: create.endAt,
      reminderAt: create.reminderAt,
      isReminder: create.isReminder,
      status: "pending",
      executionMode: create.executionMode,
      source: create.source.type,
      sources: [create.source],
      createdAt: now,
      updatedAt: now,
    };
    newItems.push(newItem);
    createdUids.push(newItem.uid);
  }

  const nextItems = [...newItems, ...current.map((item) => byUid.get(item.uid) ?? item)];
  return { next: nextItems, createdUids, mergedUids, completedUids };
}

function alreadyHasSource(item: ScheduleItem, sourceId: string) {
  return item.sources.some((source) => source.id === sourceId);
}

export function createScheduleItemFromDraft(
  draft: ScheduleDraft,
  sourceType: ScheduleSourceType = "manual",
  source?: ScheduleSourceContext
): ScheduleItem {
  const now = Date.now();
  const baseSource: ScheduleSourceContext =
    source ??
    {
      id: `${sourceType}-${createScheduleUid()}`,
      type: sourceType,
      excerpt: draft.title,
      capturedAt: now,
    };
  return {
    uid: createScheduleUid(),
    title: draft.title.trim(),
    note: draft.note?.trim() || undefined,
    location: draft.location?.trim() || undefined,
    people: draft.people?.trim() || undefined,
    timeKind: draft.timeKind,
    dueAt: draft.timeKind === "due" ? draft.dueAt : undefined,
    startAt: draft.timeKind === "range" ? draft.startAt : undefined,
    endAt: draft.timeKind === "range" ? draft.endAt : undefined,
    reminderAt: draft.timeKind === "reminder" ? draft.reminderAt : undefined,
    isReminder: draft.isReminder,
    status: "pending",
    executionMode: draft.executionMode ?? "manual",
    source: sourceType,
    sources: [baseSource],
    createdAt: now,
    updatedAt: now,
  };
}
