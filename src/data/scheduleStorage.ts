import type {
  ScheduleExecutionMode,
  ScheduleItem,
  ScheduleSourceContext,
  ScheduleSourceType,
  ScheduleStatus,
  ScheduleTimeKind,
} from "@/types/schedule";

export const scheduleStorageKey = "arkme-demo.schedules";
export const scheduleStorageEvent = "arkme-demo:schedules-changed";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStatus(value: unknown): ScheduleStatus {
  return value === "done" || value === "later" ? value : "pending";
}

function normalizeSourceType(value: unknown): ScheduleSourceType {
  return value === "self" || value === "private" || value === "group" ? value : "manual";
}

function normalizeExecutionMode(value: unknown): ScheduleExecutionMode {
  return value === "ai-assist" || value === "ai-auto" ? value : "manual";
}

function normalizeTimeKind(value: unknown): ScheduleTimeKind {
  return value === "range" || value === "reminder" || value === "due" ? value : "none";
}

function normalizeSourceContext(value: unknown): ScheduleSourceContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ScheduleSourceContext>;
  if (typeof item.id !== "string" || typeof item.excerpt !== "string") return null;
  if (!isFiniteNumber(item.capturedAt)) return null;
  return {
    id: item.id,
    type: normalizeSourceType(item.type),
    conversationId:
      typeof item.conversationId === "string" ? item.conversationId : undefined,
    conversationLabel:
      typeof item.conversationLabel === "string" ? item.conversationLabel : undefined,
    senderName: typeof item.senderName === "string" ? item.senderName : undefined,
    senderIsSelf: typeof item.senderIsSelf === "boolean" ? item.senderIsSelf : undefined,
    excerpt: item.excerpt,
    capturedAt: item.capturedAt,
  };
}

function normalizeStoredScheduleItem(value: unknown): ScheduleItem | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<ScheduleItem>;
  if (
    typeof record.uid !== "string" ||
    typeof record.title !== "string" ||
    !isFiniteNumber(record.createdAt) ||
    !isFiniteNumber(record.updatedAt)
  ) {
    return null;
  }

  const sources = Array.isArray(record.sources)
    ? record.sources
        .map(normalizeSourceContext)
        .filter((item): item is ScheduleSourceContext => item !== null)
    : [];

  const dueAt = isFiniteNumber(record.dueAt) ? record.dueAt : undefined;
  const startAt = isFiniteNumber(record.startAt) ? record.startAt : undefined;
  const endAt = isFiniteNumber(record.endAt) ? record.endAt : undefined;
  const reminderAt = isFiniteNumber(record.reminderAt) ? record.reminderAt : undefined;

  let timeKind = normalizeTimeKind(record.timeKind);
  if (timeKind === "none") {
    if (startAt !== undefined || endAt !== undefined) timeKind = "range";
    else if (reminderAt !== undefined) timeKind = "reminder";
    else if (dueAt !== undefined) timeKind = "due";
  }

  return {
    uid: record.uid,
    title: record.title,
    note: typeof record.note === "string" ? record.note : undefined,
    location: typeof record.location === "string" ? record.location : undefined,
    people: typeof record.people === "string" ? record.people : undefined,
    timeKind,
    dueAt,
    startAt,
    endAt,
    reminderAt,
    isReminder: typeof record.isReminder === "boolean" ? record.isReminder : undefined,
    status: normalizeStatus(record.status),
    executionMode: normalizeExecutionMode(record.executionMode),
    source: normalizeSourceType(record.source),
    sources,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: isFiniteNumber(record.completedAt) ? record.completedAt : undefined,
    completedBy: record.completedBy === "ai" ? "ai" : record.completedBy === "user" ? "user" : undefined,
    completionEvidence:
      typeof record.completionEvidence === "string" ? record.completionEvidence : undefined,
    aiExecutionResult:
      typeof record.aiExecutionResult === "string" ? record.aiExecutionResult : undefined,
  };
}

export function loadStoredSchedules(): ScheduleItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(scheduleStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeStoredScheduleItem(entry))
      .filter((entry): entry is ScheduleItem => entry !== null);
  } catch {
    return [];
  }
}

export function persistSchedules(items: ScheduleItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(scheduleStorageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(scheduleStorageEvent));
  } catch {
    /* ignore quota / serialization issues */
  }
}

export function createScheduleUid() {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto & { randomUUID?: () => string }).randomUUID === "function"
  ) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
