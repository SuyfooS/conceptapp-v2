import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { BusinessDetailsView } from "../../../../(app)/manage/business-details-view";
import { closesOnShabbat } from "../../../../(app)/manage/manage";
import { shabbatByCity } from "../../../../(app)/manage/shabbat-by-city";
import { demoBusinessDetails, demoModuleRows, demoNow } from "../../data";
import { demoSaveBusinessDetails } from "../actions";

// The real details screen with the demo business and a stand-in for saving:
// what changes stays on screen until a reload.
export default function ShellManageBusiness() {
  return (
    <BusinessDetailsView
      details={demoBusinessDetails}
      save={demoSaveBusinessDetails}
      viewOnly={false}
      showCity={closesOnShabbat(demoModuleRows)}
      cities={shabbatByCity(demoNow, ISRAEL_TIME_ZONE)}
      backHref="/design/shell/manage"
    />
  );
}
