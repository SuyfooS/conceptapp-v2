import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../../../(app)/wording";
import { revealPastAction } from "../actions";
import { currentPastFile } from "../past-file";
import { PastFileView, PastUnavailable } from "../past-file-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words, never a business's name.
  const t = translator(baseWording, "app.file");
  return { title: t("metaTitle") };
}

// A former worker's own file in a business they left (profile H5c),
// read-only, from "עבודות קודמות". The business's id is all the address
// holds; no value ever is. Anything that isn't a business they left gets
// the not-found screen, the same for each, so ids can't be probed. Dynamic
// and per person, so it answers no-store, and nothing here is cached.
export default async function PastFilePage({
  params,
}: PageProps<"/me/past/[business]">) {
  const { business } = await params;
  const screen = await currentPastFile(business);
  if (screen.kind === "closed") notFound();
  if (screen.kind !== "file") return <PastUnavailable screen={screen} />;
  const { data } = screen;
  return (
    <PastFileView
      data={data}
      reveal={revealPastAction.bind(null, data.job.businessId)}
    />
  );
}
