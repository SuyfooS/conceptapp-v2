import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListView } from "../../../../(app)/lists/[id]/list-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListChange, demoSetListItem } from "../actions";
import { demoListScreen, demoLists } from "../data";
import { demoListsPaths } from "../paths";

export const generateStaticParams = () =>
  demoLists.map((list) => ({ id: list.id }));

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
};

// One of the demo's lists, as Shiran fills it. `?state=finished` shows it
// just finished by her, with the way back for five minutes.
export default function ShellList({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ id }, { state }] = await Promise.all([params, searchParams]);
  const data = demoListScreen(id, state === "finished");
  if (!data) notFound();
  return (
    <ListView
      data={data}
      actions={{
        setItem: demoSetListItem,
        finish: demoListChange,
        reopen: demoListChange,
      }}
      backHref={demoListsPaths.lists}
      wording={baseWording}
    />
  );
}
