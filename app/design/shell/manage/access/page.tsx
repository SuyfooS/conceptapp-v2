import { Suspense } from "react";
import { AccessView } from "../../../../(app)/manage/access/access-view";
import { demoNotePayView } from "../../clock/pay/actions";
import { demoSetPersonalPay, demoSetRolePay } from "./actions";
import { demoAccess, demoAccessNamed } from "./data";

type Props = { searchParams: Promise<{ state?: string }> };

// Who sees pay, as the demo restaurant's owner sees it: managers on, one
// worker given access personally, and a manager given it before managers
// were, whose role covers her too, with stand-in actions that store nothing.
// `?state=named` gives workers pay too, where the shift lead (a role the
// business named) still sees it only by his own access (roles R11e).
export default function ShellManageAccess({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <AccessView
      data={state === "named" ? demoAccessNamed : demoAccess}
      actions={{ setRole: demoSetRolePay, setPerson: demoSetPersonalPay }}
      paths={{ place: "app", manage: "/design/shell/manage" }}
      noted={{ month: "2026-11", note: demoNotePayView }}
    />
  );
}
