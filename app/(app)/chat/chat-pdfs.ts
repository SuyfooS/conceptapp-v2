import { CHAT_PDF_TYPE, type ChatPdfProblem } from "@domain/chat-files";
import type { ComposerNotice } from "./chat-pictures";
import type {
  ChatPdfActionFailure,
  ChatPdfCancelResult,
  ChatPdfFinishResult,
  ChatPdfStartResult,
} from "./chat-types";

/*
 * PDFs in a conversation (chat C5, plan §6.3), free of React: the browser's
 * PUT to Storage's signed upload, how its answer is read, what the screen
 * does when a PDF is refused, and a PDF's way from its place to its message
 * (`runPdfJob`), with its stop (`stopPdfJob`). Neither a client nor a server
 * file: the screen and its tests read it. The secret key never reaches here:
 * the server gives one signed address for one path, good for 2 hours, and
 * the browser sends the file's bytes there and nothing else (no Supabase
 * client, no session, no key, no cookie).
 */

/** The words of a PDF that didn't go (`app.chat.pdfFailure`). */
export type PdfWords =
  | ChatPdfProblem
  | "demo"
  | "noRoom"
  | "tooMany"
  | "busy"
  | "notYet"
  | "failed"
  | "cancelled";

/**
 * What the screen does next with a PDF that was refused (`next`):
 * - `retry`: it stays on screen as not sent, with its way to try again (the
 *   same draft, so it never goes twice): the network, too many in a minute,
 *   the business's PDFs of the last minutes full, a business switched since;
 * - `drop`: it can't go as it is (a demo business, no room in Storage, too
 *   many unsent, over 10 MB, not a PDF, PDFs not open here yet): it leaves
 *   the conversation, and what was written with it goes back to the field;
 * - `again`: its place has to be made again (its 2 hours are over, its
 *   upload's signature no longer holds, or the server let it go): once by
 *   itself, the same draft;
 * - `upload`: its bytes didn't arrive: put once more, then finished.
 * `notice` is what is said over the field, and `refresh` draws the screen
 * again where the chat closed or is no longer the person's.
 */
export type PdfNext = "retry" | "drop" | "again" | "upload";

export function pdfRefusal(failure: ChatPdfActionFailure): {
  next: PdfNext;
  notice: ComposerNotice | null;
  refresh: boolean;
} {
  switch (failure) {
    case "demo":
    case "noRoom":
    case "empty":
    case "tooBig":
    case "notPdf":
    case "tooMany":
    // The database hasn't C5's PDFs yet (the page offered them from C4's):
    // a retry can't send it until it has.
    case "notYet":
      return {
        next: "drop",
        notice: { of: "pdfFailure", key: failure },
        refresh: false,
      };
    case "expired":
      return { next: "again", notice: null, refresh: false };
    case "notUploaded":
      return { next: "upload", notice: null, refresh: false };
    case "busy":
      return {
        next: "retry",
        notice: { of: "pdfFailure", key: "busy" },
        refresh: false,
      };
    case "tooFast":
    case "businessChanged":
      return {
        next: "retry",
        notice: { of: "conversation", key: failure },
        refresh: false,
      };
    case "closed":
    case "noAccess":
      return { next: "retry", notice: null, refresh: true };
    case "viewOnly":
      return { next: "retry", notice: null, refresh: false };
    case "failed":
    case "invalid":
      return {
        next: "retry",
        notice: { of: "pdfFailure", key: "failed" },
        refresh: false,
      };
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}

/** What Storage answered the browser's PUT (status 0: it never arrived). */
export type PutAnswer = { status: number; body: string };

/**
 * Storage's answer to the PUT, read: `done` (stored, or already there from
 * an earlier try: a signed upload never replaces a file), `tooBig` (over the
 * bucket's 10 MiB), `again` (its signature expired or no longer holds: a new
 * place), or `retry` (the network, CORS, Storage busy: the same address
 * again). Storage says a duplicate either as 409 or as 400 with "409" in its
 * body, and an expired token as 400, 401 or 403 with the JWT's words.
 */
export function putOutcome(
  answer: PutAnswer,
): "done" | "tooBig" | "again" | "retry" {
  const { status, body } = answer;
  if (status >= 200 && status < 300) return "done";
  if (status === 409) return "done";
  if (status === 413) return "tooBig";
  if (status === 400 || status === 401 || status === 403) {
    const said = readError(body);
    if (said.status === "409" || /duplicate|already exists/i.test(said.words)) {
      return "done";
    }
    if (said.status === "413" || /too large|exceeded/i.test(said.words)) {
      return "tooBig";
    }
    if (/jwt|token|signature|expired|unauthori[sz]ed/i.test(said.words)) {
      return "again";
    }
  }
  return "retry";
}

/** Storage's error body, as far as it can be read: its own status and words. */
function readError(body: string): { status: string; words: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const status =
        typeof record.statusCode === "string" ||
        typeof record.statusCode === "number"
          ? String(record.statusCode)
          : "";
      const words = [record.error, record.message, record.code]
        .filter((part): part is string => typeof part === "string")
        .join(" ");
      return { status, words };
    }
  } catch {
    // Not JSON: its words as they are.
  }
  return { status: "", words: body.slice(0, 200) };
}

/** A PUT on its way: its answer, and the way to stop it. */
export type PdfPut = { done: Promise<PutAnswer>; abort: () => void };

/**
 * Puts a PDF's bytes at its signed upload, as the browser has them: one PUT
 * of the file itself (not a form), typed `application/pdf`, with nothing
 * else: no session, no key, no cookie (`withCredentials` off). How far it went
 * comes to `onProgress` (0 to 1) from the upload's own events. The answer is
 * always given, never thrown: status 0 for a network error, CORS, or a stop.
 */
export function putPdf(
  signedUrl: string,
  file: Blob,
  onProgress: (fraction: number) => void,
): PdfPut {
  const request = new XMLHttpRequest();
  const done = new Promise<PutAnswer>((resolve) => {
    const answer = () =>
      resolve({
        status: request.status,
        body:
          typeof request.responseText === "string" ? request.responseText : "",
      });
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onload = answer;
    request.onerror = () => resolve({ status: 0, body: "" });
    request.onabort = () => resolve({ status: 0, body: "" });
    request.ontimeout = () => resolve({ status: 0, body: "" });
  });
  request.open("PUT", signedUrl);
  request.withCredentials = false;
  request.setRequestHeader("Content-Type", CHAT_PDF_TYPE);
  request.send(file);
  return { done, abort: () => request.abort() };
}

/** Where a PDF on its way is, as its bubble says: its place, its bytes (how far), its check. */
export type PdfStep = {
  step: "start" | "put" | "finish";
  progress: number | null;
};

/**
 * A PDF on its way (C5), by its message's draft: its file, its place once
 * the server gave one, whether its bytes are in Storage, its PUT while it
 * goes, whether it was stopped, and how many times it went back a step by
 * itself (once at most each time it is sent or tried again). The screen keeps
 * one per draft, and `runPdfJob` moves it on.
 */
export type PdfJob = {
  file: Blob;
  name: string;
  size: number;
  upload: string | null;
  signedUrl: string | null;
  uploaded: boolean;
  /**
   * A sending was asked of the server and its end is unknown (its answer
   * lost, or the server couldn't say): the message may be there already, so
   * from now on it is only tried again (the same draft gives back the same
   * message), never stopped.
   */
  mayHaveGone: boolean;
  put: PdfPut | null;
  stopped: boolean;
  again: number;
};

/** A PDF chosen for a message, on its way from now on. */
export function newPdfJob(chosen: {
  file: Blob;
  name: string;
  size: number;
}): PdfJob {
  return {
    file: chosen.file,
    name: chosen.name,
    size: chosen.size,
    upload: null,
    signedUrl: null,
    uploaded: false,
    mayHaveGone: false,
    put: null,
    stopped: false,
    again: 0,
  };
}

/**
 * What a PDF's way needs from the screen: its three actions, bound to where
 * it goes and its draft (`start`: its place and signed upload; `finish`: the
 * message, once its bytes are there; `cancel`: its place let go), the
 * browser's PUT (`putPdf`), and where to say how far it is (`onStep`, null
 * once it isn't on its way).
 */
export type PdfRunner = {
  start: () => Promise<ChatPdfStartResult>;
  put: (
    signedUrl: string,
    file: Blob,
    onProgress: (fraction: number) => void,
  ) => PdfPut;
  finish: (upload: string) => Promise<ChatPdfFinishResult>;
  cancel: (upload: string) => Promise<ChatPdfCancelResult>;
  onStep: (step: PdfStep | null) => void;
};

/**
 * How a PDF's way ended: `sent` (its message), `dropped` (it can't go as it
 * is: it leaves the conversation and its words go back to the field),
 * `failed` (it stays as not sent, with its retry), each with what the field
 * says, whether the screen is drawn again, and the reason; or `stopped` (the
 * person stopped it meanwhile: the screen did all there is to do).
 */
export type PdfEnd =
  | { end: "sent"; value: { conversation: string; message: string } }
  | {
      end: "dropped" | "failed";
      failure: ChatPdfActionFailure;
      notice: ComposerNotice | null;
      refresh: boolean;
    }
  | { end: "stopped" };

type Tried =
  | { ok: true; value: { conversation: string; message: string } }
  | { ok: false; failure: ChatPdfActionFailure }
  | "stopped";

/** What Storage's answer to the PUT means for the PDF, as a refusal. */
const putFailure = {
  tooBig: "tooBig",
  again: "expired",
  retry: "failed",
} as const satisfies Record<string, ChatPdfActionFailure>;

/** One try: whatever of its place, its bytes and its message it doesn't have yet. */
async function tryPdf(job: PdfJob, runner: PdfRunner): Promise<Tried> {
  runner.onStep({ step: "start", progress: null });
  if (!job.upload || !job.signedUrl) {
    let started: ChatPdfStartResult;
    try {
      started = await runner.start();
    } catch {
      started = { ok: false, failure: "failed" };
    }
    if (job.stopped) {
      // Stopped while its place was being made: that place is let go.
      if (started.ok) {
        void runner.cancel(started.value.upload).catch(() => undefined);
      }
      return "stopped";
    }
    if (!started.ok) return { ok: false, failure: started.failure };
    job.upload = started.value.upload;
    job.signedUrl = started.value.signedUrl;
    job.uploaded = false;
  }
  const { upload, signedUrl } = job;
  if (!upload || !signedUrl) return { ok: false, failure: "failed" };

  if (!job.uploaded) {
    runner.onStep({ step: "put", progress: 0 });
    // Said again once a whole percent more went, not at every event.
    let percent = 0;
    const put = runner.put(signedUrl, job.file, (fraction) => {
      const now = Math.floor(fraction * 100);
      if (now === percent) return;
      percent = now;
      runner.onStep({ step: "put", progress: fraction });
    });
    job.put = put;
    const answer = await put.done;
    job.put = null;
    if (job.stopped) return "stopped";
    const outcome = putOutcome(answer);
    if (outcome !== "done") return { ok: false, failure: putFailure[outcome] };
    job.uploaded = true;
  }

  runner.onStep({ step: "finish", progress: null });
  let finished: ChatPdfFinishResult;
  try {
    finished = await runner.finish(upload);
  } catch {
    finished = { ok: false, failure: "failed" };
  }
  // Its end unknown: the message may be written (the server keeps its file).
  if (!finished.ok && finished.failure === "failed") job.mayHaveGone = true;
  if (job.stopped) return "stopped";
  return finished;
}

/**
 * A PDF goes (C5, plan §6.3) in three steps, each kept on the job for a retry
 * under the same draft: its place and signed upload, from the server; its
 * bytes, put there by the browser itself, with how far they went; and the
 * message, once the server read its start and the database its size and
 * type. A place that has to be made again (its hours over, its signature no
 * longer good, let go by the server), or whose bytes didn't arrive, goes back
 * a step by itself, once. One that can't go as it is ends `dropped`, and its
 * place is let go; any other failure ends `failed`, the job kept for a retry.
 */
export async function runPdfJob(
  job: PdfJob,
  runner: PdfRunner,
): Promise<PdfEnd> {
  for (;;) {
    const tried = await tryPdf(job, runner);
    if (tried === "stopped") return { end: "stopped" };
    if (tried.ok) {
      runner.onStep(null);
      return { end: "sent", value: tried.value };
    }
    const refusal = pdfRefusal(tried.failure);
    const back = refusal.next === "again" || refusal.next === "upload";
    if (refusal.next === "again") {
      job.upload = null;
      job.signedUrl = null;
    }
    if (back) job.uploaded = false;
    if (back && job.again < 1) {
      job.again += 1;
      continue;
    }
    runner.onStep(null);
    if (refusal.next === "drop") {
      // Whatever arrived at its place goes too (one the server refused for
      // its bytes it let go already).
      const upload = job.upload;
      if (upload) void runner.cancel(upload).catch(() => undefined);
      return {
        end: "dropped",
        failure: tried.failure,
        notice: refusal.notice,
        refresh: refusal.refresh,
      };
    }
    return {
      end: "failed",
      failure: tried.failure,
      notice: back ? { of: "pdfFailure", key: "failed" } : refusal.notice,
      refresh: refusal.refresh,
    };
  }
}

/** Tried again by hand: it may go back a step by itself once more. */
export function retryPdfJob(job: PdfJob): void {
  job.again = 0;
}

/**
 * Whether the way to stop it is offered: while it waits for its place or its
 * bytes go up, and once it didn't go; never while it is being sent as a
 * message, nor ever after a sending whose end is unknown (it may be there).
 */
export function canStopPdf(
  job: PdfJob | undefined,
  state: "sending" | "failed" | "sent",
  step: PdfStep | undefined,
): boolean {
  if (!job || job.mayHaveGone) return false;
  return state === "failed" || (state === "sending" && step?.step !== "finish");
}

/**
 * The person stops it: its PUT stops, and its place is let go, unless it was
 * sent. The server's word comes back: `{ sent }` (sent after all: its message
 * shows with the next sync), or null when there was no place yet (one that
 * comes later is let go by `runPdfJob`) or the server couldn't be asked.
 */
export async function stopPdfJob(
  job: PdfJob,
  cancel: PdfRunner["cancel"],
): Promise<{ sent: boolean } | null> {
  job.stopped = true;
  job.put?.abort();
  const upload = job.upload;
  if (!upload) return null;
  try {
    const answer = await cancel(upload);
    return answer.ok ? answer.value : null;
  } catch {
    return null;
  }
}
