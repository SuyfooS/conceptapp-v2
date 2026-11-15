import { Suspense } from "react";
import { demoRoles } from "./data";
import { RolesDemo } from "./demo";

type Props = { searchParams: Promise<{ role?: string }> };

// Roles and permissions (roles plan R0), as the demo restaurant's owner sees
// them: managers, workers and the shift lead the business named, each
// changed at once with its undo, and the fixed owner and accountant. Mock
// data and stand-in actions: nothing reaches a database. ?role=worker (or
// manager, shift-lead) opens that role first; on a phone, on its own screen.
export default function ShellManageRoles({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { role } = await searchParams;
  return <RolesDemo data={demoRoles} initialRole={role} />;
}
