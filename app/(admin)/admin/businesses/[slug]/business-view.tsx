import type { BusinessSetup, SetupPerson } from "@db/admin";
import { accentTokens } from "@domain/color";
import type { Role } from "@domain/modules";
import { displayIsraeliMobile } from "@domain/phone";
import { type SetupItem, setupChecklist, setupRemaining } from "@domain/setup";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { VIEW_AS_ROLES } from "@domain/view-as";
import { accentProps } from "@ui/accent";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import {
  Check,
  ChevronRight,
  CircleDashed,
  Eye,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import { InviteLink } from "./invite-link";

type T = Awaited<ReturnType<typeof getTranslations<"admin">>>;
type Issue = ComponentProps<typeof InviteLink>["issue"];

function templateName(t: T, key: string | null) {
  return TEMPLATE_KEYS.includes(key as TemplateKey)
    ? t(`businesses.templates.${key as TemplateKey}`)
    : t("businesses.templates.none");
}

/**
 * A business as the console opened it: what is set up and what is left
 * (worked out from the database, never ticked by hand), on its own colour, and
 * the people in it. Phone: one column; tablet: the checklist beside the people;
 * desktop: the checklist beside viewing as a role, and the people as a table
 * under them. Also rendered with mock data on /design/console/businesses.
 * Invites that ran out stay on the page, with a way to renew them, so a
 * business whose owner never joined is not stuck.
 */
export async function BusinessView({
  business,
  listHref,
  created,
  viewFailed,
  settingsHref,
  addHref,
  viewAs,
  issue,
}: {
  business: BusinessSetup;
  listHref: string;
  created: boolean;
  viewFailed: boolean;
  /** Where this business's settings are, when the person may edit them. */
  settingsHref: string | null;
  /** Where to add a person, when the person may invite staff. */
  addHref: string | null;
  /** Bound to this business, when the person may view it as a role. */
  viewAs: ((form: FormData) => Promise<void>) | null;
  issue: Issue;
}) {
  const t = await getTranslations("admin");
  const template = templateName(t, business.templateKey);
  // Someone whose invite ran out can't join through it, so they don't count.
  const count = (r: Role) =>
    business.people.filter((p) => p.role === r && p.status !== "expired")
      .length;
  const items = setupChecklist({
    people: {
      owner: count("owner"),
      manager: count("manager"),
      worker: count("worker"),
    },
    hasAddress: business.address !== null,
  });

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: listHref, label: t("setup.back") }}
        title={business.name}
        subtitle={t.rich("setup.subtitle", {
          template,
          slug: business.slug,
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
        actions={
          addHref ? (
            <Button asChild>
              <Link href={addHref}>
                <UserPlus aria-hidden="true" />
                {t("setup.people.add")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {created ? (
        <Card
          tone="flat"
          padding="md"
          role="status"
          className="flex items-center gap-3 md:max-w-2xl"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-5"
          >
            <Check />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">
              {t("setup.opened.title", { name: business.name })}
            </span>
            <CardText className="text-sm">
              {t("setup.opened.body", { template })}
            </CardText>
          </span>
        </Card>
      ) : null}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8">
        <div className="flex flex-col gap-6 md:col-start-1 md:row-start-1">
          <Checklist
            t={t}
            items={items}
            business={business}
            template={template}
            hrefs={{ people: addHref, settings: settingsHref }}
          />
          {settingsHref ? (
            <ListGroup>
              <ListRow
                href={settingsHref}
                leading={<SlidersHorizontal />}
                title={t("setup.settings.row")}
                subtitle={t("setup.settings.subtitle")}
              />
            </ListGroup>
          ) : null}
        </div>
        <div
          id="people"
          className="scroll-mt-4 md:col-start-2 md:row-span-2 md:row-start-1 xl:col-span-2 xl:col-start-1 xl:row-span-1 xl:row-start-2"
        >
          <People t={t} business={business} issue={issue} />
        </div>
        {viewAs ? (
          <div className="md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1">
            <ViewAs
              t={t}
              business={business}
              failed={viewFailed}
              viewAs={viewAs}
            />
          </div>
        ) : null}
      </div>
    </PageBody>
  );
}

/** The state of the setup on the business's colour, the list floating over it. */
function Checklist({
  t,
  items,
  business,
  template,
  hrefs,
}: {
  t: T;
  items: SetupItem[];
  business: BusinessSetup;
  template: string;
  /** Where a missing item is fixed, when the person may fix it. */
  hrefs: { people: string | null; settings: string | null };
}) {
  const remaining = setupRemaining(items);
  const people = (roles: Role[]) =>
    business.people.filter(
      (p) => roles.includes(p.role) && p.status !== "expired",
    ).length;
  const ownerExpired = business.people.some(
    (p) => p.role === "owner" && p.status === "expired",
  );
  // A missing owner is invited as an owner; one whose invite ran out is
  // renewed in the people list, never invited again in another role.
  const href = (item: SetupItem) => {
    if (item.done) return null;
    if (item.key === "owner") {
      if (!hrefs.people) return null;
      return ownerExpired ? "#people" : `${hrefs.people}?role=owner`;
    }
    if (item.key === "staff") return hrefs.people;
    if (item.key === "address") return hrefs.settings;
    return null;
  };
  const body = (item: SetupItem) => {
    switch (item.key) {
      case "opened":
        return t("setup.checklist.items.opened.done", { template });
      case "owner":
        return item.done
          ? t("setup.checklist.items.owner.done", {
              count: people(["owner"]),
            })
          : ownerExpired
            ? t("setup.checklist.items.owner.expired")
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
    <section
      className="flex flex-col"
      {...accentProps(accentTokens(business.accent))}
    >
      <Card tone="hero" padding="none" className="px-5 pt-5 pb-[84px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-base">
            {t("setup.checklist.title")}
          </h2>
          <span className="inline-flex min-h-[30px] items-center rounded-full bg-[color-mix(in_srgb,var(--accent-ink)_18%,transparent)] px-3 font-semibold text-sm">
            {t("setup.checklist.progress", {
              done: items.length - remaining,
              total: items.length,
            })}
          </span>
        </div>
        <p className="mt-3 font-bold text-2xl">
          {t("setup.checklist.remaining", { count: remaining })}
        </p>
      </Card>
      <ul className="relative z-10 mx-3 -mt-[60px] overflow-hidden rounded-card bg-surface shadow-float">
        {items.map((item) => (
          <ChecklistRow key={item.key} href={href(item)}>
            {item.done ? (
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-4 [&_svg]:stroke-3"
              >
                <Check />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-soft text-warning [&_svg]:size-4 [&_svg]:stroke-3"
              >
                <CircleDashed />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">
                {t(`setup.checklist.items.${item.key}.title`)}
                <span className="sr-only">
                  {" · "}
                  {item.done
                    ? t("setup.checklist.done")
                    : t("setup.checklist.todo")}
                </span>
              </span>
              <span className="break-words text-ink-2 text-sm">
                {body(item)}
              </span>
            </span>
          </ChecklistRow>
        ))}
      </ul>
    </section>
  );
}

const rowClass =
  "relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:end-0 not-first:before:start-[56px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/** A checklist item; one that is missing leads to where it is fixed. */
function ChecklistRow({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  if (!href) return <li className={rowClass}>{children}</li>;
  return (
    <li className={cn(rowClass, "p-0")}>
      <Link
        href={href}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-calm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
      >
        {children}
        <ChevronRight
          aria-hidden="true"
          className="ms-auto size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
        />
      </Link>
    </li>
  );
}

// Open the business's app as one of its roles, read only.
function ViewAs({
  t,
  business,
  failed,
  viewAs,
}: {
  t: T;
  business: BusinessSetup;
  failed: boolean;
  viewAs: (form: FormData) => Promise<void>;
}) {
  return (
    <PageSection title={t("setup.viewAs.title")}>
      {failed ? (
        <p role="alert" className="px-1 text-danger text-sm">
          {t("setup.viewAs.failed")}
        </p>
      ) : null}
      <form
        action={viewAs}
        className="overflow-hidden rounded-card bg-surface shadow-card"
      >
        {VIEW_AS_ROLES.map((r) => (
          <button
            key={r}
            type="submit"
            name="role"
            value={r}
            className="relative flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start font-medium transition-colors duration-150 ease-calm not-first:before:absolute not-first:before:end-0 not-first:before:start-[60px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-[''] hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-[18px]"
            >
              <Eye />
            </span>
            <span className="min-w-0 flex-1">{t(`setup.viewAs.as.${r}`)}</span>
            <ChevronRight
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
            />
          </button>
        ))}
      </form>
      <p className="px-1 text-ink-2 text-sm">
        {t("setup.viewAs.body", { name: business.name })}
      </p>
    </PageSection>
  );
}

const th = "px-5 pt-4 pb-2.5 text-start font-medium text-ink-2 text-sm";
const td = "px-5 py-3 border-line border-t";

function People({
  t,
  business,
  issue,
}: {
  t: T;
  business: BusinessSetup;
  issue: Issue;
}) {
  const { people } = business;
  const name = (n: string) => n || t("setup.people.noName");
  const phone = (p: string | null) =>
    p ? <span dir="ltr">{displayIsraeliMobile(p)}</span> : null;
  const status = (s: SetupPerson["status"]) =>
    s === "expired" ? (
      <Badge tone="danger">{t("setup.people.expired")}</Badge>
    ) : s === "invited" ? (
      <Badge tone="warning">{t("setup.people.invited")}</Badge>
    ) : (
      <span className="text-ink-2">{t("setup.people.member")}</span>
    );
  // Keyed by the invite, so a renewed one keeps its new link on screen when
  // the page reads again and the row moves up.
  const key = (p: SetupPerson) =>
    p.inviteId ?? `member-${p.phone ?? ""}-${p.name}`;

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
          <PersonList
            aria-label={t("setup.people.listLabel")}
            className="xl:hidden"
          >
            {people.map((person) => (
              <PersonRow
                key={key(person)}
                name={person.name || null}
                title={name(person.name)}
                subtitle={
                  <>
                    {t(`memberRoles.${person.role}`)}
                    {person.phone ? " · " : null}
                    {phone(person.phone)}
                  </>
                }
                trailing={
                  person.status === "member" ? null : status(person.status)
                }
                below={
                  person.inviteId ? (
                    <InviteLink
                      inviteId={person.inviteId}
                      name={name(person.name)}
                      renew={person.status === "expired"}
                      issue={issue}
                    />
                  ) : null
                }
              />
            ))}
          </PersonList>
          <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                {t("setup.people.listLabel")}
              </caption>
              <thead>
                <tr>
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
                  <th scope="col" className={th}>
                    {t("setup.people.invite")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={key(person)}>
                    <th
                      scope="row"
                      className={cn(td, "text-start font-medium")}
                    >
                      <span className="flex items-center gap-3">
                        <PersonAvatar name={person.name || null} />
                        <span>{name(person.name)}</span>
                      </span>
                    </th>
                    <td className={cn(td, "text-ink-2")}>
                      {phone(person.phone)}
                    </td>
                    <td className={td}>{t(`memberRoles.${person.role}`)}</td>
                    <td className={td}>{status(person.status)}</td>
                    <td className={cn(td, "w-2/5")}>
                      {person.inviteId ? (
                        <InviteLink
                          inviteId={person.inviteId}
                          name={name(person.name)}
                          renew={person.status === "expired"}
                          issue={issue}
                        />
                      ) : null}
                    </td>
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
