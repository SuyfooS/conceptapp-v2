"use client";

import { dateIn } from "@domain/availability";
import type { ChatKind } from "@domain/chat";
import {
  announcementState,
  sortAnnouncements,
  waitsFor,
} from "@domain/chat-announce";
import { chatShortDate, messageTime } from "@domain/chat-days";
import type { PinnedAnnouncement } from "@domain/chat-sync";
import { AnnouncementCard } from "@ui/announcement-card";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Building, Megaphone, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChatPageHeader } from "../../chat-page-header";
import { chatPaths } from "../../chat-paths";
import { useChat } from "../../chat-provider";
import type { ChatActionResult, ChatReaders } from "../../chat-types";
import { ReadersSheet } from "../../readers-sheet";

/** An announcement as the page lists it. */
export type AnnouncementShown = PinnedAnnouncement & {
  conversation: string;
  /** The department's group it was posted in; null for the whole team's. */
  group: string | null;
  /** Its author's name, when known. */
  author: string | null;
};

/** A group an announcer may post in. */
export type PublishGroup = {
  conversation: string;
  kind: ChatKind;
  title: string;
};

/**
 * /chat/announcements on screen: the pinned ones, then the earlier ones, each
 * a card with where it was posted; "קראתי" on those waiting for the reader
 * (the first of them the one accent card), and for its author and management
 * who confirmed. Announcers have the main action, which asks for the group.
 */
export function AnnouncementsView({
  readerId,
  moderates,
  timeZone,
  now,
  announcements,
  publishIn,
  confirm,
  readers,
}: {
  readerId: string;
  moderates: boolean;
  timeZone: string;
  now: string;
  announcements: AnnouncementShown[];
  /** The groups an announcer may post in; null for someone who may not. */
  publishIn: PublishGroup[] | null;
  confirm: (message: string) => Promise<ChatActionResult>;
  readers: (message: string) => Promise<ChatActionResult<ChatReaders>>;
}) {
  const t = useTranslations("app.chat");
  const chat = useChat();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  // Removed or unpinned since the page was drawn ("קראתי" refused for it):
  // gone at once, with its words, while the page is drawn again; the new
  // drawing says what is there (one only unpinned is among the earlier ones).
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new drawing is what says what is there
  useEffect(() => {
    setGone(new Set());
  }, [announcements]);
  const [pending, setPending] = useState<string | null>(null);
  const [readersFor, setReadersFor] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [failed, setFailed] = useState(0);
  const pathname = usePathname();
  // What opened each sheet, for the focus once it closed.
  const readersOpener = useRef<HTMLElement | null>(null);
  const publishOpener = useRef<HTMLElement | null>(null);

  // A group chosen takes the screen along: the sheet is closed when the
  // page shows again (kept for going back).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address is what closes it
  useEffect(() => {
    setChoosing(false);
  }, [pathname]);

  const today = dateIn(new Date(now), timeZone);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const list = sortAnnouncements(
    announcements
      .filter((a) => !gone.has(a.message.id))
      .map((a) => ({
        ...a,
        id: a.message.id,
        createdAt: a.message.createdAt,
        pinned: a.message.pinned,
        confirmed: a.confirmed || confirmed.has(a.message.id),
      })),
  );
  const pinned = list.filter((a) => a.pinned);
  const earlier = list.filter((a) => !a.pinned);
  // The one accent card: the first that waits for the reader.
  const first = pinned.find((a) => waitsFor(a, readerId))?.id ?? null;

  async function press(item: (typeof list)[number]) {
    setPending(item.id);
    let result: ChatActionResult;
    try {
      result = await confirm(item.id);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setPending(null);
    if (!result.ok) {
      if (result.failure === "closed" || result.failure === "noAccess") {
        setGone((set) => new Set([...set, item.id]));
        router.refresh();
      }
      setFailed((n) => n + 1);
      return;
    }
    setConfirmed((set) => new Set([...set, item.id]));
    chat.changeRowLocally(item.conversation, (row) => ({
      ...row,
      pinnedWaiting: Math.max(0, row.pinnedWaiting - 1),
    }));
    chat.syncNow();
    router.refresh();
  }

  function openReaders(id: string, trigger: HTMLElement) {
    readersOpener.current = trigger;
    setReadersFor(id);
  }

  function card(item: (typeof list)[number]) {
    const state = announcementState(
      { authorId: item.message.authorId, confirmed: item.confirmed },
      readerId,
    );
    const day = dateIn(new Date(item.createdAt), timeZone);
    const time = messageTime(item.createdAt, timeZone);
    const name = item.author ?? t("list.noName");
    const mayCount = state === "own" || moderates;
    return (
      <AnnouncementCard
        key={item.id}
        tone={item.id === first ? "accent" : "flat"}
        headingLevel="h3"
        label={t("announcement.label")}
        byline={
          day === today
            ? t.rich("announcement.byline", { name, time, ltr })
            : t.rich("announcement.bylineDay", {
                name,
                time,
                day: chatShortDate(day, today),
                ltr,
              })
        }
        body={item.message.body ?? ""}
        confirm={
          state === "own" || (!item.pinned && !item.confirmed)
            ? null
            : {
                confirmed: item.confirmed,
                label: t("announcement.confirm"),
                confirmedLabel: t("announcement.confirmed"),
                onConfirm: () => void press(item),
                pending: pending === item.id,
                note: t("announcement.whoSees"),
              }
        }
        readers={
          !mayCount
            ? null
            : item.readers
              ? {
                  label: t.rich("announcement.readBy", {
                    count: item.readers.count,
                    total: item.readers.total,
                    ltr,
                  }),
                  onOpen: (trigger) => openReaders(item.id, trigger),
                }
              : {
                  label: t("announcement.readersOpen"),
                  onOpen: (trigger) => openReaders(item.id, trigger),
                }
        }
        footer={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {item.group
                ? t("announcement.inGroup", { group: item.group })
                : t("announcement.inTeam")}
            </span>
            <Link
              href={chatPaths.conversation(item.conversation)}
              className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("announcement.page.open")}
            </Link>
          </span>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
      <ChatPageHeader
        back={{ href: chatPaths.list, label: t("announcement.page.back") }}
        title={t("announcement.page.title")}
        subtitle={t("announcement.page.subtitle")}
        actions={
          publishIn && publishIn.length > 0 ? (
            <Button
              aria-haspopup="dialog"
              onClick={(event) => {
                publishOpener.current = event.currentTarget;
                setChoosing(true);
              }}
            >
              <Megaphone aria-hidden="true" />
              {t("announcement.page.publish")}
            </Button>
          ) : null
        }
      />
      {list.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<Megaphone />}
          title={t("announcement.page.empty.title")}
          body={
            publishIn
              ? t("announcement.page.empty.bodyAnnouncer")
              : t("announcement.page.empty.body")
          }
        />
      ) : null}
      {pinned.length > 0 ? (
        <PageSection title={t("announcement.page.pinnedTitle")}>
          <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
            {pinned.map(card)}
          </div>
        </PageSection>
      ) : null}
      {earlier.length > 0 ? (
        <PageSection title={t("announcement.page.earlierTitle")}>
          <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
            {earlier.map(card)}
          </div>
        </PageSection>
      ) : null}
      {publishIn ? (
        <Sheet
          open={choosing}
          onOpenChange={setChoosing}
          title={t("announcement.page.chooseGroup")}
          subtitle={t("announcement.page.chooseHint")}
          closeLabel={t("announcement.page.close")}
          returnFocus={() => publishOpener.current}
        >
          <div className="px-2 pb-2">
            <ListGroup className="bg-elevated shadow-none">
              {publishIn.map((group) => (
                <ListRow
                  key={group.conversation}
                  href={chatPaths.announceIn(group.conversation)}
                  leading={group.kind === "team" ? <Building /> : <Users />}
                  title={group.title}
                />
              ))}
            </ListGroup>
          </div>
        </Sheet>
      ) : null}
      <ReadersSheet
        message={readersFor}
        onClose={() => setReadersFor(null)}
        load={readers}
        timeZone={timeZone}
        now={now}
        returnFocus={() => readersOpener.current}
      />
      <StatusToast
        message={failed > 0 ? t("announcement.confirmFailed") : null}
        stamp={String(failed)}
      />
    </div>
  );
}
