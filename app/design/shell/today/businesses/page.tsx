import { Suspense } from "react";
import { DepartureNotice } from "../../../../(app)/departure-notice";
import { AccountantHome } from "../../../../(app)/home/accountant-home";
import { baseWording } from "../../../../(app)/wording";
import { demoSeenDeparture } from "../../actions";
import { demoSwitcher } from "../../businesses";
import { demoAccountantName, demoPayHome } from "../../clock/pay/data";
import { business, leftBusiness } from "../../data";

type Props = { searchParams: Promise<{ state?: string }> };

// Home as the demo's accountant has it when she keeps the books of two
// businesses (payroll P3b): the restaurant's October to pay, and "העסקים
// שלי" under it on phones and tablets, with the shop's two unread lines. On
// a desktop the sidebar names the business as a menu of both. ?state=left:
// she was taken off the team of a third, whichever she had open then, and
// the app says so above the screen until she says she saw it (Orel's
// decision 3 of 14 November 2026).
export default function ShellTodayBusinesses({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <>
      {state === "left" ? (
        <DepartureNotice
          business={leftBusiness.name}
          current={business.name}
          wording={baseWording}
          seen={demoSeenDeparture}
        />
      ) : null}
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
    </>
  );
}
