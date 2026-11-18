import { Suspense } from "react";
import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

type Props = { searchParams: Promise<{ state?: string }> };

// Home as the owner of a business still being set up has it: the first
// steps under the greeting, what is done and what to do next. ?state=new is
// a business of any kind on its first day, ?state=viewing the ConceptApp
// team viewing it as the owner, with no way to hide them.
export default function ShellTodayFirstSteps({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <TodayDemo
      data={todayScenarios.firstSteps(
        state === "new" || state === "viewing" ? state : undefined,
      )}
    />
  );
}
