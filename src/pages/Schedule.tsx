import React from "react";
import { usePreferences } from "@/settings/preferences";
import {
  aiSettingsEvent,
  isAiCallable,
  loadAiSettings,
  type AiSettings,
} from "@/data/aiSettings";
import {
  loadStoredSchedules,
  persistSchedules,
  scheduleStorageEvent,
  scheduleStorageKey,
} from "@/data/scheduleStorage";
import { createScheduleItemFromDraft } from "@/lib/scheduleMutations";
import { executeScheduleWithAi } from "@/lib/scheduleExecutor";
import { cn } from "@/lib/utils";
import type {
  ScheduleDraft,
  ScheduleExecutionMode,
  ScheduleItem,
  ScheduleTimeKind,
} from "@/types/schedule";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DONE_VISIBLE = 30;
const LONG_PRESS_MS = 480;

type SectionKey = "today" | "upcoming" | "untimed" | "later" | "done";

type ScheduleSection = {
  key: SectionKey;
  items: ScheduleItem[];
};

type ViewMode = "list" | "calendar";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function formatDateInput(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTimeInput(timestamp: number) {
  const d = new Date(timestamp);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateAndTime(dateValue: string, timeValue: string): number | undefined {
  if (!dateValue) return undefined;
  const datePart = new Date(`${dateValue}T${timeValue || "09:00"}:00`);
  const timestamp = datePart.getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function primaryTimestamp(item: ScheduleItem): number | undefined {
  return item.dueAt ?? item.startAt ?? item.reminderAt;
}

function formatRelative(
  timestamp: number,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
) {
  const now = Date.now();
  const dueDay = startOfDay(timestamp);
  const todayDay = startOfDay(now);
  const diffDays = Math.round((dueDay - todayDay) / ONE_DAY_MS);
  const time = new Date(timestamp).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (diffDays === 0) return `${t("schedule.dueToday")} ${time}`;
  if (diffDays === 1) return `${t("schedule.dueTomorrow")} ${time}`;
  if (diffDays === -1) return `${t("schedule.dueYesterday")} ${time}`;
  if (diffDays < 0)
    return `${t("schedule.dueOverduePrefix")} ${-diffDays}${t("schedule.daysSuffix")}`;
  if (diffDays <= 6) return `${diffDays}${t("schedule.daysLaterSuffix")} ${time}`;
  return `${new Date(timestamp).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })} ${time}`;
}

function formatTimeChip(
  item: ScheduleItem,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
): string | null {
  if (item.timeKind === "due" && item.dueAt) return formatRelative(item.dueAt, locale, t);
  if (item.timeKind === "reminder" && item.reminderAt)
    return `${t("schedule.tag.reminder")} ${formatRelative(item.reminderAt, locale, t)}`;
  if (item.timeKind === "range" && item.startAt) {
    const startLabel = formatRelative(item.startAt, locale, t);
    if (item.endAt) {
      const endLabel = new Date(item.endAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return `${startLabel} ~ ${endLabel}`;
    }
    return startLabel;
  }
  return null;
}

function sortPendingItems(a: ScheduleItem, b: ScheduleItem) {
  const aTime = primaryTimestamp(a);
  const bTime = primaryTimestamp(b);
  if (aTime && bTime) return aTime - bTime;
  if (aTime) return -1;
  if (bTime) return 1;
  return a.createdAt - b.createdAt;
}

function groupSchedules(items: ScheduleItem[]): ScheduleSection[] {
  const now = Date.now();
  const todayEnd = endOfDay(now);

  const today: ScheduleItem[] = [];
  const upcoming: ScheduleItem[] = [];
  const untimed: ScheduleItem[] = [];
  const later: ScheduleItem[] = [];
  const done: ScheduleItem[] = [];

  for (const item of items) {
    if (item.status === "done") {
      done.push(item);
      continue;
    }
    if (item.status === "later") {
      later.push(item);
      continue;
    }
    const time = primaryTimestamp(item);
    if (!time) {
      untimed.push(item);
      continue;
    }
    if (time <= todayEnd) today.push(item);
    else upcoming.push(item);
  }

  today.sort(sortPendingItems);
  upcoming.sort(sortPendingItems);
  untimed.sort(sortPendingItems);
  later.sort(sortPendingItems);
  done.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));

  const sections: ScheduleSection[] = [];
  if (today.length) sections.push({ key: "today", items: today });
  if (upcoming.length) sections.push({ key: "upcoming", items: upcoming });
  if (untimed.length) sections.push({ key: "untimed", items: untimed });
  if (later.length) sections.push({ key: "later", items: later });
  if (done.length) sections.push({ key: "done", items: done.slice(0, MAX_DONE_VISIBLE) });
  return sections;
}

function useScheduleState() {
  const [items, setItems] = React.useState<ScheduleItem[]>(() => loadStoredSchedules());
  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== scheduleStorageKey) return;
      setItems(loadStoredSchedules());
    };
    const handleCustom = () => setItems(loadStoredSchedules());
    window.addEventListener("storage", handleStorage);
    window.addEventListener(scheduleStorageEvent, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(scheduleStorageEvent, handleCustom);
    };
  }, []);
  return [items, setItems] as const;
}

function useAiSettings() {
  const [settings, setSettings] = React.useState<AiSettings>(() => loadAiSettings());
  React.useEffect(() => {
    const refresh = () => setSettings(loadAiSettings());
    window.addEventListener(aiSettingsEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(aiSettingsEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return settings;
}

export default function Schedule() {
  const { resolvedLocale, t } = usePreferences();
  const [items, setItems] = useScheduleState();
  const aiSettings = useAiSettings();
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<ScheduleItem | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<ScheduleItem | null>(null);
  const [editTarget, setEditTarget] = React.useState<ScheduleItem | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [executingUid, setExecutingUid] = React.useState<string | null>(null);
  const [executionError, setExecutionError] = React.useState<string>("");

  const writeItems = React.useCallback(
    (next: ScheduleItem[]) => {
      setItems(next);
      persistSchedules(next);
    },
    [setItems]
  );

  const handleCreate = (draft: ScheduleDraft) => {
    if (!draft.title.trim()) return;
    const newItem = createScheduleItemFromDraft(draft, "manual");
    writeItems([newItem, ...items]);
    setComposerOpen(false);
  };

  const handleUpdate = (target: ScheduleItem, draft: ScheduleDraft) => {
    const trimmed = draft.title.trim();
    if (!trimmed) return;
    const now = Date.now();
    const next = items.map((item) =>
      item.uid !== target.uid
        ? item
        : {
            ...item,
            title: trimmed,
            note: draft.note?.trim() || undefined,
            location: draft.location?.trim() || undefined,
            people: draft.people?.trim() || undefined,
            timeKind: draft.timeKind,
            dueAt: draft.timeKind === "due" ? draft.dueAt : undefined,
            startAt: draft.timeKind === "range" ? draft.startAt : undefined,
            endAt: draft.timeKind === "range" ? draft.endAt : undefined,
            reminderAt: draft.timeKind === "reminder" ? draft.reminderAt : undefined,
            isReminder: draft.isReminder,
            executionMode: draft.executionMode ?? item.executionMode,
            updatedAt: now,
          }
    );
    writeItems(next);
    setEditTarget(null);
  };

  const handleToggleComplete = (target: ScheduleItem) => {
    const now = Date.now();
    const next = items.map((item) => {
      if (item.uid !== target.uid) return item;
      if (item.status === "done") {
        return {
          ...item,
          status: "pending" as const,
          completedAt: undefined,
          completedBy: undefined,
          completionEvidence: undefined,
          updatedAt: now,
        };
      }
      return {
        ...item,
        status: "done" as const,
        completedAt: now,
        completedBy: "user" as const,
        updatedAt: now,
      };
    });
    writeItems(next);
  };

  const handleSnooze = (target: ScheduleItem) => {
    const now = Date.now();
    const next = items.map((item) =>
      item.uid === target.uid
        ? { ...item, status: "later" as const, updatedAt: now }
        : item
    );
    writeItems(next);
    setActionTarget(null);
  };

  const handleRevive = (target: ScheduleItem) => {
    const now = Date.now();
    const next = items.map((item) =>
      item.uid === target.uid
        ? { ...item, status: "pending" as const, updatedAt: now }
        : item
    );
    writeItems(next);
    setActionTarget(null);
  };

  const handleDelete = (target: ScheduleItem) => {
    writeItems(items.filter((item) => item.uid !== target.uid));
    setActionTarget(null);
    if (detailTarget?.uid === target.uid) setDetailTarget(null);
  };

  const handleEditRequest = (target: ScheduleItem) => {
    setActionTarget(null);
    setEditTarget(target);
  };

  const handleExecuteWithAi = async (target: ScheduleItem) => {
    if (!isAiCallable(aiSettings)) {
      setExecutionError(t("schedule.execute.needsAi"));
      return;
    }
    setExecutionError("");
    setExecutingUid(target.uid);
    const result = await executeScheduleWithAi(aiSettings, target);
    if (!result.ok) {
      setExecutionError(
        result.error === "missing-api-key" ? t("schedule.execute.needsAi") : result.error || ""
      );
      setExecutingUid(null);
      return;
    }
    const now = Date.now();
    const next = items.map((item) =>
      item.uid !== target.uid
        ? item
        : {
            ...item,
            status: "done" as const,
            completedAt: now,
            completedBy: "ai" as const,
            aiExecutionResult: result.result,
            updatedAt: now,
          }
    );
    writeItems(next);
    setExecutingUid(null);
    setDetailTarget(next.find((item) => item.uid === target.uid) ?? null);
  };

  const sections = React.useMemo(() => groupSchedules(items), [items]);
  const pendingItems = React.useMemo(
    () => items.filter((item) => item.status === "pending"),
    [items]
  );

  const headerSubtitle =
    pendingItems.length > 0
      ? `${t("schedule.subtitlePending")} ${pendingItems.length} ${t("schedule.subtitlePendingSuffix")}`
      : t("schedule.subtitleEmpty");

  const aiBadgeText = !aiSettings.enabled
    ? t("schedule.aiBadge.off")
    : aiSettings.provider === "demo-mock"
    ? t("schedule.aiBadge.demo")
    : isAiCallable(aiSettings)
    ? t("schedule.aiBadge.on")
    : t("schedule.aiBadge.missingKey");

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-start justify-between bg-bg px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text">{t("schedule.title")}</h1>
          <p className="mt-0.5 text-xs text-text-muted">{headerSubtitle}</p>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-4",
              aiSettings.enabled
                ? "bg-primary-soft text-primary"
                : "bg-[var(--fill-4)] text-text-tertiary"
            )}
          >
            <SparkleIcon className="h-2.5 w-2.5" />
            {aiBadgeText}
          </span>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-on-primary transition active:scale-[0.98]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t("schedule.add")}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {viewMode === "list" ? (
          sections.length === 0 ? (
            <ScheduleEmptyState onCreate={() => setComposerOpen(true)} />
          ) : (
            sections.map((section) => (
              <ScheduleSectionBlock
                key={section.key}
                sectionKey={section.key}
                items={section.items}
                locale={resolvedLocale}
                onToggleComplete={handleToggleComplete}
                onOpenAction={setActionTarget}
                onOpenDetail={setDetailTarget}
                onExecuteWithAi={handleExecuteWithAi}
                executingUid={executingUid}
              />
            ))
          )
        ) : (
          <CalendarView
            items={pendingItems}
            locale={resolvedLocale}
            onSelect={setDetailTarget}
          />
        )}
        {executionError && (
          <p className="mt-3 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-5 text-primary">
            {executionError}
          </p>
        )}
        <p className="mt-6 px-2 text-center text-[11px] leading-4 text-text-disabled">
          {t("schedule.hint")}
        </p>
      </div>

      {composerOpen && (
        <ScheduleComposerSheet
          onClose={() => setComposerOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {editTarget && (
        <ScheduleComposerSheet
          initialItem={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(draft) => handleUpdate(editTarget, draft)}
        />
      )}

      {actionTarget && (
        <ScheduleActionSheet
          target={actionTarget}
          onClose={() => setActionTarget(null)}
          onSnooze={handleSnooze}
          onRevive={handleRevive}
          onDelete={handleDelete}
          onEdit={handleEditRequest}
        />
      )}

      {detailTarget && (
        <ScheduleDetailSheet
          item={detailTarget}
          locale={resolvedLocale}
          onClose={() => setDetailTarget(null)}
          onToggleComplete={(target) => {
            handleToggleComplete(target);
            const refreshed = loadStoredSchedules().find((entry) => entry.uid === target.uid);
            setDetailTarget(refreshed ?? null);
          }}
          onExecuteWithAi={handleExecuteWithAi}
          onOpenAction={(target) => {
            setDetailTarget(null);
            setActionTarget(target);
          }}
          executingUid={executingUid}
        />
      )}
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const { t } = usePreferences();
  return (
    <div className="inline-flex h-9 items-center rounded-full bg-surface-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "h-8 rounded-full px-3 transition",
          value === "list" ? "bg-surface text-text shadow-sm" : "text-text-tertiary"
        )}
      >
        {t("schedule.view.list")}
      </button>
      <button
        type="button"
        onClick={() => onChange("calendar")}
        className={cn(
          "h-8 rounded-full px-3 transition",
          value === "calendar" ? "bg-surface text-text shadow-sm" : "text-text-tertiary"
        )}
      >
        {t("schedule.view.calendar")}
      </button>
    </div>
  );
}

function ScheduleSectionBlock({
  sectionKey,
  items,
  locale,
  onToggleComplete,
  onOpenAction,
  onOpenDetail,
  onExecuteWithAi,
  executingUid,
}: {
  sectionKey: SectionKey;
  items: ScheduleItem[];
  locale: string;
  onToggleComplete: (item: ScheduleItem) => void;
  onOpenAction: (item: ScheduleItem) => void;
  onOpenDetail: (item: ScheduleItem) => void;
  onExecuteWithAi: (item: ScheduleItem) => void;
  executingUid: string | null;
}) {
  const { t } = usePreferences();
  return (
    <section className="mt-3 first:mt-2">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-semibold text-text-muted">
          {t(`schedule.section.${sectionKey}`)}
        </h2>
        <span className="text-[11px] text-text-disabled">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-[14px] bg-surface">
        {items.map((item, index) => (
          <ScheduleItemRow
            key={item.uid}
            item={item}
            divider={index < items.length - 1}
            locale={locale}
            onToggleComplete={onToggleComplete}
            onOpenAction={onOpenAction}
            onOpenDetail={onOpenDetail}
            onExecuteWithAi={onExecuteWithAi}
            isExecuting={executingUid === item.uid}
          />
        ))}
      </div>
    </section>
  );
}

function ScheduleItemRow({
  item,
  divider,
  locale,
  onToggleComplete,
  onOpenAction,
  onOpenDetail,
  onExecuteWithAi,
  isExecuting,
}: {
  item: ScheduleItem;
  divider: boolean;
  locale: string;
  onToggleComplete: (item: ScheduleItem) => void;
  onOpenAction: (item: ScheduleItem) => void;
  onOpenDetail: (item: ScheduleItem) => void;
  onExecuteWithAi: (item: ScheduleItem) => void;
  isExecuting: boolean;
}) {
  const { t } = usePreferences();
  const isDone = item.status === "done";
  const isLater = item.status === "later";
  const dueTime = primaryTimestamp(item);
  const isOverdue =
    !isDone && !isLater && dueTime !== undefined && dueTime < Date.now();
  const timeChip = formatTimeChip(item, locale, t);
  const longPress = useLongPress(() => onOpenAction(item));

  return (
    <div
      className={cn(
        "flex gap-3 px-3 py-2.5",
        divider && "border-b border-border-light"
      )}
    >
      <button
        type="button"
        onClick={() => onToggleComplete(item)}
        aria-label={isDone ? t("schedule.action.undo") : t("schedule.action.complete")}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.92]",
          isDone
            ? "border-primary bg-primary text-on-primary"
            : "border-border-strong text-transparent hover:border-primary"
        )}
      >
        <CheckIcon className="h-3 w-3" />
      </button>

      <button
        type="button"
        onClick={() => onOpenDetail(item)}
        {...longPress}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "min-w-0 flex-1 break-words text-[15px] leading-5 text-text",
              isDone && "text-text-tertiary line-through",
              isLater && "text-text-muted"
            )}
          >
            {item.title}
          </p>
          <ExecutionBadge mode={item.executionMode} />
          {item.source !== "manual" && (
            <SourceBadge type={item.source} />
          )}
        </div>
        {item.note && !isDone && (
          <p className="mt-0.5 break-words text-xs leading-4 text-text-muted">
            {item.note}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {timeChip && (
            <ScheduleChip
              tone={isOverdue ? "warning" : isDone ? "muted" : "default"}
              icon={<ClockIcon className="h-3 w-3" />}
              label={timeChip}
            />
          )}
          {item.location && (
            <ScheduleChip
              tone="muted"
              icon={<LocationIcon className="h-3 w-3" />}
              label={item.location}
            />
          )}
          {item.people && (
            <ScheduleChip
              tone="muted"
              icon={<PersonIcon className="h-3 w-3" />}
              label={item.people}
            />
          )}
          {item.sources.length > 1 && (
            <ScheduleChip
              tone="muted"
              icon={<LayersIcon className="h-3 w-3" />}
              label={`${item.sources.length} ${t("schedule.sourceCountSuffix")}`}
            />
          )}
        </div>
      </button>

      {item.executionMode === "ai-auto" && !isDone && (
        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onExecuteWithAi(item)}
          className={cn(
            "mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 text-[11px] font-semibold text-primary transition",
            isExecuting ? "opacity-60" : "active:scale-[0.97]"
          )}
        >
          <SparkleIcon className="h-3 w-3" />
          {isExecuting ? t("schedule.execute.running") : t("schedule.execute.cta")}
        </button>
      )}

      <button
        type="button"
        onClick={() => onOpenAction(item)}
        aria-label={t("schedule.action.more")}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-tertiary transition hover:bg-hover-overlay active:scale-[0.94]"
      >
        <MoreIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function useLongPress(onLongPress: () => void) {
  const timerRef = React.useRef<number | null>(null);
  const triggeredRef = React.useRef(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = () => {
    triggeredRef.current = false;
    clear();
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      clear();
      onLongPress();
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (triggeredRef.current) {
        event.stopPropagation();
        event.preventDefault();
        triggeredRef.current = false;
      }
    },
  };
}

function ScheduleChip({
  tone,
  icon,
  label,
}: {
  tone: "default" | "warning" | "muted";
  icon: React.ReactNode;
  label: string;
}) {
  const toneClass =
    tone === "warning"
      ? "bg-[var(--fill-3)] text-text-muted"
      : tone === "muted"
      ? "bg-[var(--fill-4)] text-text-tertiary"
      : "bg-primary-soft text-primary";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4",
        toneClass
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function ExecutionBadge({ mode }: { mode: ScheduleExecutionMode }) {
  const { t } = usePreferences();
  if (mode === "manual") return null;
  const tone = mode === "ai-auto" ? "bg-primary text-on-primary" : "bg-primary-soft text-primary";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-3",
        tone
      )}
    >
      <SparkleIcon className="h-2 w-2" />
      {mode === "ai-auto" ? t("schedule.execution.auto") : t("schedule.execution.assist")}
    </span>
  );
}

function SourceBadge({ type }: { type: ScheduleItem["source"] }) {
  const { t } = usePreferences();
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--fill-4)] px-1.5 py-0.5 text-[10px] leading-3 text-text-tertiary">
      {t(`schedule.sourceLabel.${type}`)}
    </span>
  );
}

function ScheduleEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = usePreferences();
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-text-tertiary">
        <ScheduleEmptyIcon className="h-7 w-7" />
      </div>
      <p className="mt-3 text-sm font-semibold text-text">
        {t("schedule.empty.title")}
      </p>
      <p className="mt-1 max-w-[260px] text-xs leading-5 text-text-muted">
        {t("schedule.empty.desc")}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-9 items-center gap-1 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary transition active:scale-[0.98]"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        {t("schedule.empty.cta")}
      </button>
    </div>
  );
}

function CalendarView({
  items,
  locale,
  onSelect,
}: {
  items: ScheduleItem[];
  locale: string;
  onSelect: (item: ScheduleItem) => void;
}) {
  const { t } = usePreferences();
  const [cursor, setCursor] = React.useState(() => {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const monthLabel = cursor.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });

  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const time = primaryTimestamp(item);
      if (!time) continue;
      const key = formatDateInput(time);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const firstDay = new Date(cursor);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ date: null, key: `pad-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const cellDate = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ date: cellDate, key: cellDate.toISOString() });
  }

  const today = new Date();
  const [selectedKey, setSelectedKey] = React.useState<string>(() => formatDateInput(today.getTime()));
  React.useEffect(() => {
    setSelectedKey(formatDateInput(today.getTime()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.getFullYear(), cursor.getMonth()]);

  const selectedItems = selectedKey ? itemsByDay.get(selectedKey) ?? [] : [];

  const weekdayLabels = (t("schedule.calendar.weekdays") || "日,一,二,三,四,五,六").split(",");

  return (
    <section className="mt-3 rounded-[14px] bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const next = new Date(cursor);
            next.setMonth(next.getMonth() - 1);
            setCursor(next);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-hover-overlay"
          aria-label={t("schedule.calendar.prev")}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-text">{monthLabel}</p>
        <button
          type="button"
          onClick={() => {
            const next = new Date(cursor);
            next.setMonth(next.getMonth() + 1);
            setCursor(next);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-hover-overlay"
          aria-label={t("schedule.calendar.next")}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-text-tertiary">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.date) {
            return <div key={cell.key} className="h-12" />;
          }
          const dayKey = formatDateInput(cell.date.getTime());
          const dayItems = itemsByDay.get(dayKey) ?? [];
          const isToday = dayKey === formatDateInput(today.getTime());
          const isSelected = dayKey === selectedKey;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedKey(dayKey)}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-[10px] text-xs leading-4 transition",
                isSelected
                  ? "bg-primary text-on-primary"
                  : isToday
                  ? "bg-primary-soft text-primary"
                  : "text-text hover:bg-hover-overlay"
              )}
            >
              <span className="font-medium">{cell.date.getDate()}</span>
              {dayItems.length > 0 && (
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    isSelected ? "bg-on-primary" : "bg-primary"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <p className="px-1 text-xs font-medium text-text-muted">
          {selectedKey
            ? new Date(selectedKey).toLocaleDateString(locale, {
                month: "short",
                day: "numeric",
                weekday: "short",
              })
            : ""}
        </p>
        {selectedItems.length === 0 ? (
          <p className="mt-2 px-1 text-xs text-text-tertiary">
            {t("schedule.calendar.emptyDay")}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {selectedItems.map((item) => {
              const time = primaryTimestamp(item);
              return (
                <li key={item.uid}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center justify-between rounded-[10px] bg-surface-muted px-3 py-2 text-left transition hover:bg-hover-overlay"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{item.title}</p>
                      {item.location && (
                        <p className="truncate text-[11px] leading-4 text-text-tertiary">
                          {item.location}
                        </p>
                      )}
                    </div>
                    <span className="ml-2 text-[11px] text-text-tertiary">
                      {time
                        ? new Date(time).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })
                        : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScheduleComposerSheet({
  onClose,
  onSubmit,
  initialItem,
}: {
  onClose: () => void;
  onSubmit: (draft: ScheduleDraft) => void;
  initialItem?: ScheduleItem;
}) {
  const { t } = usePreferences();
  const [title, setTitle] = React.useState(initialItem?.title ?? "");
  const [note, setNote] = React.useState(initialItem?.note ?? "");
  const [location, setLocation] = React.useState(initialItem?.location ?? "");
  const [people, setPeople] = React.useState(initialItem?.people ?? "");
  const [timeKind, setTimeKind] = React.useState<ScheduleTimeKind>(
    initialItem?.timeKind ?? "none"
  );
  const [executionMode, setExecutionMode] = React.useState<ScheduleExecutionMode>(
    initialItem?.executionMode ?? "manual"
  );

  const [dueDate, setDueDate] = React.useState(
    initialItem?.dueAt ? formatDateInput(initialItem.dueAt) : ""
  );
  const [dueTime, setDueTime] = React.useState(
    initialItem?.dueAt ? formatTimeInput(initialItem.dueAt) : ""
  );

  const [startDate, setStartDate] = React.useState(
    initialItem?.startAt ? formatDateInput(initialItem.startAt) : ""
  );
  const [startTime, setStartTime] = React.useState(
    initialItem?.startAt ? formatTimeInput(initialItem.startAt) : ""
  );
  const [endDate, setEndDate] = React.useState(
    initialItem?.endAt ? formatDateInput(initialItem.endAt) : ""
  );
  const [endTime, setEndTime] = React.useState(
    initialItem?.endAt ? formatTimeInput(initialItem.endAt) : ""
  );

  const [reminderDate, setReminderDate] = React.useState(
    initialItem?.reminderAt ? formatDateInput(initialItem.reminderAt) : ""
  );
  const [reminderTime, setReminderTime] = React.useState(
    initialItem?.reminderAt ? formatTimeInput(initialItem.reminderAt) : ""
  );

  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const draft: ScheduleDraft = {
      title: trimmedTitle,
      note: note.trim() || undefined,
      location: location.trim() || undefined,
      people: people.trim() || undefined,
      timeKind,
      dueAt: timeKind === "due" ? combineDateAndTime(dueDate, dueTime) : undefined,
      startAt: timeKind === "range" ? combineDateAndTime(startDate, startTime) : undefined,
      endAt: timeKind === "range" ? combineDateAndTime(endDate, endTime) : undefined,
      reminderAt:
        timeKind === "reminder" ? combineDateAndTime(reminderDate, reminderTime) : undefined,
      isReminder: timeKind === "reminder",
      executionMode,
    };
    onSubmit(draft);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.done")}
        className="absolute inset-0 bg-overlay-light"
      />
      <div className="relative max-h-[90%] overflow-hidden rounded-t-[22px] bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-full px-3 text-sm text-text-muted transition hover:bg-hover-overlay active:scale-[0.98]"
          >
            {t("schedule.create.cancel")}
          </button>
          <h2 className="text-base font-semibold text-text">
            {initialItem ? t("schedule.create.editTitle") : t("schedule.create.title")}
          </h2>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "flex h-9 items-center rounded-full px-3 text-sm font-semibold transition active:scale-[0.98]",
              canSubmit
                ? "text-primary hover:bg-primary-soft"
                : "cursor-not-allowed text-text-disabled"
            )}
          >
            {t("schedule.create.submit")}
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 pb-5">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("schedule.create.titlePlaceholder")}
            className="w-full border-b border-border-light bg-transparent py-3 text-[17px] font-medium leading-6 text-text outline-none placeholder:text-text-disabled"
          />

          <FieldRow label={t("schedule.create.timeKindLabel")}>
            <SegmentedTimeKind value={timeKind} onChange={setTimeKind} />
          </FieldRow>

          {timeKind === "due" && (
            <FieldRow label={t("schedule.create.dueLabel")}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none"
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                  disabled={!dueDate}
                  className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none disabled:opacity-50"
                />
              </div>
            </FieldRow>
          )}

          {timeKind === "range" && (
            <FieldRow label={t("schedule.create.rangeLabel")}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 text-[11px] text-text-tertiary">
                    {t("schedule.create.startShort")}
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none"
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    disabled={!startDate}
                    className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 text-[11px] text-text-tertiary">
                    {t("schedule.create.endShort")}
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    disabled={!endDate}
                    className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none disabled:opacity-50"
                  />
                </div>
              </div>
            </FieldRow>
          )}

          {timeKind === "reminder" && (
            <FieldRow label={t("schedule.create.reminderLabel")}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                  className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none"
                />
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(event) => setReminderTime(event.target.value)}
                  disabled={!reminderDate}
                  className="rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none disabled:opacity-50"
                />
              </div>
            </FieldRow>
          )}

          <FieldRow label={t("schedule.create.locationLabel")}>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t("schedule.create.locationPlaceholder")}
              className="w-full rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none placeholder:text-text-disabled"
            />
          </FieldRow>

          <FieldRow label={t("schedule.create.peopleLabel")}>
            <input
              type="text"
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              placeholder={t("schedule.create.peoplePlaceholder")}
              className="w-full rounded-[10px] bg-surface-muted px-3 py-2 text-sm text-text outline-none placeholder:text-text-disabled"
            />
          </FieldRow>

          <FieldRow label={t("schedule.create.noteLabel")}>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("schedule.create.notePlaceholder")}
              rows={3}
              className="w-full resize-none rounded-[10px] bg-surface-muted px-3 py-2 text-sm leading-5 text-text outline-none placeholder:text-text-disabled"
            />
          </FieldRow>

          <FieldRow label={t("schedule.create.executionLabel")}>
            <SegmentedExecution value={executionMode} onChange={setExecutionMode} />
          </FieldRow>
        </div>
      </div>
    </div>
  );
}

function SegmentedTimeKind({
  value,
  onChange,
}: {
  value: ScheduleTimeKind;
  onChange: (next: ScheduleTimeKind) => void;
}) {
  const { t } = usePreferences();
  const options: Array<{ key: ScheduleTimeKind; label: string }> = [
    { key: "none", label: t("schedule.timeKind.none") },
    { key: "due", label: t("schedule.timeKind.due") },
    { key: "range", label: t("schedule.timeKind.range") },
    { key: "reminder", label: t("schedule.timeKind.reminder") },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "h-8 rounded-full border px-3 text-xs transition",
            value === option.key
              ? "border-primary bg-primary-soft text-primary"
              : "border-border bg-surface text-text-muted"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SegmentedExecution({
  value,
  onChange,
}: {
  value: ScheduleExecutionMode;
  onChange: (next: ScheduleExecutionMode) => void;
}) {
  const { t } = usePreferences();
  const options: Array<{ key: ScheduleExecutionMode; label: string; desc: string }> = [
    {
      key: "manual",
      label: t("schedule.execution.manual"),
      desc: t("schedule.execution.manualDesc"),
    },
    {
      key: "ai-assist",
      label: t("schedule.execution.assist"),
      desc: t("schedule.execution.assistDesc"),
    },
    {
      key: "ai-auto",
      label: t("schedule.execution.auto"),
      desc: t("schedule.execution.autoDesc"),
    },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "flex w-full items-start gap-2 rounded-[10px] border px-3 py-2 text-left transition",
            value === option.key
              ? "border-primary bg-primary-soft"
              : "border-border bg-surface"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              value === option.key
                ? "border-primary bg-primary text-on-primary"
                : "border-border"
            )}
          >
            {value === option.key && <CheckIcon className="h-2.5 w-2.5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text">{option.label}</p>
            <p className="text-[11px] leading-4 text-text-tertiary">{option.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1 px-1 text-[12px] font-medium text-text-muted">{label}</p>
      {children}
    </div>
  );
}

function ScheduleActionSheet({
  target,
  onClose,
  onSnooze,
  onRevive,
  onDelete,
  onEdit,
}: {
  target: ScheduleItem;
  onClose: () => void;
  onSnooze: (target: ScheduleItem) => void;
  onRevive: (target: ScheduleItem) => void;
  onDelete: (target: ScheduleItem) => void;
  onEdit: (target: ScheduleItem) => void;
}) {
  const { t } = usePreferences();
  const isLater = target.status === "later";
  const isDone = target.status === "done";

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.done")}
        className="absolute inset-0 bg-overlay-light"
      />
      <div className="relative overflow-hidden rounded-t-[22px] bg-surface px-3 pb-4 pt-3 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        <p className="px-2 pb-2 text-xs text-text-tertiary">{target.title}</p>
        <div className="overflow-hidden rounded-[12px] bg-surface-muted">
          <ActionRow
            label={t("schedule.action.edit")}
            description={t("schedule.action.editDesc")}
            onClick={() => onEdit(target)}
          />
          {!isDone && !isLater && (
            <ActionRow
              label={t("schedule.action.later")}
              description={t("schedule.action.laterDesc")}
              onClick={() => onSnooze(target)}
            />
          )}
          {isLater && (
            <ActionRow
              label={t("schedule.action.revive")}
              description={t("schedule.action.reviveDesc")}
              onClick={() => onRevive(target)}
            />
          )}
          <ActionRow
            label={t("schedule.action.delete")}
            tone="danger"
            onClick={() => onDelete(target)}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-[12px] bg-surface-muted text-sm font-medium text-text active:scale-[0.99]"
        >
          {t("schedule.create.cancel")}
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  label,
  description,
  tone = "default",
  onClick,
}: {
  label: string;
  description?: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-border-light px-3 py-3 text-left last:border-b-0 active:scale-[0.99]"
    >
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-[15px] leading-5",
            tone === "danger" ? "text-danger" : "text-text"
          )}
        >
          {label}
        </p>
        {description && (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-text-tertiary">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

function ScheduleDetailSheet({
  item,
  locale,
  onClose,
  onToggleComplete,
  onExecuteWithAi,
  onOpenAction,
  executingUid,
}: {
  item: ScheduleItem;
  locale: string;
  onClose: () => void;
  onToggleComplete: (target: ScheduleItem) => void;
  onExecuteWithAi: (target: ScheduleItem) => void;
  onOpenAction: (target: ScheduleItem) => void;
  executingUid: string | null;
}) {
  const { t } = usePreferences();
  const isDone = item.status === "done";
  const timeChip = formatTimeChip(item, locale, t);
  const isExecuting = executingUid === item.uid;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.done")}
        className="absolute inset-0 bg-overlay-light"
      />
      <div className="relative max-h-[90%] overflow-hidden rounded-t-[22px] bg-surface px-4 pb-5 pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold leading-6 text-text">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              {t(`schedule.sourceLabel.${item.source}`)}
              {item.sources.length > 1 &&
                ` · ${item.sources.length} ${t("schedule.sourceCountSuffix")}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAction(item)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary hover:bg-hover-overlay"
            aria-label={t("schedule.action.more")}
          >
            <MoreIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {timeChip && (
            <ScheduleChip
              tone="default"
              icon={<ClockIcon className="h-3 w-3" />}
              label={timeChip}
            />
          )}
          {item.location && (
            <ScheduleChip
              tone="muted"
              icon={<LocationIcon className="h-3 w-3" />}
              label={item.location}
            />
          )}
          {item.people && (
            <ScheduleChip
              tone="muted"
              icon={<PersonIcon className="h-3 w-3" />}
              label={item.people}
            />
          )}
          {item.executionMode !== "manual" && (
            <ScheduleChip
              tone="default"
              icon={<SparkleIcon className="h-3 w-3" />}
              label={
                item.executionMode === "ai-auto"
                  ? t("schedule.execution.auto")
                  : t("schedule.execution.assist")
              }
            />
          )}
        </div>

        {item.note && (
          <section className="mt-4 rounded-[12px] bg-surface-muted px-3 py-2">
            <p className="text-[11px] font-semibold text-text-tertiary">
              {t("schedule.detail.note")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-text">
              {item.note}
            </p>
          </section>
        )}

        <section className="mt-4 max-h-[40vh] overflow-y-auto rounded-[12px] bg-surface-muted px-3 py-2">
          <p className="text-[11px] font-semibold text-text-tertiary">
            {t("schedule.detail.sources")}
          </p>
          {item.sources.length === 0 ? (
            <p className="mt-1 text-xs text-text-tertiary">
              {t("schedule.detail.sourcesEmpty")}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {item.sources.map((source) => (
                <li key={source.id} className="rounded-[10px] bg-surface px-3 py-2">
                  <p className="text-[11px] text-text-tertiary">
                    {`${t(`schedule.sourceLabel.${source.type}`)}${
                      source.conversationLabel ? ` · ${source.conversationLabel}` : ""
                    } · ${new Date(source.capturedAt).toLocaleString(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}`}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-text">
                    {source.senderName ? `${source.senderName}: ${source.excerpt}` : source.excerpt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {item.completionEvidence && (
          <section className="mt-4 rounded-[12px] bg-primary-soft px-3 py-2 text-xs text-primary">
            <p className="text-[11px] font-semibold">{t("schedule.detail.completionEvidence")}</p>
            <p className="mt-1 leading-5">{item.completionEvidence}</p>
          </section>
        )}

        {item.aiExecutionResult && (
          <section className="mt-4 rounded-[12px] bg-primary-soft px-3 py-2 text-xs text-primary">
            <p className="text-[11px] font-semibold">{t("schedule.detail.aiExecutionResult")}</p>
            <p className="mt-1 whitespace-pre-wrap leading-5">{item.aiExecutionResult}</p>
          </section>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onToggleComplete(item)}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold transition active:scale-[0.98]",
              isDone
                ? "bg-surface-muted text-text-muted"
                : "bg-primary text-on-primary"
            )}
          >
            <CheckIcon className="h-3 w-3" />
            {isDone ? t("schedule.action.undo") : t("schedule.action.complete")}
          </button>
          {item.executionMode === "ai-auto" && !isDone && (
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => onExecuteWithAi(item)}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition",
                isExecuting ? "bg-primary-soft opacity-60" : "bg-primary-soft active:scale-[0.98]"
              )}
            >
              <SparkleIcon className="h-3 w-3" />
              {isExecuting ? t("schedule.execute.running") : t("schedule.execute.cta")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.2L10 10" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 14s-4.5-4-4.5-7.5a4.5 4.5 0 1 1 9 0C12.5 10 8 14 8 14Z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 13.2c1-2.2 3-3.2 5-3.2s4 1 5 3.2" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="3.5" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="12.5" cy="8" r="1.4" />
    </svg>
  );
}

function ScheduleEmptyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M9 14.5l1.8 1.8L15 12.5" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.5l1.4 3.5L13 6.4l-3.6 1.4L8 11.3 6.6 7.8 3 6.4l3.6-1.4L8 1.5Z" />
      <path d="M12.5 10l.7 1.8L15 12.5l-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </svg>
  );
}

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2L2 5l6 3 6-3-6-3Z" />
      <path d="M2 9l6 3 6-3" />
      <path d="M2 13l6 3 6-3" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 12L6 8l4-4" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
