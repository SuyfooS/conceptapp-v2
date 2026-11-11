import "server-only";
import {
  CHAT_PAGE_SIZE,
  type ChatConversationView,
  chatSeen,
  getConversation,
  getMessages,
  getPinnedState,
  withOwnDrafts,
} from "@db/chat";
import type { Department } from "@domain/departments";
import { canSeeTeam } from "@domain/team";
import { notFound } from "next/navigation";
import { currentModuleSettings } from "../modules";
import type { AppWording } from "../wording";
import {
  announcementReadersAction,
  confirmAnnouncementAction,
  muteChatAction,
  olderChatMessagesAction,
  pinAnnouncementAction,
  readChatAction,
  removeChatMessageAction,
  restoreChatMessageAction,
  sendChatImageAction,
  sendChatMessageAction,
} from "./actions";
import {
  byName,
  chatPeople,
  currentChatDepartments,
  currentChatDirectory,
  currentChatFiles,
  currentChatPictures,
} from "./chat";
import type { ChatAccess } from "./chat-access";
import type { ConversationActions } from "./conversation-screen";
import { type ConversationBlock, ConversationView } from "./conversation-view";

/**
 * What a conversation's screen asks the server to do, each bound to the
 * business it was drawn for (a tab left open after switching is refused, never
 * written in the other one).
 */
export function boundChatActions(businessId: string): ConversationActions {
  return {
    send: sendChatMessageAction.bind(null, businessId),
    sendImage: sendChatImageAction.bind(null, businessId),
    read: readChatAction.bind(null, businessId),
    older: olderChatMessagesAction.bind(null, businessId),
    confirm: confirmAnnouncementAction.bind(null, businessId),
    pin: pinAnnouncementAction.bind(null, businessId),
    remove: removeChatMessageAction.bind(null, businessId),
    restore: restoreChatMessageAction.bind(null, businessId),
    readers: announcementReadersAction.bind(null, businessId),
  };
}

/**
 * Who is in a group now: the whole staff, or a department's people (its
 * group's moderators read it too, which its details say); nobody for a
 * private chat, whose details show the other person.
 */
export function groupMembers(
  view: Pick<ChatConversationView, "kind" | "departmentId">,
  people: ReturnType<typeof chatPeople>,
  departments: readonly Department[],
) {
  if (view.kind === "team") {
    return [...people.values()].filter((person) => person.active);
  }
  if (view.kind !== "department") return [];
  return (
    departments
      .find((d) => d.id.toLowerCase() === view.departmentId?.toLowerCase())
      ?.members.flatMap((id) => {
        const person = people.get(id.toLowerCase());
        return person?.active ? [person] : [];
      }) ?? []
  );
}

/**
 * One conversation the person reads, as both its addresses draw it: the
 * whole team's group, a department's, or their private chat with someone
 * (/chat/<id>, and /chat/with/<person> once that chat exists, so a new chat's
 * screen goes on where its first message was written). One they may not read
 * (another business's, a private chat of two others, the owner's included) is
 * the same not-found screen as one that doesn't exist. Writing is bound to
 * the business the screen was drawn for.
 */
export async function ConversationPageView({
  access,
  conversationId,
  toPerson,
  announceFirst = false,
  wording,
}: {
  access: ChatAccess;
  conversationId: string;
  /** Drawn at /chat/with/<person>: that person, the other of the two. */
  toPerson: string | null;
  /** /chat/<id>?announce=1: the composer opens as "הודעה מההנהלה". */
  announceFirst?: boolean;
  /** The business's words. */
  wording: AppWording;
}) {
  const businessId = access.businessId;
  const view = await getConversation(businessId, conversationId, access.userId);
  if (!view) notFound();

  const [
    page,
    seenUpTo,
    settings,
    directory,
    departments,
    pinned,
    files,
    latest,
  ] = await Promise.all([
    getMessages({ businessId, conversationId: view.id }).then((found) =>
      withOwnDrafts(found, access.userId),
    ),
    view.kind === "direct" ? chatSeen(view.id) : Promise.resolve(null),
    currentModuleSettings("chat"),
    currentChatDirectory(businessId),
    currentChatDepartments(businessId),
    view.kind === "direct"
      ? Promise.resolve([])
      : getPinnedState(businessId, view.id, access.userId, access.canModerate),
    currentChatFiles(businessId),
    currentChatPictures(businessId, view.id),
  ]);
  // The details' pictures, where the business takes them (C4).
  const pictures = files === "yes" ? latest : [];
  const people = chatPeople(directory, departments, wording);
  const other = view.otherPerson
    ? (people.get(view.otherPerson.toLowerCase()) ?? null)
    : null;
  const members = groupMembers(view, people, departments);
  const block: ConversationBlock | null =
    view.state === "closed"
      ? { kind: "closed" }
      : view.state === "left"
        ? { kind: "left", name: other?.name ?? null }
        : view.kind === "team" &&
            settings.teamGroupWho === "announcers" &&
            !access.canAnnounce
          ? { kind: "announcersOnly" }
          : null;

  return (
    <ConversationView
      readerId={access.userId}
      conversation={view.id}
      toPerson={toPerson}
      kind={view.kind}
      title={view.title}
      otherPerson={other}
      // Oldest first, as the screen adds to it.
      messages={[...page].reverse()}
      people={view.names}
      older={page.length >= CHAT_PAGE_SIZE}
      seenUpTo={seenUpTo}
      block={block}
      members={byName(members)}
      profileHref={
        other?.active && canSeeTeam(access.role) ? `/team/${other.id}` : null
      }
      businessName={access.businessName}
      fileDays={settings.fileDays}
      demo={access.demo}
      files={files}
      pictures={pictures}
      actions={boundChatActions(businessId)}
      pinned={pinned}
      powers={{ announce: access.canAnnounce, moderate: access.canModerate }}
      announceFirst={announceFirst && view.kind !== "direct"}
      mute={muteChatAction.bind(null, businessId)}
      wording={wording}
    />
  );
}
