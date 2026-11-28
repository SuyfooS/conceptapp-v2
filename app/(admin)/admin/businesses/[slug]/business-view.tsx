import type { BusinessSetup, SetupPerson } from "@db/admin";
import { accentTokens } from "@domain/color";
import { displayIsraeliMobile } from "@domain/phone";
import { type NamedRole, namedRoleName } from "@domain/role-access";
import {
  countsInSetup,
  SETUP_ITEM_MODULE,
  type SetupItem,
  type SetupModuleFacts,
  setupChecklist,
  setupCounted,
  setupDone,
  setupPeople,
  setupRemaining,
  setupTeam,
} from "@domain/setup";
import { TEMPLATE_KEYS, type TemplateKey } from "@domain/templates";
import { type ViewAsFailure, viewAsChoices, viewAsKey } from "@domain/view-as";
import type { Wording } from "@domain/wording";
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
import { WordingProvider } from "@/app/(app)/wording-provider";
import type { InviteShareSetup } from "@/app/invite-share";
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
 * beside the people's count), the owners one at a time. Beyond the people
 * and the address, the checklist reads what the business's modules hold
 * (closing the pilot, PR 16): the Shabbat answer, job roles and shifts, the
 * clock's code, who sees pay, who of the staff joined and the first week
 * published, each while its module is on (`facts`), a missing one leading to
 * where the team fixes it.
 */
export async function BusinessView({
  business,
  facts,
  listHref,
  created,
  shabbatUnsaved = false,
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
  whatsappToNumber = false,
  inviteWording = {},
}: {
  business: BusinessSetup;
  /** What the checklist reads from the business's modules (`setupModuleFacts`). */
  facts: SetupModuleFacts;
  listHref: string;
  created: boolean;
  /**
   * Just opened, and the wizard's answer about Shabbat could not be saved
   * (`?shabbat=unsaved`): the card says so, and where to set it.
   */
  shabbatUnsaved?: boolean;
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
  /**
   * Each link on WhatsApp to the invite's own number: the real page's,
   * behind the database. A twin's made-up numbers may be someone's, so by
   * default WhatsApp asks whom to send to.
   */
  whatsappToNumber?: boolean;
  /**
   * The business's own sentences for what its invites' links go out with
   * (`inviteShareWording`): the real page's. The app's by default.
   */
  inviteWording?: Wording;
}) {
  const t = await getTranslations("admin");
  // Its rows read as the pages they open are named, as in the owner's /manage.
  const tAccess = await getTranslations("app.manage.access");
  const tRoles = await getTranslations("app.manage.roles");
  const template = templateName(t, business.templateKey);
  const items = setupChecklist({
    people: setupPeople(business.people),
    hasAddress: business.address !== null,
    team: setupTeam(business.people),
    ...facts,
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
          className="flex items-center gap-3 md:max-w-2xl"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-5"
          >
            <Check />
          </span>
          <span className="flex min-w-0 flex-col">
            <span role="status" className="flex flex-col">
              <span className="font-semibold">
                {t("setup.opened.title", { name: business.name })}
              </span>
              <CardText className="text-sm">
                {t("setup.opened.body", { template })}
              </CardText>
            </span>
            {shabbatUnsaved ? (
              // An alert of its own beside the status, never inside it: the
              // card arrives with the page, words and all, and a status drawn
              // that way is often not heard, where an alert is said as it is
              // drawn (as the view-as failure below).
              <span role="alert" className="font-medium text-sm text-warning">
                {t("setup.opened.shabbatUnsaved")}
              </span>
            ) : null}
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
          {/* Each link goes out in the business's own sentence, as from /team. */}
          <WordingProvider overrides={inviteWording}>
            <People
              t={t}
              business={business}
              issue={issue}
              share={{ business: business.name, toNumber: whatsappToNumber }}
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
          </WordingProvider>
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

/** The page has one checklist, so its title's id is fixed. */
const CHECKLIST_TITLE_ID = "setup-checklist-title";

/** Each mark in words, for screen readers. */
const STATE = { done: "done", missing: "todo", open: "open" } as const;

/**
 * The state of the setup on the business's colour, the list floating over
 * it. A missing item leads to where the team fixes it: the people one at a
 * time or from a list, the people list here for their links, and the
 * settings page at the module's own section. The first week is the
 * business's to publish, and who sees pay is there to check, so neither
 * leads anywhere from here (who sees pay has its row under the people). The
 * clock's code, who sees pay and Shabbat with no answer stored are never
 * counted (`countsInSetup`), and say so beside them: a choice, or there to
 * check.
 */
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
   * one at a time, the staff from a list, the business's settings.
   */
  hrefs: {
    people: string | null;
    staff: string | null;
    settings: string | null;
  };
}) {
  const remaining = setupRemaining(items);
  // Counted as the owner and staff items count them (`setupPeople`).
  const people = setupPeople(business.people);
  // Why no owner counts yet, when one is on the list: their first link,
  // only the team's to make, or an invite that ran out. Both are fixed in
  // the people list, never by inviting them again.
  const ownerWaiting = (["pending", "expired"] as const).find((status) =>
    business.people.some((p) => p.role === "owner" && p.status === status),
  );
  // The settings page at the section of the item's module, or at its top
  // (the business's details) for one of the business itself.
  const settings = (item: SetupItem) => {
    if (!hrefs.settings) return null;
    const module = SETUP_ITEM_MODULE[item.key];
    return module ? `${hrefs.settings}#${module}` : hrefs.settings;
  };
  // A missing owner is invited as an owner; one with no link yet gets it,
  // and one whose invite ran out is renewed, in the people list, never
  // invited again in another role.
  const href = (item: SetupItem) => {
    if (item.done) return null;
    switch (item.key) {
      case "owner":
        if (!hrefs.people) return null;
        return ownerWaiting ? "#people" : `${hrefs.people}?role=owner`;
      case "staff":
        return hrefs.staff;
      case "address":
      case "shabbat":
      case "shifts":
      case "clockCode":
        return settings(item);
      case "joined": {
        // Each one's link is made in the people list; with nobody there
        // yet, the staff item leads to adding them.
        const { invited, expired, pending } = item.team;
        return invited + expired + pending > 0 ? "#people" : null;
      }
      default:
        return null;
    }
  };
  const body = (item: SetupItem) => {
    switch (item.key) {
      case "opened":
        return t("setup.checklist.items.opened.done", { template });
      case "owner":
        return item.done
          ? t("setup.checklist.items.owner.done", { count: people.owner })
          : t(`setup.checklist.items.owner.${ownerWaiting ?? "todo"}`);
      case "staff":
        return item.done
          ? t("setup.checklist.items.staff.done", {
              count: people.manager + people.worker,
            })
          : t("setup.checklist.items.staff.todo");
      case "address":
        return item.done
          ? t("setup.checklist.items.address.done", {
              address: business.address ?? "",
            })
          : t("setup.checklist.items.address.todo");
      case "shabbat":
        return t(`setup.checklist.items.shabbat.${item.answer ?? "noAnswer"}`);
      case "shifts":
        return item.done
          ? t("setup.checklist.items.shifts.done", {
              positions: item.positions,
              shifts: item.patterns,
            })
          : t("setup.checklist.items.shifts.todo", {
              missing:
                item.positions > 0
                  ? "shifts"
                  : item.patterns > 0
                    ? "positions"
                    : "both",
            });
      case "clockCode":
        return item.code === "station" || item.code === "both"
          ? t(`setup.checklist.items.clockCode.${item.code}`, {
              count: item.stations,
            })
          : t(`setup.checklist.items.clockCode.${item.code}`);
      case "pay":
        return t("setup.checklist.items.pay.done", {
          roles: item.roles.length === 2 ? "both" : (item.roles[0] ?? "none"),
          personal: item.personal,
        });
      case "joined": {
        const { joined, invited, pending, expired } = item.team;
        // One sentence each, those with nobody in them left out.
        return [
          t("setup.checklist.items.joined.joined", { count: joined }),
          invited > 0
            ? t("setup.checklist.items.joined.invited", { count: invited })
            : null,
          pending > 0
            ? t("setup.checklist.items.joined.pending", { count: pending })
            : null,
          expired > 0
            ? t("setup.checklist.items.joined.expired", { count: expired })
            : null,
        ]
          .filter((sentence) => sentence !== null)
          .join(" ");
      }
      case "publish":
        return item.done
          ? t("setup.checklist.items.publish.done")
          : t("setup.checklist.items.publish.todo");
    }
  };
  // Done; missing, where it counts; or not yet, for a choice.
  const mark = (item: SetupItem): keyof typeof STATE =>
    item.done ? "done" : countsInSetup(item) ? "missing" : "open";

  return (
    <section
      aria-labelledby={CHECKLIST_TITLE_ID}
      className="flex flex-col"
      {...accentProps(accentTokens(business.accent))}
    >
      <Card tone="hero" padding="none" className="px-5 pt-5 pb-[84px]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={CHECKLIST_TITLE_ID} className="font-medium text-base">
            {t("setup.checklist.title")}
          </h2>
          <span className="inline-flex min-h-[30px] items-center rounded-full bg-[color-mix(in_srgb,var(--accent-ink)_18%,transparent)] px-3 font-semibold text-sm">
            {t("setup.checklist.progress", {
              done: setupDone(items),
              total: setupCounted(items),
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
            href={href(item)}
            mark={mark(item)}
            title={t(`setup.checklist.items.${item.key}.title`)}
            state={t(`setup.checklist.${STATE[mark(item)]}`)}
            detail={body(item)}
            badge={
              countsInSetup(item) ? null : (
                <Badge>
                  {t(
                    item.key === "clockCode"
                      ? "setup.checklist.optional"
                      : "setup.checklist.toCheck",
                  )}
                </Badge>
              )
            }
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
  share,
  importHref,
  roles,
  access,
}: {
  t: T;
  business: BusinessSetup;
  issue: Issue;
  /** Where each link goes on WhatsApp (`InviteShare`). */
  share: InviteShareSetup;
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
  // An invite's link, and for one waiting for its first who sends it: an
  // owner's is made and sent from here (a business the wizard opened has no
  // owner yet to send it), anyone else's by the owners, from /team. In the
  // same wrapper whatever its state: making a link reads the page again, and
  // the row it was made on is "הוזמן" now; a slot that changed its element
  // would draw a new press in place of the link just made.
  const invite = (p: SetupPerson) => {
    if (!p.inviteId) return null;
    return (
      <div className="flex flex-col gap-2">
        {p.status === "pending" ? (
          <p className="text-pretty text-ink-2 text-sm">
            {t(
              p.role === "owner"
                ? "setup.people.ownerPendingHint"
                : "setup.people.pendingHint",
            )}
          </p>
        ) : null}
        <InviteLink
          inviteId={p.inviteId}
          name={name(p.name)}
          phone={p.phone}
          share={share}
          // The owner's first link, from here, says it is theirs to manage.
          words={p.role === "owner" ? "owner" : "team"}
          renew={p.status === "expired"}
          issue={issue}
        />
      </div>
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
