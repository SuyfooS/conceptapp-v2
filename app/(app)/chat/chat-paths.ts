import { isUuid } from "@domain/activity";
import type { ChatTitle } from "@domain/chat";

/**
 * Chat's addresses, and the words a chat is called by, for the server and
 * the browser alike: a plain file, so a server view never gets a client
 * reference for a value (tooling/client-values.test.ts).
 */
export const chatPaths = {
  list: "/chat",
  conversation: (id: string) => `/chat/${id}`,
  /** Someone's private chat, opened by its first message. */
  withPerson: (id: string) => `/chat/with/${id}`,
} as const;

/** The conversation an address of chat shows, or null. */
export function conversationOfPath(pathname: string): string | null {
  const id = /^\/chat\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  return id && isUuid(id) ? id.toLowerCase() : null;
}

/** The person a new private chat's address is for, or null. */
export function personOfPath(pathname: string): string | null {
  const id = /^\/chat\/with\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  return id && isUuid(id) ? id.toLowerCase() : null;
}

/** The words a chat's title is made of, in the business's own words. */
export type ChatTitleWords = {
  /** "כל הצוות". */
  team: string;
  /** A department nobody can name any more. */
  department: string;
  /** Someone on the team whose name nobody wrote down. */
  noName: string;
  /** Someone who left the team, when their name isn't known. */
  former: string;
};

/**
 * What a chat is called: the whole team, its department, or the other
 * person, by the name the business knows them by (`name`, which a former
 * colleague keeps too).
 */
export function chatTitleText(
  title: ChatTitle,
  name: string | null,
  words: ChatTitleWords,
): string {
  switch (title.kind) {
    case "team":
      return words.team;
    case "department":
      return title.name ?? words.department;
    case "direct":
      if (name) return name;
      return title.person.kind === "member" ? words.noName : words.former;
    default: {
      const unhandled: never = title;
      return unhandled;
    }
  }
}
