import "server-only";
import {
  CHAT_PAGE_SIZE,
  chatSeen,
  getConversation,
  getMessages,
  withOwnDrafts,
} from "@db/chat";
import { canSeeTeam } from "@domain/team";
import { notFound } from "next/navigation";
import { currentModuleSettings } from "../modules";
import type { AppWording } from "../wording";
import {
  olderChatMessagesAction,
  readChatAction,
  sendChatMessageAction,
} from "./actions";
import {
  byName,
  chatPeople,
  currentChatDepartments,
  currentChatDirectory,
} from "./chat";
import type { ChatAccess } from "./chat-access";
import { type ConversationBlock, ConversationView } from "./conversation-view";

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
  wording,
}: {
  access: ChatAccess;
  conversationId: string;
  /** Drawn at /chat/with/<person>: that person, the other of the two. */
  toPerson: string | null;
  /** The business's words. */
  wording: AppWording;
}) {
  const businessId = access.businessId;
  const view = await getConversation(businessId, conversationId, access.userId);
  if (!view) notFound();

  const [page, seenUpTo, settings, directory, departments] = await Promise.all([
    getMessages({ businessId, conversationId: view.id }).then((found) =>
      withOwnDrafts(found, access.userId),
    ),
    view.kind === "direct" ? chatSeen(view.id) : Promise.resolve(null),
    currentModuleSettings("chat"),
    currentChatDirectory(businessId),
    currentChatDepartments(businessId),
  ]);
  const people = chatPeople(directory, departments, wording);
  const other = view.otherPerson
    ? (people.get(view.otherPerson.toLowerCase()) ?? null)
    : null;
  // Who is in the group now: the whole staff, or a department's people (its
  // group's moderators read it too, which its details say).
  const members =
    view.kind === "team"
      ? [...people.values()].filter((person) => person.active)
      : view.kind === "department"
        ? (departments
            .find(
              (d) => d.id.toLowerCase() === view.departmentId?.toLowerCase(),
            )
            ?.members.flatMap((id) => {
              const person = people.get(id.toLowerCase());
              return person?.active ? [person] : [];
            }) ?? [])
        : [];
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
      actions={{
        send: sendChatMessageAction.bind(null, businessId),
        read: readChatAction.bind(null, businessId),
        older: olderChatMessagesAction.bind(null, businessId),
      }}
      wording={wording}
    />
  );
}
