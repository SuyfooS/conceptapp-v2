import type { BusinessSetup, SetupPerson } from "@db/admin";
import { accentTokens } from "@domain/color";
import type { Role } from "@domain/modules";
import { displayIsraeliMobile } from "@domain/phone";
import { type NamedRole, namedRoleName } from "@domain/role-access";
import { type SetupItem, setupChecklist, setupRemaining } from "@domain/setup";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { type ViewAsFailure, viewAsChoices, viewAsKey } from "@domain/view-as";
import { accentProps } from "@ui/accent";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { StepList, StepRow } from "@ui/step-list";
import {
  Check,
  ChevronRight,
  Eye,
  KeyRound,
  ListPlus,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
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
 * Viewing as a role offers the business's own named roles too, each after
 * the role it is built on (the roles plan's R11c).
 * Invites that ran out stay on the page, with a way to renew them, so a
 * business whose owner never joined is not stuck. Under the people, roles and
 * permissions and who sees pay, each on its own page. The staff are added
 * from a pasted list ("הוספה מרשימה": the checklist's staff item, and a link
 * beside the people's count), the owners one at a time.
 */
export async function BusinessView({
  business,
  listHref,
  created,
  viewFailure,
  settingsHref,
  wordingHref,
  addHref,
  importHref,
  rolesHref,
  accessHref,
  viewAs,
  namedRoles = [],
  issue,
}: {
  business: BusinessSetup;
  listHref: string;
  created: boolean;
  /** Why the last view didn't open (`?view=`), or null. */
  viewFailure: ViewAsFailure | null;
  /** Where this business's settings are, when the person may edit them. */
  settingsHref: string | null;
  /** Where this business's sentences are, when the person may edit them. */
  wordingHref: string | null;
  /** Where to add a person, when the person may invite staff. */
  addHref: string | null;
  /** Where to add people from a pasted list, when the person may invite staff. */
  importHref: string | null;
  /** What each role sees and does, when the person reads it. */
  rolesHref: string | null;
  /** Who sees pay, where it opens something and the person reads it. */
  accessHref: string | null;
  /** Bound to this business, when the person may view it as a role. */
  viewAs: ((form: FormData) => Promise<void>) | null;
  /** The business's live named roles, to view it as too; none by default. */
  namedRoles?: readonly NamedRole[];
  issue: Issue;
}) {
  const t = await getTranslations("admin");
  // Its rows read as the pages they open are named, as in the owner's /manage.
  const tAccess = await getTranslations("app.manage.access");
  const tRoles = await getTranslations("app.manage.roles");
  const template = templateName(t, business.templateKey);
  // Someone whose invite ran out can't join through it, so they don't count;
  // one waiting for the owners to send their first link does, whatever its
  // date (`pending` is never expired).
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
            hrefs={{
              people: addHref,
              staff: importHref,
              settings: settingsHref,
            }}
          />
          {settingsHref || wordingHref ? (
            <ListGroup>
              {settingsHref ? (
                <ListRow
                  href={settingsHref}
                  leading={<SlidersHorizontal />}
                  title={t("setup.settings.row")}
                  subtitle={t("setup.settings.subtitle")}
                />
              ) : null}
              {wordingHref ? (
                <ListRow
                  href={wordingHref}
                  leading={<MessageSquareText />}
                  title={t("wording.row")}
                  subtitle={t("wording.rowSubtitle")}
                />
              ) : null}
            </ListGroup>
          ) : null}
        </div>
        <div
          id="people"
          className="scroll-mt-4 md:col-start-2 md:row-span-2 md:row-start-1 xl:col-span-2 xl:col-start-1 xl:row-span-1 xl:row-start-2"
        >
          <People
            t={t}
            business={business}
            issue={issue}
            importHref={importHref}
            roles={
              rolesHref
                ? {
                    href: rolesHref,
                    title: tRoles("title"),
                    subtitle: tRoles("row"),
                  }
                : null
            }
            access={
              accessHref
                ? {
                    href: accessHref,
                    title: tAccess("title"),
                    subtitle: tAccess("row"),
                  }
                : null
            }
          />
        </div>
        {viewAs ? (
          <div className="md:col-start-1 md:row-start-2 xl:col-start-2 xl:row-start-1">
            <ViewAs
              t={t}
              business={business}
              failure={viewFailure}
              namedRoles={namedRoles}
              locale={await getLocale()}
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
  /**
   * Where a missing item is fixed, when the person may fix it: the owners
   * one at a time, the staff from a list.
   */
  hrefs: {
    people: string | null;
    staff: string | null;
    settings: string | null;
  };
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
    if (item.key === "staff") return hrefs.staff;
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
      <StepList className="relative z-10 mx-3 -mt-[60px]">
        {items.map((item) => (
          <StepRow
            key={item.key}
            // A missing item leads to where it is fixed.
            href={href(item)}
            mark={item.done ? "done" : "missing"}
            title={t(`setup.checklist.items.${item.key}.title`)}
            state={
              item.done ? t("setup.checklist.done") : t("setup.checklist.todo")
            }
            detail={body(item)}
          />
        ))}
      </StepList>
    </section>
  );
}

// Open the business's app as one of its roles, read only: the built-in
// ones, each followed by the business's named roles built on it, by their
// names with what each is built on (R11c).
function ViewAs({
  t,
  business,
  failure,
  namedRoles,
  locale,
  viewAs,
}: {
  t: T;
  business: BusinessSetup;
  failure: ViewAsFailure | null;
  namedRoles: readonly NamedRole[];
  /** For a named role's English name, where it has one. */
  locale: string;
  viewAs: (form: FormData) => Promise<void>;
}) {
  return (
    <PageSection title={t("setup.viewAs.title")}>
      {failure ? (
        <p role="alert" className="px-1 text-danger text-sm">
          {t(`setup.viewAs.${failure}`)}
        </p>
      ) : null}
      <form
        action={viewAs}
        className="overflow-hidden rounded-card bg-surface shadow-card"
      >
        {viewAsChoices(namedRoles).map((choice) => (
          <button
            key={viewAsKey(choice)}
            type="submit"
            name="role"
            value={viewAsKey(choice)}
            className="relative flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start font-medium transition-colors duration-150 ease-calm not-first:before:absolute not-first:before:end-0 not-first:before:start-[60px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-[''] hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-[18px]"
            >
              <Eye />
            </span>
            {choice.namedRole ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span>
                  {t("setup.viewAs.asNamed", {
                    role: namedRoleName(choice.namedRole, locale),
                  })}
                </span>
                <span className="font-normal text-ink-2 text-sm">
                  {t("setup.viewAs.namedHint", {
                    role: t(`memberRoles.${choice.role}`),
                  })}
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                {t(`setup.viewAs.as.${choice.role}`)}
              </span>
            )}
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

type PageLink = { href: string; title: string; subtitle: string };

function People({
  t,
  business,
  issue,
  importHref,
  roles,
  access,
}: {
  t: T;
  business: BusinessSetup;
  issue: Issue;
  /** "הוספה מרשימה", beside the count: never a second accent button. */
  importHref: string | null;
  /** Roles and permissions, its row as the owner's /manage names it. */
  roles: PageLink | null;
  /** Who sees pay, its row as the owner's /manage names it. */
  access: PageLink | null;
}) {
  const { people } = business;
  const name = (n: string) => n || t("setup.people.noName");
  const phone = (p: string | null) =>
    p ? <span dir="ltr">{displayIsraeliMobile(p)}</span> : null;
  // One nobody got a link for yet (the wizard's) says so, as the owners'
  // Team screen does: never "הוזמן", nor "ההזמנה פגה" once its date passed.
  const status = (s: SetupPerson["status"]) =>
    s === "expired" ? (
      <Badge tone="danger">{t("setup.people.expired")}</Badge>
    ) : s === "invited" ? (
      <Badge tone="warning">{t("setup.people.invited")}</Badge>
    ) : s === "pending" ? (
      <Badge tone="accent">{t("setup.people.pending")}</Badge>
    ) : (
      <span className="text-ink-2">{t("setup.people.member")}</span>
    );
  // Keyed by the invite, so a renewed one keeps its new link on screen when
  // the page reads again and the row moves up.
  const key = (p: SetupPerson) =>
    p.inviteId ?? `member-${p.phone ?? ""}-${p.name}`;
  // An invite's link, and for one waiting for its first who sends it.
  const invite = (p: SetupPerson) => {
    if (!p.inviteId) return null;
    const link = (
      <InviteLink
        inviteId={p.inviteId}
        name={name(p.name)}
        renew={p.status === "expired"}
        issue={issue}
      />
    );
    return p.status === "pending" ? (
      <div className="flex flex-col gap-2">
        <p className="text-pretty text-ink-2 text-sm">
          {t("setup.people.pendingHint")}
        </p>
        {link}
      </div>
    ) : (
      link
    );
  };

  return (
    <PageSection
      title={t("setup.people.title")}
      action={
        <span className="flex flex-wrap items-center justify-end gap-x-3">
          <span className="text-ink-2 text-sm">
            {t("setup.people.count", { count: people.length })}
          </span>
          {importHref ? (
            <Button asChild variant="ghost" className="-me-2 px-3">
              <Link href={importHref}>
                <ListPlus aria-hidden="true" />
                {t("setup.people.import")}
              </Link>
            </Button>
          ) : null}
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
                below={invite(person)}
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
                    <td className={cn(td, "w-2/5")}>{invite(person)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {roles || access ? (
        <ListGroup className="xl:max-w-2xl">
          {roles ? (
            <ListRow
              href={roles.href}
              leading={<ShieldCheck />}
              title={roles.title}
              subtitle={roles.subtitle}
            />
          ) : null}
          {access ? (
            <ListRow
              href={access.href}
              leading={<KeyRound />}
              title={access.title}
              subtitle={access.subtitle}
            />
          ) : null}
        </ListGroup>
      ) : null}
    </PageSection>
  );
}
