import type { Role } from "@domain/modules";
import { type KnownInvite, knownTeamOf } from "@domain/people-import";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConsoleImportClosed } from "../../../../../../(admin)/admin/businesses/[slug]/people/import/closed-view";
import { consoleImportRoles } from "../../../../../../(admin)/admin/businesses/[slug]/people/import/console-roles";
import { baseWording, translator } from "../../../../../../(app)/wording";
import { demoNamedRole } from "../../../../../shell/data";
import {
  againInvites,
  againMembers,
  importPastes,
} from "../../../../../shell/team/import/data";
import { ImportTwin } from "../../../../../shell/team/import/import-twin";
import { setups } from "../../../../data";
import { elsewherePaste } from "./data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string; fail?: string }>;
};

const STATES = [
  "empty",
  "whatsapp",
  "sheet",
  "problems",
  "again",
  "tooMany",
  "done",
  "removed",
  "elsewhere",
  "closed",
] as const;
type State = (typeof STATES)[number];

// The console's "הוספת אנשים מרשימה" as the ConceptApp team sees it at a
// business's setup, on that business's people from the console's twin
// (../../../../data.ts), with the Team twin's pastes and states (a clinic's
// WhatsApp list, a shop's sheet, a cleaning crew's lines to fix, the sheet
// again, 320 people, imported and taken back), in the console's words.
// ?state=elsewhere a shop's sheet with the owner of another of the twin's
// businesses on it, which the stand-in refuses on pressing as the
// console's database does; ?state=closed the card for a demo business,
// which takes no invites. &fail=import or &fail=undo as the Team twin's.
// The stand-ins write nothing anywhere, and nothing pasted leaves the
// device.
export default function ConsolePeopleImportDemo({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ slug }, { state: asked, fail: failing }] = await Promise.all([
    params,
    searchParams,
  ]);
  const setup = setups[slug];
  if (!setup) notFound();
  const { business } = setup;
  const businessHref = `/design/console/businesses/${slug}`;
  const state: State = STATES.includes(asked as State)
    ? (asked as State)
    : "empty";
  if (state === "closed") {
    return (
      <ConsoleImportClosed name={business.name} businessHref={businessHref} />
    );
  }
  const fail = failing === "import" || failing === "undo" ? failing : undefined;
  const tr = translator(baseWording, "app.roles");
  const labels: Record<Role, string> = {
    owner: tr("owner"),
    manager: tr("manager"),
    worker: tr("worker"),
    accountant: tr("accountant"),
  };
  // The restaurant's own named role, as its business twin offers it.
  const roles = consoleImportRoles(
    slug === "demo-restaurant" ? [demoNamedRole] : [],
    labels,
  );
  const people = business.people;
  const invites: KnownInvite[] = people.flatMap((person) =>
    person.inviteId
      ? [
          {
            id: person.inviteId,
            phone: person.phone ?? "",
            name: person.name || null,
            role: person.role,
            namedRole: null,
            linkPending: person.status === "pending",
            expired: person.status === "expired",
            touchable: person.role === "manager" || person.role === "worker",
          },
        ]
      : [],
  );
  const members = people
    .filter((person) => person.status === "member")
    .map((person) => ({ phone: person.phone, name: person.name || null }));
  const again = state === "again";
  const known = knownTeamOf(
    [...members, ...(again ? againMembers : [])],
    [...invites, ...(again ? againInvites : [])],
  );
  // On the staff of the twin's other businesses: never their accountants.
  const elsewhere = Object.entries(setups).flatMap(([other, { business }]) =>
    other === slug
      ? []
      : business.people.flatMap((person) =>
          person.status === "member" &&
          person.role !== "accountant" &&
          person.phone
            ? [person.phone]
            : [],
        ),
  );
  const paste =
    state === "whatsapp" || state === "done" || state === "removed"
      ? importPastes.whatsapp
      : state === "sheet" || state === "again"
        ? importPastes.sheet
        : state === "problems"
          ? importPastes.problems
          : state === "tooMany"
            ? importPastes.tooMany
            : state === "elsewhere"
              ? elsewherePaste
              : "";
  const t = await getTranslations("admin.peopleImport");
  return (
    <ImportTwin
      // A state of its own each, so a link from one to another starts afresh.
      key={`${state}:${fail ?? ""}`}
      mode="console"
      roles={roles}
      known={known}
      initialPaste={paste}
      startAt={state === "done" || state === "removed" ? state : undefined}
      fail={fail}
      paths={{
        back: { href: businessHref, label: business.name },
        done: {
          href: businessHref,
          label: t("done.toBusiness", { name: business.name }),
        },
      }}
      elsewhere={elsewhere}
    />
  );
}
