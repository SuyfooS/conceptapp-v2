import { type AdminBusiness, listBusinesses } from "@db/admin";
import { platformCan } from "@domain/platform";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { Badge } from "@ui/badge";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { currentPlatformRole } from "../staff";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.businesses");
  return { title: t("metaTitle") };
}

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

// The console's first screen: every business, with what needs attention
// (open invites) visible at a glance. Phone and tablet get a list, desktop
// a table with every column.
export default async function BusinessesPage() {
  const role = await currentPlatformRole();
  // The layout already shows the no-access screen; this keeps the list
  // from being read for anyone off the team.
  if (!platformCan(role, "businesses.read")) notFound();
  const [businesses, labels] = await Promise.all([
    listBusinesses(),
    labelsFor(),
  ]);
  const { t } = labels;

  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { count: businesses.length })}
      />
      {businesses.length === 0 ? (
        <Card
          tone="flat"
          padding="lg"
          className="flex flex-col gap-2 md:max-w-xl"
        >
          <CardTitle as="h2">{t("empty.title")}</CardTitle>
          <CardText>{t("empty.body")}</CardText>
        </Card>
      ) : (
        <>
          <div className="xl:hidden">
            <BusinessList businesses={businesses} labels={labels} />
          </div>
          <div className="hidden xl:block">
            <BusinessTable businesses={businesses} labels={labels} />
          </div>
        </>
      )}
    </PageBody>
  );
}

function Initial({ name }: { name: string }) {
  return <span aria-hidden="true">{name.slice(0, 1)}</span>;
}

/**
 * Phone: one list. Tablet: a two-column grid of the same rows, each in its
 * own bordered tile.
 */
function BusinessList({
  businesses,
  labels: { t, template },
}: {
  businesses: AdminBusiness[];
  labels: Labels;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent">
      {businesses.map((b) => (
        <li
          key={b.id}
          className="md:overflow-hidden md:rounded-card md:border md:border-line md:bg-surface"
        >
          <ListRow
            leading={<Initial name={b.name} />}
            title={b.name}
            subtitle={`${template(b.templateKey)} · ${t("membersCount", { count: b.members })}`}
            trailing={
              b.openInvites > 0 ? (
                <Badge tone="warning">
                  {t("invitesCount", { count: b.openInvites })}
                </Badge>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}

const th = "px-4 py-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-4 py-3";

/** Desktop: the full picture, one row per business. */
function BusinessTable({
  businesses,
  labels: { t, template, created },
}: {
  businesses: AdminBusiness[];
  labels: Labels;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full border-collapse">
        <caption className="sr-only">{t("listLabel")}</caption>
        <thead>
          <tr className="border-line border-b bg-surface-2">
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
          </tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id} className="border-line border-b last:border-b-0">
              <th scope="row" className={cn(td, "text-start font-medium")}>
                <span className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 text-sm">
                    <Initial name={b.name} />
                  </span>
                  <span>{b.name}</span>
                </span>
              </th>
              <td className={cn(td, "text-ink-2")}>
                <span dir="ltr">{b.slug}</span>
              </td>
              <td className={td}>{template(b.templateKey)}</td>
              <td className={td}>{b.members}</td>
              <td className={td}>
                {b.openInvites > 0 ? (
                  <Badge tone="warning">{b.openInvites}</Badge>
                ) : (
                  <span className="text-ink-2">{b.openInvites}</span>
                )}
              </td>
              <td className={cn(td, "text-ink-2")}>{created(b.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
