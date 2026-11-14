import { getBusinessSetup } from "@db/admin";
import { getPayAccessForTeam } from "@db/payroll";
import { accessOrder } from "@domain/payroll-access";
import { consolePayAccess } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AccessView } from "@/app/(app)/manage/access/access-view";
import { currentPlatformStaff } from "../../../../staff";
import { setTeamPersonalPayAction, setTeamRolePayAction } from "./actions";
import { payAccessIn } from "./pay-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.manage.access");
  return { title: t("title") };
}

/**
 * Who sees pay in a business, from the console: the owner's own screen, with
 * the console's actions and its way back to the business. Every team role
 * that reads businesses sees it, and one that may invite people changes it
 * (`consolePayAccess`). A demo business too, as the console sets up a demo's
 * settings, sentences and lists: its owner changes it in the app the same
 * way. Not found off the team, for an unknown business, and where pay access
 * opens nothing: no module that is on uses it (the time clock's hours for
 * payroll, chat's documents).
 */
export default async function TeamAccessPage({
  params,
}: PageProps<"/admin/businesses/[slug]/access">) {
  const staff = await currentPlatformStaff();
  const may = consolePayAccess(staff?.role ?? null);
  if (!staff || may === null) notFound();
  const { slug } = await params;
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  // The actions ask the same again before they write.
  const applies = await payAccessIn(business.id);
  if (!applies) notFound();
  const { roles, people } = await getPayAccessForTeam(business.id);
  return (
    <AccessView
      data={{
        roles,
        people: people.sort(accessOrder),
        me: staff.userId,
        viewOnly: may !== "change",
        documents: applies.documents,
      }}
      // Each write names the business the screen is drawn for.
      actions={{
        setRole: setTeamRolePayAction.bind(null, business.id),
        setPerson: setTeamPersonalPayAction.bind(null, business.id),
      }}
      paths={{
        place: "console",
        business: `/admin/businesses/${business.slug}`,
        name: business.name,
      }}
      // The team holds no pay access: its look is not a pay holder's.
      noted={null}
    />
  );
}
