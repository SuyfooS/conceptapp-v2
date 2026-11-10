import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { notePayViewAction } from "./actions";
import { currentPayMonth } from "./pay";
import { payPaths } from "./pay-types";
import { PayMonthView } from "./pay-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.pay");
  return { title: t("title") };
}

// Only for those who hold pay access; the not-found screen for everyone else.
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; person?: string; show?: string }>;
}) {
  const { month, person, show } = await searchParams;
  const data = await currentPayMonth(month, person, show);
  if (!data) notFound();
  return (
    <PayMonthView
      data={data}
      paths={payPaths}
      note={notePayViewAction}
      wording={await currentWording()}
    />
  );
}
