"use server";

import type { FileTodayAnswer } from "../../../(app)/me/file/file-types";

// Stand-ins for Today's bank change on the twin (profile H5b), where nobody
// is signed in: nothing is kept, and each goes on to the worker's twin as
// the app would draw Today again, disputed or without the card.

const WORKER = "/design/shell/today/worker";

const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

export async function demoDisputeBankChange(): Promise<FileTodayAnswer> {
  await pause();
  return { ok: true, to: `${WORKER}?file=disputed` };
}

export async function demoSeenBankChange(): Promise<FileTodayAnswer> {
  await pause();
  return { ok: true, to: WORKER };
}
