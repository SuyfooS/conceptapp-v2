import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessView } from "../../../../../(app)/manage/access/access-view";
import {
  demoSetPersonalPay,
  demoSetRolePay,
} from "../../../../shell/manage/access/actions";
import { consoleAccess, setups } from "../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string }>;
};

// Who sees pay as the team sets it in the console: the owner's screen with
// the demo's people, stand-in actions that store nothing, and the way back to
// the business. `?state=readOnly` is a team role that only reads businesses.
export default function ConsoleAccessDemo({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ slug }, { state }] = await Promise.all([params, searchParams]);
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <AccessView
      data={consoleAccess(slug, state === "readOnly")}
      actions={{ setRole: demoSetRolePay, setPerson: demoSetPersonalPay }}
      paths={{
        place: "console",
        business: `/design/console/businesses/${slug}`,
        name: setup.business.name,
      }}
      noted={null}
    />
  );
}
