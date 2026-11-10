import type { Role } from "@domain/modules";
import { displayIsraeliMobile } from "@domain/phone";
import { canResendInvite, type Team } from "@domain/team";
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
import { ResendLink } from "./resend-link";

type Resend = ComponentProps<typeof ResendLink>["resend"];

type T = Translator<"app">;
type Invite = Team["invites"][number];
type ViewProps = {
  t: T;
  team: Team;
  viewerRole: Role;
  resend: Resend;
  /** A member's own page, under this path. */
  peopleHref: string;
  /** Whether the business takes invites: a demo one doesn't (#80). */
  invites: boolean;
};

/**
 * The Team screen's body: who is in, and who has not joined yet. Phone: what
 * needs action first, then everyone; tablet: the two lists side by side;
 * desktop: everyone in one table. Each invite the viewer may send gets a "new
 * link" button; each member leads to their profile (`peopleHref`/id). A
 * business closed to invites (a demo one, #80) gets no `inviteHref`: no
 * invite, no new links, and a line saying why. Also rendered with mock data
 * on /design/shell/team.
 */
export function TeamView({
  team,
  viewerRole,
  inviteHref,
  peopleHref,
  resend,
  wording,
}: {
  team: Team;
  /** The signed-in owner or manager. */
  viewerRole: Role;
  /** The invite form, or nothing when the business takes no invites. */
  inviteHref?: string;
  /** Where each member's profile lives: `/team`, or the demo's. */
  peopleHref: string;
  resend: Resend;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const invites = inviteHref !== undefined;
  const view = { t, team, viewerRole, resend, peopleHref, invites };
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle", {
          members: team.counts.members,
          open: team.counts.open,
        })}
        actions={
          inviteHref ? (
            <Button asChild size="lg">
              <Link href={inviteHref}>
                <UserPlus aria-hidden="true" />
                {t("team.inviteAction")}
              </Link>
            </Button>
          ) : undefined
        }
      />
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

/** The "new link" button, when the viewer may send this invite. */
function resendButton(
  { t, viewerRole, resend, invites }: ViewProps,
  invite: Invite,
) {
  return invites && canResendInvite(viewerRole, invite.role) ? (
    <ResendLink
      inviteId={invite.id}
      name={name(t, invite.name)}
      resend={resend}
    />
  ) : null;
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
                {t(`team.roles.${m.role}`)}
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
 * them, else how many expired, which a new link opens again.
 */
function invitesNote({ t, team, invites }: ViewProps): string | null {
  if (!invites) return t("team.invites.closed");
  const { expired } = team.counts;
  return expired > 0 ? t("team.invites.expiredHint", { count: expired }) : null;
}

function Invites(view: ViewProps) {
  const { t, team, invites } = view;
  const note = invitesNote(view);
  return (
    <PageSection title={t("team.invites.title")}>
      {team.invites.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>
            {invites ? t("team.invites.empty") : t("team.invites.closed")}
          </CardText>
        </Card>
      ) : (
        <>
          <PersonList aria-label={t("team.invites.title")}>
            {team.invites.map((i) => (
              <PersonRow
                key={i.id}
                name={i.name}
                title={name(t, i.name)}
                subtitle={
                  <>
                    {t(`team.roles.${i.role}`)}
                    {" · "}
                    {phone(i.phone)}
                  </>
                }
                trailing={<InviteBadge t={t} state={i.state} />}
                below={resendButton(view, i)}
              />
            ))}
          </PersonList>
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
  const { t, team, peopleHref, invites } = view;
  const note = invitesNote(view);
  return (
    <PageSection title={t("team.everyone")}>
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
              {invites ? (
                <th scope="col" className={th}>
                  {t("team.columns.link")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {team.invites.map((i) => (
              <tr key={i.id}>
                <NameCell person={i.name} label={name(t, i.name)} />
                <td className={cn(td, "text-ink-2")}>{phone(i.phone)}</td>
                <td className={td}>{t(`team.roles.${i.role}`)}</td>
                <td className={td}>
                  <InviteBadge t={t} state={i.state} />
                </td>
                {invites ? (
                  <td className={cn(td, "w-96")}>{resendButton(view, i)}</td>
                ) : null}
              </tr>
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
                <td className={td}>{t(`team.roles.${m.role}`)}</td>
                <td className={cn(td, "text-ink-2")}>
                  {t("team.state.member")}
                </td>
                {invites ? <td className={td} /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invites && team.invites.length === 0 ? (
        <p className="px-1 text-ink-2 text-sm">{t("team.invites.empty")}</p>
      ) : note ? (
        <p className="px-1 text-ink-2 text-sm">{note}</p>
      ) : null}
    </PageSection>
  );
}
