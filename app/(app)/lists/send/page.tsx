import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { sendListAction } from "../actions";
import {
  currentSendForm,
  currentSentToday,
  listsAccess,
  listsPaths,
} from "../lists";
import { SendForm } from "./send-form";
import { SentToday } from "./sent-today";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.lists.send");
  return { title: t("title") };
}

// Sending a list now: `?template=` starts from one, `?template=new` from a
// list typed now. Whoever may send nothing, or is only viewing, goes back to
// Lists; whoever can't open lists gets the not-found screen. Sending is
// bound to the business the screen was drawn for.
export default async function SendListPage({
  searchParams,
}: PageProps<"/lists/send">) {
  const { template } = await searchParams;
  const [data, sent, access, wording] = await Promise.all([
    currentSendForm(typeof template === "string" ? template : undefined),
    currentSentToday(),
    listsAccess(),
    currentWording(),
  ]);
  if (!access) notFound();
  if (!data) redirect(listsPaths.lists);
  return (
    <SendForm
      data={data}
      send={sendListAction.bind(null, access.businessId)}
      paths={{ lists: listsPaths.lists }}
      sentToday={
        sent ? (
          <SentToday data={sent} wording={wording} href={listsPaths.list} />
        ) : null
      }
    />
  );
}
