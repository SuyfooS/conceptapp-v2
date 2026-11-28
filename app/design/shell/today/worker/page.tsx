import { Suspense } from "react";
import { TodayDemo } from "../demo";
import { pushTwinOf } from "../push-twin";
import {
  todayScenarios,
  WORKER_FILE_STATES,
  type WorkerFileState,
} from "../scenarios";

type Props = { searchParams: Promise<{ file?: string; push?: string }> };

// Noa, a worker. In a business that uses the hiring file (H5b): ?file=missing
// has its card, three parts still to give; ?file=pension, a fund she chose
// to pick later all that is left, its card leading to the pension's step;
// ?file=bank, her account changed two days ago; ?file=disputed, after "לא
// שיניתי"; ?file=complete, nothing missing and nothing to tell, the file's
// quiet row saying so, as Today is once the bank's card is hidden. The
// file's card and row lead to its twin in the state they tell. ?push= has
// the card that offers notifications on the phone (closing the pilot, PR 6)
// in a state of its own (`pushTwinOf`): its presses ask the browser nothing
// and keep nothing.
export default function ShellTodayWorker({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

const isFileState = (file: unknown): file is WorkerFileState =>
  WORKER_FILE_STATES.some((state) => state === file);

/**
 * The file twin's state for each of Today's: stopped (its own default), sent
 * with a fund still to choose, or everything in.
 */
const FILE_TWIN_QUERY: Record<WorkerFileState, string | undefined> = {
  missing: undefined,
  pension: "state=later",
  bank: "state=done",
  disputed: "state=done",
  complete: "state=done",
};

async function Demo({ searchParams }: Props) {
  const { file, push } = await searchParams;
  const pushAsk = pushTwinOf(push);
  return isFileState(file) ? (
    <TodayDemo
      data={{ ...todayScenarios.workerFile(file), pushAsk }}
      fileQuery={FILE_TWIN_QUERY[file]}
    />
  ) : (
    <TodayDemo data={{ ...todayScenarios.worker(), pushAsk }} />
  );
}
