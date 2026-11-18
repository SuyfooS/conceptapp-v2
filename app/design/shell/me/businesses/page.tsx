import { SwitchBusinessSection } from "../../../../(app)/home/my-businesses";
import { MeView } from "../../../../(app)/me/me-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSignOut } from "../../actions";
import { demoSwitcher } from "../../businesses";
import { demoAccountantName } from "../../clock/pay/data";
import { business } from "../../data";
import {
  demoRemovePhotoAction,
  demoSaveProfileAction,
  demoSetPhotoAction,
} from "../actions";

// The profile of the demo's accountant, who keeps the books of two
// businesses (payroll P3b): on phones and tablets a row opens the list of
// them in a sheet; on a desktop the sidebar names the business as a menu.
export default function ShellMeBusinesses() {
  return (
    <MeView
      wording={baseWording}
      signOut={demoSignOut}
      actions={{
        setPhoto: demoSetPhotoAction,
        removePhoto: demoRemovePhotoAction,
        saveProfile: demoSaveProfileAction,
      }}
      home="/design/shell/today/businesses"
      businesses={
        <SwitchBusinessSection
          businesses={demoSwitcher()}
          wording={baseWording}
        />
      }
      data={{
        name: demoAccountantName,
        photo: null,
        role: "accountant",
        businessName: business.name,
        timeZone: "Asia/Jerusalem",
        since: "2026-03-01T08:00:00.000Z",
        locked: null,
        about: {
          bio: null,
          cover: "glow",
          addressForm: "f",
          locked: null,
          demo: false,
        },
      }}
    />
  );
}
