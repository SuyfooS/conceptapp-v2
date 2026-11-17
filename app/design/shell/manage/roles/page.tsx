import { Suspense } from "react";
import { demoRoles, demoRolesWithSenior } from "./data";
import { RolesDemo } from "./demo";

type Props = { searchParams: Promise<{ role?: string; state?: string }> };

// Roles and permissions (roles plan R0), as the demo restaurant's owner sees
// them: managers, workers and the shift lead the business named, each
// changed at once with its undo, and the fixed owner and accountant. Mock
// data and stand-in actions: nothing reaches a database. ?role=worker (or
// manager, shift-lead) opens that role first; on a phone, on its own screen.
// ?state=senior adds "עובד בכיר" on workers (L6b-2, Orel's case): lists at
// view with "תיקון רשימות שנסגרו" on; ?role=senior opens it first.
export default function ShellManageRoles({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { role, state } = await searchParams;
  return (
    <RolesDemo
      data={state === "senior" ? demoRolesWithSenior : demoRoles}
      initialRole={role}
    />
  );
}
