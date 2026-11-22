"use server";

import type { FileTodayAnswer } from "../../../(app)/me/file/file-types";

// The stand-in for Today's "לא שיניתי" on the twin (profile H5b), where
// nobody is signed in: nothing is kept, and it goes on to the worker's twin
// as the app would draw Today again, disputed. "אני שיניתי" and "הבנתי" go
// to the stand-in route /design/shell/home/bank-seen, which keeps nothing:
// the card hides as in the app, with its undo, and the twin's Today stays
// as drawn, its file's quiet row too.

const WORKER = "/design/shell/today/worker";

const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

export async function demoDisputeBankChange(): Promise<FileTodayAnswer> {
  await pause();
  return { ok: true, to: `${WORKER}?file=disputed` };
}
