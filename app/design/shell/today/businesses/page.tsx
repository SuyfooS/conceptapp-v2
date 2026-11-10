import { AccountantHome } from "../../../../(app)/home/accountant-home";
import { baseWording } from "../../../../(app)/wording";
import { demoSwitcher } from "../../businesses";
import { demoAccountantName, demoPayHome } from "../../clock/pay/data";
import { business } from "../../data";

// Home as the demo's accountant has it when she keeps the books of two
// businesses (payroll P3b): the restaurant's October to pay, and "העסקים
// שלי" under it on phones and tablets, with the shop's two unread lines. On
// a desktop the sidebar names the business as a menu of both.
export default function ShellTodayBusinesses() {
  return (
    <AccountantHome
      wording={baseWording}
      base="/design/shell"
      businesses={demoSwitcher()}
      data={{
        now: "2026-11-04T08:30:00.000Z",
        timeZone: "Asia/Jerusalem",
        name: demoAccountantName,
        photo: null,
        businessName: business.name,
        pay: demoPayHome,
        bell: { unread: 1 },
      }}
    />
  );
}
