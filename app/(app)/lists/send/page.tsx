import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { sendListAction } from "../actions";
import { currentSendForm, listsAccess, listsPaths } from "../lists";
import { SendForm } from "./send-form";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.lists.send");
  return { title: t("title") };
}

// Sending a list now. Whoever may send nothing, or is only viewing, goes back
// to Lists; whoever can't open lists gets the not-found screen.
export default async function SendListPage({
  searchParams,
}: PageProps<"/lists/send">) {
  const { template } = await searchParams;
  const data = await currentSendForm(
    typeof template === "string" ? template : undefined,
  );
  if (!data) {
    if (!(await listsAccess())) notFound();
    redirect(listsPaths.lists);
  }
  return (
    <SendForm
      data={data}
      send={sendListAction}
      paths={{ lists: listsPaths.lists }}
    />
  );
}
