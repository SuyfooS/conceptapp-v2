"use client";

import { displayIsraeliMobile } from "@domain/phone";
import { shareText, whatsappHref, whatsappToHref } from "@domain/share";
import { announce } from "@ui/announcer";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { arrived, focusFirst, focusOrSay } from "@ui/focus-after";
import { PageSection } from "@ui/page";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { Link2, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useActionState,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CopyLink } from "@/app/copy-link";
import { useAnswerCount } from "../../(auth)/step-results";
import type { ResendState } from "./actions";
import {
  CancelInviteButton,
  InviteCancelUndo,
  UnlessCancelled,
  useGoneInvites,
} from "./invite-cancel";
import {
  holdsAfter,
  leftToLink,
  nextToLink,
  PENDING_LIST,
  type PendingRow,
  pendingCreateTarget,
  pendingShown,
  released,
} from "./pending-links";
import { useInviteLinks } from "./resend-link";

/*
 * "עוד לא קיבלו קישור" on the Team screen (inviting from a list, part 2;
 * Orel, 25 November 2026): the invites nobody got a link for yet (the
 * console's new-business wizard saves its staff so), each one's link made at
 * the moment of sending, "יצירת קישור", then WhatsApp to that number or a
 * copy, and the focus on to the next person. The app sends nothing: the
 * person sending still presses send in WhatsApp.
 */

/** `firstLinkAction` (or `resendInviteAction`), or the design demo's stand-in. */
export type Resend = (
  inviteId: string,
  prev: ResendState,
  form: FormData,
) => Promise<ResendState>;

type Sent = "whatsapp" | "copied";

type Pending = {
  /** What the section lists: read with no link yet, or whose link was asked for here. */
  rows: readonly PendingRow[];
  /** Keeps a row in place once its link is asked for. */
  hold: (row: PendingRow) => void;
  /** Lets it go again: the answer made no link (`holdsAfter`). */
  release: (inviteId: string) => void;
  /** The ids held so, whose rows the open invites leave out meanwhile. */
  here: ReadonlySet<string>;
  /** How each row's link went out here, once it did. */
  sent: ReadonlyMap<string, Sent>;
  markSent: (inviteId: string, how: Sent) => void;
  /**
   * The rows whose "יצירת קישור" was refused here: a link was made for them
   * meanwhile, elsewhere ("linked"), and still works.
   */
  elsewhere: ReadonlySet<string>;
  markElsewhere: (inviteId: string) => void;
  /** The business, for the message the link goes with. */
  business: string;
  /** WhatsApp to the person's number; the twin's goes to nobody. */
  toNumber: boolean;
  resend: Resend;
};

const PendingContext = createContext<Pending | null>(null);

const initial: ResendState = {};

/** Outside `PendingLinks`, where no screen draws it: nothing is made. */
const noResend: Resend = async (_inviteId, prev) => prev;

/**
 * What the focus goes on to (the next person's "יצירת קישור", then their
 * "וואטסאפ") comes into view clear of the tab bar floating over the page's
 * bottom on phones and tablets (`AppShell`, its band and its fade): the
 * browser counts nothing fixed over the page, so a row on screen under the
 * bar would take the focus there (WCAG 2.4.11). A computer has no bar.
 */
const clearOfTabBar =
  "max-xl:scroll-mb-[calc(env(safe-area-inset-bottom)+6rem)]";

/**
 * The invites with no link yet, for every shape at once: a row whose link was
 * asked for here stays where it was, by name, until the page is loaded again
 * (`pendingShown`), though the screen, read again once the link is made,
 * lists it among the open invites, which leave it out meanwhile
 * (`UnlessPendingHere`), and only while the screen still reads its invite
 * (`invites`); a press refused with no link made lets its row go
 * (`holdsAfter`). How a link went out (WhatsApp or a copy) is kept here too,
 * so each shape says it, and so is a press refused since a link was made
 * meanwhile elsewhere. Inside `InviteLinks`, whose links every shape shows;
 * the page keys the screen by person and business, so nothing held here
 * outlives either.
 */
export function PendingLinks({
  rows,
  invites,
  business,
  toNumber,
  resend,
  children,
}: {
  /** The invites the screen read with no link yet, by name (`buildTeam`). */
  rows: readonly PendingRow[];
  /** Every invite the screen read, in any state: a held row needs its own. */
  invites: readonly string[];
  business: string;
  /**
   * WhatsApp to each person's own number (`whatsappToHref`). False on a twin,
   * whose made-up numbers may be someone's: WhatsApp then asks whom to.
   */
  toNumber: boolean;
  /** `firstLinkAction`, or the twin's stand-in. */
  resend: Resend;
  children: ReactNode;
}) {
  const [held, setHeld] = useState<ReadonlyMap<string, PendingRow>>(
    () => new Map(),
  );
  const [sent, setSent] = useState<ReadonlyMap<string, Sent>>(() => new Map());
  const [elsewhere, setElsewhere] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const hold = (row: PendingRow) =>
    setHeld((all) => (all.has(row.id) ? all : new Map(all).set(row.id, row)));
  const release = (inviteId: string) =>
    setHeld((all) => released(all, inviteId));
  const markSent = (inviteId: string, how: Sent) =>
    setSent((all) => new Map(all).set(inviteId, how));
  const markElsewhere = (inviteId: string) =>
    setElsewhere((all) =>
      all.has(inviteId) ? all : new Set(all).add(inviteId),
    );
  const read = new Set(invites);
  return (
    <PendingContext
      value={{
        rows: pendingShown(rows, held, read),
        hold,
        release,
        here: new Set([...held.keys()].filter((id) => read.has(id))),
        sent,
        markSent,
        elsewhere,
        markElsewhere,
        business,
        toNumber,
        resend,
      }}
    >
      {children}
    </PendingContext>
  );
}

/**
 * Whether a row has a link now, in any shape: made on screen, or, as its
 * refused press found, meanwhile elsewhere.
 */
function useLinked(): (inviteId: string) => boolean {
  const links = useInviteLinks();
  const pending = use(PendingContext);
  return (inviteId) =>
    links?.links.has(inviteId) === true ||
    pending?.elsewhere.has(inviteId) === true;
}

/**
 * The count above the rows: how many on screen still have no link
 * ("3 אנשים עוד לא קיבלו קישור"), or that everyone has one, and, for
 * someone who makes them, how. Nothing once every row was deleted.
 */
export function PendingCount() {
  const pending = use(PendingContext);
  const t = useTranslations("app.team.pending");
  const linked = useLinked();
  const gone = useGoneInvites();
  if (!pending) return null;
  const listed = pending.rows.filter((row) => !gone.has(row.id));
  if (listed.length === 0) return null;
  const left = leftToLink(listed, linked, gone);
  // How to send, while a link is left for this viewer to make.
  const links = listed.some((row) => row.send === "link" && !linked(row.id));
  return (
    <div className="flex flex-col gap-1 px-1 md:max-w-2xl">
      <p className="font-medium text-base text-ink">
        {left > 0 ? t("count", { count: left }) : t("left", { count: 0 })}
      </p>
      {links ? (
        <p className="text-pretty text-ink-2 text-sm">{t("hint")}</p>
      ) : null}
    </div>
  );
}

/** A row's phone number, read left to right. */
function Phone({ phone }: { phone: string }) {
  return <span dir="ltr">{displayIsraeliMobile(phone)}</span>;
}

/**
 * What a row offers the viewer: its link, or why someone else sends it
 * (an owner's role to give, or a role removed since), and deleting it.
 */
function RowActions({ row }: { row: PendingRow }) {
  const t = useTranslations("app.team");
  if (row.send === null && !row.cancels) return null;
  return (
    <div className="flex w-full min-w-0 flex-wrap items-start gap-2">
      {row.send === "link" ? (
        <SendLinkRow row={row} />
      ) : row.send === "ownerSends" ? (
        <p className="basis-full text-pretty text-ink-2 text-sm">
          {t("pending.ownerSends")}
        </p>
      ) : row.send === "roleGone" ? (
        <p className="basis-full text-pretty text-ink-2 text-sm">
          {t("invites.roleGone")}
        </p>
      ) : null}
      {row.cancels ? (
        <CancelInviteButton inviteId={row.id} name={row.shown} />
      ) : null}
    </div>
  );
}

/**
 * The phone's and the tablet's "עוד לא קיבלו קישור": its title, how many,
 * and a row for each person, with their name, role and number and their
 * link's buttons, above the open and expired invites. Nothing while there is
 * none. A deleted row's "ביטול" waits here, under its own rows.
 */
export function PendingList() {
  const pending = use(PendingContext);
  const t = useTranslations("app.team");
  const gone = useGoneInvites();
  if (!pending || pending.rows.length === 0) return null;
  const ids = pending.rows.map((row) => row.id);
  const listed = pending.rows.filter((row) => !gone.has(row.id));
  return (
    <PageSection title={t("pending.title")}>
      <PendingCount />
      {listed.length > 0 ? (
        // Where the next person's "יצירת קישור" is found (`PENDING_LIST`).
        <PersonList aria-label={t("pending.title")} data-pending-links="">
          {pending.rows.map((row) => (
            <UnlessCancelled key={row.id} id={row.id}>
              <PersonRow
                name={row.name}
                title={row.shown}
                subtitle={
                  <>
                    {row.role}
                    {/* A role the import's done screen can't know (an
                        invite made meanwhile elsewhere) says none. */}
                    {row.role ? " · " : null}
                    <Phone phone={row.phone} />
                  </>
                }
                below={<RowActions row={row} />}
              />
            </UnlessCancelled>
          ))}
        </PersonList>
      ) : null}
      <InviteCancelUndo ids={ids} />
    </PageSection>
  );
}

/**
 * The desktop's "עוד לא קיבלו קישור": the same rows, first in the table of
 * everyone, with their state and, for someone who sends links, their link's
 * buttons in its own column. `cell` is the table's cell class, `blank` its
 * columns that hold nothing for an invite (the hiring file's).
 */
export function PendingTableRows({
  cell,
  blank,
  links,
}: {
  cell: string;
  /** The columns that hold nothing for an invite, by name. */
  blank: readonly string[];
  /** The column of links is drawn: the viewer sends them. */
  links: boolean;
}) {
  const pending = use(PendingContext);
  const t = useTranslations("app.team");
  const linked = useLinked();
  if (!pending) return null;
  return pending.rows.map((row) => (
    <UnlessCancelled key={row.id} id={row.id}>
      <tr>
        <th scope="row" className={cn(cell, "text-start font-medium")}>
          <span className="flex items-center gap-3">
            <PersonAvatar name={row.name} />
            {row.shown}
          </span>
        </th>
        <td className={cn(cell, "text-ink-2")}>
          <Phone phone={row.phone} />
        </td>
        <td className={cell}>{row.role}</td>
        {blank.map((column) => (
          <td key={column} className={cell} />
        ))}
        <td className={cell}>
          {linked(row.id) ? (
            <Badge tone="warning">{t("state.open")}</Badge>
          ) : (
            <Badge tone="accent">{t("state.pending")}</Badge>
          )}
        </td>
        {links ? (
          <td className={cn(cell, "w-[28rem]")}>
            <RowActions row={row} />
          </td>
        ) : null}
      </tr>
    </UnlessCancelled>
  ));
}

/**
 * An open or expired invite's row, unless it is listed under "עוד לא קיבלו
 * קישור" instead: its link was asked for there, and it stays there until
 * the page is loaded again.
 */
export function UnlessPendingHere({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const pending = use(PendingContext);
  return pending?.here.has(id) ? null : children;
}

/**
 * The open and expired invites' section, unless every one of them is listed
 * under "עוד לא קיבלו קישור" (`UnlessPendingHere`), which says it all.
 */
export function UnlessAllPendingHere({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) {
  const pending = use(PendingContext);
  if (pending && ids.length > 0 && ids.every((id) => pending.here.has(id))) {
    return null;
  }
  return children;
}

/**
 * The open and expired invites' list, while any of them is left on it:
 * neither deleted on screen nor listed under "עוד לא קיבלו קישור".
 */
export function WhileAnyListed({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) {
  const pending = use(PendingContext);
  const gone = useGoneInvites();
  if (ids.every((id) => gone.has(id) || pending?.here.has(id))) return null;
  return children;
}

/**
 * The open and expired invites' "ביטול", for theirs alone: one listed under
 * "עוד לא קיבלו קישור" has its own there.
 */
export function ListedUndo({ ids }: { ids: readonly string[] }) {
  const pending = use(PendingContext);
  return <InviteCancelUndo ids={ids.filter((id) => !pending?.here.has(id))} />;
}

/**
 * One person's link, made at the moment of sending: "יצירת קישור", which
 * keeps the row in place (`PendingLinks`); once made, "וואטסאפ" (a chat to
 * their number with the message and the link written, the person still
 * pressing send there; a real link, opened by the press itself, so nothing
 * blocks it) and the link with its copy button, in every shape
 * (`InviteLinks`). The press went as the link arrived, so "וואטסאפ" takes
 * the focus; with the focus put elsewhere meanwhile it stays there, and the
 * announcer says the link is ready. After WhatsApp or a copy the row says
 * so, and the focus goes to the next person's "יצירת קישור" in this shape,
 * whose name the announcer says. A refusal is a line drawn anew each time,
 * and the press, busy meanwhile, takes back the focus it lost. One refused
 * since a link was made meanwhile elsewhere ("linked": another device,
 * someone else, the console) makes none, so the link already sent keeps
 * working: the row says so in every shape in place of its press, counts as
 * having its link, and the line takes the focus the press lost.
 */
export function SendLinkRow({ row }: { row: PendingRow }) {
  const pending = use(PendingContext);
  const t = useTranslations("app.team");
  const links = useInviteLinks();
  const linked = useLinked();
  const gone = useGoneInvites();
  const [state, action, busy] = useActionState(
    (pending?.resend ?? noResend).bind(null, row.id),
    initial,
  );
  const answer = useAnswerCount(state);
  const press = useRef<HTMLButtonElement>(null);
  const whatsapp = useRef<HTMLAnchorElement>(null);
  const madeElsewhere = useRef<HTMLParagraphElement>(null);
  // The state it starts with is no answer.
  const seen = useRef<ResendState | null>(state);

  // Each answer once, as it arrives: not when the screen is shown again.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    // Refused with no link made: the screen's own read lists the row again,
    // so a link made elsewhere after this takes it off.
    if (!holdsAfter(state)) pending?.release(row.id);
    if (state.failure === "linked") {
      pending?.markElsewhere(row.id);
      if (!focusFirst([madeElsewhere.current], { title: false })) {
        announce(t("pending.linked", { name: row.shown }));
      }
      return;
    }
    if (!state.link) {
      focusFirst([press.current]);
      return;
    }
    links?.keep(row.id, state.link);
    // Never the page's title in its place (the other shape on screen now):
    // the link ready is said, then the title.
    focusOrSay([whatsapp.current], () =>
      announce(t("pending.ready", { name: row.shown })),
    );
  }, [state, links, pending, row.id, row.shown, t]);

  /** On to the next person with no link, in the shape `from` is in. */
  const goNext = (how: Sent, from: Element) => {
    pending?.markSent(row.id, how);
    if (!pending) return;
    const next = nextToLink(
      pending.rows,
      row.id,
      (other) =>
        other.send === "link" && !linked(other.id) && !gone.has(other.id),
    );
    if (!next) return;
    const moved = focusFirst([pendingCreateTarget(next.id)], {
      root: from.closest(`[${PENDING_LIST}]`),
      onlyIfLost: false,
      title: false,
    });
    if (moved) announce(t("pending.next", { name: next.shown }));
  };

  // Made here, or in the screen's other shape.
  const link = state.link ?? links?.links.get(row.id);
  if (link) {
    const text = shareText(
      t("pending.message", { business: pending?.business ?? "" }),
      link,
    );
    const sent = pending?.sent.get(row.id);
    return (
      <div className="flex w-full min-w-0 flex-col gap-3">
        <Button
          asChild
          variant="secondary"
          className={cn("w-full md:w-auto md:self-start", clearOfTabBar)}
        >
          <a
            ref={whatsapp}
            href={
              pending?.toNumber
                ? whatsappToHref(row.phone, text)
                : whatsappHref(text)
            }
            target="_blank"
            rel="noopener noreferrer"
            // The word it shows, then whom it goes to.
            aria-label={t("pending.whatsappFor", { name: row.shown })}
            onClick={(event) => goNext("whatsapp", event.currentTarget)}
          >
            <MessageCircle aria-hidden="true" />
            {t("pending.whatsapp")}
          </a>
        </Button>
        {sent === "whatsapp" ? (
          <p className="px-1 text-ink-2 text-sm">{t("pending.opened")}</p>
        ) : null}
        <CopyLink
          link={link}
          label={t("link.linkFor", { name: row.shown })}
          hint={t("link.hint")}
          copy={t("link.copy")}
          copied={t("link.copied")}
          failed={t("link.copyFailed")}
          onCopied={(button) => goNext("copied", button)}
        />
      </div>
    );
  }

  // Refused here or in the screen's other shape: its link was made elsewhere.
  if (state.failure === "linked" || pending?.elsewhere.has(row.id)) {
    return (
      <p ref={madeElsewhere} className="text-pretty text-ink-2 text-sm">
        {t("link.errors.linked")}
      </p>
    );
  }

  return (
    <form
      action={action}
      // Kept in place before the answer, as the screen is read again with
      // it; let go once an answer made no link (`holdsAfter`).
      onSubmit={() => pending?.hold(row)}
      className="flex flex-col items-start gap-1"
    >
      <Button
        ref={press}
        type="submit"
        variant="secondary"
        loading={busy}
        className={clearOfTabBar}
        // The word it shows, then whose link it makes.
        aria-label={t("pending.createFor", { name: row.shown })}
        // Found by its invite once the person before is done (`PENDING_CREATE`).
        data-pending-create={row.id}
      >
        <Link2 aria-hidden="true" />
        {t("pending.create")}
      </Button>
      {state.failure ? (
        // Drawn anew for each answer, so the same refusal again is heard.
        <p key={answer} role="alert" className="text-danger text-sm">
          {t(`link.errors.${state.failure}`)}
        </p>
      ) : null}
    </form>
  );
}
