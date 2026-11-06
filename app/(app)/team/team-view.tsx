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
import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { ResendLink } from "./resend-link";

type Resend = ComponentProps<typeof ResendLink>["resend"];

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;
type Invite = Team["invites"][number];
type ViewProps = { t: T; team: Team; viewerRole: Role; resend: Resend };

/**
 * The Team screen's body: who is in, and who has not joined yet. Phone: what
 * needs action first, then everyone; tablet: the two lists side by side;
 * desktop: everyone in one table. Each invite the viewer may send gets a "new
 * link" button. Also rendered with mock data on /design/shell/team.
 */
export async function TeamView({
  team,
  viewerRole,
  inviteHref,
  resend,
}: {
  team: Team;
  /** The signed-in owner or manager. */
  viewerRole: Role;
  inviteHref: string;
  resend: Resend;
}) {
  const t = await getTranslations("app");
  const view = { t, team, viewerRole, resend };
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle", {
          members: team.counts.members,
          open: team.counts.open,
        })}
        actions={
          <Button asChild size="lg">
            <Link href={inviteHref}>
              <UserPlus aria-hidden="true" />
              {t("team.inviteAction")}
            </Link>
          </Button>
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
function resendButton({ t, viewerRole, resend }: ViewProps, invite: Invite) {
  return canResendInvite(viewerRole, invite.role) ? (
    <ResendLink
      inviteId={invite.id}
      name={name(t, invite.name)}
      resend={resend}
    />
  ) : null;
}

function Members({ t, team }: ViewProps) {
  return (
    <PageSection title={t("team.members.title")}>
      <PersonList aria-label={t("team.members.title")}>
        {team.members.map((m) => (
          <PersonRow
            key={m.userId}
            name={m.name}
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

function Invites(view: ViewProps) {
  const { t, team } = view;
  const { expired } = team.counts;
  return (
    <PageSection title={t("team.invites.title")}>
      {team.invites.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("team.invites.empty")}</CardText>
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
          {expired > 0 ? (
            <p className="px-1 text-ink-2 text-sm">
              {t("team.invites.expiredHint", { count: expired })}
            </p>
          ) : null}
        </>
      )}
    </PageSection>
  );
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

function NameCell({ person, label }: { person: string | null; label: string }) {
  return (
    <th scope="row" className={cn(td, "text-start font-medium")}>
      <span className="flex items-center gap-3">
        <PersonAvatar name={person} />
        {label}
      </span>
    </th>
  );
}

function Everyone(view: ViewProps) {
  const { t, team } = view;
  const { expired } = team.counts;
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
              <th scope="col" className={th}>
                {t("team.columns.link")}
              </th>
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
                <td className={cn(td, "w-96")}>{resendButton(view, i)}</td>
              </tr>
            ))}
            {team.members.map((m) => (
              <tr key={m.userId}>
                <NameCell person={m.name} label={name(t, m.name)} />
                <td className={cn(td, "text-ink-2")}>{phone(m.phone)}</td>
                <td className={td}>{t(`team.roles.${m.role}`)}</td>
                <td className={cn(td, "text-ink-2")}>
                  {t("team.state.member")}
                </td>
                <td className={td} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team.invites.length === 0 ? (
        <p className="px-1 text-ink-2 text-sm">{t("team.invites.empty")}</p>
      ) : expired > 0 ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("team.invites.expiredHint", { count: expired })}
        </p>
      ) : null}
    </PageSection>
  );
}
