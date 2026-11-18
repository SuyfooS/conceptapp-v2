import type { Role, Viewer } from "@domain/modules";
import { displayIsraeliMobile } from "@domain/phone";
import {
  canCancelInvite,
  canEditTeam,
  canResendInvite,
  type GivableNamedRole,
  type Team,
} from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { type AppWording, type Translator, translator } from "../wording";
import {
  CancelInviteButton,
  InviteCancels,
  InviteCancelUndo,
  UnlessCancelled,
  WhileAnyInvite,
} from "./invite-cancel";
import { ResendLink } from "./resend-link";
import { roleLabel } from "./role-label";
import type { CancelInvite } from "./team-change-types";

type Resend = ComponentProps<typeof ResendLink>["resend"];

type T = Translator<"app">;
type Invite = Team["invites"][number];
type ViewProps = {
  t: T;
  team: Team;
  viewer: Viewer;
  resend: Resend;
  /** A member's own page, under this path. */
  peopleHref: string;
  /** Whether the business takes invites: a demo one doesn't (#80). */
  invites: boolean;
  /** Whether the viewer changes the team (`canEditTeam`), or only reads it. */
  edits: boolean;
  /** The roles only an owner gives (`ownerOnlyRoles`): no new link for theirs. */
  ownerOnly: readonly Role[];
  /** The business's live named roles: a new link only for one the viewer gives. */
  named: readonly GivableNamedRole[];
};

/**
 * The Team screen's body: who is in, and who has not joined yet. Phone: what
 * needs action first, then everyone; tablet: the two lists side by side;
 * desktop: everyone in one table. Each invite the viewer may send gets a "new
 * link" button, and "מחיקת ההזמנה", held for its undo (`InviteCancels`);
 * each member leads to their profile (`peopleHref`/id), where their role is
 * changed and they are taken off the team. A business closed to invites (a
 * demo one, #80) gets no `inviteHref`: no invite, no new links, and a line
 * saying why. Someone who sees the team without editing it (team view, the
 * roles plan's R6) reads all of it, numbers and invites included, with no
 * invite, no new links and no deleting, and a line under the title says
 * so. Someone other than an owner gets no new link for an invite to a role
 * that holds pay (`ownerOnly`), which only an owner gives, and can still
 * delete it. A role the business named shows by its name, with the role it
 * is built on (the roles plan's R11b), and an invite to one gets a new link
 * only from someone who gives it (`named`), never once it was removed.
 * Also rendered with mock data on /design/shell/team.
 */
export function TeamView({
  team,
  viewer,
  inviteHref,
  peopleHref,
  resend,
  cancel,
  ownerOnly = [],
  named = [],
  wording,
}: {
  team: Team;
  /** The signed-in person, with what they hold (`my_permissions`). */
  viewer: Viewer;
  /** The invite form, or nothing when the business takes no invites. */
  inviteHref?: string;
  /** Where each member's profile lives: `/team`, or the demo's. */
  peopleHref: string;
  resend: Resend;
  /**
   * `cancelInviteAction` bound to the business, or the demo's stand-in;
   * none while viewing as someone, who changes nothing.
   */
  cancel?: CancelInvite;
  /**
   * The roles only an owner gives (`currentOwnerOnlyRoles`: those that hold
   * pay), for a viewer who isn't one; none by default.
   */
  ownerOnly?: readonly Role[];
  /**
   * The business's live named roles (`currentGivableNamedRoles`), for a
   * viewer who edits the team; none by default.
   */
  named?: readonly GivableNamedRole[];
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const invites = inviteHref !== undefined;
  const edits = canEditTeam(viewer);
  const view = {
    t,
    team,
    viewer,
    resend,
    peopleHref,
    invites,
    edits,
    ownerOnly,
    named,
  };
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle", {
          members: team.counts.members,
          open: team.counts.open,
        })}
        actions={
          inviteHref && edits ? (
            <Button asChild size="lg">
              <Link href={inviteHref}>
                <UserPlus aria-hidden="true" />
                {t("team.inviteAction")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {edits ? null : (
        <p className="text-ink-2 md:max-w-2xl">{t("team.readOnly")}</p>
      )}
      <InviteCancels cancel={cancel ?? null}>
        <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:hidden">
          {team.invites.length > 0 ? (
            <>
              <Invites {...view} />
              <Members {...view} />
            </>
          ) : (
            <>
              <Members {...view} />
              <Invites {...view} />
            </>
          )}
        </div>
        <div className="hidden xl:block">
          <Everyone {...view} />
        </div>
      </InviteCancels>
    </PageBody>
  );
}

const name = (t: T, n: string | null) => n ?? t("team.noName");
const phone = (p: string | null) =>
  p ? <span dir="ltr">{displayIsraeliMobile(p)}</span> : null;

function InviteBadge({ t, state }: { t: T; state: Invite["state"] }) {
  return (
    <Badge tone={state === "open" ? "warning" : "danger"}>
      {t(`team.state.${state}`)}
    </Badge>
  );
}

/** An invite to a role the business named that was removed since: no new link opens it. */
const roleGone = (invite: Invite) => invite.namedRole?.archived === true;

/**
 * What the viewer may do with this invite: a new link, to a role they give
 * now (`canResendInvite`: a named role among `named`, live), and deleting
 * it, by the rank rule (`canCancelInvite`); a new link for a role that holds
 * pay only from an owner (`ownerOnly`; a named role never does). An invite
 * whose named role was removed since gets none from anyone, so a line says
 * why and what to do instead, beside its deleting.
 */
function inviteActions(
  { t, viewer, resend, invites, ownerOnly, named }: ViewProps,
  invite: Invite,
) {
  if (!invites) return null;
  const who = name(t, invite.name);
  const namedRole = invite.namedRole?.id ?? null;
  const resendable =
    canResendInvite(viewer, { role: invite.role, namedRole }, named) &&
    (namedRole !== null || !ownerOnly.includes(invite.role));
  const cancellable = canCancelInvite(viewer, invite.role);
  if (!resendable && !cancellable) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {roleGone(invite) ? (
        <p className="basis-full text-pretty text-ink-2 text-sm">
          {t("team.invites.roleGone")}
        </p>
      ) : null}
      {resendable ? (
        <ResendLink inviteId={invite.id} name={who} resend={resend} />
      ) : null}
      {cancellable ? (
        <CancelInviteButton inviteId={invite.id} name={who} />
      ) : null}
    </div>
  );
}

function Members({ t, team, peopleHref }: ViewProps) {
  return (
    <PageSection title={t("team.members.title")}>
      <PersonList aria-label={t("team.members.title")}>
        {team.members.map((m) => (
          <PersonRow
            key={m.userId}
            name={m.name}
            photo={m.photo}
            href={`${peopleHref}/${m.userId}`}
            title={name(t, m.name)}
            subtitle={
              <>
                {roleLabel(t, m.role, m.namedRole)}
                {m.phone ? " · " : null}
                {phone(m.phone)}
              </>
            }
          />
        ))}
      </PersonList>
    </PageSection>
  );
}

/**
 * The line under the invites: why there are none in a business closed to
 * them, else how many expired, which a new link opens again for whoever
 * sends one. For them, those whose named role was removed since are not
 * counted: no new link opens those, and their own line says so.
 */
function invitesNote(view: ViewProps): string | null {
  const { t, team, invites, edits } = view;
  if (!invites) return closedNote(view);
  if (!edits) {
    const { expired } = team.counts;
    return expired === 0
      ? null
      : t("team.invites.expiredReadOnly", { count: expired });
  }
  const expired = team.invites.filter(
    (i) => i.state === "expired" && !roleGone(i),
  ).length;
  return expired === 0
    ? null
    : t("team.invites.expiredHint", { count: expired });
}

/**
 * Why a business closed to invites (a demo one) has none: for whoever edits
 * the team, where they would invite from in a real one; for anyone else, only
 * why.
 */
function closedNote({ t, edits }: ViewProps): string {
  return edits ? t("team.invites.closed") : t("team.invites.closedReadOnly");
}

/** No invite waits: how to invite someone, for whoever may. */
function noInvites({ t, edits }: ViewProps): string {
  return edits ? t("team.invites.empty") : t("team.invites.emptyReadOnly");
}

function Invites(view: ViewProps) {
  const { t, team, invites } = view;
  const note = invitesNote(view);
  return (
    <PageSection title={t("team.invites.title")}>
      {team.invites.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{invites ? noInvites(view) : closedNote(view)}</CardText>
        </Card>
      ) : (
        <>
          <WhileAnyInvite ids={team.invites.map((i) => i.id)}>
            <PersonList aria-label={t("team.invites.title")}>
              {team.invites.map((i) => (
                <UnlessCancelled key={i.id} id={i.id}>
                  <PersonRow
                    name={i.name}
                    title={name(t, i.name)}
                    subtitle={
                      <>
                        {roleLabel(t, i.role, i.namedRole)}
                        {" · "}
                        {phone(i.phone)}
                      </>
                    }
                    trailing={<InviteBadge t={t} state={i.state} />}
                    below={inviteActions(view, i)}
                  />
                </UnlessCancelled>
              ))}
            </PersonList>
          </WhileAnyInvite>
          <InviteCancelUndo />
          {note ? <p className="px-1 text-ink-2 text-sm">{note}</p> : null}
        </>
      )}
    </PageSection>
  );
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

function NameCell({
  person,
  photo,
  label,
  href,
}: {
  person: string | null;
  photo?: string | null;
  label: string;
  /** A member's profile; invites have none. */
  href?: string;
}) {
  const content = (
    <>
      <PersonAvatar name={person} photo={photo} />
      {label}
    </>
  );
  return (
    <th scope="row" className={cn(td, "text-start font-medium")}>
      {href ? (
        <Link
          href={href}
          className="-mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {content}
        </Link>
      ) : (
        <span className="flex items-center gap-3">{content}</span>
      )}
    </th>
  );
}

function Everyone(view: ViewProps) {
  const { t, team, peopleHref, invites, edits } = view;
  const note = invitesNote(view);
  // The column of new links, for someone who may send them.
  const links = invites && edits;
  return (
    <PageSection title={t("team.everyone")}>
      {/* Above the table, where the invites are its first rows: with a long
          team, under it would be out of sight while the undo waits. */}
      <InviteCancelUndo />
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t("team.everyone")}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t("team.columns.name")}
              </th>
              <th scope="col" className={th}>
                {t("team.columns.phone")}
              </th>
              <th scope="col" className={th}>
                {t("team.columns.role")}
              </th>
              <th scope="col" className={th}>
                {t("team.columns.status")}
              </th>
              {links ? (
                <th scope="col" className={th}>
                  {t("team.columns.link")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {team.invites.map((i) => (
              <UnlessCancelled key={i.id} id={i.id}>
                <tr>
                  <NameCell person={i.name} label={name(t, i.name)} />
                  <td className={cn(td, "text-ink-2")}>{phone(i.phone)}</td>
                  <td className={td}>{roleLabel(t, i.role, i.namedRole)}</td>
                  <td className={td}>
                    <InviteBadge t={t} state={i.state} />
                  </td>
                  {links ? (
                    <td className={cn(td, "w-[28rem]")}>
                      {inviteActions(view, i)}
                    </td>
                  ) : null}
                </tr>
              </UnlessCancelled>
            ))}
            {team.members.map((m) => (
              <tr key={m.userId}>
                <NameCell
                  person={m.name}
                  photo={m.photo}
                  label={name(t, m.name)}
                  href={`${peopleHref}/${m.userId}`}
                />
                <td className={cn(td, "text-ink-2")}>{phone(m.phone)}</td>
                <td className={td}>{roleLabel(t, m.role, m.namedRole)}</td>
                <td className={cn(td, "text-ink-2")}>
                  {t("team.state.member")}
                </td>
                {links ? <td className={td} /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invites && team.invites.length === 0 ? (
        <p className="px-1 text-ink-2 text-sm">{noInvites(view)}</p>
      ) : note ? (
        <p className="px-1 text-ink-2 text-sm">{note}</p>
      ) : null}
    </PageSection>
  );
}
