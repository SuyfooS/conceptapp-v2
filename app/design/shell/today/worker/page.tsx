import { Suspense } from "react";
import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

type Props = { searchParams: Promise<{ file?: string }> };

// Noa, a worker. In a business that uses the hiring file (H5b): ?file=missing
// has its card, three parts still to give; ?file=bank, her account changed
// two days ago; ?file=disputed, after "לא שיניתי".
export default function ShellTodayWorker({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { file } = await searchParams;
  return (
    <TodayDemo
      data={
        file === "missing" || file === "bank" || file === "disputed"
          ? todayScenarios.workerFile(file)
          : todayScenarios.worker()
      }
    />
  );
}
