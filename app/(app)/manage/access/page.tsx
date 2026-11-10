import { monthOf } from "@domain/time-clock";
import { clockAt } from "@domain/today";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notePayViewAction } from "../../clock/pay/actions";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import { currentAccess } from "./access";
import { AccessView } from "./access-view";
import { setPersonalPayAction, setRolePayAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.manage.access");
  return { title: t("title") };
}

// For owners only (and the team viewing as one); the not-found screen for
// everyone else, managers included.
export default async function AccessPage() {
  const [data, member] = await Promise.all([currentAccess(), currentMember()]);
  if (!data || !member?.membership) notFound();
  const { business } = member.membership;
  const today = clockAt(new Date(), business.place.timeZone).date;
  return (
    <AccessView
      data={data}
      // Each write names the business the screen is drawn for: one sent after
      // a switch to another business is refused there (payroll P3b).
      actions={{
        setRole: setRolePayAction.bind(null, business.id),
        setPerson: setPersonalPayAction.bind(null, business.id),
      }}
      paths={{ manage: "/manage" }}
      month={monthOf(today)}
      note={notePayViewAction}
    />
  );
}
