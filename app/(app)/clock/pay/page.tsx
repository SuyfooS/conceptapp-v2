import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import {
  closeMonthAction,
  notePayViewAction,
  reopenMonthAction,
} from "./actions";
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
  const [data, member] = await Promise.all([
    currentPayMonth(month, person, show),
    currentMember(),
  ]);
  const business = member?.membership?.business.id;
  if (!data || !business) notFound();
  return (
    <PayMonthView
      data={data}
      paths={payPaths}
      note={notePayViewAction}
      // Closing and reopening name the business the screen is drawn for: a
      // press sent after a switch to another business is refused there
      // (payroll P3b).
      close={closeMonthAction.bind(null, business)}
      reopen={reopenMonthAction.bind(null, business)}
      wording={await currentWording()}
    />
  );
}
