import type { AdminBusiness } from "@db/admin";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonList, PersonRow } from "@ui/person-row";
import { ChevronRight, Plus, Store } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { type SignOutAction, SignOutForm } from "@/app/sign-out-form";
import { BusinessMark } from "../business-mark";

type Labels = Awaited<ReturnType<typeof labelsFor>>;

async function labelsFor() {
  const [t, format] = await Promise.all([
    getTranslations("admin.businesses"),
    getFormatter(),
  ]);
  return {
    t,
    template: (key: string | null) =>
      TEMPLATE_KEYS.includes(key as TemplateKey)
        ? t(`templates.${key as TemplateKey}`)
        : t("templates.none"),
    created: (iso: string) =>
      format.dateTime(new Date(iso), {
        dateStyle: "short",
        timeZone: "Asia/Jerusalem",
      }),
  };
}

/**
 * The console's first screen: every business, in its own colour, with what
 * needs attention (open invites) visible at a glance, each leading to its
 * checklist. Phone: a grouped list; tablet: a grid of cards; desktop: a table
 * with every column. The account and the way out close the page. Also rendered
 * with mock data on /design/console.
 */
export async function BusinessesView({
  businesses,
  canCreate,
  basePath,
  account,
  signOut,
}: {
  businesses: AdminBusiness[];
  canCreate: boolean;
  /** Where the console lives: "/admin", or the design demo's own place. */
  basePath: string;
  account: { name: string; role: string };
  /** `signOut`, or the design demo's stand-in. */
  signOut: SignOutAction;
}) {
  const [labels, ta] = await Promise.all([
    labelsFor(),
    getTranslations("admin.account"),
  ]);
  const { t } = labels;
  const href = (slug: string) => `${basePath}/businesses/${slug}`;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: businesses.length })}
        actions={
          canCreate ? (
            <Button asChild size="lg">
              <Link href={`${basePath}/new`}>
                <Plus aria-hidden="true" />
                {t("new")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {businesses.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<Store />}
          title={t("empty.title")}
          body={t("empty.body")}
        />
      ) : (
        <>
          <div className="md:hidden">
            <BusinessList businesses={businesses} labels={labels} href={href} />
          </div>
          <div className="hidden md:block xl:hidden">
            <BusinessCards
              businesses={businesses}
              labels={labels}
              href={href}
            />
          </div>
          <div className="hidden xl:block">
            <BusinessTable
              businesses={businesses}
              labels={labels}
              href={href}
            />
          </div>
        </>
      )}
      <PageSection title={ta("title")} className="md:max-w-xl">
        <PersonList>
          <PersonRow
            name={account.name}
            title={account.name}
            subtitle={account.role}
            trailing={
              <SignOutForm action={signOut}>
                <Button type="submit" variant="secondary">
                  {ta("signOut")}
                </Button>
              </SignOutForm>
            }
          />
        </PersonList>
      </PageSection>
    </PageBody>
  );
}

type ShapeProps = {
  businesses: AdminBusiness[];
  labels: Labels;
  href: (slug: string) => string;
};

/**
 * What needs the team: invites that ran out first, since nobody can join
 * through them, then invites still open.
 */
function InvitesBadge({
  t,
  open,
  expired,
}: {
  t: Labels["t"];
  open: number;
  expired: number;
}) {
  if (expired > 0) {
    return <Badge tone="danger">{t("expiredCount", { count: expired })}</Badge>;
  }
  return open > 0 ? (
    <Badge tone="warning">{t("invitesCount", { count: open })}</Badge>
  ) : null;
}

/** Phone: one thing at a time, a grouped list. */
function BusinessList({ businesses, labels, href }: ShapeProps) {
  const { t, template } = labels;
  return (
    <ListGroup>
      {businesses.map((b) => (
        <ListRow
          key={b.id}
          href={href(b.slug)}
          leading={<BusinessMark name={b.name} accent={b.accent} />}
          title={b.name}
          subtitle={
            <>
              {template(b.templateKey)} ·{" "}
              {t("membersCount", { count: b.members })}
            </>
          }
          trailing={
            <InvitesBadge
              t={t}
              open={b.openInvites}
              expired={b.expiredInvites}
            />
          }
        />
      ))}
    </ListGroup>
  );
}

/** Tablet: the same facts as a grid of cards. */
function BusinessCards({ businesses, labels, href }: ShapeProps) {
  const { t, template } = labels;
  return (
    <ul className="grid grid-cols-2 gap-4">
      {businesses.map((b) => (
        <li key={b.id} className="min-w-0">
          <Link
            href={href(b.slug)}
            className="pressable flex h-full flex-col gap-4 rounded-card bg-surface p-5 shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex min-h-12 items-center justify-between gap-3">
              <BusinessMark
                name={b.name}
                accent={b.accent}
                className="size-12 rounded-control text-lg"
              />
              <InvitesBadge
                t={t}
                open={b.openInvites}
                expired={b.expiredInvites}
              />
            </span>
            <span className="flex flex-col">
              <span className="font-bold text-lg">{b.name}</span>
              <span className="text-ink-2 text-sm">
                {template(b.templateKey)} ·{" "}
                {t("membersCount", { count: b.members })}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

/** Desktop: the full picture, one row per business, each leading to it. */
function BusinessTable({ businesses, labels, href }: ShapeProps) {
  const { t, template, created } = labels;
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <table className="w-full border-collapse">
        <caption className="sr-only">{t("listLabel")}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("name")}
            </th>
            <th scope="col" className={th}>
              {t("slug")}
            </th>
            <th scope="col" className={th}>
              {t("template")}
            </th>
            <th scope="col" className={th}>
              {t("members")}
            </th>
            <th scope="col" className={th}>
              {t("invites")}
            </th>
            <th scope="col" className={th}>
              {t("created")}
            </th>
            <td className={cn(th, "w-10")} />
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr
              key={b.id}
              className="relative transition-colors duration-150 ease-calm hover:bg-surface-2/60"
            >
              <th scope="row" className={cn(td, "text-start font-medium")}>
                <span className="flex items-center gap-3">
                  <BusinessMark name={b.name} accent={b.accent} />
                  <Link
                    href={href(b.slug)}
                    className="rounded-control after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {b.name}
                  </Link>
                </span>
              </th>
              <td className={cn(td, "text-ink-2")}>
                <span dir="ltr">{b.slug}</span>
              </td>
              <td className={td}>{template(b.templateKey)}</td>
              <td className={td}>{b.members}</td>
              <td className={td}>
                <span className="flex flex-wrap items-center gap-2">
                  {b.openInvites > 0 ? (
                    <Badge tone="warning">{b.openInvites}</Badge>
                  ) : (
                    <span className="text-ink-2">{b.openInvites}</span>
                  )}
                  {b.expiredInvites > 0 ? (
                    <Badge tone="danger">
                      {t("expiredCount", { count: b.expiredInvites })}
                    </Badge>
                  ) : null}
                </span>
              </td>
              <td className={cn(td, "text-ink-2")}>{created(b.createdAt)}</td>
              <td className={td}>
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 text-ink-2 rtl:-scale-x-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
