import "server-only";
import {
  chatNoticeSeen,
  chatVersion,
  getChatDirectory,
  getChatInbox,
  getWaitingAnnouncements,
} from "@db/chat";
import { getDepartments } from "@db/departments";
import type { ChatInboxRow } from "@domain/chat";
import { type ChatDirectory, chatListRows } from "@domain/chat-sync";
import type { Department } from "@domain/departments";
import type { Role } from "@domain/modules";
import { cache } from "react";
import { currentModuleSettings } from "../modules";
import { type AppWording, translator } from "../wording";
import { type ChatAccess, chatAccess } from "./chat-access";
import type { ChatContact, ChatFrame } from "./chat-provider";

/*
 * What the chat screens read, once per request however many parts ask: the
 * layout's list and the pages beside it. All of it under the person's own
 * session (RLS): their chats only, and of the business only names, photos
 * and departments.
 */

/**
 * The person's chats, with the list's version read first: a change between
 * the two moves the version past what the list shows, so the next sync
 * brings it rather than missing it.
 */
export const currentChatInbox = cache(
  async (
    businessId: string,
  ): Promise<{ version: string | null; rows: ChatInboxRow[] }> => {
    const version = await chatVersion(businessId);
    const rows = await getChatInbox(businessId);
    return { version, rows: rows === "notYet" ? [] : rows };
  },
);

/** Who the business has had, with names, photos and roles. */
export const currentChatDirectory = cache(
  (businessId: string): Promise<ChatDirectory> => getChatDirectory(businessId),
);

/** The business's departments with their people, removed ones too. */
export const currentChatDepartments = cache(
  async (businessId: string): Promise<Department[]> => {
    const found = await getDepartments(businessId);
    return found === "notYet" ? [] : found;
  },
);

/**
 * Everyone the business has had, by id, as the chat screens name them: their
 * name, photo, and who they are in a word or two (their live departments, or
 * else their role), and whether they are on the staff now.
 */
export function chatPeople(
  directory: ChatDirectory,
  departments: readonly Department[],
  wording: AppWording,
): Map<string, ChatContact & { active: boolean }> {
  const t = translator(wording, "app.team.roles");
  const roleWord = (role: Role) => t(role);
  const live = departments.filter((d) => d.archivedAt === null);
  return new Map(
    [...directory.members.entries()].map(([id, member]) => {
      const theirs = live
        .filter((d) => d.members.some((m) => m.toLowerCase() === id))
        .map((d) => d.name);
      return [
        id,
        {
          id,
          name: member.name,
          photo: member.photo,
          active: member.active,
          line:
            theirs.length > 0
              ? theirs.join(" · ")
              : member.role
                ? roleWord(member.role)
                : null,
        },
      ];
    }),
  );
}

/** People in the order lists of them read: by name. */
export function byName<T extends { name: string | null }>(people: T[]): T[] {
  return people.sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "he"),
  );
}

/**
 * What the chat layout draws and hands the screens: the list (named), the
 * people to write to, the reader's departments, and whether they still have
 * the notice to read.
 */
export async function currentChatFrame(
  access: ChatAccess,
  wording: AppWording,
): Promise<ChatFrame> {
  const businessId = access.businessId;
  const [inbox, directory, departments, noticeSeen, settings] =
    await Promise.all([
      currentChatInbox(businessId),
      currentChatDirectory(businessId),
      currentChatDepartments(businessId),
      chatNoticeSeen(businessId),
      currentModuleSettings("chat"),
    ]);
  const reader = access.userId.toLowerCase();
  const people = chatPeople(directory, departments, wording);
  return {
    business: businessId,
    businessName: access.businessName,
    readerId: reader,
    timeZone: access.timeZone,
    version: inbox.version,
    rows: chatListRows(inbox.rows, directory),
    names: Object.fromEntries(
      [...directory.members.entries()].map(([id, m]) => [id, m.name]),
    ),
    contacts: byName(
      [...people.values()]
        .filter((person) => person.active && person.id !== reader)
        .map(({ active: _active, ...contact }) => contact),
    ),
    myDepartments: departments
      .filter((d) => d.members.some((m) => m.toLowerCase() === reader))
      .map((d) => d.id.toLowerCase()),
    demo: access.demo,
    noticeSeen,
    fileDays: settings.fileDays,
    now: new Date().toISOString(),
  };
}

/** What chat brings to Today (plan §11.4): what waits for the person there. */
export type ChatHomeData = {
  /** The business the screen was drawn for: "קראתי" is bound to it. */
  business: string;
  timeZone: string;
  /** When it was read, for the times it names. */
  now: string;
  /** Conversations with messages the person hasn't read. */
  chatsWithNew: number;
  /** Pinned announcements waiting for the person's "קראתי", newest first. */
  waiting: {
    id: string;
    conversation: string;
    /** The department's group it was posted in; null for the whole team's. */
    group: string | null;
    author: string | null;
    body: string;
    createdAt: string;
  }[];
};

/**
 * Chat's part of Today, for someone on the staff of a business with chat on
 * (null for anyone else, and while viewing as someone, who reads no chat):
 * how many conversations have something new, and the announcements waiting
 * for their "קראתי". Under their own session, so only their chats.
 */
export const currentChatHome = cache(async (): Promise<ChatHomeData | null> => {
  const access = await chatAccess();
  if (!access || access.viewing) return null;
  const businessId = access.businessId;
  const [inbox, directory, waiting] = await Promise.all([
    currentChatInbox(businessId),
    currentChatDirectory(businessId),
    getWaitingAnnouncements(businessId, access.userId),
  ]);
  const departments = new Map(
    inbox.rows.flatMap((row) =>
      row.kind === "department" && row.department
        ? [[row.conversation, row.department] as const]
        : [],
    ),
  );
  return {
    business: businessId,
    timeZone: access.timeZone,
    now: new Date().toISOString(),
    chatsWithNew: inbox.rows.filter((row) => row.unread > 0).length,
    waiting: waiting.flatMap(({ conversation, message }) => {
      if (message.body === null) return [];
      const department = departments.get(conversation);
      return [
        {
          id: message.id,
          conversation,
          group: department
            ? (directory.departments.get(department.toLowerCase()) ?? null)
            : null,
          author: message.authorId
            ? (directory.members.get(message.authorId.toLowerCase())?.name ??
              null)
            : null,
          body: message.body,
          createdAt: message.createdAt,
        },
      ];
    }),
  };
});
