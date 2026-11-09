import { notFound } from "next/navigation";
import { AddPersonView } from "../../../../../../(admin)/admin/businesses/[slug]/people/new/add-person-view";
import { demoInviteAction } from "../../../../../shell/team/actions";
import { setups } from "../../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// The real "add a person" screen, with the demo's stand-in action: the same
// checks and a link that leads nowhere.
export default async function ConsoleAddPersonDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <AddPersonView
      name={setup.business.name}
      businessHref={`/design/console/businesses/${slug}`}
      invite={demoInviteAction}
    />
  );
}
