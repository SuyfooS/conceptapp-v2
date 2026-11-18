import { chatPreview, sortInbox } from "@domain/chat";
import { chatWhen } from "@domain/chat-days";
import { shownFileName } from "@domain/chat-files";
import { Avatar } from "@ui/avatar";
import { ChatGroupMark, ChatRow, UNREAD_MOST } from "@ui/chat-row";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageHeader, PageSection } from "@ui/page";
import { VisibilityNote } from "@ui/visibility-note";
import { Building, Megaphone, MessageCircle, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { firstName } from "../shell/data";
import {
  CHAT_DEMO_NOW,
  CHAT_DEMO_READER,
  CHAT_DEMO_ZONE,
  type ChatDemoConversation,
  chatDemoConversations,
  chatDemoPeople,
  chatDemoPerson,
  chatDemoShortDate,
} from "./data";
import { NewMessage } from "./new-message";

export const chatDemoHref = (id: string) => `/design/chat/${id}`;

/** A conversation's mark: the person's face, or the group's. */
export function ChatDemoMark({ chat }: { chat: ChatDemoConversation }) {
  if (chat.kind === "direct") {
    const person = chatDemoPerson(chat.person ?? "");
    return <Avatar name={person?.name ?? ""} photo={person?.photo} />;
  }
  return (
    <ChatGroupMark icon={chat.kind === "team" ? <Building /> : <Users />} />
  );
}

/** Everyone else on the team, for the new-message sheet. */
function sheetPeople() {
  return chatDemoPeople
    .filter((p) => p.id !== CHAT_DEMO_READER)
    .map((p) => ({ ...p, href: chatDemoHref(p.id) }));
}

/**
 * Shiran's chat list: the way to every announcement from management (C3),
 * saying how many wait for her "קראתי", the whole team's group and her
 * departments, the other departments she reads as management, then her
 * private chats by their last message. On a phone it is the screen; from
 * tablet up it stays beside the conversation (`current`, "announcements"
 * for /design/chat/announcements), with its title one level down.
 */
export function ChatList({
  current,
  heading,
  demo = false,
  empty = false,
}: {
  current?: string;
  heading: "h1" | "h2";
  /** In a demo business: who sees what is written, and for how long. */
  demo?: boolean;
  /** A business where nobody wrote yet. */
  empty?: boolean;
}) {
  const t = useTranslations("app.chat");
  const tModules = useTranslations("modules");
  const now = new Date(CHAT_DEMO_NOW);

  function row(chat: ChatDemoConversation): ReactNode {
    const last = chat.messages.at(-1);
    const author = last ? chatDemoPerson(last.author) : null;
    const said =
      last && !last.removedBy && last.pdf
        ? t("list.pdfWith", {
            caption: chatPreview(last.body ?? shownFileName(last.pdf.name)),
          })
        : last && !last.removedBy && (last.photo || last.fileGone)
          ? last.body
            ? t("list.photoWith", { caption: chatPreview(last.body) })
            : t("list.photo")
          : last?.body
            ? chatPreview(last.body)
            : t("message.removed");
    const preview = !last
      ? t("list.noMessages")
      : last.author === CHAT_DEMO_READER
        ? t("list.fromYou", { preview: said })
        : chat.kind === "direct"
          ? said
          : t("list.from", {
              name: firstName(author?.name ?? ""),
              preview: said,
            });
    const when = last ? chatWhen(last.at, now, CHAT_DEMO_ZONE) : null;
    const time = !when
      ? null
      : when.kind === "time"
        ? when.time
        : when.kind === "yesterday"
          ? t("day.yesterday")
          : chatDemoShortDate(when.day);
    const title =
      chat.kind === "team"
        ? t("list.team")
        : chat.kind === "department"
          ? chat.name
          : chatDemoPerson(chat.person ?? "")?.name;
    return (
      <ChatRow
        key={chat.id}
        href={chatDemoHref(chat.id)}
        current={chat.id === current}
        leading={<ChatDemoMark chat={chat} />}
        title={title}
        preview={preview}
        time={time && last ? { label: time, at: last.at } : null}
        unread={
          chat.unread > 0
            ? {
                count: chat.unread,
                // The badge stops at "99+", and the words say the number shown.
                label:
                  chat.unread > UNREAD_MOST
                    ? t("list.unreadMore", { count: UNREAD_MOST })
                    : t("list.unread", { count: chat.unread }),
              }
            : null
        }
        muted={chat.muted ? t("list.muted") : null}
        waiting={chat.pinned ? t("list.waiting") : null}
      />
    );
  }

  const inbox = (rows: ChatDemoConversation[]) =>
    sortInbox(
      rows.map((chat) => ({
        ...chat,
        conversation: chat.id,
        lastAt: chat.messages.at(-1)?.at ?? null,
        pinnedWaiting: chat.pinned ? 1 : 0,
      })),
    );
  const team = chatDemoConversations.filter((c) => c.kind === "team");
  const departments = chatDemoConversations.filter(
    (c) => c.kind === "department",
  );
  const groups = [...team, ...inbox(departments.filter((c) => c.mine))];
  const more = inbox(departments.filter((c) => !c.mine));
  const direct = inbox(
    chatDemoConversations.filter(
      (c) => c.kind === "direct" && c.messages.length > 0,
    ),
  );

  const title = tModules("chat.name");
  const toConfirm = chatDemoConversations.filter((c) => c.pinned).length;
  const action = <NewMessage people={sheetPeople()} quiet={heading !== "h1"} />;
  const level = heading === "h1" ? 2 : 3;

  return (
    <div className="flex flex-col gap-6">
      {heading === "h1" ? (
        <PageHeader title={title} actions={action} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 className="font-bold text-2xl">{title}</h2>
          {action}
        </div>
      )}
      {demo ? <VisibilityNote>{t("list.demoNote")}</VisibilityNote> : null}
      {empty ? null : (
        <ListGroup>
          <ListRow
            href="/design/chat/announcements"
            current={current === "announcements"}
            leading={<Megaphone />}
            title={t("list.announcements")}
            subtitle={
              toConfirm > 0
                ? t("list.announcementsWaiting", { count: toConfirm })
                : t("list.announcementsAll")
            }
          />
        </ListGroup>
      )}
      {empty ? (
        <EmptyState
          headingLevel="h2"
          icon={<MessageCircle />}
          title={t("list.empty.title")}
          body={t("list.empty.body")}
        />
      ) : (
        <>
          <PageSection title={t("list.groups")} level={level}>
            <ListGroup>{groups.map(row)}</ListGroup>
          </PageSection>
          {more.length > 0 ? (
            <PageSection title={t("list.moreDepartments")} level={level}>
              <ListGroup>{more.map(row)}</ListGroup>
            </PageSection>
          ) : null}
          <PageSection title={t("list.people")} level={level}>
            <ListGroup>{direct.map(row)}</ListGroup>
          </PageSection>
        </>
      )}
    </div>
  );
}
