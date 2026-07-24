import React from "react";
import ChatInput from "@/components/ChatInput";
import { useCandidateProfile } from "@/data/candidateProfile";
import { formatBubbleTime } from "@/lib/time";
import { usePreferences } from "@/settings/preferences";
import type { RecordItem, RecordSourceConversation } from "@/types/record";

type RecordFullDetailScreenProps = {
  record: RecordItem;
  extensionRecords: RecordItem[];
  onBack: () => void;
  onCreateExtension: (record: RecordItem, content: string) => void;
  onOpenSource?: (source: RecordSourceConversation) => void;
};

export default function RecordFullDetailScreen({
  record,
  extensionRecords,
  onBack,
  onCreateExtension,
  onOpenSource,
}: RecordFullDetailScreenProps) {
  const { t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const selfDisplayName = candidateProfile?.name || t("mine.user");
  const selfAvatarLabel =
    candidateProfile?.avatarLabel || t("recordDetail.me").slice(0, 1);
  const sourceLabel =
    record.sourceConversation?.label ?? t("recordDetail.quickNoteSource");
  const canOpenSource = Boolean(record.sourceConversation && onOpenSource);
  const sortedExtensionRecords = React.useMemo(
    () => [...extensionRecords].sort((a, b) => a.send_at - b.send_at),
    [extensionRecords]
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-[50px] shrink-0 items-center bg-[var(--record-detail-main-bg)] px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-medium leading-none text-[var(--record-detail-content-text)]">
          {t("recordDetail.title")}
        </h1>
        <div className="h-10 w-10" aria-hidden="true" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <MainRecordCard
          record={record}
          sourceLabel={sourceLabel}
          canOpenSource={canOpenSource}
          onOpenSource={onOpenSource}
          selfDisplayName={selfDisplayName}
          selfAvatarLabel={selfAvatarLabel}
        />
        <SimilarRecords />
        <ExtendList
          items={sortedExtensionRecords}
          selfDisplayName={selfDisplayName}
          selfAvatarLabel={selfAvatarLabel}
        />
      </div>

      <ChatInput
        onSubmit={(content) => onCreateExtension(record, content)}
        onVoiceSubmit={() => onCreateExtension(record, t("records.voiceRecord"))}
      />
    </div>
  );
}

function MainRecordCard({
  record,
  sourceLabel,
  canOpenSource,
  onOpenSource,
  selfDisplayName,
  selfAvatarLabel,
}: {
  record: RecordItem;
  sourceLabel: string;
  canOpenSource: boolean;
  onOpenSource?: (source: RecordSourceConversation) => void;
  selfDisplayName: string;
  selfAvatarLabel: string;
}) {
  const { t } = usePreferences();

  return (
    <article className="w-full rounded-b-[8px] border-b border-[var(--record-detail-main-border)] bg-[var(--record-detail-main-bg)]">
      <div className="relative px-4 pb-4 pt-4">
        <button
          type="button"
          className="absolute right-3 top-1 flex h-10 w-10 items-center justify-center rounded-full text-text transition hover:bg-hover-overlay"
          aria-label={t("recordAction.more")}
        >
          <svg className="h-5 w-5 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5h.01M12 12h.01M12 19h.01" />
          </svg>
        </button>

        <div className="flex items-center pr-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-medium text-white">
            {selfAvatarLabel}
          </div>
          <div className="ml-[13px] min-w-0 flex-1">
            <p className="truncate pr-2 text-[14px] leading-5 text-[var(--record-detail-content-text)]">
              {selfDisplayName}
            </p>
            <time className="mt-0.5 block text-[12px] leading-4 text-text-tertiary">
              {formatBubbleTime(record.send_at)}
            </time>
          </div>
        </div>

        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-[1.65] text-[var(--record-detail-content-text)]">
          {record.text_content || t("recordDetail.untitled")}
        </p>

        {canOpenSource && (
          <button
            type="button"
            className="mt-3 inline-flex max-w-full items-center rounded-[8px] border border-[var(--record-topic-border)] px-2 py-1 text-left text-[12px] leading-4 text-text-tertiary transition hover:text-text-muted active:scale-[0.99]"
            onClick={() => onOpenSource?.(record.sourceConversation!)}
          >
            <span className="min-w-0 truncate">{sourceLabel}</span>
            <svg
              className="ml-1 h-3.5 w-3.5 shrink-0"
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
          </button>
        )}
      </div>
    </article>
  );
}

function SimilarRecords() {
  const { t } = usePreferences();

  return (
    <section className="px-4 pb-2 pt-3">
      <h2 className="text-[12px] leading-5 text-text-tertiary">
        {t("recordDetail.similarTitle")}
      </h2>
      <div className="mt-1 overflow-hidden rounded-[8px] bg-[var(--record-detail-main-bg)]">
        <SimilarRow text={t("recordDetail.similarDemo1")} />
        <SimilarRow text={t("recordDetail.similarDemo2")} />
      </div>
    </section>
  );
}

function SimilarRow({ text }: { text: string }) {
  return (
    <article className="border-b border-[var(--record-detail-main-border)] px-3 py-2.5 text-[13px] leading-5 text-text-muted last:border-b-0">
      {text}
    </article>
  );
}

function ExtendList({
  items,
  selfDisplayName,
  selfAvatarLabel,
}: {
  items: RecordItem[];
  selfDisplayName: string;
  selfAvatarLabel: string;
}) {
  const { t } = usePreferences();
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="px-4 pb-1.5 pt-2.5 text-[12px] leading-5 text-text-muted">
        {t("recordDetail.extendsPrefix")}{items.length}{t("recordDetail.extendsSuffix")}
      </h2>
      <div>
        {items.map((item) => (
          <article key={item.uid} className="px-4 py-3">
            <div className="flex items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill-2 text-[13px] font-medium text-text-muted">
                {selfAvatarLabel}
              </div>
              <div className="ml-1.5 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[12px] leading-5 text-text-muted">
                    {selfDisplayName}
                  </p>
                  <time className="shrink-0 text-[12px] leading-5 text-text-tertiary">
                    {formatBubbleTime(item.send_at)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-text">
                  {item.text_content}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
