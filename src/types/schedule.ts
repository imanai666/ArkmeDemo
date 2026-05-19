export type ScheduleStatus = "pending" | "done" | "later";

export type ScheduleSourceType = "manual" | "self" | "private" | "group";

export type ScheduleExecutionMode = "manual" | "ai-assist" | "ai-auto";

export type ScheduleTimeKind = "due" | "range" | "reminder" | "none";

export type ScheduleSourceContext = {
  id: string;
  type: ScheduleSourceType;
  conversationId?: string;
  conversationLabel?: string;
  senderName?: string;
  senderIsSelf?: boolean;
  excerpt: string;
  capturedAt: number;
};

export type ScheduleItem = {
  uid: string;
  title: string;
  note?: string;
  location?: string;
  people?: string;
  timeKind: ScheduleTimeKind;
  dueAt?: number;
  startAt?: number;
  endAt?: number;
  reminderAt?: number;
  isReminder?: boolean;
  status: ScheduleStatus;
  executionMode: ScheduleExecutionMode;
  source: ScheduleSourceType;
  sources: ScheduleSourceContext[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  completedBy?: "user" | "ai";
  completionEvidence?: string;
  aiExecutionResult?: string;
};

export type ScheduleDraft = {
  title: string;
  note?: string;
  location?: string;
  people?: string;
  timeKind: ScheduleTimeKind;
  dueAt?: number;
  startAt?: number;
  endAt?: number;
  reminderAt?: number;
  isReminder?: boolean;
  executionMode?: ScheduleExecutionMode;
};
