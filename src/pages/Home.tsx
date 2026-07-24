import React from "react";
import AppShell from "@/layouts/AppShell";
import ChatBubble from "@/components/ChatBubble";
import ChatInput from "@/components/ChatInput";
import ChatList from "@/components/ChatList";
import RecordDetailSheet from "@/components/RecordDetailSheet";
import RecordFullDetailScreen from "@/components/RecordFullDetailScreen";
import Records from "@/pages/Records";
import { aiConversationLogEntries } from "@/data/aiConversationLog";
import { useCandidateProfile } from "@/data/candidateProfile";
import {
  createTestReplyMessage,
  demoSenderIdentityId,
  getInitialTestGroupSettings,
  getInitialTestGroups,
  getInitialTestIdentities,
  getInitialTestMessages,
  getInitialTestReadState,
  getPrivateConversationId,
  persistTestGroups,
  persistTestGroupSettings,
  persistTestMessages,
  persistTestReadState,
  testConversationStorageEvent,
  testGroupSettingsStorageKey,
  testGroupsStorageKey,
  testIdentitiesStorageKey,
  testMessagesStorageKey,
  testReadStateStorageKey,
  type TestConversationType,
  type TestGroup,
  type TestGroupSettings,
  type TestIdentity,
  type TestMessage,
  type TestReadState,
  type TestMessageSender,
} from "@/data/testConversations";
import { formatBubbleTime, formatTimeLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  accentColorOptions,
  getLocaleDisplayName,
  supportedLocales,
  usePreferences,
  type AccentColor,
  type AppIcon,
  type LocaleCode,
  type ResolvedTheme,
  type ThemeMode,
} from "@/settings/preferences";
import type { PageType } from "@/App";
import type { RecordItem, RecordReference, RecordSourceConversation } from "@/types/record";

type HomeProps = {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
};

type TabItem = {
  key: PageType;
};

const tabs: TabItem[] = [
  { key: "records" },
  { key: "insight" },
  { key: "mine" },
];

const aiConversationReadCountStorageKey = "arkme-demo.aiConversationReadCount";
const browserNotificationPromptedStorageKey = "arkme-demo.browserNotificationPrompted";
const createdSelfRecordsStorageKey = "arkme-demo.selfRecords";
const searchHistoryStorageKey = "arkme-demo.searchHistory";
const aiConversationTotalCount = aiConversationLogEntries.length;
const maxSearchHistoryCount = 4;

type QuickSearchType = "image" | "audio" | "link" | "file" | "longArticle" | "contact";

type ConversationReturnContext =
  | { mode: "drawer" }
  | {
      mode: "previous";
      recordDetail: RecordItem | null;
      recordSnapshot: RecordItem | null;
    };

type TestConversationSummary = {
  conversationId: string;
  conversationType: TestConversationType;
  title: string;
  subtitle: string;
  avatarLabel: string;
  color: string;
  identity?: TestIdentity;
  group?: TestGroup;
  memberIdentities: TestIdentity[];
  records: TestConversationRecord[];
  latestMessage: TestMessage;
  latestUnreadIdentityMessage: TestMessage | null;
  unreadCount: number;
};

type TestConversationRecord = RecordItem & {
  sender: TestMessageSender;
  identityId: string;
};

type HomeMessagePreview = {
  summary: TestConversationSummary;
  message: TestMessage;
  unreadCount: number;
};

const quickSearchTypes: QuickSearchType[] = [
  "image",
  "audio",
  "link",
  "file",
  "longArticle",
  "contact",
];

function getInitialAiConversationReadCount() {
  if (typeof window === "undefined") {
    return aiConversationTotalCount;
  }

  const storedValue = window.localStorage.getItem(aiConversationReadCountStorageKey);
  if (storedValue === null) {
    window.localStorage.setItem(
      aiConversationReadCountStorageKey,
      String(aiConversationTotalCount)
    );
    return aiConversationTotalCount;
  }

  const parsedValue = Number(storedValue);
  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(Math.max(0, parsedValue), aiConversationTotalCount);
}

function normalizeStoredSelfRecord(value: unknown): RecordItem | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<RecordItem>;
  if (
    typeof record.uid !== "string" ||
    typeof record.text_content !== "string" ||
    typeof record.send_at !== "number" ||
    typeof record.create_at !== "number" ||
    typeof record.update_at !== "number" ||
    !Number.isFinite(record.send_at) ||
    !Number.isFinite(record.create_at) ||
    !Number.isFinite(record.update_at)
  ) {
    return null;
  }

  const referencedRecord = normalizeStoredRecordReference(record.referencedRecord);

  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(referencedRecord ? { referencedRecord } : {}),
  };
}

function normalizeStoredRecordReference(value: unknown): RecordReference | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<RecordReference>;
  if (
    typeof record.uid !== "string" ||
    typeof record.text_content !== "string" ||
    typeof record.send_at !== "number" ||
    typeof record.create_at !== "number" ||
    typeof record.update_at !== "number" ||
    !Number.isFinite(record.send_at) ||
    !Number.isFinite(record.create_at) ||
    !Number.isFinite(record.update_at)
  ) {
    return null;
  }

  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(record.sourceConversation ? { sourceConversation: record.sourceConversation } : {}),
  };
}

function getInitialCreatedSelfRecords() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(createdSelfRecordsStorageKey);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map(normalizeStoredSelfRecord)
      .filter((record): record is RecordItem => Boolean(record));
  } catch {
    return [];
  }
}

function persistCreatedSelfRecords(records: RecordItem[]) {
  if (typeof window === "undefined") return;

  const storableRecords = records.map(
    ({ uid, text_content, send_at, create_at, update_at, referencedRecord }) => ({
      uid,
      text_content,
      send_at,
      create_at,
      update_at,
      ...(referencedRecord ? { referencedRecord } : {}),
    })
  );

  try {
    window.localStorage.setItem(
      createdSelfRecordsStorageKey,
      JSON.stringify(storableRecords)
    );
  } catch {
    // Storage can be unavailable in private modes; keep the in-memory record.
  }
}

function makeRecordReference(record: RecordItem): RecordReference {
  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(record.sourceConversation ? { sourceConversation: record.sourceConversation } : {}),
  };
}

function getInitialSearchHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(searchHistoryStorageKey);
    if (!storedValue) return [];
    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxSearchHistoryCount);
  } catch {
    return [];
  }
}

function persistSearchHistory(history: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(searchHistoryStorageKey, JSON.stringify(history));
  } catch {
    // Keep the visible in-memory history if storage is unavailable.
  }
}

function parseAiConversationTimestamp(value: string, fallbackTime: number) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return fallbackTime;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

function countRecordTextLength(value: string) {
  return Array.from(value.trim()).length;
}

function formatNumberForLocale(value: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function formatStatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function openExternalLink(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function shouldRequestBrowserNotificationPermission() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(browserNotificationPromptedStorageKey) === "true") {
    return false;
  }
  window.localStorage.setItem(browserNotificationPromptedStorageKey, "true");
  return true;
}

export default function Home({ currentPage, onNavigate }: HomeProps) {
  const { t } = usePreferences();
  const [showSearch, setShowSearch] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showAnswerGuide, setShowAnswerGuide] = React.useState(false);
  const [showAiConversation, setShowAiConversation] = React.useState(false);
  const [showSendToSelf, setShowSendToSelf] = React.useState(false);
  const [showTestConversation, setShowTestConversation] = React.useState(false);
  const [conversationReturnContext, setConversationReturnContext] =
    React.useState<ConversationReturnContext>({ mode: "drawer" });
  const [aiConversationTargetIndex, setAiConversationTargetIndex] =
    React.useState<number | null>(null);
  const [sendToSelfTargetUid, setSendToSelfTargetUid] = React.useState<string | null>(null);
  const [activeTestIdentityId, setActiveTestIdentityId] = React.useState<string | null>(null);
  const [testConversationTargetUid, setTestConversationTargetUid] = React.useState<string | null>(null);
  const [settingsView, setSettingsView] = React.useState<null | "settings" | "appearance" | "about">(
    null
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchHistory, setSearchHistory] = React.useState(getInitialSearchHistory);
  const [recordDetail, setRecordDetail] = React.useState<RecordItem | null>(null);
  const [recordSnapshot, setRecordSnapshot] = React.useState<RecordItem | null>(null);
  const [lastReadAiConversationCount, setLastReadAiConversationCount] =
    React.useState(getInitialAiConversationReadCount);
  const recordsDemoBaseTime = React.useMemo(() => Date.now(), []);
  const selfDemoBaseTime = React.useMemo(() => Date.now(), []);
  const [createdSelfRecords, setCreatedSelfRecords] = React.useState(
    getInitialCreatedSelfRecords
  );
  const [testIdentities, setTestIdentities] = React.useState(getInitialTestIdentities);
  const [testGroups, setTestGroups] = React.useState(getInitialTestGroups);
  const [testMessages, setTestMessages] = React.useState(getInitialTestMessages);
  const [testReadState, setTestReadState] =
    React.useState<TestReadState>(getInitialTestReadState);
  const initializedBrowserNotificationMessagesRef = React.useRef(false);
  const browserNotifiedMessageIdsRef = React.useRef<Set<string>>(new Set());

  const unreadAiConversationCount = Math.max(
    0,
    aiConversationTotalCount - lastReadAiConversationCount
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshTestConversations = () => {
      setTestIdentities(getInitialTestIdentities());
      setTestGroups(getInitialTestGroups());
      setTestMessages(getInitialTestMessages());
      setTestReadState(getInitialTestReadState());
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== testIdentitiesStorageKey &&
        event.key !== testGroupsStorageKey &&
        event.key !== testMessagesStorageKey &&
        event.key !== testReadStateStorageKey &&
        event.key !== testGroupSettingsStorageKey
      ) {
        return;
      }
      refreshTestConversations();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(testConversationStorageEvent, refreshTestConversations);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(testConversationStorageEvent, refreshTestConversations);
    };
  }, []);

  const updateTestGroup = React.useCallback(
    (groupId: string, update: (group: TestGroup) => TestGroup) => {
      setTestGroups((groups) => {
        const nextGroups = groups.map((group) =>
          group.id === groupId ? update(group) : group
        );
        persistTestGroups(nextGroups);
        return nextGroups;
      });
    },
    []
  );

  const markAiConversationAsRead = React.useCallback(() => {
    setLastReadAiConversationCount(aiConversationTotalCount);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        aiConversationReadCountStorageKey,
        String(aiConversationTotalCount)
      );
    }
  }, []);

  const makeSelfSource = React.useCallback(
    (recordUid: string): RecordSourceConversation => ({
      type: "self",
      label: t("sendToSelf.title"),
      actionLabel: t("sendToSelf.open"),
      iconLabel: t("sendToSelf.icon"),
      recordUid,
    }),
    [t]
  );

  const makeTestSource = React.useCallback(
    (
      label: string,
      iconLabel: string,
      conversationId: string,
      recordUid?: string
    ): RecordSourceConversation => ({
      type: "test",
      label,
      actionLabel: t("records.openSource"),
      iconLabel,
      conversationId,
      recordUid,
    }),
    [t]
  );

  const demoRecords = React.useMemo<RecordItem[]>(
    () => [
      {
        uid: "demo-1",
        text_content: t("records.demo1"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
        create_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
        update_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
      },
      {
        uid: "demo-2",
        text_content: t("records.demo2"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 45,
        create_at: recordsDemoBaseTime - 1000 * 60 * 45,
        update_at: recordsDemoBaseTime - 1000 * 60 * 45,
      },
      {
        uid: "demo-3",
        text_content: t("records.demo3"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 12,
        create_at: recordsDemoBaseTime - 1000 * 60 * 12,
        update_at: recordsDemoBaseTime - 1000 * 60 * 12,
      },
    ],
    [recordsDemoBaseTime, t]
  );

  const aiConversationRecords = React.useMemo<RecordItem[]>(
    () =>
      aiConversationLogEntries.map((entry, index) => {
        const timestamp = parseAiConversationTimestamp(
          entry.timestamp,
          recordsDemoBaseTime + index
        );
        return {
          uid: `ai-conversation-user-${index}`,
          text_content: entry.userInput,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
          sourceConversation: {
            type: "ai",
            label: t("ai.title"),
            actionLabel: t("records.openSource"),
            iconLabel: "AI",
            entryIndex: index,
          },
        };
      }),
    [recordsDemoBaseTime, t]
  );

  const selfDemoRecords = React.useMemo<RecordItem[]>(
    () => [
      {
        uid: "self-demo-1",
        text_content: t("sendToSelf.demo1"),
        send_at: selfDemoBaseTime - 1000 * 60 * 28,
        create_at: selfDemoBaseTime - 1000 * 60 * 28,
        update_at: selfDemoBaseTime - 1000 * 60 * 28,
        sourceConversation: makeSelfSource("self-demo-1"),
      },
      {
        uid: "self-demo-2",
        text_content: t("sendToSelf.demo2"),
        send_at: selfDemoBaseTime - 1000 * 60 * 7,
        create_at: selfDemoBaseTime - 1000 * 60 * 7,
        update_at: selfDemoBaseTime - 1000 * 60 * 7,
        sourceConversation: makeSelfSource("self-demo-2"),
      },
    ],
    [makeSelfSource, selfDemoBaseTime, t]
  );

  const selfRecords = React.useMemo(
    () =>
      [...selfDemoRecords, ...createdSelfRecords].map((record) => ({
        ...record,
        sourceConversation: makeSelfSource(record.uid),
      })),
    [createdSelfRecords, makeSelfSource, selfDemoRecords]
  );

  const testConversationRecords = React.useMemo<TestConversationRecord[]>(
    () =>
      testMessages
        .map<TestConversationRecord | null>((message) => {
          const identity = testIdentities.find((item) => item.id === message.identityId);
          const group = testGroups.find((item) => item.id === message.conversationId);
          const isGroup = message.conversationType === "group";
          const privateIdentity =
            !isGroup
              ? testIdentities.find(
                  (item) => getPrivateConversationId(item.id) === message.conversationId
                )
              : null;
          const sourceLabel = isGroup ? group?.name : privateIdentity?.name;
          const iconLabel = isGroup ? group?.avatarLabel : privateIdentity?.avatarLabel;
          if (!sourceLabel || !iconLabel) return null;
          if (message.sender === "identity" && !identity) return null;

          const uid = `test-${message.id}`;
          return {
            uid,
            text_content: message.text,
            send_at: message.sentAt,
            create_at: message.sentAt,
            update_at: message.sentAt,
            sourceConversation: makeTestSource(
              sourceLabel,
              iconLabel,
              message.conversationId,
              uid
            ),
            sender: message.sender,
            identityId: message.identityId,
          };
        })
        .filter((record): record is TestConversationRecord => Boolean(record)),
    [makeTestSource, testGroups, testIdentities, testMessages]
  );

  const testDemoReplyRecords = React.useMemo<RecordItem[]>(
    () => testConversationRecords.filter((record) => record.sender === "demo"),
    [testConversationRecords]
  );

  const testConversationSummaries = React.useMemo<TestConversationSummary[]>(
    () => {
      const privateSummaries = testIdentities
        .map<TestConversationSummary | null>((identity) => {
          const conversationId = getPrivateConversationId(identity.id);
          const records = testConversationRecords.filter(
            (record) => record.sourceConversation?.conversationId === conversationId
          );
          const messages = testMessages.filter(
            (message) => message.conversationId === conversationId
          );
          const unreadIdentityMessages = messages.filter(
            (message) =>
              message.sender === "identity" &&
              message.sentAt > (testReadState[conversationId] ?? 0)
          );
          const latestMessage = messages.reduce<TestMessage | null>(
            (latest, message) => {
              if (!latest || message.sentAt > latest.sentAt) return message;
              return latest;
            },
            null
          );
          const latestUnreadIdentityMessage =
            unreadIdentityMessages.reduce<TestMessage | null>(
              (latest, message) => {
                if (!latest || message.sentAt > latest.sentAt) return message;
                return latest;
              },
              null
            );

          if (!latestMessage) return null;

          return {
            conversationId,
            conversationType: "private",
            title: identity.name,
            subtitle: identity.note || "测试私聊",
            avatarLabel: identity.avatarLabel,
            color: identity.color,
            identity,
            memberIdentities: [identity],
            records,
            latestMessage,
            latestUnreadIdentityMessage,
            unreadCount: unreadIdentityMessages.length,
          };
        });
      const groupSummaries = testGroups
        .map<TestConversationSummary | null>((group) => {
          const memberIdentities = group.memberIdentityIds
            .map((identityId) => testIdentities.find((identity) => identity.id === identityId))
            .filter((identity): identity is TestIdentity => Boolean(identity));
          const records = testConversationRecords.filter(
            (record) => record.sourceConversation?.conversationId === group.id
          );
          const messages = testMessages.filter(
            (message) => message.conversationId === group.id
          );
          const unreadIdentityMessages = messages.filter(
            (message) =>
              message.sender === "identity" &&
              message.sentAt > (testReadState[group.id] ?? 0)
          );
          const latestMessage = messages.reduce<TestMessage | null>(
            (latest, message) => {
              if (!latest || message.sentAt > latest.sentAt) return message;
              return latest;
            },
            null
          );
          const latestUnreadIdentityMessage =
            unreadIdentityMessages.reduce<TestMessage | null>(
              (latest, message) => {
                if (!latest || message.sentAt > latest.sentAt) return message;
                return latest;
              },
              null
            );

          if (!latestMessage) {
            return {
              conversationId: group.id,
              conversationType: "group",
              title: group.name,
              subtitle: group.note || `${memberIdentities.length} 位成员`,
              avatarLabel: group.avatarLabel,
              color: group.color,
              group,
              memberIdentities,
              records,
              latestMessage: {
                id: `empty-${group.id}`,
                conversationId: group.id,
                conversationType: "group",
                identityId: demoSenderIdentityId,
                text: "群聊能力已开启，可从后台发送群消息测试。",
                sentAt: group.createdAt,
                sender: "demo",
              },
              latestUnreadIdentityMessage: null,
              unreadCount: 0,
            };
          }

          return {
            conversationId: group.id,
            conversationType: "group",
            title: group.name,
            subtitle: group.note || `${memberIdentities.length} 位成员`,
            avatarLabel: group.avatarLabel,
            color: group.color,
            group,
            memberIdentities,
            records,
            latestMessage,
            latestUnreadIdentityMessage,
            unreadCount: unreadIdentityMessages.length,
          };
        });

      return [...privateSummaries, ...groupSummaries]
        .filter((summary): summary is TestConversationSummary => Boolean(summary))
        .sort((a, b) => b.latestMessage.sentAt - a.latestMessage.sentAt);
    },
    [testConversationRecords, testGroups, testIdentities, testMessages, testReadState]
  );

  const unreadTestConversationCount = testConversationSummaries.reduce(
    (total, summary) => total + summary.unreadCount,
    0
  );
  const homeMessagePreview = React.useMemo<HomeMessagePreview | null>(
    () =>
      testConversationSummaries.reduce<HomeMessagePreview | null>(
        (latestPreview, summary) => {
          if (!summary.latestUnreadIdentityMessage) return latestPreview;
          if (
            latestPreview &&
            latestPreview.message.sentAt >= summary.latestUnreadIdentityMessage.sentAt
          ) {
            return latestPreview;
          }
          return {
            summary,
            message: summary.latestUnreadIdentityMessage,
            unreadCount: summary.unreadCount,
          };
        },
        null
      ),
    [testConversationSummaries]
  );

  const activeTestConversationSummary =
    testConversationSummaries.find(
      (summary) => summary.conversationId === activeTestIdentityId
    ) ?? null;

  const mineStatisticRecords = React.useMemo(
    () => [
      ...demoRecords,
      ...aiConversationRecords,
      ...selfRecords,
      ...testDemoReplyRecords,
    ],
    [aiConversationRecords, demoRecords, selfRecords, testDemoReplyRecords]
  );
  const recordDetailExtensionRecords = React.useMemo(
    () =>
      recordDetail
        ? mineStatisticRecords.filter(
            (record) => record.referencedRecord?.uid === recordDetail.uid
          )
        : [],
    [mineStatisticRecords, recordDetail]
  );

  const commitSearchKeyword = React.useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;

    setSearchHistory((prev) => {
      const nextHistory = [
        normalizedKeyword,
        ...prev.filter((value) => value !== normalizedKeyword),
      ].slice(0, maxSearchHistoryCount);
      persistSearchHistory(nextHistory);
      return nextHistory;
    });
  }, []);

  const createSelfRecord = React.useCallback((content: string) => {
    const timestamp = Date.now();
    setCreatedSelfRecords((prev) => {
      const nextRecords = [
        ...prev,
        {
          uid: `self-${timestamp}`,
          text_content: content,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
        },
      ];
      persistCreatedSelfRecords(nextRecords);
      return nextRecords;
    });
  }, []);

  const createRecordExtension = React.useCallback((parentRecord: RecordItem, content: string) => {
    const timestamp = Date.now();
    setCreatedSelfRecords((prev) => {
      const nextRecords = [
        ...prev,
        {
          uid: `self-extension-${timestamp}`,
          text_content: content,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
          referencedRecord: makeRecordReference(parentRecord),
        },
      ];
      persistCreatedSelfRecords(nextRecords);
      return nextRecords;
    });
  }, []);

  const backToDrawer = () => {
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setShowMenu(true);
    setConversationReturnContext({ mode: "drawer" });
  };

  const backToPreviousConversationOrigin = () => {
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setShowMenu(false);

    if (conversationReturnContext.mode === "previous") {
      setRecordDetail(conversationReturnContext.recordDetail);
      setRecordSnapshot(conversationReturnContext.recordSnapshot);
    }

    setConversationReturnContext({ mode: "drawer" });
  };

  const handleConversationBack = () => {
    if (conversationReturnContext.mode === "drawer") {
      backToDrawer();
      return;
    }

    backToPreviousConversationOrigin();
  };

  const openAiConversation = React.useCallback(
    (
      targetIndex: number | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      markAiConversationAsRead();
      setConversationReturnContext(returnContext);
      setAiConversationTargetIndex(targetIndex);
      setShowMenu(false);
      setShowSendToSelf(false);
      setShowTestConversation(false);
      setShowAiConversation(true);
    },
    [markAiConversationAsRead]
  );

  const openSendToSelf = React.useCallback(
    (
      targetUid: string | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      setConversationReturnContext(returnContext);
      setShowMenu(false);
      setSendToSelfTargetUid(targetUid);
      setShowAiConversation(false);
      setShowTestConversation(false);
      setShowSendToSelf(true);
    },
    []
  );

  const markTestConversationAsRead = React.useCallback(
    (conversationId: string) => {
      const latestMessageTime = testMessages.reduce((latest, message) => {
        if (message.conversationId !== conversationId) return latest;
        return Math.max(latest, message.sentAt);
      }, 0);

      setTestReadState((prev) => {
        const nextReadState = {
          ...prev,
          [conversationId]: latestMessageTime || Date.now(),
        };
        persistTestReadState(nextReadState);
        return nextReadState;
      });
    },
    [testMessages]
  );

  const openTestConversation = React.useCallback(
    (
      conversationId: string,
      targetUid: string | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      markTestConversationAsRead(conversationId);
      setConversationReturnContext(returnContext);
      setActiveTestIdentityId(conversationId);
      setTestConversationTargetUid(targetUid);
      setShowMenu(false);
      setShowAiConversation(false);
      setShowSendToSelf(false);
      setShowTestConversation(true);
    },
    [markTestConversationAsRead]
  );

  const returnToHomeFromNotification = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.focus();
    }

    setShowSearch(false);
    setShowMenu(false);
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setConversationReturnContext({ mode: "drawer" });
    setAiConversationTargetIndex(null);
    setSendToSelfTargetUid(null);
    setActiveTestIdentityId(null);
    setTestConversationTargetUid(null);
    setSettingsView(null);
    setRecordDetail(null);
    setRecordSnapshot(null);
    onNavigate("records");
  }, [onNavigate]);

  const showBrowserMessageNotification = React.useCallback(
    (summary: TestConversationSummary, message: TestMessage) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;

      const showNotification = () => {
        const notification = new Notification(summary.title, {
          body: message.text,
          icon: "/images/logo-jiwo-green.svg",
          tag: `arkme-demo-message-${message.id}`,
        });
        notification.onclick = () => {
          notification.close();
          returnToHomeFromNotification();
        };
      };

      if (Notification.permission === "granted") {
        showNotification();
        return;
      }

      if (
        Notification.permission === "default" &&
        shouldRequestBrowserNotificationPermission()
      ) {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            showNotification();
          }
        });
      }
    },
    [returnToHomeFromNotification]
  );

  React.useEffect(() => {
    if (!showTestConversation || !activeTestIdentityId) return;
    markTestConversationAsRead(activeTestIdentityId);
  }, [
    activeTestIdentityId,
    markTestConversationAsRead,
    showTestConversation,
    testMessages.length,
  ]);

  React.useEffect(() => {
    const identityMessages = testMessages.filter(
      (message) => message.sender === "identity"
    );

    if (!initializedBrowserNotificationMessagesRef.current) {
      identityMessages.forEach((message) => {
        browserNotifiedMessageIdsRef.current.add(message.id);
      });
      initializedBrowserNotificationMessagesRef.current = true;
      return;
    }

    const newIdentityMessages = identityMessages.filter(
      (message) => !browserNotifiedMessageIdsRef.current.has(message.id)
    );
    if (newIdentityMessages.length === 0) return;

    newIdentityMessages.forEach((message) => {
      browserNotifiedMessageIdsRef.current.add(message.id);
    });

    const latestMessage = newIdentityMessages.reduce((latest, message) =>
      message.sentAt > latest.sentAt ? message : latest
    );
    if (
      showTestConversation &&
      activeTestIdentityId === latestMessage.conversationId
    ) {
      return;
    }

    const summary = testConversationSummaries.find(
      (item) => item.conversationId === latestMessage.conversationId
    );
    if (!summary) return;

    showBrowserMessageNotification(summary, latestMessage);
  }, [
    activeTestIdentityId,
    showBrowserMessageNotification,
    showTestConversation,
    testConversationSummaries,
    testMessages,
  ]);

  const openHomeMessagePreview = React.useCallback(() => {
    if (!homeMessagePreview) return;

    const returnContext: ConversationReturnContext = {
      mode: "previous",
      recordDetail: null,
      recordSnapshot: null,
    };
    openTestConversation(
      homeMessagePreview.summary.conversationId,
      `test-${homeMessagePreview.message.id}`,
      returnContext
    );
  }, [homeMessagePreview, openTestConversation]);

  const createTestReply = React.useCallback((summary: TestConversationSummary, content: string) => {
    const reply = createTestReplyMessage(
      summary.conversationId,
      content,
      summary.conversationType
    );
    setTestMessages((prev) => {
      const nextMessages = [...prev, reply];
      persistTestMessages(nextMessages);
      return nextMessages;
    });
    markTestConversationAsRead(summary.conversationId);
    setTestConversationTargetUid(`test-${reply.id}`);
  }, [markTestConversationAsRead]);

  const openSourceConversation = React.useCallback(
    (source: RecordSourceConversation) => {
      const returnContext: ConversationReturnContext = {
        mode: "previous",
        recordDetail,
        recordSnapshot,
      };

      setRecordDetail(null);
      setRecordSnapshot(null);

      if (source.type === "ai" && typeof source.entryIndex === "number") {
        openAiConversation(source.entryIndex, returnContext);
        return;
      }

      if (source.type === "test" && source.conversationId) {
        openTestConversation(source.conversationId, source.recordUid ?? null, returnContext);
        return;
      }

      openSendToSelf(source.recordUid ?? null, returnContext);
    },
    [
      openAiConversation,
      openSendToSelf,
      openTestConversation,
      recordDetail,
      recordSnapshot,
    ]
  );

  const renderMainContent = () => {
    if (recordDetail) {
      return (
        <RecordFullDetailScreen
          record={recordDetail}
          extensionRecords={recordDetailExtensionRecords}
          onBack={() => setRecordDetail(null)}
          onCreateExtension={createRecordExtension}
          onOpenSource={openSourceConversation}
        />
      );
    }

    if (settingsView === "appearance") {
      return <AppearanceStyleScreen onBack={() => setSettingsView("settings")} />;
    }

    if (settingsView === "about") {
      return <AboutScreen onBack={() => setSettingsView(null)} />;
    }

    if (settingsView === "settings") {
      return (
        <SettingsScreen
          onBack={() => setSettingsView(null)}
          onOpenAppearance={() => setSettingsView("appearance")}
        />
      );
    }

    if (showAiConversation) {
      return (
        <AiToolConversationChat
          onBack={handleConversationBack}
          targetIndex={aiConversationTargetIndex}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
        />
      );
    }

    if (showSendToSelf) {
      return (
        <SendToSelfConversationChat
          records={selfRecords}
          targetUid={sendToSelfTargetUid}
          onBack={handleConversationBack}
          onCreateRecord={createSelfRecord}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
        />
      );
    }

    if (showTestConversation && activeTestConversationSummary) {
      return (
        <TestIdentityConversationChat
          summary={activeTestConversationSummary}
          targetUid={testConversationTargetUid}
          onBack={handleConversationBack}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
          onCreateReply={(content) => createTestReply(activeTestConversationSummary, content)}
          allIdentities={testIdentities}
          onUpdateGroup={updateTestGroup}
        />
      );
    }

    if (showAnswerGuide) {
      return <AnswerGuideChat onBack={backToDrawer} />;
    }

    if (showSearch) {
      return (
        <SearchScreen
          searchQuery={searchQuery}
          searchHistory={searchHistory}
          records={mineStatisticRecords}
          onChangeSearchQuery={setSearchQuery}
          onCommitSearch={commitSearchKeyword}
          onClose={() => {
            commitSearchKeyword(searchQuery);
            setShowSearch(false);
          }}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
          onOpenSourceConversation={openSourceConversation}
        />
      );
    }

    if (currentPage === "mine") {
      return (
        <MinePreview
          records={mineStatisticRecords}
          onOpenSettings={() => setSettingsView("settings")}
          onOpenAbout={() => setSettingsView("about")}
        />
      );
    }

    if (currentPage === "insight") {
      return <InsightPreview />;
    }

    return (
      <div className="flex h-full flex-col bg-bg">
        <MobileHeader
          onMenuClick={() => setShowMenu(true)}
          onSearchClick={() => setShowSearch(true)}
          unreadCount={unreadAiConversationCount + unreadTestConversationCount}
        />
        {homeMessagePreview && (
          <div className="shrink-0 bg-bg px-4 pb-2">
            <HomeNewMessagePreview
              preview={homeMessagePreview}
              onOpen={openHomeMessagePreview}
            />
          </div>
        )}
        <Records
          compactHeader
          demoRecords={[...demoRecords, ...testDemoReplyRecords]}
          aiConversationEntries={aiConversationLogEntries}
          selfRecords={selfRecords}
          onCreateSelfRecord={createSelfRecord}
          onOpenSourceConversation={openSourceConversation}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
        />
      </div>
    );
  };

  return (
    <AppShell
      mainPane={
        <div className="relative flex min-h-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-hidden">{renderMainContent()}</main>
          {!recordDetail && !showSearch && !showAnswerGuide && !showAiConversation && !showSendToSelf && !showTestConversation && !settingsView && (
            <MobileBottomNavigation currentPage={currentPage} onNavigate={onNavigate} />
          )}
          <MobileSideDrawer
            open={showMenu}
            onClose={() => setShowMenu(false)}
            onOpenAnswerGuide={() => {
              setShowMenu(false);
              setShowAnswerGuide(true);
            }}
            onOpenAiConversation={() => {
              openAiConversation(null);
            }}
            onOpenSendToSelf={() => {
              openSendToSelf(null);
            }}
            onOpenTestConversation={(conversationId) => {
              openTestConversation(conversationId);
            }}
            unreadAiConversationCount={unreadAiConversationCount}
            selfRecords={selfRecords}
            testConversations={testConversationSummaries}
          />
          <RecordDetailSheet
            record={recordSnapshot}
            onClose={() => setRecordSnapshot(null)}
            onOpenSource={openSourceConversation}
          />
        </div>
      }
    />
  );
}

function SearchScreen({
  searchQuery,
  searchHistory,
  records,
  onChangeSearchQuery,
  onCommitSearch,
  onClose,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
  onOpenSourceConversation,
}: {
  searchQuery: string;
  searchHistory: string[];
  records: RecordItem[];
  onChangeSearchQuery: (value: string) => void;
  onCommitSearch: (value: string) => void;
  onClose: () => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
  onOpenSourceConversation: (source: RecordSourceConversation) => void;
}) {
  const { resolvedTheme, t } = usePreferences();
  const [activeTab, setActiveTab] = React.useState<"records" | "topics">("records");
  const [activeQuickType, setActiveQuickType] = React.useState<QuickSearchType | null>(null);
  const keyword = searchQuery.trim().toLowerCase();
  const hasSearchCondition = keyword.length > 0 || activeQuickType !== null;
  const searchTags = React.useMemo(
    () =>
      t("search.defaultTags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [t]
  );
  const emptyImageSrc =
    resolvedTheme === "dark"
      ? "/images/image_search_empty.png"
      : "/images/image_search_empty_light.png";

  const filteredRecords = React.useMemo(
    () =>
      records.filter((record) => {
        const content = record.text_content.toLowerCase();
        const matchesKeyword = !keyword || content.includes(keyword);
        const matchesQuickType =
          activeQuickType === null || recordMatchesQuickType(record, activeQuickType);
        return matchesKeyword && matchesQuickType;
      }),
    [activeQuickType, keyword, records]
  );

  const topicGroups = React.useMemo(
    () => buildSearchTopicGroups(records, t).filter((topic) => {
      if (!keyword) return topic.count > 0;
      return (
        topic.title.toLowerCase().includes(keyword) ||
        topic.description.toLowerCase().includes(keyword)
      );
    }),
    [keyword, records, t]
  );

  const handleKeywordSelect = (value: string) => {
    setActiveQuickType(null);
    onChangeSearchQuery(value);
    onCommitSearch(value);
  };

  const handleQuickSearch = (type: QuickSearchType) => {
    setActiveQuickType(type);
    setActiveTab("records");
    onChangeSearchQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-[50px] shrink-0 items-center bg-bg pl-2.5">
        <div className="relative min-w-0 flex-1">
          <input
            data-mobile-demo-input
            value={searchQuery}
            onChange={(event) => {
              onChangeSearchQuery(event.target.value);
              setActiveQuickType(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitSearch(searchQuery);
                event.currentTarget.blur();
              }
            }}
            onBlur={() => onCommitSearch(searchQuery)}
            autoFocus
            placeholder={t("search.placeholder")}
            className="h-10 w-full rounded-[12px] bg-surface px-2.5 pr-12 text-[16px] leading-10 text-text outline-none transition placeholder:text-input-placeholder focus:bg-input-bg-focus"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-fill-2 text-text-tertiary transition active:scale-[0.94]"
              onClick={() => {
                onChangeSearchQuery("");
                setActiveQuickType(null);
              }}
              aria-label={t("search.clear")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 px-[19px] py-2 text-[16px] leading-6 text-text transition active:scale-[0.96]"
          onClick={onClose}
        >
          {t("search.cancel")}
        </button>
      </header>

      {!hasSearchCondition ? (
        <SearchLanding
          searchHistory={searchHistory}
          searchTags={searchTags}
          onKeywordSelect={handleKeywordSelect}
          onQuickSearch={handleQuickSearch}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <SearchTabs
            activeTab={activeTab}
            activeQuickType={activeQuickType}
            onChangeTab={setActiveTab}
            onClearQuickType={() => setActiveQuickType(null)}
          />
          {activeTab === "records" ? (
            filteredRecords.length > 0 ? (
              <ChatList
                records={filteredRecords}
                hasMore={false}
                loading={false}
                onLoadMore={() => undefined}
                onOpenSourceConversation={onOpenSourceConversation}
                onOpenRecordDetail={onOpenRecordDetail}
                onOpenRecordSnapshot={onOpenRecordSnapshot}
              />
            ) : (
              <SearchEmptyState
                imageSrc={emptyImageSrc}
                keyword={searchQuery || quickSearchLabel(activeQuickType, t)}
              />
            )
          ) : topicGroups.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {topicGroups.map((topic) => (
                  <button
                    key={topic.key}
                    type="button"
                    className="flex min-h-[62px] w-full items-center rounded-[12px] bg-surface px-3 text-left transition active:scale-[0.99]"
                    onClick={() => handleKeywordSelect(topic.searchKeyword)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">
                      {topic.icon}
                    </div>
                    <div className="ml-3 min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium leading-5 text-text">
                        {topic.title}
                      </p>
                      <p className="mt-1 truncate text-xs leading-4 text-text-tertiary">
                        {formatTemplate(t("search.topicCount"), {
                          count: String(topic.count),
                        })}
                      </p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-disabled" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <SearchEmptyState imageSrc={emptyImageSrc} keyword={searchQuery} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchLanding({
  searchHistory,
  searchTags,
  onKeywordSelect,
  onQuickSearch,
}: {
  searchHistory: string[];
  searchTags: string[];
  onKeywordSelect: (value: string) => void;
  onQuickSearch: (type: QuickSearchType) => void;
}) {
  const { t } = usePreferences();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-[22px]">
      {searchHistory.length > 0 && (
        <section className="pb-[22px]">
          <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
            {t("search.recent")}
          </p>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {searchHistory.map((keyword) => (
              <SearchChip
                key={keyword}
                label={keyword}
                textClassName="text-text"
                onClick={() => onKeywordSelect(keyword)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
          {t("search.quickSearch")}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {quickSearchTypes.map((type) => (
            <SearchChip
              key={type}
              label={quickSearchLabel(type, t)}
              textClassName="text-link"
              onClick={() => onQuickSearch(type)}
            />
          ))}
        </div>
      </section>

      {searchTags.length > 0 && (
        <section className="mt-[30px]">
          <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
            {t("search.tags")}
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
            {searchTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="px-2 py-[3px] text-[14px] leading-5 text-link transition active:scale-[0.97]"
                onClick={() => onKeywordSelect(tag.replace(/^#/, ""))}
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SearchTabs({
  activeTab,
  activeQuickType,
  onChangeTab,
  onClearQuickType,
}: {
  activeTab: "records" | "topics";
  activeQuickType: QuickSearchType | null;
  onChangeTab: (tab: "records" | "topics") => void;
  onClearQuickType: () => void;
}) {
  const { t } = usePreferences();
  const tabs: Array<{ key: "records" | "topics"; label: string }> = [
    { key: "records", label: t("search.tabRecords") },
    { key: "topics", label: t("search.tabTopics") },
  ];

  return (
    <div className="flex h-[30px] shrink-0 items-center bg-gray-8">
      <div className="ml-[18px] flex min-w-0 flex-1 items-center gap-[30px]">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={cn(
                "relative h-[30px] px-0 pb-1 text-[14px] leading-[24px] transition",
                selected ? "font-semibold text-primary" : "font-normal text-text"
              )}
              onClick={() => onChangeTab(tab.key)}
            >
              {tab.label}
              {selected && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
      {activeQuickType && (
        <button
          type="button"
          className="mr-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-[12px] leading-5 text-primary transition active:scale-[0.96]"
          onClick={onClearQuickType}
        >
          {quickSearchLabel(activeQuickType, t)}
        </button>
      )}
      <button
        type="button"
        className="mr-[18px] flex h-[21px] w-[23px] items-center justify-center text-text-muted transition active:scale-[0.96]"
        aria-label={t("search.filter")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function SearchChip({
  label,
  textClassName,
  onClick,
}: {
  label: string;
  textClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded-full border border-[var(--record-topic-border)] px-3 py-[3px] text-[14px] leading-5 transition active:scale-[0.97]",
        textClassName
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SearchEmptyState({ imageSrc, keyword }: { imageSrc: string; keyword: string }) {
  const { t } = usePreferences();
  const label = keyword.trim() || t("search.label");

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center px-4 pt-20 text-center">
      <div>
        <img src={imageSrc} alt="" className="mx-auto w-[140px]" aria-hidden="true" />
        <p className="mt-2.5 whitespace-pre-line text-[14px] leading-5 text-text-tertiary">
          {formatTemplate(t("search.noResult"), { keyword: label })}
        </p>
      </div>
    </div>
  );
}

function quickSearchLabel(type: QuickSearchType | null, t: (key: string) => string) {
  if (!type) return "";
  return t(`search.quick.${type}`);
}

function recordMatchesQuickType(record: RecordItem, type: QuickSearchType) {
  const content = record.text_content.toLowerCase();
  const sourceLabel = record.sourceConversation?.label.toLowerCase() ?? "";
  const combined = `${content} ${sourceLabel}`;

  switch (type) {
    case "image":
      return /图片|照片|视频|image|photo|video/.test(combined);
    case "audio":
      return /语音|音频|录音|voice|audio|recording/.test(combined);
    case "link":
      return /链接|http|link|url/.test(combined);
    case "file":
      return /文件|文档|file|document/.test(combined);
    case "longArticle":
      return Array.from(record.text_content).length >= 80;
    case "contact":
      return /联系人|同事|候选人|用户|ai|contact|user/.test(combined);
    default:
      return true;
  }
}

function buildSearchTopicGroups(records: RecordItem[], t: (key: string) => string) {
  const quickNotes = records.filter((record) => !record.sourceConversation);
  const selfNotes = records.filter((record) => record.sourceConversation?.type === "self");
  const aiNotes = records.filter((record) => record.sourceConversation?.type === "ai");

  return [
    {
      key: "quick",
      icon: t("search.topicQuickIcon"),
      title: t("records.title"),
      description: t("recordDetail.quickNoteSource"),
      count: quickNotes.length,
      searchKeyword: t("records.title"),
    },
    {
      key: "self",
      icon: t("sendToSelf.icon"),
      title: t("sendToSelf.title"),
      description: t("sendToSelf.privateTag"),
      count: selfNotes.length,
      searchKeyword: t("sendToSelf.title"),
    },
    {
      key: "ai",
      icon: "AI",
      title: t("ai.title"),
      description: t("ai.rounds"),
      count: aiNotes.length,
      searchKeyword: "AI",
    },
  ];
}

function MobileHeader({
  onMenuClick,
  onSearchClick,
  unreadCount,
}: {
  onMenuClick: () => void;
  onSearchClick: () => void;
  unreadCount: number;
}) {
  const { appIcon, resolvedTheme, t } = usePreferences();
  const logoSrc = getJiwoLogoSrc(appIcon, resolvedTheme);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-bg px-4">
      <button
        type="button"
        className="flex h-9 items-center gap-[2px] text-text transition active:scale-[0.96]"
        onClick={onMenuClick}
        aria-label={t("common.openMenu")}
      >
        <span className="flex h-9 w-5 items-center justify-center">
          <svg
            className="h-6 w-5"
            viewBox="0 0 20 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M5 6.25C5 5.55964 5.55964 5 6.25 5H12.75C13.4404 5 14 5.55964 14 6.25C14 6.94036 13.4404 7.5 12.75 7.5H6.25C5.55964 7.5 5 6.94036 5 6.25ZM5 12.25C5 11.5596 5.55964 11 6.25 11H15.75C16.4404 11 17 11.5596 17 12.25C17 12.9404 16.4404 13.5 15.75 13.5H6.25C5.55964 13.5 5 12.9404 5 12.25ZM6.25 17C5.55964 17 5 17.5596 5 18.25C5 18.9404 5.55964 19.5 6.25 19.5H9.75C10.4404 19.5 11 18.9404 11 18.25C11 17.5596 10.4404 17 9.75 17H6.25Z"
              fill="currentColor"
            />
          </svg>
        </span>
        {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        <img src={logoSrc} alt="" className="h-8 w-8" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onSearchClick}
          aria-label={t("search.label")}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 25 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.0969 19.0453C14.9754 19.0453 18.1196 15.9012 18.1196 12.0227C18.1196 8.14416 14.9754 5 11.0969 5C7.21838 5 4.07422 8.14416 4.07422 12.0227C4.07422 15.9012 7.21838 19.0453 11.0969 19.0453ZM11.0969 21.0453C16.08 21.0453 20.1196 17.0058 20.1196 12.0227C20.1196 7.03959 16.08 3 11.0969 3C6.11381 3 2.07422 7.03959 2.07422 12.0227C2.07422 17.0058 6.11381 21.0453 11.0969 21.0453Z"
              fill="currentColor"
            />
            <path
              d="M16.8203 17.8184L19.7295 20.7282"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

function HomeNewMessagePreview({
  preview,
  onOpen,
}: {
  preview: HomeMessagePreview;
  onOpen: () => void;
}) {
  const { t } = usePreferences();
  const unreadLabel = formatUnreadCount(preview.unreadCount);

  return (
    <button
      type="button"
      className="flex w-full items-center rounded-[16px] border border-border-light bg-surface px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:bg-[var(--record-card-hover-bg)] active:scale-[0.99] dark:shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
      onClick={onOpen}
      aria-label={`${t("homeMessagePreview.label")}，${preview.summary.title}`}
    >
      <AvatarUnreadWrap unreadCount={preview.unreadCount}>
        <TestConversationAvatar summary={preview.summary} className="h-[34px] w-[34px]" />
      </AvatarUnreadWrap>
      <div className="ml-3 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[14px] font-medium leading-5 text-text">
              {preview.summary.title}
            </p>
            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-[2px] text-[10px] font-medium leading-3 text-primary">
              {t("homeMessagePreview.label")}
            </span>
          </div>
          <span className="shrink-0 text-[11px] leading-4 text-text-tertiary">
            {formatBubbleTime(preview.message.sentAt)}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs leading-4 text-text-muted">
            {preview.message.text}
          </p>
          <span className="shrink-0 text-[11px] leading-4 text-primary">
            {unreadLabel}
            {t("common.unreadCount")}
          </span>
        </div>
      </div>
      <svg
        className="ml-2 h-4 w-4 shrink-0 text-text-tertiary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function getLatestRecord(records: RecordItem[]) {
  return records.reduce<RecordItem | null>((latest, record) => {
    if (!latest || record.send_at > latest.send_at) return record;
    return latest;
  }, null);
}

function MobileSideDrawer({
  open,
  onClose,
  onOpenAnswerGuide,
  onOpenAiConversation,
  onOpenSendToSelf,
  onOpenTestConversation,
  unreadAiConversationCount,
  selfRecords,
  testConversations,
}: {
  open: boolean;
  onClose: () => void;
  onOpenAnswerGuide: () => void;
  onOpenAiConversation: () => void;
  onOpenSendToSelf: () => void;
  onOpenTestConversation: (conversationId: string) => void;
  unreadAiConversationCount: number;
  selfRecords: RecordItem[];
  testConversations: TestConversationSummary[];
}) {
  const { t } = usePreferences();
  const latestSelfRecord = React.useMemo(
    () => getLatestRecord(selfRecords),
    [selfRecords]
  );
  const latestAiEntry = aiConversationLogEntries.at(-1);
  const latestAiTime = latestAiEntry
    ? parseAiConversationTimestamp(latestAiEntry.timestamp, 0)
    : 0;
  const conversationItems = React.useMemo(
    () =>
      [
        {
          key: "self",
          latestAt: latestSelfRecord?.send_at ?? 0,
          node: (
            <SendToSelfDrawerItem
              records={selfRecords}
              latestRecord={latestSelfRecord}
              onClick={onOpenSendToSelf}
            />
          ),
        },
        {
          key: "ai",
          latestAt: latestAiTime,
          node: (
            <AiToolConversationItem
              onClick={onOpenAiConversation}
              unreadCount={unreadAiConversationCount}
              latestAt={latestAiTime}
            />
          ),
        },
        ...testConversations.map((summary) => ({
          key: `test-${summary.conversationId}`,
          latestAt: summary.latestMessage.sentAt,
          node: (
            <TestConversationDrawerItem
              summary={summary}
              onClick={() => onOpenTestConversation(summary.conversationId)}
            />
          ),
        })),
      ].sort((a, b) => b.latestAt - a.latestAt),
    [
      latestAiTime,
      latestSelfRecord,
      onOpenAiConversation,
      onOpenSendToSelf,
      onOpenTestConversation,
      selfRecords,
      testConversations,
      unreadAiConversationCount,
    ]
  );

  return (
    <div
      className={cn(
        "absolute inset-x-0 -top-9 z-50 h-[calc(100%+36px)] transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-overlay-light transition-opacity duration-150 ease-out",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-label={t("drawer.closeMask")}
      />
      <aside
        className={cn(
          "absolute left-0 top-0 flex h-full w-[296px] max-w-[82%] flex-col bg-surface px-4 pb-4 pt-[52px] shadow-[8px_0_32px_rgba(0,0,0,0.12)] transition-transform duration-[180ms] ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-label={t("drawer.label")}
      >
        <h2 className="-mx-1 px-3 pb-[5px] pt-[3px] text-xl font-semibold leading-[1.2] text-text">
          {t("drawer.title")}
        </h2>

        <nav className="-mx-4 mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-3">
          <GuideConversationItem onClick={onOpenAnswerGuide} />
          {conversationItems.map((item) => (
            <React.Fragment key={item.key}>{item.node}</React.Fragment>
          ))}
        </nav>

        <div className="mt-auto rounded-[12px] bg-bg px-3 py-3">
          <p className="text-xs font-semibold text-text">{t("drawer.footerTitle")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
            {t("drawer.footerDesc")}
          </p>
        </div>
      </aside>
    </div>
  );
}

function SendToSelfDrawerItem({
  records,
  latestRecord,
  onClick,
}: {
  records: RecordItem[];
  latestRecord: RecordItem | null;
  onClick: () => void;
}) {
  const { t } = usePreferences();

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <SendToSelfIcon className="h-[30px] w-[30px] shrink-0" />
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center">
            <p className="truncate text-[16px] font-normal leading-6 text-text">
              {t("sendToSelf.title")}
            </p>
            <OverviewEntryTag label={t("sendToSelf.privateTag")} />
          </div>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {latestRecord
              ? formatBubbleTime(latestRecord.send_at)
              : formatRoundCount(records.length, t("sendToSelf.recordCount"))}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {latestRecord?.text_content ?? t("sendToSelf.emptyPreview")}
        </p>
      </div>
    </button>
  );
}

function GuideConversationItem({ onClick }: { onClick: () => void }) {
  const { t } = usePreferences();

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-[11px] font-semibold text-primary">
        {t("guide.avatar")}
      </div>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {t("guide.title")}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {t("guide.pinned")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {t("guide.subtitle")}
        </p>
      </div>
    </button>
  );
}

function AvatarUnreadWrap({
  unreadCount,
  children,
}: {
  unreadCount: number;
  children: React.ReactNode;
}) {
  const label = formatUnreadCount(unreadCount);

  return (
    <span className="relative shrink-0">
      {children}
      {unreadCount > 0 && (
        <span
          className={cn(
            "absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-primary text-[10px] font-normal leading-none text-on-primary",
            label.length > 1 ? "px-[4px]" : "px-0"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

function AiToolConversationItem({
  onClick,
  unreadCount,
  latestAt,
}: {
  onClick: () => void;
  unreadCount: number;
  latestAt: number;
}) {
  const { t } = usePreferences();
  const latestEntry = aiConversationLogEntries.at(-1);

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <AvatarUnreadWrap unreadCount={unreadCount}>
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
          AI
        </div>
      </AvatarUnreadWrap>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {t("ai.title")}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {latestAt > 0
              ? formatBubbleTime(latestAt)
              : `${aiConversationLogEntries.length}${t("ai.rounds")}`}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {latestEntry?.userInput ?? t("ai.emptyTitle")}
        </p>
      </div>
    </button>
  );
}

function TestConversationDrawerItem({
  summary,
  onClick,
}: {
  summary: TestConversationSummary;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <AvatarUnreadWrap unreadCount={summary.unreadCount}>
        <TestConversationAvatar summary={summary} className="h-[30px] w-[30px]" />
      </AvatarUnreadWrap>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {summary.title}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {formatBubbleTime(summary.latestMessage.sentAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {summary.conversationType === "group" &&
          summary.latestMessage.sender === "identity"
            ? `${summary.memberIdentities.find((identity) => identity.id === summary.latestMessage.identityId)?.name ?? "成员"}：${summary.latestMessage.text}`
            : summary.latestMessage.text}
        </p>
      </div>
    </button>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const { t } = usePreferences();
  const label = formatUnreadCount(count);

  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-normal leading-[14px] text-on-primary",
        label.length > 1 ? "px-[5px]" : "px-0"
      )}
      aria-label={`${label}${t("common.unreadCount")}`}
    >
      {label}
    </span>
  );
}

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function AiToolConversationChat({
  onBack,
  targetIndex,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
}: {
  onBack: () => void;
  targetIndex?: number | null;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
}) {
  const { t } = usePreferences();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const entryRefs = React.useRef<Array<HTMLElement | null>>([]);
  const fallbackBaseTime = React.useMemo(() => Date.now(), []);

  const makeUserInputRecord = React.useCallback(
    (entry: (typeof aiConversationLogEntries)[number], index: number): RecordItem => {
      const timestamp = parseAiConversationTimestamp(
        entry.timestamp,
        fallbackBaseTime + index
      );
      return {
        uid: `ai-conversation-user-${index}`,
        text_content: entry.userInput,
        send_at: timestamp,
        create_at: timestamp,
        update_at: timestamp,
        sourceConversation: {
          type: "ai",
          label: t("ai.title"),
          actionLabel: t("records.openSource"),
          iconLabel: "AI",
          entryIndex: index,
        },
      };
    },
    [fallbackBaseTime, t]
  );

  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (targetIndex !== null && targetIndex !== undefined) {
      entryRefs.current[targetIndex]?.scrollIntoView({
        block: "center",
      });
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [targetIndex]);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
            AI
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {t("ai.title")}
            </h1>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {formatRoundCount(aiConversationLogEntries.length, t("ai.rounds"))}
            </p>
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-5 pt-4"
      >
        {aiConversationLogEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-sm font-semibold text-primary">
                AI
              </div>
              <p className="mt-4 text-sm font-semibold text-text">
                {t("ai.emptyTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {t("ai.emptyDesc")}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-6">
            {aiConversationLogEntries.map((entry, index) => (
              <section
                key={`${entry.timestamp}-${index}`}
                ref={(node) => {
                  entryRefs.current[index] = node;
                }}
                className={cn(
                  "min-w-0 scroll-mt-4 space-y-3 transition-colors duration-300",
                  targetIndex === index && "-m-1 rounded-[18px] bg-primary-soft/70 p-1"
                )}
              >
                <div className="flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
                    {entry.timestamp}
                  </span>
                </div>

                <div className="flex min-w-0 justify-end gap-2">
                  <div className="-mx-4 min-w-0 flex-1">
                    {(() => {
                      const userInputRecord = makeUserInputRecord(entry, index);
                      return (
                        <ChatBubble
                          textContent={userInputRecord.text_content}
                          disableAnimation
                          variant="primary"
                          onOpenDetail={() => onOpenRecordDetail(userInputRecord)}
                          onOpenMemorySnapshot={() =>
                            onOpenRecordSnapshot(userInputRecord)
                          }
                        />
                      );
                    })()}
                  </div>
                </div>

                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
                    AI
                  </div>
                  <div className="min-w-0 max-w-[82%]">
                    <p className="mb-1 px-1 text-[11px] leading-4 text-text-tertiary">
                      {t("ai.output")}
                    </p>
                    <div className="max-w-full rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55] text-text [overflow-wrap:anywhere]">
                        {entry.aiFinalOutput}
                      </p>
                    </div>

                    <div className="mt-2 min-w-0 max-w-full rounded-[10px] bg-surface-muted px-3 py-2">
                      <p className="text-[11px] font-semibold leading-4 text-text">
                        {t("ai.changedFiles")}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {entry.changedFiles.map((file) => (
                          <li key={file} className="break-words text-[11px] leading-4 text-text-muted [overflow-wrap:anywhere]">
                            {file}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] font-semibold leading-4 text-text">
                        {t("ai.verification")}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {entry.verification.map((item) => (
                          <li key={item} className="break-words text-[11px] leading-4 text-text-muted [overflow-wrap:anywhere]">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SendToSelfConversationChat({
  records,
  targetUid,
  onBack,
  onCreateRecord,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
}: {
  records: RecordItem[];
  targetUid?: string | null;
  onBack: () => void;
  onCreateRecord: (content: string) => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
}) {
  const { t } = usePreferences();
  const recordsWithoutSource = React.useMemo(
    () => records.map(({ sourceConversation: _sourceConversation, ...record }) => record),
    [records]
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <SendToSelfIcon className="h-[30px] w-[30px] shrink-0" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center">
              <h1 className="truncate text-[18px] font-normal leading-6 text-text">
                {t("sendToSelf.title")}
              </h1>
              <OverviewEntryTag label={t("sendToSelf.privateTag")} />
            </div>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {formatRoundCount(records.length, t("sendToSelf.recordCount"))}
            </p>
          </div>
        </div>
      </header>

      <ChatList
        records={recordsWithoutSource}
        hasMore={false}
        loading={false}
        onLoadMore={() => undefined}
        targetRecordUid={targetUid}
        onOpenRecordDetail={onOpenRecordDetail}
        onOpenRecordSnapshot={onOpenRecordSnapshot}
      />
      <ChatInput
        onSubmit={onCreateRecord}
        onVoiceSubmit={() => onCreateRecord(t("records.voiceRecord"))}
      />
    </div>
  );
}

function TestIdentityConversationChat({
  summary,
  targetUid,
  onBack,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
  onCreateReply,
  allIdentities,
  onUpdateGroup,
}: {
  summary: TestConversationSummary;
  targetUid?: string | null;
  onBack: () => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
  onCreateReply: (content: string) => void;
  allIdentities: TestIdentity[];
  onUpdateGroup: (groupId: string, update: (group: TestGroup) => TestGroup) => void;
}) {
  const { resolvedLocale, t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const selfDisplayName = candidateProfile?.name || t("recordDetail.me");
  const [showGroupSettings, setShowGroupSettings] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const recordRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const sortedRecords = React.useMemo(
    () => [...summary.records].sort((a, b) => a.send_at - b.send_at),
    [summary.records]
  );

  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (targetUid) {
      recordRefs.current.get(targetUid)?.scrollIntoView({ block: "center" });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [sortedRecords.length, targetUid]);

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
          {summary.conversationType !== "group" && (
            <TestConversationAvatar summary={summary} className="h-8 w-8" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {summary.title}
            </h1>
            <p className="mt-0.5 truncate text-[11px] leading-3 text-text-tertiary">
              {summary.subtitle}
            </p>
          </div>
        </div>
        {summary.conversationType === "group" && (
          <button
            type="button"
            className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-hover-overlay active:scale-[0.96]"
            onClick={() => setShowGroupSettings(true)}
            aria-label={`打开${summary.title}群聊设置`}
          >
            <TestConversationAvatar summary={summary} className="h-8 w-8" />
          </button>
        )}
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4"
      >
        <div className="space-y-3">
          {sortedRecords.map((record, index) => {
            const prevRecord = sortedRecords[index - 1];
            const showTime =
              index === 0 || shouldShowConversationTime(prevRecord.send_at, record.send_at);

            return (
              <div
                key={record.uid}
                ref={(node) => {
                  if (node) {
                    recordRefs.current.set(record.uid, node);
                  } else {
                    recordRefs.current.delete(record.uid);
                  }
                }}
                className={cn(
                  "scroll-mt-4",
                  targetUid === record.uid && "rounded-[18px] bg-primary-soft/70 py-1"
                )}
              >
                {showTime && (
                  <div className="mb-3 flex justify-center">
                    <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
                      {formatTimeLabel(record.send_at, {
                        locale: resolvedLocale,
                        today: t("time.today"),
                        yesterday: t("time.yesterday"),
                        dayBeforeYesterday: t("time.dayBeforeYesterday"),
                      })}{" "}
                      {formatBubbleTime(record.send_at)}
                    </span>
                  </div>
                )}
                {record.sender === "demo" ? (
                  <div className="-mx-4">
                    <ChatBubble
                      textContent={record.text_content}
                      disableAnimation
                      variant="primary"
                      topLabel={
                        summary.conversationType === "group" ? selfDisplayName : undefined
                      }
                      onOpenDetail={() => onOpenRecordDetail(record)}
                      onOpenMemorySnapshot={() => onOpenRecordSnapshot(record)}
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <TestMessageIdentityAvatar
                      identityId={record.identityId}
                      summary={summary}
                    />
                    <div className="min-w-0 max-w-[82%]">
                      {summary.conversationType === "group" && (
                        <p className="mb-1 px-1 text-[11px] leading-4 text-text-tertiary">
                          {summary.memberIdentities.find(
                            (identity) => identity.id === record.identityId
                          )?.name ?? "群成员"}
                        </p>
                      )}
                      <button
                        type="button"
                        className="max-w-full rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 text-left text-text shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-[var(--record-card-hover-bg)] active:scale-[0.99]"
                        onClick={() => onOpenRecordDetail(record)}
                      >
                        <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
                          {record.text_content}
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ChatInput
        onSubmit={onCreateReply}
        onVoiceSubmit={() => onCreateReply(t("records.voiceRecord"))}
      />
      {showGroupSettings && (
        <GroupSettingsPanel
          summary={summary}
          allIdentities={allIdentities}
          onUpdateGroup={onUpdateGroup}
          onClose={() => setShowGroupSettings(false)}
        />
      )}
    </div>
  );
}

type GroupSettingsView =
  | "main"
  | "members"
  | "invite"
  | "join"
  | "requests"
  | "nickname"
  | "search"
  | "children"
  | "media"
  | "danger";

function GroupSettingsPanel({
  summary,
  allIdentities,
  onUpdateGroup,
  onClose,
}: {
  summary: TestConversationSummary;
  allIdentities: TestIdentity[];
  onUpdateGroup: (groupId: string, update: (group: TestGroup) => TestGroup) => void;
  onClose: () => void;
}) {
  const [view, setView] = React.useState<GroupSettingsView>("main");
  const [settings, setSettings] = React.useState<TestGroupSettings>(() =>
    getInitialTestGroupSettings(summary.group?.id ?? summary.conversationId)
  );
  const [memberSearch, setMemberSearch] = React.useState("");
  const [memberEditMode, setMemberEditMode] = React.useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([]);
  const [nicknameDraft, setNicknameDraft] = React.useState(settings.selfNickname);
  const [recordSearch, setRecordSearch] = React.useState("");
  const [childTopicDraft, setChildTopicDraft] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [dangerAction, setDangerAction] = React.useState<"exit" | "dissolve" | null>(null);
  const groupId = summary.group?.id ?? summary.conversationId;
  const memberCount = summary.memberIdentities.length;
  const members = summary.memberIdentities;
  const availableIdentities = allIdentities.filter(
    (identity) => !summary.group?.memberIdentityIds.includes(identity.id)
  );

  const updateSettings = (update: (current: TestGroupSettings) => TestGroupSettings) => {
    setSettings((current) => {
      const next = update(current);
      persistTestGroupSettings(groupId, next);
      return next;
    });
  };

  const openView = (nextView: Exclude<GroupSettingsView, "main">) => {
    setView(nextView);
    setNotice("");
  };

  const returnToMain = () => {
    if (view !== "main") {
      setView("main");
      setNotice("");
      setDangerAction(null);
      return;
    }
    onClose();
  };

  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`${summary.title}群聊设置`}>
      {view === "main" ? (
        <button
          type="button"
          className="absolute left-3 top-2 z-10 flex h-10 w-10 items-center justify-center text-[28px] font-light leading-none text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={returnToMain}
          aria-label="返回群聊"
        >
          &lt;
        </button>
      ) : (
        <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-surface px-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center text-[28px] font-light leading-none text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
            onClick={returnToMain}
            aria-label="返回群聊设置"
          >
            &lt;
          </button>
          <h2 className="flex-1 pr-10 text-center text-[17px] font-semibold text-text">
            {getGroupSettingsViewTitle(view)}
          </h2>
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
        {view === "main" ? (
          <GroupSettingsMain
            summary={summary}
            memberCount={memberCount}
            settings={settings}
            onOpenView={openView}
            onUpdateSettings={updateSettings}
          />
        ) : (
          <GroupSettingsDetail
            view={view}
            summary={summary}
            members={members}
            availableIdentities={availableIdentities}
            settings={settings}
            memberSearch={memberSearch}
            memberEditMode={memberEditMode}
            selectedMemberIds={selectedMemberIds}
            nicknameDraft={nicknameDraft}
            recordSearch={recordSearch}
            childTopicDraft={childTopicDraft}
            notice={notice}
            dangerAction={dangerAction}
            onSetMemberSearch={setMemberSearch}
            onSetMemberEditMode={setMemberEditMode}
            onToggleSelectedMember={(identityId) => {
              setSelectedMemberIds((current) =>
                current.includes(identityId)
                  ? current.filter((id) => id !== identityId)
                  : [...current, identityId]
              );
            }}
            onAddMembers={() => {
              if (selectedMemberIds.length === 0) return;
              onUpdateGroup(groupId, (group) => ({
                ...group,
                memberIdentityIds: Array.from(
                  new Set([...group.memberIdentityIds, ...selectedMemberIds])
                ),
              }));
              setNotice(`已添加 ${selectedMemberIds.length} 位协作者`);
              setSelectedMemberIds([]);
            }}
            onRemoveMember={(identityId) => {
              onUpdateGroup(groupId, (group) => ({
                ...group,
                memberIdentityIds: group.memberIdentityIds.filter((id) => id !== identityId),
              }));
              setNotice("已移除协作者");
            }}
            onUpdateSettings={updateSettings}
            onSetNicknameDraft={setNicknameDraft}
            onSaveNickname={() => {
              updateSettings((current) => ({ ...current, selfNickname: nicknameDraft.trim() }));
              setNotice("群内昵称已保存");
            }}
            onSetRecordSearch={setRecordSearch}
            onSetChildTopicDraft={setChildTopicDraft}
            onCreateChildTopic={() => {
              const title = childTopicDraft.trim();
              if (!title) return;
              updateSettings((current) => ({
                ...current,
                childTopics: [
                  ...current.childTopics,
                  { id: `child-topic-${Date.now()}`, title, createdAt: Date.now() },
                ],
              }));
              setChildTopicDraft("");
              setNotice("子主题已创建");
            }}
            onCopyInvite={() => {
              const inviteLink = `jiwo://group/${groupId}?invite=demo`;
              void window.navigator.clipboard?.writeText(inviteLink).catch(() => undefined);
              setNotice("邀请链接已复制");
            }}
            onPrepareExport={() => setNotice("主题数据已准备导出（本地模拟）")}
            onSetDangerAction={setDangerAction}
            onConfirmDanger={() => {
              if (dangerAction === "exit") setNotice("已退出群聊（本地模拟）");
              if (dangerAction === "dissolve") setNotice("群聊已解散（本地模拟）");
              setDangerAction(null);
            }}
          />
        )}
      </div>
    </section>
  );
}

function GroupSettingsMain({
  summary,
  memberCount,
  settings,
  onOpenView,
  onUpdateSettings,
}: {
  summary: TestConversationSummary;
  memberCount: number;
  settings: TestGroupSettings;
  onOpenView: (view: Exclude<GroupSettingsView, "main">) => void;
  onUpdateSettings: (update: (current: TestGroupSettings) => TestGroupSettings) => void;
}) {
  const pendingRequestCount = settings.joinRequests.filter((request) => request.status === "pending").length;
  const [moreExpanded, setMoreExpanded] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!moreExpanded) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreMenuRef.current?.contains(event.target)) {
        setMoreExpanded(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreExpanded(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreExpanded]);

  const openViewFromMore = (view: Exclude<GroupSettingsView, "main">) => {
    setMoreExpanded(false);
    onOpenView(view);
  };

  return (
    <>
      <div className="px-5 pb-5 pt-3 text-center">
        <TestConversationAvatar summary={summary} className="mx-auto h-[72px] w-[72px] text-[24px]" />
        <h3 className="mt-3 text-[20px] font-semibold leading-6 text-text">{summary.title}</h3>
      </div>

      <section className="border-y border-border-light bg-surface px-4 py-4">
        <div className="grid grid-cols-4 gap-y-5">
          <GroupSettingShortcut icon={<LinkIcon />} label="邀请协作者" onClick={() => onOpenView("invite")} />
          <GroupSettingShortcut icon={<ShieldIcon />} label="加入方式" onClick={() => onOpenView("join")} />
          <GroupSettingShortcut icon={<MembersIcon />} label="入群申请" hint={pendingRequestCount ? `${pendingRequestCount}` : undefined} onClick={() => onOpenView("requests")} />
          <GroupSettingShortcut icon={<BellIcon />} label="群通知" onClick={() => onUpdateSettings((current) => ({ ...current, notificationsEnabled: !current.notificationsEnabled }))} />
          <GroupSettingShortcut icon={<EditIcon />} label="我的群昵称" onClick={() => onOpenView("nickname")} />
          <GroupSettingShortcut icon={<SearchIcon />} label="搜索快记" onClick={() => onOpenView("search")} />
          <div ref={moreMenuRef} className="relative min-w-0">
            <GroupSettingShortcut
              icon={<MoreIcon expanded={moreExpanded} />}
              label="更多"
              ariaExpanded={moreExpanded}
              ariaHaspopup="dialog"
              onClick={() => setMoreExpanded((expanded) => !expanded)}
            />
            {moreExpanded && (
              <section
                role="dialog"
                aria-label="更多群聊设置"
                className="absolute right-0 top-[calc(100%+8px)] z-30 max-h-[min(360px,60vh)] w-[min(280px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-border-light bg-surface py-1 shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
              >
                <GroupSettingRow icon={<MediaIcon />} label="媒体、文件和链接" onClick={() => openViewFromMore("media")} />
                <GroupSettingRow
                  icon={<BookmarkIcon />}
                  label="首页不显示群快记"
                  trailing={<SettingSwitch checked={settings.hideRecordsOnHome} onChange={(checked) => onUpdateSettings((current) => ({ ...current, hideRecordsOnHome: checked }))} label="首页显示群快记" />}
                />
                <GroupSettingRow icon={<BranchIcon />} label="新建子主题" value={settings.childTopics.length ? `${settings.childTopics.length}` : undefined} onClick={() => openViewFromMore("children")} />
                <GroupSettingRow
                  icon={<LockIcon />}
                  label="隐私锁"
                  value={settings.privacyLocked ? "已开启" : "未开启"}
                  trailing={<SettingSwitch checked={settings.privacyLocked} onChange={(checked) => onUpdateSettings((current) => ({ ...current, privacyLocked: checked }))} label="隐私锁" />}
                />
                <GroupSettingRow icon={<DownloadIcon />} label="导出主题数据" onClick={() => openViewFromMore("danger")} />
                <GroupSettingRow icon={<MoreIcon />} label="退出群聊和解散群聊" onClick={() => openViewFromMore("danger")} />
              </section>
            )}
          </div>
        </div>
      </section>

      <section className="pt-5">
        <div className="flex items-center px-5 pb-3">
          <h4 className="text-[16px] font-semibold text-text">全部成员（{memberCount}）</h4>
          <button type="button" onClick={() => onOpenView("members")} className="ml-auto text-[13px] text-primary">管理协作者</button>
        </div>
        <div className="border-y border-border-light bg-surface">
          {summary.memberIdentities.map((identity, index) => (
            <button
              key={identity.id}
              type="button"
              onClick={() => onOpenView("members")}
              className="flex min-h-[68px] w-full items-center gap-3 border-b border-border-light px-5 text-left last:border-b-0 transition hover:bg-hover-overlay active:bg-hover-overlay"
            >
              <TestIdentityAvatar identity={identity} className="h-11 w-11 shrink-0 text-[14px]" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-text">{identity.name}</span>
              <span className="shrink-0 text-[13px] text-text-tertiary">{index === 0 ? "群主" : "成员"}</span>
            </button>
          ))}
          {summary.memberIdentities.length === 0 && <p className="px-5 py-6 text-center text-[14px] text-text-tertiary">暂未添加群成员</p>}
        </div>
      </section>
    </>
  );
}

function GroupSettingShortcut({
  icon,
  label,
  hint,
  ariaExpanded,
  ariaHaspopup,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  ariaExpanded?: boolean;
  ariaHaspopup?: React.AriaAttributes["aria-haspopup"];
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-expanded={ariaExpanded} aria-haspopup={ariaHaspopup} className="flex w-full min-w-0 flex-col items-center text-center text-text transition active:scale-[0.96]">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
        {hint && <span className="absolute -right-2 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 text-white">{hint}</span>}
      </span>
      <span className="mt-1.5 max-w-full truncate text-[12px] leading-4">{label}</span>
    </button>
  );
}

function GroupSettingsDetail({
  view,
  summary,
  members,
  availableIdentities,
  settings,
  memberSearch,
  memberEditMode,
  selectedMemberIds,
  nicknameDraft,
  recordSearch,
  childTopicDraft,
  notice,
  dangerAction,
  onSetMemberSearch,
  onSetMemberEditMode,
  onToggleSelectedMember,
  onAddMembers,
  onRemoveMember,
  onUpdateSettings,
  onSetNicknameDraft,
  onSaveNickname,
  onSetRecordSearch,
  onSetChildTopicDraft,
  onCreateChildTopic,
  onCopyInvite,
  onPrepareExport,
  onSetDangerAction,
  onConfirmDanger,
}: {
  view: Exclude<GroupSettingsView, "main">;
  summary: TestConversationSummary;
  members: TestIdentity[];
  availableIdentities: TestIdentity[];
  settings: TestGroupSettings;
  memberSearch: string;
  memberEditMode: boolean;
  selectedMemberIds: string[];
  nicknameDraft: string;
  recordSearch: string;
  childTopicDraft: string;
  notice: string;
  dangerAction: "exit" | "dissolve" | null;
  onSetMemberSearch: (value: string) => void;
  onSetMemberEditMode: (value: boolean) => void;
  onToggleSelectedMember: (identityId: string) => void;
  onAddMembers: () => void;
  onRemoveMember: (identityId: string) => void;
  onUpdateSettings: (update: (current: TestGroupSettings) => TestGroupSettings) => void;
  onSetNicknameDraft: (value: string) => void;
  onSaveNickname: () => void;
  onSetRecordSearch: (value: string) => void;
  onSetChildTopicDraft: (value: string) => void;
  onCreateChildTopic: () => void;
  onCopyInvite: () => void;
  onPrepareExport: () => void;
  onSetDangerAction: (action: "exit" | "dissolve" | null) => void;
  onConfirmDanger: () => void;
}) {
  const filteredMembers = members.filter((identity) =>
    identity.name.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())
  );
  const filteredAvailableIdentities = availableIdentities.filter((identity) =>
    identity.name.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())
  );
  const matchingRecords = summary.records.filter((record) =>
    record.text_content.toLocaleLowerCase().includes(recordSearch.trim().toLocaleLowerCase())
  );
  const pendingRequests = settings.joinRequests.filter((request) => request.status === "pending");

  if (view === "members") {
    const showingAddCandidates = memberEditMode;
    const displayedMembers = showingAddCandidates ? filteredAvailableIdentities : filteredMembers;
    return (
      <section className="pt-2">
        <div className="px-4 pb-3">
          <div className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-text-tertiary">
            <SearchIcon />
            <input value={memberSearch} onChange={(event) => onSetMemberSearch(event.target.value)} placeholder={showingAddCandidates ? "搜索可添加的协作者" : "搜索协作者"} className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-tertiary" />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <p className="text-[13px] text-text-tertiary">{showingAddCandidates ? "从已有测试身份中添加" : `${members.length} 位协作者`}</p>
          <button type="button" onClick={() => { onSetMemberEditMode(!memberEditMode); onSetMemberSearch(""); }} className="text-[14px] font-medium text-primary">
            {showingAddCandidates ? "查看成员" : "添加协作者"}
          </button>
        </div>
        <div className="border-y border-border-light bg-surface">
          {displayedMembers.map((identity, index) => {
            const isOwner = !showingAddCandidates && index === 0;
            const selected = selectedMemberIds.includes(identity.id);
            return (
              <div key={identity.id} className="flex min-h-16 items-center gap-3 px-4">
                <TestIdentityAvatar identity={identity} className="h-10 w-10 text-[13px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-text">{identity.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-text-tertiary">{isOwner ? "群主" : identity.note || "协作者"}</p>
                </div>
                {showingAddCandidates ? (
                  <button type="button" onClick={() => onToggleSelectedMember(identity.id)} className={cn("flex h-7 w-7 items-center justify-center rounded-full border transition", selected ? "border-primary bg-primary text-white" : "border-border text-text-tertiary")} aria-label={selected ? `取消选择${identity.name}` : `选择${identity.name}`}>
                    {selected && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
                  </button>
                ) : !isOwner ? (
                  <button type="button" onClick={() => onRemoveMember(identity.id)} className="text-[13px] text-[#D84B4B]">移除</button>
                ) : null}
              </div>
            );
          })}
          {displayedMembers.length === 0 && <p className="px-4 py-6 text-[14px] text-text-tertiary">{showingAddCandidates ? "没有可添加的测试身份" : "未找到协作者"}</p>}
        </div>
        {showingAddCandidates && <div className="p-4"><button type="button" disabled={selectedMemberIds.length === 0} onClick={onAddMembers} className="h-11 w-full rounded-lg bg-primary text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-45">添加 {selectedMemberIds.length ? `${selectedMemberIds.length} 位协作者` : "协作者"}</button></div>}
        <GroupSettingsNotice notice={notice} />
      </section>
    );
  }

  if (view === "invite") {
    return <section className="px-5 pt-6 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary"><LinkIcon /></div><h3 className="mt-4 text-[18px] font-semibold text-text">邀请协作者加入群聊</h3><p className="mt-2 text-[13px] leading-5 text-text-tertiary">生成的邀请链接仅用于本地 Demo 演示。</p><div className="mt-5 flex items-center gap-2 rounded-lg border border-border-light bg-surface px-3 py-3 text-left"><span className="min-w-0 flex-1 truncate text-[13px] text-text-muted">jiwo://group/{summary.conversationId}?invite=demo</span><button type="button" onClick={onCopyInvite} className="shrink-0 text-[14px] font-medium text-primary">复制</button></div><GroupSettingsNotice notice={notice} /></section>;
  }

  if (view === "join") {
    return <section className="pt-3"><p className="px-5 pb-2 text-[13px] text-text-tertiary">选择谁可以加入这个群聊</p><GroupSettingsSection>{(["invite", "approval", "public"] as const).map((mode) => <button type="button" key={mode} onClick={() => onUpdateSettings((current) => ({ ...current, joinMode: mode }))} className="flex min-h-16 w-full items-center gap-3 px-4 text-left transition hover:bg-hover-overlay"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", settings.joinMode === mode ? "border-primary" : "border-border")}>{settings.joinMode === mode && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span><span className="min-w-0 flex-1"><span className="block text-[15px] text-text">{getJoinModeLabel(mode)}</span><span className="mt-1 block text-[12px] text-text-tertiary">{getJoinModeDescription(mode)}</span></span></button>)}</GroupSettingsSection></section>;
  }

  if (view === "requests") {
    return <section className="pt-3"><div className="border-y border-border-light bg-surface">{pendingRequests.map((request) => <div key={request.id} className="flex min-h-20 items-center gap-3 px-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ backgroundColor: request.color }}>{request.avatarLabel}</div><div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-text">{request.name}</p><p className="mt-0.5 truncate text-[12px] text-text-tertiary">{request.message || "申请加入群聊"}</p></div><div className="flex gap-2"><button type="button" onClick={() => onUpdateSettings((current) => ({ ...current, joinRequests: current.joinRequests.map((item) => item.id === request.id ? { ...item, status: "rejected" } : item) }))} className="text-[13px] text-text-tertiary">拒绝</button><button type="button" onClick={() => onUpdateSettings((current) => ({ ...current, joinRequests: current.joinRequests.map((item) => item.id === request.id ? { ...item, status: "approved" } : item) }))} className="text-[13px] font-medium text-primary">同意</button></div></div>)}</div>{pendingRequests.length === 0 && <p className="px-5 py-10 text-center text-[14px] text-text-tertiary">暂无待处理申请</p>}</section>;
  }

  if (view === "nickname") {
    return <section className="p-5"><label className="text-[13px] text-text-tertiary" htmlFor="group-nickname">只在这个群聊中展示</label><input id="group-nickname" value={nicknameDraft} onChange={(event) => onSetNicknameDraft(event.target.value)} maxLength={24} placeholder="输入群内昵称" className="mt-2 h-11 w-full rounded-lg border border-border-light bg-surface px-3 text-[15px] text-text outline-none focus:border-primary" /><button type="button" onClick={onSaveNickname} className="mt-4 h-11 w-full rounded-lg bg-primary text-[15px] font-medium text-white">保存</button><GroupSettingsNotice notice={notice} /></section>;
  }

  if (view === "search") {
    return <section className="pt-3"><div className="px-4"><div className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-text-tertiary"><SearchIcon /><input value={recordSearch} onChange={(event) => onSetRecordSearch(event.target.value)} placeholder="搜索群内快记" className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-tertiary" /></div></div><div className="mt-3 border-y border-border-light bg-surface">{recordSearch.trim() ? matchingRecords.map((record) => <div key={record.uid} className="border-b border-border-light px-4 py-3 last:border-b-0"><p className="text-[14px] leading-5 text-text">{record.text_content}</p><p className="mt-1 text-[12px] text-text-tertiary">{formatBubbleTime(record.send_at)}</p></div>) : <p className="px-4 py-8 text-center text-[14px] text-text-tertiary">输入关键词搜索群内快记</p>}{recordSearch.trim() && matchingRecords.length === 0 && <p className="px-4 py-8 text-center text-[14px] text-text-tertiary">没有找到相关快记</p>}</div></section>;
  }

  if (view === "media") {
    return <section className="px-5 py-10 text-center"><MediaIcon /><p className="mt-3 text-[15px] text-text">媒体、文件和链接</p><p className="mt-2 text-[13px] text-text-tertiary">当前群聊还没有可归类的内容。</p></section>;
  }

  if (view === "children") {
    return <section className="pt-3"><div className="flex gap-2 px-4"><input value={childTopicDraft} onChange={(event) => onSetChildTopicDraft(event.target.value)} maxLength={30} placeholder="输入子主题名称" className="h-10 min-w-0 flex-1 rounded-lg border border-border-light bg-surface px-3 text-[14px] text-text outline-none focus:border-primary" /><button type="button" onClick={onCreateChildTopic} className="h-10 shrink-0 rounded-lg bg-primary px-4 text-[14px] font-medium text-white">创建</button></div><div className="mt-4 border-y border-border-light bg-surface">{settings.childTopics.map((topic) => <div key={topic.id} className="flex min-h-14 items-center px-4"><span className="min-w-0 flex-1 truncate text-[15px] text-text">{topic.title}</span><span className="text-[12px] text-text-tertiary">子主题</span></div>)}{settings.childTopics.length === 0 && <p className="px-4 py-8 text-center text-[14px] text-text-tertiary">还没有子主题</p>}</div><GroupSettingsNotice notice={notice} /></section>;
  }

  return <section className="pt-3"><GroupSettingsSection title="数据"><button type="button" onClick={onPrepareExport} className="flex min-h-14 w-full items-center px-4 text-left text-[15px] text-text"><span className="flex h-7 w-7 items-center justify-center text-text-tertiary"><DownloadIcon /></span><span className="ml-3 flex-1">导出主题数据</span><span className="text-[13px] text-primary">准备导出</span></button></GroupSettingsSection><GroupSettingsSection title="危险操作"><button type="button" onClick={() => onSetDangerAction("exit")} className="flex min-h-14 w-full items-center px-4 text-left text-[15px] text-[#D84B4B]">退出群聊</button><button type="button" disabled={members.length > 1} onClick={() => onSetDangerAction("dissolve")} className="flex min-h-14 w-full items-center border-t border-border-light px-4 text-left text-[15px] text-[#D84B4B] disabled:text-text-tertiary">解散群聊<span className="ml-auto text-[12px] text-text-tertiary">{members.length > 1 ? "请先移除其他协作者" : ""}</span></button></GroupSettingsSection>{dangerAction && <div className="mx-4 mt-5 rounded-lg border border-[#F1C8C8] bg-[#FFF7F7] p-4"><p className="text-[15px] font-medium text-text">确认{dangerAction === "exit" ? "退出群聊" : "解散群聊"}？</p><p className="mt-1 text-[13px] leading-5 text-text-tertiary">这是本地 Demo 操作，不会影响真实群聊。</p><div className="mt-4 flex justify-end gap-3"><button type="button" onClick={() => onSetDangerAction(null)} className="text-[14px] text-text-tertiary">取消</button><button type="button" onClick={onConfirmDanger} className="text-[14px] font-medium text-[#D84B4B]">确认</button></div></div>}<GroupSettingsNotice notice={notice} /></section>;
}

function GroupSettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section className="mt-4"><>{title && <p className="px-5 pb-2 text-[13px] font-medium text-text-tertiary">{title}</p>}</><div className="border-y border-border-light bg-surface">{children}</div></section>;
}

function GroupSettingsNotice({ notice }: { notice: string }) {
  return notice ? <p className="mx-5 mt-5 rounded-lg bg-primary-soft px-3 py-2.5 text-center text-[13px] text-primary">{notice}</p> : null;
}

function SettingSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" className={cn("relative h-7 w-12 rounded-full transition-colors", checked ? "bg-primary" : "bg-surface-2")} onClick={(event) => { event.stopPropagation(); onChange(!checked); }} aria-pressed={checked} aria-label={`${checked ? "关闭" : "开启"}${label}`}><span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} /></button>;
}

function getGroupSettingsViewTitle(view: GroupSettingsView) {
  const titles: Record<GroupSettingsView, string> = { main: "群聊设置", members: "协作者", invite: "邀请协作者", join: "加入方式", requests: "入群申请", nickname: "我的群昵称", search: "搜索群内快记", children: "子主题", media: "媒体、文件和链接", danger: "群聊管理" };
  return titles[view];
}

function getJoinModeLabel(mode: TestGroupSettings["joinMode"]) {
  return mode === "invite" ? "仅邀请" : mode === "approval" ? "需审核" : "公开加入";
}

function getJoinModeDescription(mode: TestGroupSettings["joinMode"]) {
  return mode === "invite" ? "只有群成员邀请后才能加入" : mode === "approval" ? "提交申请后，由群主审核" : "任何人都可以通过链接加入";
}

function GroupSettingRow({
  icon,
  label,
  value,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-text-tertiary">{icon}</span>
      <span className="min-w-0 flex-1 text-[15px] text-text">{label}</span>
      {trailing ?? (
        <>
          {value && <span className="text-[13px] text-text-tertiary">{value}</span>}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-tertiary" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </>
      )}
    </>
  );

  if (trailing) {
    return <div className="flex min-h-14 w-full items-center gap-3 px-4 text-left">{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition hover:bg-hover-overlay">
      {content}
    </button>
  );
}

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 6 6M8.5 8.5h.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function MoreIcon({ expanded = false }: { expanded?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /><path className={expanded ? "origin-center rotate-180" : "origin-center"} d="m8 17 4 4 4-4" /></svg>;
}

function LinkIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" /></svg>;
}

function ShieldIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

function EditIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>;
}

function BookmarkIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z" /></svg>;
}

function BranchIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v12a3 3 0 0 0 3 3h9" /><path d="m15 14 3 3-3 3" /><circle cx="6" cy="3" r="2" /></svg>;
}

function LockIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function DownloadIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
}

function shouldShowConversationTime(prevSendAt: number, currentSendAt: number) {
  return Math.abs(currentSendAt - prevSendAt) > 1000 * 60 * 5;
}

function TestIdentityAvatar({
  identity,
  className,
}: {
  identity: TestIdentity;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white",
        className
      )}
      style={{ backgroundColor: identity.color }}
      aria-hidden="true"
    >
      {identity.avatarLabel}
    </div>
  );
}

function TestConversationAvatar({
  summary,
  className,
}: {
  summary: TestConversationSummary;
  className?: string;
}) {
  if (summary.identity) {
    return <TestIdentityAvatar identity={summary.identity} className={className} />;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white",
        className
      )}
      style={{ backgroundColor: summary.color }}
      aria-hidden="true"
    >
      {summary.avatarLabel}
    </div>
  );
}

function TestMessageIdentityAvatar({
  identityId,
  summary,
}: {
  identityId: string;
  summary: TestConversationSummary;
}) {
  const identity =
    summary.memberIdentities.find((item) => item.id === identityId) ?? summary.identity;

  if (identity) {
    return <TestIdentityAvatar identity={identity} className="mt-0.5 h-8 w-8" />;
  }

  return <TestConversationAvatar summary={summary} className="mt-0.5 h-8 w-8" />;
}

function AnswerGuideChat({ onBack }: { onBack: () => void }) {
  const { resolvedLocale, t } = usePreferences();
  const guideTime = React.useMemo(() => Date.now(), []);
  const answerGuideMessages = [
    t("guide.message1"),
    t("guide.message2"),
    t("guide.message3"),
    t("guide.message4"),
    t("guide.message5"),
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-xs font-semibold text-primary">
            {t("guide.avatar")}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {t("guide.title")}
            </h1>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {t("guide.scope")}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
        <div className="mb-4 flex justify-center">
          <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
            {formatTimeLabel(guideTime, {
              locale: resolvedLocale,
              today: t("time.today"),
              yesterday: t("time.yesterday"),
              dayBeforeYesterday: t("time.dayBeforeYesterday"),
            })}{" "}
            {formatBubbleTime(guideTime)}
          </span>
        </div>
        <div className="space-y-3">
          {answerGuideMessages.map((message, index) => (
            <div key={message} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-xs font-semibold text-primary">
                {t("guide.avatar")}
              </div>
              <div className="max-w-[78%]">
                <div className="rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-text">
                    {message}
                  </p>
                </div>
                {index === 0 && (
                  <p className="mt-1 px-1 text-[11px] leading-4 text-text-tertiary">
                    {t("guide.title")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileBottomNavigation({
  currentPage,
  onNavigate,
}: {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}) {
  const { t } = usePreferences();

  return (
    <nav className="mobile-bottom-navigation shrink-0 bg-bg px-2 pb-3 pt-1">
      <div className="flex h-12 items-center">
        {tabs.map((tab) => {
          const active = tab.key === currentPage;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className={cn(
                "flex h-full flex-1 items-center justify-center rounded-[10px] text-base transition active:scale-[0.98]",
                active
                  ? "font-semibold text-text"
                  : "font-normal text-text-tertiary"
              )}
            >
              {getTabLabel(tab.key, t)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function InsightPreview() {
  const { t } = usePreferences();

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center bg-bg px-4">
        <h1 className="text-lg font-semibold text-text">{t("insight.title")}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-text">
            {t("insight.emptyTitle")}
          </p>
          <p className="mt-1 text-xs text-text-muted">{t("insight.emptyDesc")}</p>
        </div>
      </div>
    </div>
  );
}

function MinePreview({
  records,
  onOpenSettings,
  onOpenAbout,
}: {
  records: RecordItem[];
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}) {
  const { resolvedLocale, resolvedTheme, t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const mineImagePrefix = resolvedTheme === "dark" ? "/images/mine/theme_dark/" : "/images/mine/";
  const mineUserName = candidateProfile?.name || t("mine.user");
  const mineAvatarLabel =
    candidateProfile?.avatarLabel || t("recordDetail.me").slice(0, 1);
  const quickNoteCount = records.length;
  const wordCount = records.reduce(
    (total, record) => total + countRecordTextLength(record.text_content),
    0
  );
  const quickNoteCountText = formatNumberForLocale(quickNoteCount, resolvedLocale);
  const wordCountText = formatNumberForLocale(wordCount, resolvedLocale);
  const mineStats = [
    t("mine.stat1"),
    formatStatTemplate(t("mine.stat2"), {
      count: quickNoteCountText,
      places: "0",
    }),
    t("mine.stat3"),
    formatStatTemplate(t("mine.stat4"), {
      words: wordCountText,
    }),
  ];
  const mineDataTags = [
    t("mine.tagImportExport"),
    t("mine.tagDataSecurity"),
    t("mine.tagPrivacy"),
  ];

  return (
    <div className="h-full overflow-y-auto bg-bg pb-4">
      <section className="relative overflow-hidden pb-5 pt-10">
        <img
          src="/images/mine/image_mine_page_background.png"
          alt=""
          className="pointer-events-none absolute -right-[52px] -top-11 h-[273px] w-[375px] max-w-none object-cover"
          aria-hidden="true"
        />

        <button
          type="button"
          className="absolute right-0 top-14 z-10 flex w-[98px] items-center rounded-l-[10px] bg-[var(--mine-world-bg)] py-[7px] pl-3 pr-1.5 text-[14px] leading-4 text-text transition active:scale-[0.98]"
        >
          {t("mine.world")}
          <ChevronRightIcon className="ml-0.5 h-4 w-4 shrink-0 text-text" />
        </button>

        <div className="relative z-10 flex items-center pl-4 pr-[112px]">
          <div
            className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border border-border-strong/80 bg-primary text-[23px] font-semibold leading-none text-on-primary shadow-[var(--mine-card-shadow)]"
            aria-label={t("mine.avatarAlt")}
          >
            {mineAvatarLabel}
          </div>
          <div className="ml-3 min-w-0">
            <div className="flex items-center">
              <p className="truncate text-xl leading-5 text-text">{mineUserName}</p>
              <ChevronRightIcon className="ml-1.5 h-4 w-4 shrink-0 text-text-disabled" />
            </div>
            <div className="mt-3 flex h-4 items-center">
              <div className="h-[3px] w-[83px] overflow-hidden rounded-full bg-[rgba(136,136,136,0.2)]">
                <div className="h-full w-[18%] rounded-full bg-primary" />
              </div>
              <p className="ml-2 text-xs leading-4 text-text-tertiary">
                {t("mine.storage")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-2.5 pt-[50px]">
        <button
          type="button"
          className="absolute left-2.5 right-2.5 top-2.5 z-0 flex min-h-[70px] items-start rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-member-bg)] px-2.5 pb-3 pt-3 text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center">
              <p className="shrink-0 text-sm font-bold leading-4 text-text">
                {t("mine.memberTitle")}
              </p>
              <p className="ml-1.5 truncate text-xs leading-4 text-text-tertiary">
                {t("mine.memberDesc")}
              </p>
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center text-sm leading-4 text-primary">
            {t("mine.memberAction")}
            <ChevronRightIcon className="h-4 w-4" />
          </div>
        </button>

        <div className="relative z-10 overflow-hidden rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] shadow-[var(--mine-card-shadow)]">
          <img
            src={`${mineImagePrefix}image_mine_page_migong_background.png`}
            alt=""
            className="pointer-events-none absolute -right-px bottom-0 h-[179px] w-[179px]"
            aria-hidden="true"
          />
          <div className="relative px-3 pb-2.5 pt-2.5">
            <div className="flex items-center justify-between">
              <p className="truncate text-sm leading-[22px] text-text-tertiary">
                {t("mine.statsTitle")}
              </p>
              <button
                type="button"
                className="ml-3 flex shrink-0 items-center text-sm leading-[22px] text-text-tertiary transition active:scale-[0.98]"
              >
                {t("mine.statsButton")}
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {mineStats.map((line) => (
                <p key={line} className="text-base leading-7 text-text">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-2.5 px-2.5">
        <button
          type="button"
          className="relative w-full overflow-hidden rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
        >
          <img
            src={`${mineImagePrefix}image_mine_page_datamanager_protect_background.png`}
            alt=""
            className="pointer-events-none absolute -right-px bottom-0 h-24 w-[106px]"
            aria-hidden="true"
          />
          <div className="relative px-3 pb-2.5 pt-2.5">
            <h2 className="text-base font-bold leading-6 text-text">
              {t("mine.dataTitle")}
            </h2>
            <p className="mt-px text-sm leading-5 text-text-tertiary">
              {t("mine.dataDesc")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mineDataTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[8px] bg-[rgba(136,136,136,0.12)] px-2 py-1 text-xs leading-4 text-text-tertiary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </button>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <MineActionCard
            title={t("mine.settings")}
            description={t("mine.settingsDesc")}
            onClick={onOpenSettings}
          />
          <MineActionCard
            title={t("mine.about")}
            description={t("mine.aboutDesc")}
            onClick={onOpenAbout}
          />
        </div>
      </section>
    </div>
  );
}

function AboutScreen({ onBack }: { onBack: () => void }) {
  const { t } = usePreferences();
  const legalLinks = [
    {
      title: t("about.userAgreement"),
      url: "https://www.jiwo.cc/article/user-aggrement-v1.html",
    },
    {
      title: t("about.privacyTerms"),
      url: "https://www.jiwo.cc/article/privacy-aggrement-v1.html",
    },
    {
      title: t("about.privacyStatement"),
      url: "https://www.jiwo.cc/article/privacy-protect-v1.html?canReset=true",
    },
  ];
  const runLinks = [
    {
      title: t("about.wechatOfficial"),
      icon: "/images/about/icon_run_weixin_gongzhonghao.svg",
      url: "/images/about/image_wxgongzhonghao_qrcode.png",
    },
    {
      title: t("about.xiaohongshu"),
      icon: "/images/about/icon_run_xiaohongshu.svg",
      url: "https://www.xiaohongshu.com/user/profile/645464ff00000000290168b1?xhsshare=CopyLink&appuid=645464ff00000000290168b1&apptime=1716282708",
    },
    {
      title: t("about.douyin"),
      icon: "/images/about/icon_run_douyin.png",
      url: "https://www.douyin.com/user/MS4wLjABAAAACyK_g4xd0gUVN4ViU4FigeAYc2RFPO-sEp9RjXc6C4OWmDF9cJx9nzXBSEDw2J-C",
    },
    {
      title: t("about.jike"),
      icon: "/images/about/icon_run_jike.svg",
      url: "https://okjk.co/tHwXUq",
    },
    {
      title: t("about.weibo"),
      icon: "/images/about/icon_run_weibo.svg",
      url: "https://weibo.com/u/7960184078",
    },
  ];
  const footerRecords = [
    "ICP备案号：鄂ICP备2024037215号",
    "增值电信业务经营许可证：鄂B2-20240478",
    "模型名称：DeepSeek-R1",
    "互联网信息服务算法备案号：网信算备330110507206401230035号",
    "软著：软著登字第14519261号",
    "森奇思(武汉)科技有限公司",
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("mine.about")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col px-2.5">
          <section className="flex flex-col items-center pt-[35px]">
            <img
              src="/images/about/icon_logo_jiwo.png"
              alt={t("about.appName")}
              className="h-[72px] w-[72px] rounded-[12px] object-cover"
            />
            <h1 className="mt-[5px] text-[24px] font-medium leading-[34px] text-text">
              {t("about.appName")}
            </h1>
            <p className="text-[14px] leading-[14px] text-text-muted">v0.1.0</p>
          </section>

          <section className="mt-[22px] overflow-hidden rounded-[12px] bg-surface shadow-[var(--mine-card-shadow)]">
            {legalLinks.map((item) => (
              <AboutListItem
                key={item.title}
                title={item.title}
                onClick={() => openExternalLink(item.url)}
              />
            ))}
            <AboutListItem
              title={t("about.appReview")}
              rightLabel={t("about.appReviewTip")}
              onClick={() =>
                openExternalLink(
                  "https://apps.apple.com/app/id6480506979?action=write-review"
                )
              }
            />
            <AboutListItem
              title={t("about.contactAuthor")}
              description={t("about.contactAuthorDesc")}
              external
              onClick={() => openExternalLink("https://jiwo.cc/arkmets")}
            />
          </section>

          <footer className="mt-auto flex flex-col items-center pb-3 pt-10 text-center">
            <p className="text-[14px] leading-5 text-text-muted">
              {t("about.appName")}
            </p>
            <p className="text-[14px] leading-5 text-text-muted">
              {t("about.socialChannels")}
            </p>
            <div className="mt-[11px] flex items-center justify-center gap-2.5">
              {runLinks.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-[0.96]"
                  onClick={() => openExternalLink(item.url)}
                  aria-label={item.title}
                >
                  <img src={item.icon} alt="" className="h-9 w-9" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="mt-[42px] space-y-0.5">
              {footerRecords.map((record) => (
                <p
                  key={record}
                  className="px-2 text-[10px] leading-4 text-text-disabled"
                >
                  {record}
                </p>
              ))}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function AboutListItem({
  title,
  description,
  rightLabel,
  external,
  onClick,
}: {
  title: string;
  description?: string;
  rightLabel?: string;
  external?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[50px] w-full items-center border-b border-border-light px-3 text-left last:border-b-0 transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-5 text-text">{title}</p>
        {description && (
          <p className="mt-0.5 truncate text-xs leading-4 text-text-tertiary">
            {description}
          </p>
        )}
      </div>
      {rightLabel && (
        <span className="ml-2 max-w-[128px] truncate text-sm leading-5 text-text-tertiary">
          {rightLabel}
        </span>
      )}
      {external ? (
        <ExternalLinkIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
      ) : (
        <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
      )}
    </button>
  );
}

function MineActionCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[74px] rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] px-3 pb-2.5 pt-2.5 text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
    >
      <h2 className="text-base font-bold leading-6 text-text">{title}</h2>
      <p className="mt-px text-sm leading-5 text-text-tertiary">{description}</p>
    </button>
  );
}

function SettingsScreen({
  onBack,
  onOpenAppearance,
}: {
  onBack: () => void;
  onOpenAppearance: () => void;
}) {
  const { localeCode, resolvedLocale, t } = usePreferences();
  const [showLanguageSheet, setShowLanguageSheet] = React.useState(false);

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("settings.title")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <div className="overflow-hidden rounded-[12px] bg-surface">
          <SettingsListItem
            title={t("settings.appearance")}
            description={t("settings.appearanceDesc")}
            onClick={onOpenAppearance}
          />
          <SettingsListItem
            title={t("settings.language")}
            description={`${t("settings.current")}：${
              localeCode === ""
                ? t("settings.followSystem")
                : getLocaleDisplayName(localeCode, resolvedLocale)
            }`}
            onClick={() => setShowLanguageSheet(true)}
          />
        </div>
      </div>

      {showLanguageSheet && (
        <LanguageSheet onClose={() => setShowLanguageSheet(false)} />
      )}
    </div>
  );
}

function AppearanceStyleScreen({ onBack }: { onBack: () => void }) {
  const {
    accentColor,
    appIcon,
    isVip,
    resolvedTheme,
    setAccentColor,
    setAppIcon,
    setThemeMode,
    t,
    themeMode,
  } = usePreferences();
  const [limitMessage, setLimitMessage] = React.useState("");
  const themeOptions: Array<{ value: ThemeMode; label: string; preview: ResolvedTheme }> = [
    { value: "system", label: t("appearance.themeSystem"), preview: resolvedTheme },
    { value: "light", label: t("appearance.themeLight"), preview: "light" },
    { value: "dark", label: t("appearance.themeDark"), preview: "dark" },
  ];
  const iconOptions: Array<{ value: AppIcon; label: string; vip?: boolean }> = [
    { value: "classic", label: t("appearance.iconClassic") },
    { value: "bright", label: t("appearance.iconBright"), vip: true },
  ];

  const trySetAccentColor = (value: AccentColor) => {
    setLimitMessage("");
    setAccentColor(value);
  };

  const trySetAppIcon = (value: AppIcon, needsVip?: boolean) => {
    if (needsVip && !isVip) {
      setLimitMessage(t("appearance.freeLimit"));
      return;
    }
    setLimitMessage("");
    setAppIcon(value);
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("appearance.title")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
        <section className="rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.theme")}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setThemeMode(option.value)}
                className={cn(
                  "rounded-[10px] border px-2 pb-2 pt-2 text-left transition active:scale-[0.98]",
                  themeMode === option.value
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface"
                )}
              >
                <ThemePreview mode={option.preview} />
                <p className="mt-2 truncate text-center text-xs font-medium text-text">
                  {option.label}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.accent")}
          </h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {accentColorOptions.map((option) => {
              const active = accentColor === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => trySetAccentColor(option.key)}
                  className={cn(
                    "relative flex min-h-[74px] flex-col items-center justify-center rounded-[10px] border bg-surface transition active:scale-[0.98]",
                    active ? "border-primary" : "border-border"
                  )}
                >
                  <span
                    className="h-7 w-7 rounded-full border-[3px]"
                    style={{
                      backgroundColor: option.color,
                      borderColor: active ? option.border : "transparent",
                    }}
                  />
                  <span className="mt-2 text-xs text-text">
                    {t(`accent.${option.key}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.icon")}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {iconOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => trySetAppIcon(option.value, option.vip)}
                className={cn(
                  "relative flex min-h-[74px] items-center rounded-[10px] border bg-surface px-3 text-left transition active:scale-[0.98]",
                  appIcon === option.value ? "border-primary" : "border-border"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary">
                  <img
                    src={getJiwoLogoSrc(option.value, resolvedTheme)}
                    alt=""
                    className="w-8"
                  />
                </div>
                <span className="ml-3 text-sm font-medium text-text">{option.label}</span>
                {option.vip && !isVip && (
                  <span className="absolute right-2 top-2 rounded-full bg-vip px-1.5 py-0.5 text-[9px] leading-3 text-white">
                    {t("common.vip")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {limitMessage && (
          <p className="mt-3 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-5 text-primary">
            {limitMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function LanguageSheet({ onClose }: { onClose: () => void }) {
  const { localeCode, setLocaleCode, t } = usePreferences();

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label={t("common.done")}
      />
      <div className="relative max-h-[76%] overflow-hidden rounded-t-[22px] bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div>
            <h2 className="text-lg font-semibold leading-6 text-text">
              {t("settings.language")}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              {t("settings.languageSheetDesc")}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-primary transition hover:bg-hover-overlay active:scale-[0.98]"
            onClick={onClose}
          >
            {t("common.done")}
          </button>
        </div>

        <div className="max-h-[560px] overflow-y-auto px-2 pb-5">
          {supportedLocales.map((option) => {
            const active = option.code === localeCode;
            return (
              <button
                key={option.code || "system"}
                type="button"
                onClick={() => {
                  setLocaleCode(option.code as LocaleCode);
                  onClose();
                }}
                className="flex h-12 w-full items-center justify-between rounded-[10px] px-3 text-left transition hover:bg-bg active:scale-[0.99]"
              >
                <span className="text-[15px] leading-5 text-text">
                  {option.code === "" ? t("settings.followSystem") : option.displayName}
                </span>
                {active && (
                  <span className="text-sm font-semibold text-primary">
                    {t("common.selected")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsListItem({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[62px] w-full items-center border-b border-border-light px-3 text-left last:border-b-0 transition hover:bg-bg active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-5 text-text">{title}</p>
        <p className="mt-1 truncate text-xs leading-4 text-text-tertiary">
          {description}
        </p>
      </div>
      <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
    </button>
  );
}

function MobilePageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = usePreferences();

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
        onClick={onBack}
        aria-label={t("common.back")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>
      <h1 className="ml-1 truncate text-[17px] font-semibold leading-5 text-text">
        {title}
      </h1>
    </header>
  );
}

function ThemePreview({ mode }: { mode: ResolvedTheme }) {
  const isDark = mode === "dark";

  return (
    <div
      className={cn(
        "h-[58px] overflow-hidden rounded-[8px] border p-1.5",
        isDark ? "border-[#333] bg-[#111]" : "border-[#e6e6e6] bg-[#f6f6f6]"
      )}
    >
      <div
        className={cn(
          "h-2.5 w-10 rounded-full",
          isDark ? "bg-[#2d2d2d]" : "bg-white"
        )}
      />
      <div className="mt-2 flex gap-1">
        <span className="h-7 flex-1 rounded-[5px] bg-primary" />
        <span
          className={cn(
            "h-7 flex-1 rounded-[5px]",
            isDark ? "bg-[#242424]" : "bg-white"
          )}
        />
      </div>
    </div>
  );
}

function getTabLabel(page: PageType, t: ReturnType<typeof usePreferences>["t"]) {
  if (page === "records") return t("tabs.records");
  if (page === "insight") return t("tabs.insight");
  return t("tabs.mine");
}

function getJiwoLogoSrc(appIcon: AppIcon, resolvedTheme: ResolvedTheme) {
  if (appIcon === "bright" || resolvedTheme === "dark") {
    return "/images/logo-jiwo-green.svg";
  }
  return "/images/logo-jiwo.svg";
}

function formatRoundCount(count: number, label: string) {
  return /^[a-zA-Z]/.test(label) ? `${count} ${label}` : `${count}${label}`;
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.5 4.5H4.25A1.75 1.75 0 0 0 2.5 6.25v5.5c0 .97.78 1.75 1.75 1.75h5.5c.97 0 1.75-.78 1.75-1.75V9.5M8.5 2.5h5m0 0v5m0-5-6.25 6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendToSelfIcon({ className }: { className?: string }) {
  const { resolvedTheme } = usePreferences();
  const src =
    resolvedTheme === "dark"
      ? "/images/icon_send_to_self_sidebar_dark.svg"
      : "/images/icon_send_to_self_sidebar.svg";

  return (
    <img src={src} alt="" className={className} aria-hidden="true" />
  );
}

function OverviewEntryTag({ label }: { label: string }) {
  return (
    <span className="ml-1.5 shrink-0 rounded-[10px] bg-[var(--overview-entry-tag-bg)] px-2 py-0.5 text-[10px] font-medium leading-[14px] text-text-tertiary">
      {label}
    </span>
  );
}
