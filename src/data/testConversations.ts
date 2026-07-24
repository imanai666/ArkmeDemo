export type TestIdentity = {
  id: string;
  name: string;
  note: string;
  avatarLabel: string;
  color: string;
  createdAt: number;
};

export type TestMessageSender = "identity" | "demo";
export type TestConversationType = "private" | "group";

export type TestGroup = {
  id: string;
  name: string;
  note: string;
  avatarLabel: string;
  color: string;
  memberIdentityIds: string[];
  createdAt: number;
};

export type TestMessage = {
  id: string;
  conversationId: string;
  conversationType: TestConversationType;
  identityId: string;
  text: string;
  sentAt: number;
  sender: TestMessageSender;
};

export type TestReadState = Record<string, number>;

export type TestGroupJoinMode = "invite" | "approval" | "public";

export type TestGroupJoinRequest = {
  id: string;
  name: string;
  avatarLabel: string;
  color: string;
  message: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
};

export type TestChildTopic = {
  id: string;
  title: string;
  createdAt: number;
};

export type TestGroupSettings = {
  notificationsEnabled: boolean;
  hideRecordsOnHome: boolean;
  privacyLocked: boolean;
  selfNickname: string;
  joinMode: TestGroupJoinMode;
  joinRequests: TestGroupJoinRequest[];
  childTopics: TestChildTopic[];
};

export const testIdentitiesStorageKey = "arkme-demo.testIdentities";
export const testGroupsStorageKey = "arkme-demo.testGroups";
export const testMessagesStorageKey = "arkme-demo.testMessages";
export const testReadStateStorageKey = "arkme-demo.testReadState";
export const testGroupSettingsStorageKey = "arkme-demo.testGroupSettings";
export const testConversationStorageEvent = "arkme-demo:test-conversations-updated";
export const demoSenderIdentityId = "demo";

const identityColors = [
  "#09B83E",
  "#0E9DEC",
  "#8363FF",
  "#E04DAE",
  "#F59E0B",
  "#14B8A6",
];

const candidateTestGroupId = "group-candidate-test";

const defaultIdentities: TestIdentity[] = [
  {
    id: "identity-interviewer",
    name: "面试官",
    note: "用于模拟私聊追问和反馈",
    avatarLabel: "面",
    color: identityColors[0],
    createdAt: 1760000000000,
  },
  {
    id: "identity-user-a",
    name: "用户A",
    note: "用于模拟普通用户私聊",
    avatarLabel: "A",
    color: identityColors[1],
    createdAt: 1760000001000,
  },
  {
    id: "identity-user-b",
    name: "用户B",
    note: "用于模拟群聊协作者添加",
    avatarLabel: "B",
    color: identityColors[3],
    createdAt: 1760000001500,
  },
  ...Array.from({ length: 98 }, (_, index): TestIdentity => {
    const memberNumber = String(index + 1).padStart(3, "0");
    return {
      id: `identity-group-member-${memberNumber}`,
      name: `群成员${memberNumber}`,
      note: "候选测试群模拟成员",
      avatarLabel: memberNumber.slice(-2),
      color: identityColors[(index + 2) % identityColors.length],
      createdAt: 1760000002000 + index,
    };
  }),
];

const candidateTestGroupMemberIds = [
  "identity-interviewer",
  "identity-user-a",
  ...defaultIdentities
    .filter((identity) => identity.id.startsWith("identity-group-member-"))
    .map((identity) => identity.id),
];

const defaultGroups: TestGroup[] = [
  {
    id: candidateTestGroupId,
    name: "候选测试群",
    note: "用于模拟多人群聊测试",
    avatarLabel: "群",
    color: identityColors[2],
    memberIdentityIds: candidateTestGroupMemberIds,
    createdAt: 1760000002000,
  },
];

function readJsonValue(key: string): unknown {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJsonValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory UI usable if localStorage is unavailable.
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildAvatarLabel(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return "测";
  return Array.from(trimmedName)[0].toUpperCase();
}

export function pickIdentityColor(index: number) {
  return identityColors[index % identityColors.length];
}

export function getPrivateConversationId(identityId: string) {
  return `private:${identityId}`;
}

function normalizeIdentity(value: unknown, index: number): TestIdentity | null {
  if (!value || typeof value !== "object") return null;

  const identity = value as Partial<TestIdentity>;
  const name = normalizeText(identity.name);
  if (!name) return null;

  const id = normalizeText(identity.id) || `identity-${index}`;
  const avatarLabel = normalizeText(identity.avatarLabel) || buildAvatarLabel(name);
  const color = normalizeText(identity.color) || pickIdentityColor(index);

  return {
    id,
    name,
    note: normalizeText(identity.note),
    avatarLabel: Array.from(avatarLabel).slice(0, 2).join(""),
    color,
    createdAt: normalizeTimestamp(identity.createdAt, Date.now() + index),
  };
}

function normalizeMessage(value: unknown, index: number): TestMessage | null {
  if (!value || typeof value !== "object") return null;

  const message = value as Partial<TestMessage>;
  const identityId =
    normalizeText(message.identityId) ||
    (message.sender === "demo" ? demoSenderIdentityId : "");
  const text = normalizeText(message.text);
  if (!identityId || !text) return null;

  const conversationType: TestConversationType =
    message.conversationType === "group" ? "group" : "private";
  const conversationId =
    normalizeText(message.conversationId) ||
    (conversationType === "group"
      ? normalizeText(message.identityId)
      : getPrivateConversationId(identityId));

  return {
    id: normalizeText(message.id) || `message-${index}`,
    conversationId,
    conversationType,
    identityId,
    text,
    sentAt: normalizeTimestamp(message.sentAt, Date.now() + index),
    sender: message.sender === "demo" ? "demo" : "identity",
  };
}

function normalizeGroup(value: unknown, index: number): TestGroup | null {
  if (!value || typeof value !== "object") return null;

  const group = value as Partial<TestGroup>;
  const name = normalizeText(group.name);
  if (!name) return null;

  const id = normalizeText(group.id) || `group-${index}`;
  const avatarLabel = normalizeText(group.avatarLabel) || buildAvatarLabel(name);
  const color = normalizeText(group.color) || pickIdentityColor(index + 2);
  const memberIdentityIds = Array.isArray(group.memberIdentityIds)
    ? group.memberIdentityIds.map(normalizeText).filter(Boolean)
    : [];

  return {
    id,
    name,
    note: normalizeText(group.note),
    avatarLabel: Array.from(avatarLabel).slice(0, 2).join(""),
    color,
    memberIdentityIds,
    createdAt: normalizeTimestamp(group.createdAt, Date.now() + index),
  };
}

function createDefaultGroupSettings(): TestGroupSettings {
  return {
    notificationsEnabled: true,
    hideRecordsOnHome: false,
    privacyLocked: false,
    selfNickname: "",
    joinMode: "approval",
    joinRequests: [
      {
        id: "join-request-demo-1",
        name: "陈晓宇",
        avatarLabel: "陈",
        color: identityColors[4],
        message: "想加入群聊，一起整理面试要点。",
        createdAt: 1760000003000,
        status: "pending",
      },
      {
        id: "join-request-demo-2",
        name: "林曼",
        avatarLabel: "林",
        color: identityColors[5],
        message: "朋友推荐我来申请加入。",
        createdAt: 1760000004000,
        status: "pending",
      },
    ],
    childTopics: [],
  };
}

function normalizeGroupSettings(value: unknown): TestGroupSettings {
  const defaults = createDefaultGroupSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;

  const settings = value as Partial<TestGroupSettings>;
  const joinRequests = Array.isArray(settings.joinRequests)
    ? settings.joinRequests.flatMap((request, index) => {
        if (!request || typeof request !== "object") return [];
        const candidate = request as Partial<TestGroupJoinRequest>;
        const name = normalizeText(candidate.name);
        if (!name) return [];
        const status: TestGroupJoinRequest["status"] =
          candidate.status === "approved" || candidate.status === "rejected"
            ? candidate.status
            : "pending";
        return [{
          id: normalizeText(candidate.id) || `join-request-${index}`,
          name,
          avatarLabel: normalizeText(candidate.avatarLabel) || buildAvatarLabel(name),
          color: normalizeText(candidate.color) || pickIdentityColor(index + 3),
          message: normalizeText(candidate.message),
          createdAt: normalizeTimestamp(candidate.createdAt, Date.now() + index),
          status,
        }];
      })
    : defaults.joinRequests;
  const childTopics = Array.isArray(settings.childTopics)
    ? settings.childTopics.flatMap((topic, index) => {
        if (!topic || typeof topic !== "object") return [];
        const candidate = topic as Partial<TestChildTopic>;
        const title = normalizeText(candidate.title);
        if (!title) return [];
        return [{
          id: normalizeText(candidate.id) || `child-topic-${index}`,
          title,
          createdAt: normalizeTimestamp(candidate.createdAt, Date.now() + index),
        }];
      })
    : [];

  return {
    notificationsEnabled:
      typeof settings.notificationsEnabled === "boolean"
        ? settings.notificationsEnabled
        : defaults.notificationsEnabled,
    hideRecordsOnHome:
      typeof settings.hideRecordsOnHome === "boolean"
        ? settings.hideRecordsOnHome
        : defaults.hideRecordsOnHome,
    privacyLocked:
      typeof settings.privacyLocked === "boolean"
        ? settings.privacyLocked
        : defaults.privacyLocked,
    selfNickname: normalizeText(settings.selfNickname),
    joinMode:
      settings.joinMode === "invite" || settings.joinMode === "public"
        ? settings.joinMode
        : "approval",
    joinRequests,
    childTopics,
  };
}

export function getInitialTestIdentities() {
  const parsedValue = readJsonValue(testIdentitiesStorageKey);
  if (!Array.isArray(parsedValue)) return defaultIdentities;

  const identities = parsedValue
    .map(normalizeIdentity)
    .filter((identity): identity is TestIdentity => Boolean(identity));

  if (identities.length === 0) return defaultIdentities;

  // Add newly introduced built-in demo identities without overwriting user-created entries.
  return [
    ...identities,
    ...defaultIdentities.filter(
      (defaultIdentity) => !identities.some((identity) => identity.id === defaultIdentity.id)
    ),
  ];
}

export function getInitialTestGroups() {
  const parsedValue = readJsonValue(testGroupsStorageKey);
  if (!Array.isArray(parsedValue)) return defaultGroups;

  const groups = parsedValue
    .map(normalizeGroup)
    .filter((group): group is TestGroup => Boolean(group));

  if (groups.length === 0) return defaultGroups;

  return groups.map((group) => {
    const isLegacyCandidateTestGroup =
      group.id === candidateTestGroupId &&
      group.memberIdentityIds.length === 2 &&
      group.memberIdentityIds.includes("identity-interviewer") &&
      group.memberIdentityIds.includes("identity-user-a");

    return isLegacyCandidateTestGroup
      ? { ...group, memberIdentityIds: candidateTestGroupMemberIds }
      : group;
  });
}

export function getInitialTestMessages() {
  const parsedValue = readJsonValue(testMessagesStorageKey);
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map(normalizeMessage)
    .filter((message): message is TestMessage => Boolean(message));
}

export function getInitialTestReadState() {
  const parsedValue = readJsonValue(testReadStateStorageKey);
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsedValue)
      .filter((entry): entry is [string, number] => {
        const [, value] = entry;
        return typeof value === "number" && Number.isFinite(value);
      })
  );
}

export function getInitialTestGroupSettings(groupId: string) {
  const parsedValue = readJsonValue(testGroupSettingsStorageKey);
  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return createDefaultGroupSettings();
  }
  return normalizeGroupSettings((parsedValue as Record<string, unknown>)[groupId]);
}

export function persistTestIdentities(identities: TestIdentity[]) {
  writeJsonValue(testIdentitiesStorageKey, identities);
  notifyTestConversationChange();
}

export function persistTestGroups(groups: TestGroup[]) {
  writeJsonValue(testGroupsStorageKey, groups);
  notifyTestConversationChange();
}

export function persistTestMessages(messages: TestMessage[]) {
  writeJsonValue(testMessagesStorageKey, messages);
  notifyTestConversationChange();
}

export function persistTestReadState(readState: TestReadState) {
  writeJsonValue(testReadStateStorageKey, readState);
}

export function persistTestGroupSettings(groupId: string, settings: TestGroupSettings) {
  const parsedValue = readJsonValue(testGroupSettingsStorageKey);
  const storedSettings =
    parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? parsedValue as Record<string, TestGroupSettings>
      : {};
  writeJsonValue(testGroupSettingsStorageKey, {
    ...storedSettings,
    [groupId]: settings,
  });
  notifyTestConversationChange();
}

export function notifyTestConversationChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(testConversationStorageEvent));
}

export function createTestIdentity(name: string, note: string, index: number): TestIdentity {
  const timestamp = Date.now();
  return {
    id: `identity-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    note: note.trim(),
    avatarLabel: buildAvatarLabel(name),
    color: pickIdentityColor(index),
    createdAt: timestamp,
  };
}

export function createTestMessage(identityId: string, text: string): TestMessage {
  const timestamp = Date.now();
  return {
    id: `message-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId: getPrivateConversationId(identityId),
    conversationType: "private",
    identityId,
    text: text.trim(),
    sentAt: timestamp,
    sender: "identity",
  };
}

export function createTestGroup(name: string, note: string, memberIdentityIds: string[], index: number): TestGroup {
  const timestamp = Date.now();
  return {
    id: `group-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    note: note.trim(),
    avatarLabel: buildAvatarLabel(name),
    color: pickIdentityColor(index + 2),
    memberIdentityIds,
    createdAt: timestamp,
  };
}

export function createTestGroupMessage(groupId: string, identityId: string, text: string): TestMessage {
  const timestamp = Date.now();
  return {
    id: `group-message-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId: groupId,
    conversationType: "group",
    identityId,
    text: text.trim(),
    sentAt: timestamp,
    sender: "identity",
  };
}

export function createTestReplyMessage(
  conversationId: string,
  text: string,
  conversationType: TestConversationType = "private",
  identityId: string = demoSenderIdentityId
): TestMessage {
  const timestamp = Date.now();
  return {
    id: `reply-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId,
    conversationType,
    identityId,
    text: text.trim(),
    sentAt: timestamp,
    sender: "demo",
  };
}
