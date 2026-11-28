import { filesHomeOf } from "@domain/file-holders";
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
import { business, teamFileStatus } from "../../data";
import { demoSignOutOfStation } from "../../station/actions";
import { pushTwinOf } from "../push-twin";

type Props = {
  searchParams: Promise<{
    state?: string;
    estimate?: string;
    files?: string;
    push?: string;
  }>;
};

// Home as the demo's accountant has it: October to pay with its estimate
// (payroll P7), what to check before paying it, and the months before.
// ?state=empty is a month with no hours yet, ?state=off a business with the
// clock off, ?state=checked a month with every shift approved and closed and
// the hours engine's remarks still to check, ?estimate=off one whose amounts
// the team hasn't turned on. ?state=station is the default month, signed in
// on the business's clock station: the card says the device is the
// business's tablet, and signing out goes to the station's twin. The hiring
// file's card (profile H6a): ?files=missing with the demo's files (Yoav's and
// Maya's missing details, Maya's account to look at), ?files=complete with
// every file complete; it leads to the team twin's files. ?push= has the
// card that offers notifications on the phone (closing the pilot, PR 6), as
// on Today's twin (`pushTwinOf`).
export default function ShellTodayAccountant({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, estimate, files, push } = await searchParams;
  const statuses = Object.values(teamFileStatus);
  return (
    <AccountantHome
      wording={baseWording}
      base="/design/shell"
      signOut={demoSignOutOfStation}
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
        station:
          state === "station" ? { kind: "signOut", shows: "clock_code" } : null,
        files:
          files === "missing" || files === "complete"
            ? {
                ...filesHomeOf(
                  files === "missing"
                    ? statuses
                    : statuses.map((row) => ({
                        ...row,
                        complete: true,
                        missing: 0,
                        form101_in: true,
                        detail: row.detail && {
                          ...row.detail,
                          missing: [],
                          bank_review: null,
                        },
                      })),
                  true,
                ),
                form101: true,
                href: "/design/shell/team?file=accountant",
              }
            : null,
        pushAsk: pushTwinOf(push),
      }}
    />
  );
}
