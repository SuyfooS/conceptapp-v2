import { Suspense } from "react";
import { TodayDemo } from "../demo";
import {
  todayScenarios,
  WORKER_FILE_STATES,
  type WorkerFileState,
} from "../scenarios";

type Props = { searchParams: Promise<{ file?: string }> };

// Noa, a worker. In a business that uses the hiring file (H5b): ?file=missing
// has its card, three parts still to give; ?file=pension, a fund she chose
// to pick later all that is left, its card leading to the pension's step;
// ?file=bank, her account changed two days ago; ?file=disputed, after "לא
// שיניתי"; ?file=complete, nothing missing and nothing to tell, the file's
// quiet row saying so, as Today is once the bank's card is hidden.
export default function ShellTodayWorker({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

const isFileState = (file: unknown): file is WorkerFileState =>
  WORKER_FILE_STATES.some((state) => state === file);

async function Demo({ searchParams }: Props) {
  const { file } = await searchParams;
  return (
    <TodayDemo
      data={
        isFileState(file)
          ? todayScenarios.workerFile(file)
          : todayScenarios.worker()
      }
    />
  );
}
