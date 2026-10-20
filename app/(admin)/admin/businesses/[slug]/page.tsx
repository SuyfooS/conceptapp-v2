import { type BusinessSetup, getBusinessSetup } from "@db/admin";
import type { Role } from "@domain/modules";
import { displayIsraeliMobile } from "@domain/phone";
import { platformCan } from "@domain/platform";
import { type SetupItem, setupChecklist, setupRemaining } from "@domain/setup";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { CircleCheck, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentPlatformRole } from "../../../staff";

export async function generateMetadata({
  params,
}: PageProps<"/admin/businesses/[slug]">): Promise<Metadata> {
  // The slug, not the name: reading the business needs the signed-in
  // person, and the page itself checks they are on the team.
  const { slug } = await params;
  return { title: slug };
}

type T = Awaited<ReturnType<typeof getTranslations<"admin">>>;

function templateName(t: T, key: string | null) {
  return TEMPLATE_KEYS.includes(key as TemplateKey)
    ? t(`businesses.templates.${key as TemplateKey}`)
    : t("businesses.templates.none");
}

// A business as the console opened it: what is set up and what is left
// (worked out from the database, never ticked by hand), and the people in
// it. Phone: one column; tablet: checklist beside the people; desktop: the
// people as a table.
export default async function BusinessSetupPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.read")) notFound();
  const [{ slug }, { created }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("admin"),
  ]);
  const business = await getBusinessSetup(slug);
  if (!business) notFound();

  const template = templateName(t, business.templateKey);
  const count = (r: Role) =>
    business.people.filter((person) => person.role === r).length;
  const items = setupChecklist({
    people: {
      owner: count("owner"),
      manager: count("manager"),
      worker: count("worker"),
    },
    hasAddress: business.address !== null,
  });

  return (
    <PageBody>
      <PageHeader
        title={business.name}
        subtitle={t.rich("setup.subtitle", {
          template,
          slug: business.slug,
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
        actions={
          <Button asChild variant="secondary" size="lg">
            <Link href="/admin">{t("setup.back")}</Link>
          </Button>
        }
      />
      {created ? (
        <Card
          tone="accent"
          padding="lg"
          role="status"
          className="flex flex-col gap-2 md:max-w-2xl"
        >
          <CardTitle as="h2">
            {t("setup.opened.title", { name: business.name })}
          </CardTitle>
          <CardText className="text-ink">
            {t("setup.opened.body", { template })}
          </CardText>
        </Card>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Checklist
          t={t}
          items={items}
          business={business}
          template={template}
        />
        <People t={t} business={business} />
      </div>
    </PageBody>
  );
}

function Checklist({
  t,
  items,
  business,
  template,
}: {
  t: T;
  items: SetupItem[];
  business: BusinessSetup;
  template: string;
}) {
  const remaining = setupRemaining(items);
  const people = (roles: Role[]) =>
    business.people.filter((p) => roles.includes(p.role)).length;
  const body = (item: SetupItem) => {
    switch (item.key) {
      case "opened":
        return t("setup.checklist.items.opened.done", { template });
      case "owner":
        return item.done
          ? t("setup.checklist.items.owner.done", {
              count: people(["owner"]),
            })
          : t("setup.checklist.items.owner.todo");
      case "staff":
        return item.done
          ? t("setup.checklist.items.staff.done", {
              count: people(["manager", "worker"]),
            })
          : t("setup.checklist.items.staff.todo");
      case "address":
        return item.done
          ? t("setup.checklist.items.address.done", {
              address: business.address ?? "",
            })
          : t("setup.checklist.items.address.todo");
    }
  };

  return (
    <PageSection
      title={t("setup.checklist.title")}
      action={
        <Badge tone={remaining > 0 ? "warning" : "success"}>
          {t("setup.checklist.remaining", { count: remaining })}
        </Badge>
      }
    >
      <ListGroup>
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.key} className="flex items-start gap-3 px-4 py-3">
              {item.done ? (
                <CircleCheck
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
              ) : (
                <CircleDashed
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-warning"
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {t(`setup.checklist.items.${item.key}.title`)}
                  <span className="sr-only">
                    {" · "}
                    {item.done
                      ? t("setup.checklist.done")
                      : t("setup.checklist.todo")}
                  </span>
                </span>
                <span className="text-ink-2 text-sm break-words">
                  {body(item)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </ListGroup>
    </PageSection>
  );
}

const th = "px-4 py-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-4 py-3";

function People({ t, business }: { t: T; business: BusinessSetup }) {
  const { people } = business;
  const name = (n: string) => n || t("setup.people.noName");
  const phone = (p: string | null) =>
    p ? <span dir="ltr">{displayIsraeliMobile(p)}</span> : null;
  const status = (s: "member" | "invited") => (
    <Badge tone={s === "member" ? "success" : "warning"}>
      {t(`setup.people.${s}`)}
    </Badge>
  );

  return (
    <PageSection
      title={t("setup.people.title")}
      action={
        <span className="text-ink-2 text-sm">
          {t("setup.people.count", { count: people.length })}
        </span>
      }
    >
      {people.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("setup.people.empty")}</CardText>
        </Card>
      ) : (
        <>
          <ListGroup className="xl:hidden">
            <ul
              aria-label={t("setup.people.listLabel")}
              className="divide-y divide-line"
            >
              {people.map((person) => (
                <li
                  key={`${person.status}-${person.phone}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {name(person.name)}
                    </span>
                    <span className="truncate text-ink-2 text-sm">
                      {t(`memberRoles.${person.role}`)}
                      {person.phone ? " · " : null}
                      {phone(person.phone)}
                    </span>
                  </span>
                  {status(person.status)}
                </li>
              ))}
            </ul>
          </ListGroup>
          <div className="hidden overflow-hidden rounded-card border border-line bg-surface xl:block">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                {t("setup.people.listLabel")}
              </caption>
              <thead>
                <tr className="border-line border-b bg-surface-2">
                  <th scope="col" className={th}>
                    {t("setup.people.name")}
                  </th>
                  <th scope="col" className={th}>
                    {t("setup.people.phone")}
                  </th>
                  <th scope="col" className={th}>
                    {t("setup.people.role")}
                  </th>
                  <th scope="col" className={th}>
                    {t("setup.people.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr
                    key={`${person.status}-${person.phone}`}
                    className="border-line border-b last:border-b-0"
                  >
                    <th
                      scope="row"
                      className={cn(td, "text-start font-medium")}
                    >
                      {name(person.name)}
                    </th>
                    <td className={cn(td, "text-ink-2")}>
                      {phone(person.phone)}
                    </td>
                    <td className={td}>{t(`memberRoles.${person.role}`)}</td>
                    <td className={td}>{status(person.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageSection>
  );
}
