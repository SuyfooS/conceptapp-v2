import { Suspense } from "react";
import { AccountantHome } from "../../../../(app)/home/accountant-home";
import { baseWording } from "../../../../(app)/wording";
import {
  demoAccountantName,
  demoPayHome,
  demoPayHomeChecked,
  demoPayHomeEmpty,
  demoPayHomeNoAmounts,
} from "../../clock/pay/data";
import { business } from "../../data";

type Props = { searchParams: Promise<{ state?: string; estimate?: string }> };

// Home as the demo's accountant has it: October to pay with its estimate
// (payroll P7), what to check before paying it, and the months before.
// ?state=empty is a month with no hours yet, ?state=off a business with the
// clock off, ?state=checked a month with every shift approved and closed and
// the hours engine's remarks still to check, ?estimate=off one whose amounts
// the team hasn't turned on.
export default function ShellTodayAccountant({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, estimate } = await searchParams;
  return (
    <AccountantHome
      wording={baseWording}
      base="/design/shell"
      data={{
        now: "2026-11-04T08:30:00.000Z",
        timeZone: "Asia/Jerusalem",
        name: demoAccountantName,
        photo: null,
        businessName: business.name,
        pay:
          state === "off"
            ? null
            : state === "empty"
              ? demoPayHomeEmpty
              : state === "checked"
                ? demoPayHomeChecked
                : estimate === "off"
                  ? demoPayHomeNoAmounts
                  : demoPayHome,
        bell: { unread: 1 },
      }}
    />
  );
}
