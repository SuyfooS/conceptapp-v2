"use client";

import { dateIn } from "@domain/availability";
import { chatPreview } from "@domain/chat";
import { announcementsWaiting } from "@domain/chat-announce";
import { chatShortDate, chatWhen } from "@domain/chat-days";
import { shownFileName } from "@domain/chat-files";
import type { ChatListRow } from "@domain/chat-sync";
import { firstNameOf } from "@domain/people";
import { ChatGroupMark, ChatRow } from "@ui/chat-row";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageHeader, PageSection } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import { VisibilityNote } from "@ui/visibility-note";
import { Building, Megaphone, MessageCircle, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { focusLost } from "./chat-focus";
import { ChatNotice } from "./chat-notice";
import {
  chatPaths,
  chatTitleText,
  conversationOfPath,
  personOfPath,
} from "./chat-paths";
import { useChat } from "./chat-provider";
import { NewMessage } from "./new-message";

/**
 * The list beside the conversation from tablet up: it stays put while the
 * conversation scrolls, and scrolls itself when longer than the screen (above
 * the floating tab bar on tablets). A little room at its sides and foot keeps
 * its cards' shadows.
 */
const paneClass =
  "md:sticky md:top-8 md:-mx-1 md:max-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] md:overflow-y-auto md:px-1 md:pb-4 xl:max-h-[calc(100dvh-4rem)]";

/**
 * The chat list (plan §11.1): the whole team's group and the reader's
 * departments, the other departments a moderator reads, then private chats by
 * their last message; what waits for the reader on each row. On a phone it is
 * the /chat screen itself; from tablet up it stays beside every chat screen,
 * with the conversation open marked, and its title a level down. The first
 * time, the notice of who sees what comes before it; in a demo business, a
 * line that everyone who comes in reads it. Back on a phone's list from a
 * conversation, the keyboard's focus is on that conversation's row again.
 */
export function InboxPane() {
  const t = useTranslations("app.chat");
  const tModules = useTranslations("modules");
  const chat = useChat();
  const pathname = usePathname();
  const atList = pathname === chatPaths.list;
  const current = conversationOfPath(pathname);
  const withPerson = personOfPath(pathname);
  const now = new Date(chat.now);
  const today = dateIn(now, chat.timeZone);
  const mine = new Set(chat.myDepartments);
  const pane = useRef<HTMLDivElement>(null);
  const firstHeading = useRef<HTMLHeadingElement>(null);

  // Back on the list from a conversation (a phone's back, or the browser's),
  // the focus went with the screen it was on: it goes to that chat's row.
  const lastPath = useRef(pathname);
  useEffect(() => {
    const left = lastPath.current;
    lastPath.current = pathname;
    if (left === pathname || pathname !== chatPaths.list || !focusLost()) {
      return;
    }
    const person = personOfPath(left);
    const conversation =
      conversationOfPath(left) ??
      (person
        ? chat.rows.find(
            (row) => row.kind === "direct" && row.otherPerson === person,
          )?.conversation
        : null);
    if (!conversation) return;
    pane.current
      ?.querySelector<HTMLAnchorElement>(
        `a[href="${chatPaths.conversation(conversation)}"]`,
      )
      ?.focus({ preventScroll: true });
  }, [pathname, chat.rows]);

  const nameOf = (id: string | null) => (id ? (chat.names[id] ?? null) : null);
  const titleWords = {
    team: t("list.team"),
    department: t("list.department"),
    noName: t("list.noName"),
    former: t("list.former"),
  };

  function row(item: ChatListRow) {
    // A picture says so, with what was written with it (C4); a PDF too, or
    // else with its name (C5); a removed message has neither words nor a
    // file.
    const said =
      item.lastFileKind === "image"
        ? item.lastPreview !== null
          ? t("list.photoWith", { caption: chatPreview(item.lastPreview) })
          : t("list.photo")
        : item.lastFileKind === "pdf"
          ? item.lastPreview !== null
            ? t("list.pdfWith", { caption: chatPreview(item.lastPreview) })
            : item.lastFileName
              ? t("list.pdfWith", {
                  caption: chatPreview(shownFileName(item.lastFileName)),
                })
              : t("list.pdf")
          : item.lastPreview !== null
            ? chatPreview(item.lastPreview)
            : t("message.removed");
    const author = nameOf(item.lastAuthor);
    const preview = !item.lastAt
      ? t("list.noMessages")
      : item.lastAuthor === chat.readerId
        ? t("list.fromYou", { preview: said })
        : item.kind === "direct" || !author
          ? said
          : t("list.from", { name: firstNameOf(author), preview: said });
    const when = item.lastAt ? chatWhen(item.lastAt, now, chat.timeZone) : null;
    const time = !when
      ? null
      : when.kind === "time"
        ? when.time
        : when.kind === "yesterday"
          ? t("day.yesterday")
          : chatShortDate(when.day, today);
    const other = item.kind === "direct" ? nameOf(item.otherPerson) : null;
    return (
      <ChatRow
        key={item.conversation}
        href={chatPaths.conversation(item.conversation)}
        current={
          item.conversation === current ||
          (withPerson !== null && item.otherPerson === withPerson)
        }
        leading={
          item.kind === "direct" ? (
            <PersonAvatar name={other} photo={item.photo} />
          ) : (
            <ChatGroupMark
              icon={item.kind === "team" ? <Building /> : <Users />}
            />
          )
        }
        title={chatTitleText(item.title, other, titleWords)}
        preview={preview}
        time={time && item.lastAt ? { label: time, at: item.lastAt } : null}
        unread={
          item.unread > 0
            ? {
                count: item.unread,
                label: t("list.unread", { count: item.unread }),
              }
            : null
        }
        muted={item.muted ? t("list.muted") : null}
        // An announcement here waits for the reader's "קראתי" (C3).
        waiting={item.pinnedWaiting > 0 ? t("list.waiting") : null}
      />
    );
  }

  const team = chat.rows.filter((r) => r.kind === "team");
  const departments = chat.rows.filter((r) => r.kind === "department");
  const own = departments.filter((r) => r.department && mine.has(r.department));
  const more = departments.filter(
    (r) => !(r.department && mine.has(r.department)),
  );
  const groups = [...team, ...own];
  const direct = chat.rows.filter((r) => r.kind === "direct");
  const quiet = chat.rows.every((r) => !r.lastAt);
  const announcementsNow = pathname === chatPaths.announcements;
  const toConfirm = announcementsWaiting(chat.rows);

  const title = tModules("chat.name");
  const level = atList ? 2 : 3;
  // The first section's title takes the focus once the notice is put away.
  const first =
    groups.length > 0 ? "groups" : more.length > 0 ? "more" : "direct";
  const headingRef = (section: typeof first) =>
    section === first ? firstHeading : undefined;

  return (
    <div
      ref={pane}
      // Takes the focus when there is nothing else, once the notice goes.
      tabIndex={-1}
      className={cn(
        atList ? "block" : "hidden md:block",
        paneClass,
        "outline-none",
      )}
    >
      <div className="flex flex-col gap-6">
        {atList ? (
          <PageHeader title={title} actions={<NewMessage quiet={false} />} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <h2 className="font-bold text-2xl">{title}</h2>
            <NewMessage quiet />
          </div>
        )}
        {chat.noticeSeen ? null : (
          <ChatNotice
            level={level}
            onSeen={() =>
              (firstHeading.current ?? pane.current)?.focus({
                preventScroll: true,
              })
            }
          />
        )}
        {chat.demo ? (
          <VisibilityNote className="px-1">{t("list.demoNote")}</VisibilityNote>
        ) : null}
        {atList && quiet ? (
          <EmptyState
            headingLevel="h2"
            icon={<MessageCircle />}
            title={t("list.empty.title")}
            body={t("list.empty.body")}
            className="py-4"
          />
        ) : null}
        {/* Every announcement in the reader's groups, and what waits there. */}
        {chat.rows.some((r) => r.kind !== "direct") ? (
          <ListGroup>
            <ListRow
              href={chatPaths.announcements}
              current={announcementsNow}
              leading={<Megaphone />}
              title={t("list.announcements")}
              subtitle={
                toConfirm > 0
                  ? t("list.announcementsWaiting", { count: toConfirm })
                  : t("list.announcementsAll")
              }
            />
          </ListGroup>
        ) : null}
        {groups.length > 0 ? (
          <PageSection
            title={t("list.groups")}
            level={level}
            headingRef={headingRef("groups")}
          >
            <ListGroup>{groups.map(row)}</ListGroup>
          </PageSection>
        ) : null}
        {more.length > 0 ? (
          <PageSection
            title={t("list.moreDepartments")}
            level={level}
            headingRef={headingRef("more")}
          >
            <ListGroup>{more.map(row)}</ListGroup>
          </PageSection>
        ) : null}
        {direct.length > 0 ? (
          <PageSection
            title={t("list.people")}
            level={level}
            headingRef={headingRef("direct")}
          >
            <ListGroup>{direct.map(row)}</ListGroup>
          </PageSection>
        ) : null}
      </div>
    </div>
  );
}
