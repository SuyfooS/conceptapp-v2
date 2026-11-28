import { namedRoleShown } from "@domain/team";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BusinessView } from "../../../../(admin)/admin/businesses/[slug]/business-view";
import { demoNamedRole } from "../../../shell/data";
import { demoIssueLink, demoRefusedIssueLink, demoViewAs } from "../../actions";
import { setups } from "../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ issue?: string; shabbat?: string }>;
};

// The real page for one business, with mock people. "cafe-noa" has just been
// opened; "demo-restaurant" has everything done, and a role of its own to
// view it as, the shell's "אחראי משמרת" on workers (the roles plan's R11c);
// "bar-hayam" is stuck on an owner invite that ran out, was opened before
// the wizard asked about Shabbat, and shows its clock's code only at a
// station while none runs (closing the pilot, PR 16). `?issue=refused`:
// each invite link is refused, as one that couldn't be made.
// `?shabbat=unsaved` on "cafe-noa": the wizard's answer about Shabbat could
// not be saved as it opened (closing the pilot, PR 3).
export default function ConsoleBusinessDemo({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ slug }, { issue, shabbat }] = await Promise.all([
    params,
    searchParams,
  ]);
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <BusinessView
      business={setup.business}
      facts={setup.facts}
      listHref="/design/console"
      created={setup.created}
      shabbatUnsaved={setup.created && shabbat === "unsaved"}
      viewFailure={null}
      settingsHref={`/design/console/businesses/${slug}/settings`}
      wordingHref={`/design/console/businesses/${slug}/wording`}
      addHref={`/design/console/businesses/${slug}/people/new`}
      importHref={`/design/console/businesses/${slug}/people/import`}
      rolesHref={`/design/console/businesses/${slug}/roles`}
      accessHref={`/design/console/businesses/${slug}/access`}
      viewAs={demoViewAs}
      namedRoles={
        slug === "demo-restaurant" ? [namedRoleShown(demoNamedRole)] : []
      }
      issue={issue === "refused" ? demoRefusedIssueLink : demoIssueLink}
    />
  );
}
