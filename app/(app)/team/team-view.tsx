import { displayIsraeliMobile } from "@domain/phone";
import type { Team } from "@domain/team";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;
type Invite = Team["invites"][number];

/**
 * The Team screen's body: members, and invites nobody has claimed yet.
 * Phone: members, then invites, one list each; tablet: the two lists side
 * by side; desktop: everyone in one table. Also rendered with mock data
 * on /design/shell/team.
 */
export async function TeamView({ team }: { team: Team }) {
  const t = await getTranslations("app");
  return (
    <PageBody>
      <PageHeader
        title={t("team.title")}
        subtitle={t("team.subtitle", {
          members: team.counts.members,
          open: team.counts.open,
        })}
      />
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:hidden">
        <Members t={t} team={team} />
        <Invites t={t} team={team} />
      </div>
      <div className="hidden xl:block">
        <Everyone t={t} team={team} />
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

function Row({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-ink-2 text-sm">{subtitle}</span>
      </span>
      {trailing}
    </li>
  );
}

function Members({ t, team }: { t: T; team: Team }) {
  return (
    <PageSection
      title={t("team.members.title")}
      action={
        <span className="text-ink-2 text-sm">
          {t("team.members.count", { count: team.counts.members })}
        </span>
      }
    >
      <ListGroup>
        <ul
          aria-label={t("team.members.title")}
          className="divide-y divide-line"
        >
          {team.members.map((m) => (
            <Row
              key={m.userId}
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
        </ul>
      </ListGroup>
    </PageSection>
  );
}

function Invites({ t, team }: { t: T; team: Team }) {
  const { open, expired } = team.counts;
  return (
    <PageSection
      title={t("team.invites.title")}
      action={
        open > 0 ? (
          <Badge tone="warning">
            {t("team.invites.open", { count: open })}
          </Badge>
        ) : null
      }
    >
      {team.invites.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("team.invites.empty")}</CardText>
        </Card>
      ) : (
        <>
          <ListGroup>
            <ul
              aria-label={t("team.invites.title")}
              className="divide-y divide-line"
            >
              {team.invites.map((i) => (
                <Row
                  key={i.id}
                  title={name(t, i.name)}
                  subtitle={
                    <>
                      {t(`team.roles.${i.role}`)}
                      {" · "}
                      {phone(i.phone)}
                    </>
                  }
                  trailing={<InviteBadge t={t} state={i.state} />}
                />
              ))}
            </ul>
          </ListGroup>
          {expired > 0 ? (
            <p className="text-ink-2 text-sm">
              {t("team.invites.expiredHint", { count: expired })}
            </p>
          ) : null}
        </>
      )}
    </PageSection>
  );
}

const th = "px-4 py-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-4 py-3";

function Everyone({ t, team }: { t: T; team: Team }) {
  const { open, expired } = team.counts;
  return (
    <PageSection
      title={t("team.everyone")}
      action={
        open > 0 ? (
          <Badge tone="warning">
            {t("team.invites.open", { count: open })}
          </Badge>
        ) : null
      }
    >
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t("team.everyone")}</caption>
          <thead>
            <tr className="border-line border-b bg-surface-2">
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
            </tr>
          </thead>
          <tbody>
            {team.members.map((m) => (
              <tr key={m.userId} className="border-line border-b">
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {name(t, m.name)}
                </th>
                <td className={cn(td, "text-ink-2")}>{phone(m.phone)}</td>
                <td className={td}>{t(`team.roles.${m.role}`)}</td>
                <td className={td}>
                  <Badge tone="success">{t("team.state.member")}</Badge>
                </td>
              </tr>
            ))}
            {team.invites.map((i) => (
              <tr key={i.id} className="border-line border-b last:border-b-0">
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {name(t, i.name)}
                </th>
                <td className={cn(td, "text-ink-2")}>{phone(i.phone)}</td>
                <td className={td}>{t(`team.roles.${i.role}`)}</td>
                <td className={td}>
                  <InviteBadge t={t} state={i.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team.invites.length === 0 ? (
        <p className="text-ink-2 text-sm">{t("team.invites.empty")}</p>
      ) : expired > 0 ? (
        <p className="text-ink-2 text-sm">
          {t("team.invites.expiredHint", { count: expired })}
        </p>
      ) : null}
    </PageSection>
  );
}
