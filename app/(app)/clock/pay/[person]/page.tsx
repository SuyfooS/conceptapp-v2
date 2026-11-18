import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { baseWording, translator } from "../../../wording";
import {
  notePayViewAction,
  setDetailsAction,
  setPeriodAction,
  setWageAction,
} from "../actions";
import { currentPayPerson } from "../pay";
import { payPaths } from "../pay-types";
import { PersonPayView } from "../person-pay-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.pay");
  return { title: t("title") };
}

export default async function PayPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ person }, { month }] = await Promise.all([params, searchParams]);
  const data = await currentPayPerson(person, month);
  if (!data) notFound();
  return (
    <PersonPayView
      data={data}
      paths={payPaths}
      note={notePayViewAction}
      setWage={setWageAction}
      setDetails={setDetailsAction}
      setPeriod={setPeriodAction}
      wording={await currentWording()}
    />
  );
}
