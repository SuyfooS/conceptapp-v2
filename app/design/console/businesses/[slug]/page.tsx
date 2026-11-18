import { namedRoleShown } from "@domain/team";
import { notFound } from "next/navigation";
import { BusinessView } from "../../../../(admin)/admin/businesses/[slug]/business-view";
import { demoNamedRole } from "../../../shell/data";
import { demoIssueLink, demoViewAs } from "../../actions";
import { setups } from "../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// The real page for one business, with mock people. "cafe-noa" has just been
// opened; "demo-restaurant" has everything done, and a role of its own to
// view it as, the shell's "אחראי משמרת" on workers (the roles plan's R11c);
// "bar-hayam" is stuck on an owner invite that ran out.
export default async function ConsoleBusinessDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <BusinessView
      business={setup.business}
      listHref="/design/console"
      created={setup.created}
      viewFailure={null}
      settingsHref={`/design/console/businesses/${slug}/settings`}
      wordingHref={`/design/console/businesses/${slug}/wording`}
      addHref={`/design/console/businesses/${slug}/people/new`}
      rolesHref={`/design/console/businesses/${slug}/roles`}
      accessHref={`/design/console/businesses/${slug}/access`}
      viewAs={demoViewAs}
      namedRoles={
        slug === "demo-restaurant" ? [namedRoleShown(demoNamedRole)] : []
      }
      issue={demoIssueLink}
    />
  );
}
