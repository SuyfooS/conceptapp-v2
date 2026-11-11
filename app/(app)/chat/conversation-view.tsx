import type { ChatKind, ChatTitle } from "@domain/chat";
import type {
  ChatSyncMessage,
  ChatSyncPerson,
  PinnedAnnouncement,
} from "@domain/chat-sync";
import { ChatGroupMark } from "@ui/chat-row";
import { ImmersiveScreen } from "@ui/immersive-screen";
import { PersonAvatar } from "@ui/person-row";
import { Building, Users } from "lucide-react";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import {
  ChatDetails,
  ChatDetailsBody,
  type ChatDetailsProps,
  type DetailsPerson,
} from "./chat-details";
import { chatTitleText } from "./chat-paths";
import type { ChatActionResult } from "./chat-types";
import {
  type ConversationActions,
  type ConversationPowers,
  ConversationScreen,
} from "./conversation-screen";

/** Why nobody may write in a conversation now, when so. */
export type ConversationBlock =
  | { kind: "closed" }
  /** The other person of a private chat left the team. */
  | { kind: "left"; name: string | null }
  /** The whole team's group, where only management writes (`teamGroupWho`). */
  | { kind: "announcersOnly" };

/**
 * A conversation's screen as the server draws it: its title and who sees it
 * in the business's words (in a demo business, that whoever comes in reads
 * it), its face, why nobody may write in it when so, and on desktop the
 * details column beside it (`xl:contents` puts the two in the chat layout's
 * columns). The phone's tab bar steps aside for it (ImmersiveScreen). The
 * conversation itself is ConversationScreen's, one reader's: keyed by them,
 * so nothing of it stays for someone else signing in on this browser, and by
 * its address, so a new private chat's screen stays the same one once its
 * first message made it.
 */
export function ConversationView({
  readerId,
  conversation,
  toPerson,
  kind,
  title: chatTitle,
  otherPerson,
  messages,
  people,
  older,
  seenUpTo,
  block,
  members,
  profileHref,
  businessName,
  fileDays,
  demo,
  actions,
  pinned,
  powers,
  announceFirst,
  mute,
  wording,
}: {
  /** Who reads it: the signed-in person. */
  readerId: string;
  conversation: string | null;
  /** Drawn at /chat/with/<person>: that person. */
  toPerson: string | null;
  kind: ChatKind;
  title: ChatTitle;
  /** A private chat: the other person, with what the business calls them. */
  otherPerson: DetailsPerson | null;
  messages: ChatSyncMessage[];
  people: ChatSyncPerson[];
  older: boolean;
  seenUpTo: string | null;
  block: ConversationBlock | null;
  members: DetailsPerson[];
  profileHref: string | null;
  businessName: string;
  fileDays: number;
  /** A demo business: anyone at its door reads every chat. */
  demo: boolean;
  actions: ConversationActions;
  /** Its pinned announcements, newest first, as the reader sees them (C3). */
  pinned: PinnedAnnouncement[];
  powers: ConversationPowers;
  /** The composer opens as "הודעה מההנהלה" (/chat/<id>?announce=1). */
  announceFirst: boolean;
  /** "בלי התראות מהשיחה הזאת", bound to the business. */
  mute: (conversation: string, muted: boolean) => Promise<ChatActionResult>;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.chat");
  const title = chatTitleText(chatTitle, otherPerson?.name ?? null, {
    team: t("list.team"),
    department: t("list.department"),
    noName: t("list.noName"),
    former: t("list.former"),
  });
  // Who sees it. In a demo business anyone at the door may come in as
  // anyone, so "only the two of you" would not be true there.
  const subtitle = demo
    ? t("list.demoNote")
    : kind === "team"
      ? t("conversation.teamNote")
      : kind === "department"
        ? t("conversation.departmentNote")
        : t("conversation.privateNote");
  const screenKey = `${readerId.toLowerCase()}:${
    toPerson ? `with:${toPerson.toLowerCase()}` : (conversation ?? "")
  }`;
  const leading =
    kind === "direct" ? (
      <PersonAvatar
        name={otherPerson?.name ?? null}
        photo={otherPerson?.photo}
      />
    ) : (
      <ChatGroupMark icon={kind === "team" ? <Building /> : <Users />} />
    );
  const blocked: ReactNode = !block
    ? null
    : block.kind === "closed"
      ? t("conversation.closed")
      : block.kind === "announcersOnly"
        ? t("conversation.announcersOnly")
        : block.name
          ? t.rich("conversation.left", {
              name: block.name,
              b: (chunks) => <b className="font-semibold">{chunks}</b>,
            })
          : t("conversation.leftNoName");

  const details: ChatDetailsProps = {
    conversation,
    kind,
    title,
    subtitle,
    person: otherPerson,
    profileHref,
    members,
    businessName,
    fileDays,
    demo,
    mute,
    wording,
  };

  return (
    <div className="xl:contents">
      <ImmersiveScreen />
      <ConversationScreen
        key={screenKey}
        conversation={conversation}
        toPerson={toPerson}
        kind={kind}
        title={title}
        subtitle={subtitle}
        leading={leading}
        messages={messages}
        people={people}
        older={older}
        seenUpTo={seenUpTo}
        blocked={blocked}
        empty={
          kind === "direct"
            ? t("conversation.emptyPrivate")
            : t("conversation.emptyGroup")
        }
        actions={actions}
        pinned={pinned}
        powers={powers}
        closed={block?.kind === "closed"}
        announceFirst={announceFirst}
        details={
          conversation ? (
            <ChatDetailsBody {...details} headingLevel="h2" inSheet />
          ) : null
        }
      />
      <ChatDetails {...details} />
    </div>
  );
}
