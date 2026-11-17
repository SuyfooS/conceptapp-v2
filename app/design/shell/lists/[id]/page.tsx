import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListView } from "../../../../(app)/lists/[id]/list-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoListChange,
  demoPassList,
  demoRemoveListPhoto,
  demoSetListItem,
  demoSetListPhoto,
} from "../actions";
import {
  type DemoFixState,
  type DemoPhotoState,
  demoEarlierLists,
  demoListScreen,
  demoLists,
} from "../data";
import { demoListsPaths } from "../paths";

export const generateStaticParams = () =>
  [...demoLists, ...demoEarlierLists].map((list) => ({ id: list.id }));

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
};

const PHOTO_STATES: readonly DemoPhotoState[] = ["photo", "demo", "gone"];
const photoState = (state: string | undefined): DemoPhotoState | null =>
  PHOTO_STATES.find((each) => each === state) ?? null;
const FIX_STATES: readonly DemoFixState[] = ["fix", "fixed"];
const fixState = (state: string | undefined): DemoFixState | null =>
  FIX_STATES.find((each) => each === state) ?? null;

// One of the demo's lists, as Shiran fills it. `?state=finished` shows it
// just finished by her, with the way back for five minutes; `?state=passed`
// the bar's order once the storeroom gave what it had and passed it back to
// the bar, with a note (L5). For a list with a photo item, the weekly
// cleaning (L6): `?state=photo` as just opened, its photo still to take or
// choose; `?state=demo` the same in a demo business, which takes none;
// `?state=gone` as it was, its photo no longer kept. `?state=history` (L6a)
// with its items' stories: the kitchen's opening, whose fridge reading Itay
// changed after Noa, and the weekly cleaning, opened again and closed. On
// the kitchen's opening (L6b-1), `?state=fix` as Noa closed it at 08:05,
// being fixed by Shiran, who runs the lists, past Noa's five minutes;
// `?state=fixed` once Shiran fixed its freezer reading at 08:10.
export default function ShellList({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ id }, { state }] = await Promise.all([params, searchParams]);
  const data = demoListScreen(
    id,
    state === "finished",
    state === "passed",
    photoState(state),
    state === "history",
    fixState(state),
  );
  if (!data) notFound();
  return (
    <ListView
      key={state ?? ""}
      fixing={state === "fix"}
      data={data}
      actions={{
        setItem: demoSetListItem,
        finish: demoListChange,
        reopen: demoListChange,
        pass: demoPassList,
        setPhoto: demoSetListPhoto,
        removePhoto: demoRemoveListPhoto,
      }}
      backHref={demoListsPaths.lists}
      wording={baseWording}
    />
  );
}
