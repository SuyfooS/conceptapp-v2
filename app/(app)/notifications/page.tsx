import { getInbox } from "@db/notifications";
import { buildInbox, groupsFor, parseInboxCursor } from "@domain/notifications";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import { baseWording, translator } from "../wording";
import { openNotificationAction, readAllNotificationsAction } from "./actions";
import { InboxView } from "./inbox-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.notifications");
  return { title: t("title") };
}

// The signed-in person's notifications in their business: what happened that
// concerns them. Not while the module is off for the business (the team's
// switch in the console), and not while viewing as someone, whose lines are
// theirs alone. `?before=` reads older ones.
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const [member, enabled, wording] = await Promise.all([
    currentMember(),
    currentModules(),
    currentWording(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    member.viewing ||
    !enabled.includes("notifications")
  ) {
    notFound();
  }
  const before = parseInboxCursor((await searchParams).before);
  const page = await getInbox(membership.business.id, member.userId, before);
  return (
    <InboxView
      unread={buildInbox(page.unread, page.lookups, member.userId)}
      earlier={buildInbox(page.earlier, page.lookups, member.userId)}
      older={page.older}
      olderPage={before !== null}
      groups={groupsFor(membership.role, enabled)}
      now={new Date().toISOString()}
      timeZone={membership.business.place.timeZone}
      open={openNotificationAction}
      readAll={readAllNotificationsAction}
      paths={{ self: "/notifications", home: "/home", base: "" }}
      wording={wording}
    />
  );
}
