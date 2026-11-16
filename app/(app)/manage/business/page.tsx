import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { saveBusinessDetailsAction } from "../actions";
import { BusinessDetailsView } from "../business-details-view";
import { closesOnShabbat, manageAccess } from "../manage";
import { shabbatByCity } from "../shabbat-by-city";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage.business");
  return { title: t("title") };
}

// The business's name, colour, address and Shabbat city, for whoever sees the
// management page, saved by whoever edits it. Not a module: every business
// has these.
export default async function ManageBusinessPage() {
  const access = await manageAccess();
  if (!access) notFound();
  return (
    <BusinessDetailsView
      details={access.details}
      save={saveBusinessDetailsAction}
      readOnly={access.readOnly}
      showCity={closesOnShabbat(access.rows)}
      cities={shabbatByCity(new Date(), access.timeZone)}
      backHref="/manage"
      wording={await currentWording()}
    />
  );
}
