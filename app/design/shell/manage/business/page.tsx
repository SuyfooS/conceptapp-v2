import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { Suspense } from "react";
import { BusinessDetailsView } from "../../../../(app)/manage/business-details-view";
import { closesOnShabbat } from "../../../../(app)/manage/manage";
import { shabbatByCity } from "../../../../(app)/manage/shabbat-by-city";
import { baseWording } from "../../../../(app)/wording";
import { demoBusinessDetails, demoModuleRows, demoNow } from "../../data";
import { demoSaveBusinessDetails } from "../actions";

type Props = { searchParams: Promise<{ state?: string }> };

// The real details screen with the demo business and a stand-in for saving:
// what changes stays on screen until a reload. `?state=view` is someone at
// view on the management page (the roles plan's R7): read only, with the
// line that says why.
export default function ShellManageBusiness({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <BusinessDetailsView
      details={demoBusinessDetails}
      save={demoSaveBusinessDetails}
      readOnly={state === "view" ? "manage" : null}
      showCity={closesOnShabbat(demoModuleRows)}
      cities={shabbatByCity(demoNow, ISRAEL_TIME_ZONE)}
      backHref="/design/shell/manage"
      wording={baseWording}
    />
  );
}
