import { AccessView } from "../../../../(app)/manage/access/access-view";
import { demoNotePayView } from "../../clock/pay/actions";
import { demoSetPersonalPay, demoSetRolePay } from "./actions";
import { demoAccess } from "./data";

// Who sees pay, as the demo restaurant's owner sees it: managers on, one
// worker given access personally, and a manager given it before managers
// were, whose role covers her too, with stand-in actions that store nothing.
export default function ShellManageAccess() {
  return (
    <AccessView
      data={demoAccess}
      actions={{ setRole: demoSetRolePay, setPerson: demoSetPersonalPay }}
      paths={{ manage: "/design/shell/manage" }}
      month="2026-11"
      note={demoNotePayView}
    />
  );
}
