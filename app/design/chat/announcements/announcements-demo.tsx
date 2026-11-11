"use client";

import type { ChatKind } from "@domain/chat";
import { AnnouncementCard } from "@ui/announcement-card";
import { Button } from "@ui/button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageHeader, PageSection } from "@ui/page";
import { Sheet } from "@ui/sheet";
import { Building, Megaphone, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

/** An announcement as the demo's page lists it. */
export type DemoAnnouncement = {
  id: string;
  /** Its conversation under /design/chat. */
  conversation: string;
  pinned: boolean;
  /** Shiran's own: she isn't asked to confirm it. */
  own: boolean;
  authorName: string;
  /** "07:50". */
  time: string;
  /** "1.11" for another day than today; null today. */
  day: string | null;
  body: string;
  /** "בקבוצה של כל הצוות". */
  where: string;
  /** How many of the group confirmed, for a pinned one she may count. */
  readers: { count: number; total: number } | null;
};

/**
 * The demo's /chat/announcements: the parts the app's page uses
 * (AnnouncementsView), on mock rows. "קראתי" on the pinned one says she
 * did, who confirmed opens the team's demo with them, and "פרסום הודעה
 * מההנהלה" asks for the group and opens its composer as an announcement.
 * Nothing is stored.
 */
export function AnnouncementsDemo({
  announcements,
  groups,
}: {
  announcements: DemoAnnouncement[];
  groups: { id: string; kind: ChatKind; title: string }[];
}) {
  const t = useTranslations("app.chat");
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const pinned = announcements.filter((a) => a.pinned);
  const earlier = announcements.filter((a) => !a.pinned);
  // The one accent card: the first that waits for her.
  const first = pinned.find((a) => !a.own && !confirmed.has(a.id))?.id ?? null;

  function card(item: DemoAnnouncement) {
    const done = confirmed.has(item.id);
    const counted = item.readers
      ? { ...item.readers, count: item.readers.count + (done ? 1 : 0) }
      : null;
    return (
      <AnnouncementCard
        key={item.id}
        tone={item.id === first ? "accent" : "flat"}
        headingLevel="h3"
        label={t("announcement.label")}
        byline={
          item.day
            ? t.rich("announcement.bylineDay", {
                name: item.authorName,
                time: item.time,
                day: item.day,
                ltr,
              })
            : t.rich("announcement.byline", {
                name: item.authorName,
                time: item.time,
                ltr,
              })
        }
        body={item.body}
        confirm={
          item.own || !item.pinned
            ? null
            : {
                confirmed: done,
                label: t("announcement.confirm"),
                confirmedLabel: t("announcement.confirmed"),
                onConfirm: () =>
                  setConfirmed((set) => new Set([...set, item.id])),
                note: t("announcement.whoSees"),
              }
        }
        readers={
          counted
            ? {
                label: t.rich("announcement.readBy", {
                  count: counted.count,
                  total: counted.total,
                  ltr,
                }),
                href: `/design/chat/${item.conversation}?state=readers`,
              }
            : null
        }
        footer={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{item.where}</span>
            <Link
              href={`/design/chat/${item.conversation}`}
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
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        back={{ href: "/design/chat", label: t("announcement.page.back") }}
        title={t("announcement.page.title")}
        subtitle={t("announcement.page.subtitle")}
        actions={
          <Button
            aria-haspopup="dialog"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setChoosing(true);
            }}
          >
            <Megaphone aria-hidden="true" />
            {t("announcement.page.publish")}
          </Button>
        }
      />
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
      <Sheet
        open={choosing}
        onOpenChange={setChoosing}
        title={t("announcement.page.chooseGroup")}
        subtitle={t("announcement.page.chooseHint")}
        closeLabel={t("announcement.page.close")}
        returnFocus={() => opener.current}
      >
        <div className="px-2 pb-2">
          <ListGroup className="bg-elevated shadow-none">
            {groups.map((group) => (
              <ListRow
                key={group.id}
                href={`/design/chat/${group.id}?announce=1`}
                leading={group.kind === "team" ? <Building /> : <Users />}
                title={group.title}
              />
            ))}
          </ListGroup>
        </div>
      </Sheet>
    </div>
  );
}
