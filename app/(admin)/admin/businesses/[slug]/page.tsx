import { getBusinessSetup } from "@db/admin";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { getViewableNamedRoles } from "@db/view-as";
import {
  consolePayAccess,
  consoleRolesAccess,
  platformCan,
} from "@domain/platform";
import { viewAsFailureOf } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentPlatformRole } from "../../../staff";
import { payAccessFrom } from "./access/pay-access";
import { inviteLinkAction, viewAsAction } from "./actions";
import { BusinessView } from "./business-view";
import { inviteShareWording } from "./invite-wording";
import { setupModuleFacts } from "./setup-facts";

export async function generateMetadata({
  params,
}: PageProps<"/admin/businesses/[slug]">): Promise<Metadata> {
  // The slug, not the name: reading the business needs the signed-in
  // person, and the page itself checks they are on the team.
  const { slug } = await params;
  return { title: slug };
}

export default async function BusinessSetupPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.read")) notFound();
  const [{ slug }, { created, view, shabbat }] = await Promise.all([
    params,
    searchParams,
  ]);
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  const viewsAs = platformCan(role, "businesses.view_as");
  // The business's modules, read once: who sees pay, where a module that is
  // on uses it (its page says why), and the checklist's facts from them.
  // Beside them, as neither waits for the modules: the roles the business
  // named, each one more to view it as (R11c), and its own sentence for its
  // invites' links, as /team sends them.
  const [{ payAccess, facts }, namedRoles, inviteWording] = await Promise.all([
    getBusinessModulesForTeam(business.id).then(async (rows) => {
      const payAccess =
        consolePayAccess(role) !== null && payAccessFrom(rows) !== null;
      return {
        payAccess,
        facts: await setupModuleFacts(business.id, rows, payAccess),
      };
    }),
    viewsAs ? getViewableNamedRoles(business.id) : [],
    inviteShareWording(business.id),
  ]);

  return (
    <BusinessView
      business={business}
      facts={facts}
      listHref="/admin"
      created={Boolean(created)}
      shabbatUnsaved={Boolean(created) && shabbat === "unsaved"}
      viewFailure={viewAsFailureOf(view)}
      settingsHref={
        platformCan(role, "businesses.edit")
          ? `/admin/businesses/${business.slug}/settings`
          : null
      }
      wordingHref={
        platformCan(role, "businesses.edit")
          ? `/admin/businesses/${business.slug}/wording`
          : null
      }
      addHref={
        platformCan(role, "staff.invite")
          ? `/admin/businesses/${business.slug}/people/new`
          : null
      }
      importHref={
        platformCan(role, "staff.invite")
          ? `/admin/businesses/${business.slug}/people/import`
          : null
      }
      rolesHref={
        consoleRolesAccess(role) !== null
          ? `/admin/businesses/${business.slug}/roles`
          : null
      }
      accessHref={
        payAccess ? `/admin/businesses/${business.slug}/access` : null
      }
      viewAs={
        viewsAs
          ? viewAsAction.bind(null, { id: business.id, slug: business.slug })
          : null
      }
      namedRoles={namedRoles}
      issue={inviteLinkAction}
      // Each link to the number it was made for: the real page alone.
      whatsappToNumber
      inviteWording={inviteWording}
    />
  );
}
