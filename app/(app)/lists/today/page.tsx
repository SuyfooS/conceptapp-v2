import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { currentListsToday, listsAccess, listsPaths } from "../lists";
import { ListsTodayView } from "./today-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.lists.overview");
  return { title: t("title") };
}

// The business's lists of a day (lists L4), for whoever manages lists: today,
// or `?day=` one of the last week's. Anyone else who opens lists goes back to
// Lists; whoever can't gets the not-found screen.
export default async function ListsTodayPage({
  searchParams,
}: PageProps<"/lists/today">) {
  const { day } = await searchParams;
  const [data, access, wording] = await Promise.all([
    currentListsToday(typeof day === "string" ? day : undefined),
    listsAccess(),
    currentWording(),
  ]);
  if (!access) notFound();
  if (!data) redirect(listsPaths.lists);
  return (
    <ListsTodayView
      data={data}
      wording={wording}
      paths={{
        lists: listsPaths.lists,
        list: listsPaths.list,
        today: listsPaths.today,
        send: listsPaths.send,
        templates: listsPaths.templates,
        template: (id) => `${listsPaths.templates}/${id}`,
      }}
    />
  );
}
