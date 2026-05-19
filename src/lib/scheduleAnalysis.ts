import { callAiChat, extractJsonObject } from "@/lib/aiClient";
import type { AiSettings } from "@/data/aiSettings";
import { createScheduleUid } from "@/data/scheduleStorage";
import type {
  ScheduleExecutionMode,
  ScheduleItem,
  ScheduleSourceContext,
  ScheduleSourceType,
  ScheduleTimeKind,
} from "@/types/schedule";

export type ConversationMessageInput = {
  id: string;
  senderName: string;
  senderIsSelf: boolean;
  text: string;
  sentAt: number;
};

export type ConversationAnalysisInput = {
  sourceType: ScheduleSourceType;
  conversationId?: string;
  conversationLabel?: string;
  selfName: string;
  groupScope: "self-only" | "all";
  triggerMessageId: string;
  messages: ConversationMessageInput[];
  existingItems: ScheduleItem[];
};

export type AnalyzedCreate = {
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
  executionMode: ScheduleExecutionMode;
  source: ScheduleSourceContext;
};

export type AnalyzedMerge = {
  uid: string;
  appendNote?: string;
  source: ScheduleSourceContext;
};

export type AnalyzedComplete = {
  uid: string;
  evidence: string;
  source: ScheduleSourceContext;
};

export type ScheduleAnalysisResult = {
  ok: boolean;
  creates: AnalyzedCreate[];
  merges: AnalyzedMerge[];
  completes: AnalyzedComplete[];
  error?: string;
};

const EMPTY_RESULT: ScheduleAnalysisResult = {
  ok: true,
  creates: [],
  merges: [],
  completes: [],
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function clampMessages(messages: ConversationMessageInput[], limit = 12) {
  return messages.slice(-limit);
}

function pickTriggerMessage(input: ConversationAnalysisInput) {
  return input.messages.find((message) => message.id === input.triggerMessageId);
}

function buildSourceContext(
  input: ConversationAnalysisInput,
  message: ConversationMessageInput
): ScheduleSourceContext {
  return {
    id: `${input.sourceType}-${message.id}`,
    type: input.sourceType,
    conversationId: input.conversationId,
    conversationLabel: input.conversationLabel,
    senderName: message.senderName,
    senderIsSelf: message.senderIsSelf,
    excerpt: message.text.slice(0, 240),
    capturedAt: message.sentAt,
  };
}

function shouldSkipGroup(input: ConversationAnalysisInput) {
  if (input.sourceType !== "group") return false;
  if (input.groupScope === "all") return false;
  const trigger = pickTriggerMessage(input);
  if (!trigger) return true;
  if (trigger.senderIsSelf) return false;
  return !mentionsSelf(trigger.text, input.selfName);
}

function mentionsSelf(text: string, selfName: string) {
  const lower = text.toLowerCase();
  if (lower.includes("@" + selfName.toLowerCase())) return true;
  if (lower.includes(selfName.toLowerCase())) return true;
  return /(你|您|帮我|帮忙|麻烦|提醒|带我|跟我|和我|@me|@self)/.test(text);
}

export async function analyzeConversation(
  settings: AiSettings,
  input: ConversationAnalysisInput
): Promise<ScheduleAnalysisResult> {
  if (shouldSkipGroup(input)) return EMPTY_RESULT;

  if (settings.provider === "demo-mock") {
    return runHeuristicAnalysis(input);
  }

  const prompt = buildAnalysisPrompt(input);
  const result = await callAiChat(settings, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  if (!result.ok) {
    return { ...EMPTY_RESULT, ok: false, error: result.error };
  }

  const parsed = extractJsonObject(result.content);
  if (!parsed || typeof parsed !== "object") {
    return EMPTY_RESULT;
  }

  return mapModelResponse(parsed, input);
}

const SYSTEM_PROMPT = [
  "你是「即我」App 中「安排」模块的助手。",
  "用户的消息或对话上下文里，可能包含未来要做的事（待办、日程、提醒、任务），也可能在反馈某个已有「安排」是否完成。",
  "你需要返回严格的 JSON 对象，包含 creates、merges、completes 三个数组：",
  "- creates: 新增安排，字段 title (必填) / note / location / people / timeKind ('due'|'range'|'reminder'|'none') / dueAt (ISO time, 仅 timeKind=due) / startAt / endAt (仅 timeKind=range) / reminderAt (仅 timeKind=reminder) / isReminder (boolean) / executionMode ('manual'|'ai-assist'|'ai-auto')。",
  "- merges: 已存在条目的新上下文 (uid 必填，appendNote 可选)。",
  "- completes: 标记完成的条目 (uid 必填，evidence 必填，描述用户在哪句话表达了完成)。",
  "判断 executionMode：能由 AI 直接完成的（如\"帮我查天气\"、\"翻译这段话\"）→ ai-auto；需要 AI 协助但最终人工完成的（如\"帮我先列医院电话清单，我下午去\"）→ ai-assist；必须用户线下完成的 → manual。",
  "如果用户说了隐喻或缩写无法理解，宁可不创建也不要瞎猜，让用户后续手动补。",
  "如果没有可识别的安排或完成，返回 {\"creates\":[],\"merges\":[],\"completes\":[]}。",
  "时间一律使用 ISO 8601 字符串，例如 2026-05-20T09:00:00+08:00。",
].join("\n");

function buildAnalysisPrompt(input: ConversationAnalysisInput) {
  const trigger = pickTriggerMessage(input);
  const sourceLabel =
    input.sourceType === "self"
      ? "发给自己"
      : input.sourceType === "private"
      ? "私聊"
      : input.sourceType === "group"
      ? "群聊"
      : "手动";

  const messageLines = clampMessages(input.messages)
    .map((message) => {
      const speaker = message.senderIsSelf ? "我" : message.senderName || "对方";
      const isTrigger = message.id === input.triggerMessageId ? " [本轮触发]" : "";
      const time = new Date(message.sentAt).toISOString();
      return `- ${time} ${speaker}${isTrigger}: ${message.text}`;
    })
    .join("\n");

  const existingLines = input.existingItems.map((item) => {
    const dueLabel = item.dueAt
      ? new Date(item.dueAt).toISOString()
      : item.startAt
      ? `${new Date(item.startAt).toISOString()} ~ ${
          item.endAt ? new Date(item.endAt).toISOString() : "?"
        }`
      : "无时间";
    return `- ${item.uid} :: status=${item.status} :: ${item.title} :: ${dueLabel}`;
  });

  return [
    `来源：${sourceLabel}（${input.conversationLabel ?? input.conversationId ?? ""}）。`,
    `当前用户称呼：${input.selfName}。`,
    "对话上下文（按时间正序）：",
    messageLines || "(空)",
    `本轮触发消息 id：${input.triggerMessageId}${trigger ? ` -> "${trigger.text}"` : ""}`,
    existingLines.length > 0
      ? `已存在的待跟进安排：\n${existingLines.join("\n")}`
      : "已存在的待跟进安排：无",
    "请按系统消息中的 JSON Schema 输出。",
  ].join("\n\n");
}

function mapModelResponse(
  parsed: unknown,
  input: ConversationAnalysisInput
): ScheduleAnalysisResult {
  const root = parsed as {
    creates?: unknown;
    merges?: unknown;
    completes?: unknown;
  };
  const triggerMessage = pickTriggerMessage(input);
  const fallbackSource = triggerMessage
    ? buildSourceContext(input, triggerMessage)
    : null;

  const creates: AnalyzedCreate[] = Array.isArray(root.creates)
    ? root.creates
        .map((entry) => normalizeCreatedItem(entry, fallbackSource))
        .filter((item): item is AnalyzedCreate => item !== null)
    : [];

  const merges: AnalyzedMerge[] = Array.isArray(root.merges)
    ? root.merges
        .map((entry) => normalizeMergeItem(entry, fallbackSource))
        .filter((item): item is AnalyzedMerge => item !== null)
    : [];

  const completes: AnalyzedComplete[] = Array.isArray(root.completes)
    ? root.completes
        .map((entry) => normalizeCompleteItem(entry, fallbackSource))
        .filter((item): item is AnalyzedComplete => item !== null)
    : [];

  return { ok: true, creates, merges, completes };
}

function parseIsoTime(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCreatedItem(
  entry: unknown,
  source: ScheduleSourceContext | null
): AnalyzedCreate | null {
  if (!source || !entry || typeof entry !== "object") return null;
  const data = entry as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return null;

  const timeKindRaw = data.timeKind;
  const timeKind: ScheduleTimeKind =
    timeKindRaw === "due" || timeKindRaw === "range" || timeKindRaw === "reminder"
      ? timeKindRaw
      : "none";

  const executionRaw = data.executionMode;
  const executionMode: ScheduleExecutionMode =
    executionRaw === "ai-assist" || executionRaw === "ai-auto" ? executionRaw : "manual";

  const dueAt = parseIsoTime(data.dueAt);
  const startAt = parseIsoTime(data.startAt);
  const endAt = parseIsoTime(data.endAt);
  const reminderAt = parseIsoTime(data.reminderAt);

  return {
    title,
    note: typeof data.note === "string" ? data.note.trim() || undefined : undefined,
    location:
      typeof data.location === "string" ? data.location.trim() || undefined : undefined,
    people: typeof data.people === "string" ? data.people.trim() || undefined : undefined,
    timeKind,
    dueAt: timeKind === "due" ? dueAt : undefined,
    startAt: timeKind === "range" ? startAt : undefined,
    endAt: timeKind === "range" ? endAt : undefined,
    reminderAt: timeKind === "reminder" ? reminderAt : undefined,
    isReminder: typeof data.isReminder === "boolean" ? data.isReminder : timeKind === "reminder",
    executionMode,
    source: {
      ...source,
      id: `${source.id}-create-${createScheduleUid().slice(0, 6)}`,
    },
  };
}

function normalizeMergeItem(
  entry: unknown,
  source: ScheduleSourceContext | null
): AnalyzedMerge | null {
  if (!source || !entry || typeof entry !== "object") return null;
  const data = entry as Record<string, unknown>;
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  if (!uid) return null;
  return {
    uid,
    appendNote:
      typeof data.appendNote === "string" ? data.appendNote.trim() || undefined : undefined,
    source: {
      ...source,
      id: `${source.id}-merge-${uid.slice(0, 6)}`,
    },
  };
}

function normalizeCompleteItem(
  entry: unknown,
  source: ScheduleSourceContext | null
): AnalyzedComplete | null {
  if (!source || !entry || typeof entry !== "object") return null;
  const data = entry as Record<string, unknown>;
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  const evidence = typeof data.evidence === "string" ? data.evidence.trim() : "";
  if (!uid || !evidence) return null;
  return {
    uid,
    evidence,
    source: {
      ...source,
      id: `${source.id}-complete-${uid.slice(0, 6)}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Demo-mode heuristic — no real model call. Mimics the behavior we'd expect  */
/*  from a real LLM so reviewers can test the flow without an API key.         */
/* -------------------------------------------------------------------------- */

const RELATIVE_DAYS: Array<[RegExp, number]> = [
  [/今天|今晚/, 0],
  [/明天|明晚/, 1],
  [/后天/, 2],
  [/大后天/, 3],
  [/下周/, 7],
  [/下个月/, 30],
];

const TIME_OF_DAY: Array<[RegExp, [number, number]]> = [
  [/早上|早晨|早间/, [8, 0]],
  [/上午/, [10, 0]],
  [/中午/, [12, 0]],
  [/下午/, [15, 0]],
  [/傍晚|晚饭/, [18, 0]],
  [/晚上|今晚|夜里/, [20, 0]],
];

const KEYWORD_PATTERNS: RegExp[] = [
  /提醒/,
  /记得/,
  /要去/,
  /帮我/,
  /麻烦/,
  /准备/,
  /安排/,
  /待办/,
  /记得带/,
  /带我|带个|带一份/,
  /体检|医院|检查/,
  /开会|会议/,
  /面试/,
  /快递|取件/,
  /生日|纪念日/,
  /出差|出发/,
  /报销|提交/,
  /复诊/,
  /复习|学习|练习/,
];

const COMPLETION_PATTERNS: RegExp[] = [
  /已经.*(去|做|买|完成|提交|看|约|预约|挂号|安排)/,
  /(去过|做完|完成了|搞定|搞掂|结束了)/,
  /(已挂号|已预约|已购买|已下单|已提交|已支付)/,
];

function clampToFutureDay(date: Date) {
  const now = new Date();
  if (date.getTime() < now.getTime()) {
    date.setTime(now.getTime() + ONE_DAY_MS);
  }
  return date;
}

function heuristicDateFor(text: string): { date: Date; matched: boolean } {
  const now = new Date();
  const date = new Date(now);
  let matched = false;

  for (const [pattern, offsetDays] of RELATIVE_DAYS) {
    if (pattern.test(text)) {
      date.setHours(9, 0, 0, 0);
      date.setDate(date.getDate() + offsetDays);
      matched = true;
      break;
    }
  }

  for (const [pattern, [hours, minutes]] of TIME_OF_DAY) {
    if (pattern.test(text)) {
      date.setHours(hours, minutes, 0, 0);
      matched = true;
      break;
    }
  }

  const explicitHour = /(\d{1,2})[:：](\d{2})/.exec(text);
  if (explicitHour) {
    date.setHours(Number(explicitHour[1]), Number(explicitHour[2]), 0, 0);
    matched = true;
  }

  return { date: clampToFutureDay(date), matched };
}

function heuristicTitle(text: string) {
  const cleaned = text.replace(/^(请|麻烦|帮我|帮个忙|帮个忙啊|提醒(?:一下|我)?)/g, "").trim();
  return cleaned.length > 36 ? cleaned.slice(0, 34) + "…" : cleaned;
}

function detectCommaSeparatedItems(text: string) {
  const cleaned = text.replace(/[,;；]/g, "、");
  const parts = cleaned
    .split(/[、，\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 12);
  if (parts.length >= 3 && /帮.*带|准备|采购|清单|购买/.test(text)) {
    return parts;
  }
  return [];
}

function runHeuristicAnalysis(
  input: ConversationAnalysisInput
): ScheduleAnalysisResult {
  const trigger = pickTriggerMessage(input);
  if (!trigger) return EMPTY_RESULT;
  const source = buildSourceContext(input, trigger);

  const creates: AnalyzedCreate[] = [];
  const merges: AnalyzedMerge[] = [];
  const completes: AnalyzedComplete[] = [];

  const text = trigger.text;
  if (!text) return EMPTY_RESULT;

  for (const item of input.existingItems) {
    if (item.status === "done") continue;
    if (sharesTopic(item.title, text)) {
      if (COMPLETION_PATTERNS.some((pattern) => pattern.test(text))) {
        completes.push({
          uid: item.uid,
          evidence: text,
          source: {
            ...source,
            id: `${source.id}-complete-${item.uid.slice(0, 6)}`,
          },
        });
      } else {
        merges.push({
          uid: item.uid,
          appendNote: trigger.senderIsSelf ? undefined : text,
          source: {
            ...source,
            id: `${source.id}-merge-${item.uid.slice(0, 6)}`,
          },
        });
      }
    }
  }

  const alreadyHandled = merges.length > 0 || completes.length > 0;
  const triggersIntent =
    KEYWORD_PATTERNS.some((pattern) => pattern.test(text)) || /(今晚|明天|后天|下周)/.test(text);

  if (!alreadyHandled && triggersIntent) {
    const { date, matched } = heuristicDateFor(text);
    const baseTitle = heuristicTitle(text);
    const items = detectCommaSeparatedItems(text);
    if (items.length > 0) {
      creates.push({
        title: `帮${trigger.senderIsSelf ? "对方" : trigger.senderName || "对方"}带：${items.join("、")}`,
        note: `识别到 ${items.length} 个物品，已合并为一条安排`,
        timeKind: matched ? "due" : "none",
        dueAt: matched ? date.getTime() : undefined,
        executionMode: "manual",
        source,
      });
    } else {
      creates.push({
        title: baseTitle,
        timeKind: matched ? "due" : "none",
        dueAt: matched ? date.getTime() : undefined,
        executionMode: aiExecutionGuess(text),
        source,
      });
    }
  }

  return { ok: true, creates, merges, completes };
}

function aiExecutionGuess(text: string): ScheduleExecutionMode {
  if (/(查|翻译|总结|摘要|写一份|帮我写|生成|拟一份)/.test(text)) return "ai-auto";
  if (/(列清单|草拟|起草|帮我先|帮我整理)/.test(text)) return "ai-assist";
  return "manual";
}

function sharesTopic(title: string, text: string) {
  const trimmedTitle = title.replace(/\s+/g, "");
  if (!trimmedTitle) return false;
  const sampleLength = Math.max(2, Math.min(6, Math.floor(trimmedTitle.length / 2)));
  const sample = trimmedTitle.slice(0, sampleLength);
  if (text.includes(sample)) return true;
  if (/医院|体检|检查/.test(title) && /医院|体检|检查|复诊|挂号/.test(text)) return true;
  if (/带|采购|购买/.test(title) && /带|买|采购/.test(text)) return true;
  return false;
}
