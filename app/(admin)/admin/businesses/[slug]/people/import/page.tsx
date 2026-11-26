import { getBusinessSetup } from "@db/admin";
import { invitesOpen } from "@db/invites";
import { consoleKnownTeam } from "@db/people-import";
import { getGivableNamedRoles } from "@db/roles";
import { getWordingForTeam } from "@db/wording";
import type { Role } from "@domain/modules";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PeopleImportView } from "@/app/(app)/team/import/import-view";
import { translator, wordingFrom } from "@/app/(app)/wording";
import { currentPlatformRole } from "../../../../../staff";
import { importConsolePeopleAction, undoConsoleImportAction } from "./actions";
import { ConsoleImportClosed } from "./closed-view";
import { consoleImportRoles } from "./console-roles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.peopleImport");
  return { title: t("title") };
}

/** A business's words for the built-in roles: its own, its template's, or the app's. */
async function roleLabels(businessId: string): Promise<Record<Role, string>> {
  const stored = await getWordingForTeam(businessId);
  const sentences = (rows: readonly { key: string; sentence: string }[]) =>
    Object.fromEntries(rows.map((row) => [row.key, row.sentence]));
  const tr = translator(
    wordingFrom({
      template: sentences(stored.template),
      business: sentences(stored.business),
    }),
    "app.roles",
  );
  return {
    owner: tr("owner"),
    manager: tr("manager"),
    worker: tr("worker"),
    accountant: tr("accountant"),
  };
}

// The ConceptApp team pastes a business's list at setup (inviting from a
// list, part 4; Orel, 25 November 2026): the same screen /team will have,
// in the console's words, against the business's own team (read with the
// secret key, `consoleKnownTeam`) and its roles in its own words. A demo
// business, which takes no invites, gets a card that says so, and no form.
export default async function ConsolePeopleImportPage({
  params,
}: PageProps<"/admin/businesses/[slug]/people/import">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "staff.invite")) notFound();
  const { slug } = await params;
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  const businessHref = `/admin/businesses/${business.slug}`;
  if (!(await invitesOpen(business.id))) {
    return (
      <ConsoleImportClosed name={business.name} businessHref={businessHref} />
    );
  }
  const [known, named, labels, t] = await Promise.all([
    consoleKnownTeam(business.id),
    getGivableNamedRoles(business.id),
    roleLabels(business.id),
    getTranslations("admin.peopleImport"),
  ]);
  const bound = { id: business.id, slug: business.slug };
  return (
    <PeopleImportView
      mode="console"
      roles={consoleImportRoles(named, labels)}
      known={known}
      importPeople={importConsolePeopleAction.bind(null, bound)}
      undoImport={undoConsoleImportAction.bind(null, bound)}
      paths={{
        back: { href: businessHref, label: business.name },
        done: {
          href: businessHref,
          label: t("done.toBusiness", { name: business.name }),
        },
      }}
    />
  );
}
