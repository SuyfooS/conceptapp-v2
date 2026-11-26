"use client";

import { displayIsraeliMobile } from "@domain/phone";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import { PersonRow } from "@ui/person-row";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, startTransition, useState } from "react";
import type { PendingRow } from "../pending-links";
import { InviteLinks, ResendLink, useInviteLinks } from "../resend-link";
import {
  PendingCount,
  PendingLinks,
  PendingList,
  PendingTableRows,
  type Resend,
} from "../send-links";
import type { ExpiredRow } from "./done-links";

/*
 * The send list of the Team screen's import (inviting from a list, part 5;
 * Orel, 25 November 2026): once a list is saved, each person's link is made
 * here at the moment of sending, "יצירת קישור", then WhatsApp to their
 * number or a copy, and the focus goes on to the next person, as under "עוד
 * לא קיבלו קישור" on /team, with the same rows (`SendLinkRow`). Those whose
 * earlier link ran out get "קישור חדש". The app sends nothing. Anyone not
 * sent a link here stays on /team.
 */

/** What the Team screen's done screen makes links with: the real actions, or a twin's. */
export type SendLinks = {
  /** `firstLinkAction`: refused once a link was made meanwhile elsewhere. */
  firstLink: Resend;
  /** `resendInviteAction`, "קישור חדש" for an invite whose link ran out. */
  renew: Resend;
  /** The business's name, for the message a link goes with. */
  business: string;
  /**
   * WhatsApp to each person's own number (`whatsappToHref`): the real
   * screen's. A twin's numbers may be anyone's pasted ones, so there
   * WhatsApp asks whom to send to.
   */
  toNumber: boolean;
};

/**
 * The links made on the done screen, for every shape at once and for as long
 * as the screen is up: a list taken back and kept again with its "ביטול"
 * still shows the links made before, never "יצירת קישור" again, whose press
 * would be refused. Each link is kept as it arrives, whether or not its row
 * is still drawn (`keptAsMade`). `rows` are the done screen's people, none
 * without one.
 */
export function DoneLinks({
  send,
  rows,
  children,
}: {
  send: SendLinks | undefined;
  rows: readonly PendingRow[];
  children: ReactNode;
}) {
  if (!send) return children;
  return (
    <InviteLinks>
      <DonePending send={send} rows={rows}>
        {children}
      </DonePending>
    </InviteLinks>
  );
}

/** The send list's rows, inside `InviteLinks`, whose links it keeps. */
function DonePending({
  send,
  rows,
  children,
}: {
  send: SendLinks;
  rows: readonly PendingRow[];
  children: ReactNode;
}) {
  const links = useInviteLinks();
  return (
    <PendingLinks
      rows={rows}
      invites={rows.map((row) => row.id)}
      business={send.business}
      toNumber={send.toNumber}
      resend={keptAsMade(send.firstLink, links?.keep)}
    >
      {children}
    </PendingLinks>
  );
}

/**
 * A link's action whose link is kept on the screen (`InviteLinks`) as it
 * arrives, not only by the row that asked for it: a row the done card took
 * away while its press was on its way (its list taken back, or another list
 * started) shows the link once the card is back, never "יצירת קישור" or
 * "קישור חדש" again, which would be refused, or would stop the link from
 * working. In the press's own transition, so a row still drawn gets the link
 * and its answer at once.
 */
export function keptAsMade(
  resend: Resend,
  keep: ((inviteId: string, link: string) => void) | undefined,
): Resend {
  return async (inviteId, prev, form) => {
    const state = await resend(inviteId, prev, form);
    const { link } = state;
    if (link && keep) startTransition(() => keep(inviteId, link));
    return state;
  };
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

/**
 * "עוד לא קיבלו קישור" on the done screen: how many are left, and each
 * person with their name, number and role and their link's buttons. A list
 * on a phone and a tablet, a table on a computer, as /team draws them; the
 * focus goes on to the next person in the shape on screen.
 */
export function DoneSendList({ count }: { count: number }) {
  const t = useTranslations("app.team");
  if (count === 0) return null;
  return (
    <>
      <div className="xl:hidden">
        <PendingList />
      </div>
      <div className="hidden xl:block">
        <PageSection title={t("pending.title")}>
          <PendingCount />
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {/* Where the next person's "יצירת קישור" is found (`PENDING_LIST`). */}
            <table className="w-full border-collapse" data-pending-links="">
              <caption className="sr-only">{t("pending.title")}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t("columns.name")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.phone")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.role")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.status")}
                  </th>
                  <th scope="col" className={th}>
                    {t("columns.link")}
                  </th>
                </tr>
              </thead>
              <tbody>
                <PendingTableRows cell={td} blank={[]} links />
              </tbody>
            </table>
          </div>
        </PageSection>
      </div>
    </>
  );
}

/**
 * Those on the list whose earlier link ran out, folded into one row until
 * asked for: each with "קישור חדש", which opens the invite again for 14 days
 * (the link before it no longer works), kept as it arrives (`keptAsMade`).
 * One list in every shape: a few rows at most, under the send list.
 */
export function DoneExpired({
  rows,
  renew,
}: {
  rows: readonly ExpiredRow[];
  renew: Resend;
}) {
  const t = useTranslations("app.team");
  const links = useInviteLinks();
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const kept = keptAsMade(renew, links?.keep);
  return (
    <PageSection title={t("import.done.expired.title")}>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors duration-150 ease-calm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
        >
          <span className="min-w-0 flex-1 text-ink">
            {t("import.done.expired.count", { count: rows.length })}
          </span>
          <span className="shrink-0 font-medium text-ink-2 text-sm">
            {t(open ? "import.groups.hide" : "import.groups.show")}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 text-ink-2 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        {open ? (
          <ul
            aria-label={t("import.done.expired.title")}
            className="border-line border-t"
          >
            {rows.map((row) => (
              <PersonRow
                key={row.id}
                name={row.shown}
                title={row.shown}
                subtitle={
                  <>
                    {row.role}
                    {row.role ? " · " : null}
                    <span dir="ltr">{displayIsraeliMobile(row.phone)}</span>
                  </>
                }
                below={
                  <ResendLink
                    inviteId={row.id}
                    name={row.shown}
                    resend={kept}
                  />
                }
              />
            ))}
          </ul>
        ) : null}
      </div>
      {open ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("invites.expiredHint", { count: rows.length })}
        </p>
      ) : null}
    </PageSection>
  );
}
