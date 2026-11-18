import { describe, expect, it } from "vitest";
import {
  canStopPdf,
  newPdfJob,
  type PdfJob,
  type PdfRunner,
  type PdfStep,
  type PutAnswer,
  pdfRefusal,
  putOutcome,
  retryPdfJob,
  runPdfJob,
  stopPdfJob,
} from "./chat-pdfs";
import type { ChatPdfFinishResult, ChatPdfStartResult } from "./chat-types";

describe("pdfRefusal", () => {
  it("lets what can't go as it is leave, saying why", () => {
    for (const failure of [
      "demo",
      "noRoom",
      "empty",
      "tooBig",
      "notPdf",
      "tooMany",
      "notYet",
    ] as const) {
      expect(pdfRefusal(failure)).toEqual({
        next: "drop",
        notice: { of: "pdfFailure", key: failure },
        refresh: false,
      });
    }
  });

  it("keeps one the business's last minutes are full of, saying to wait a little", () => {
    expect(pdfRefusal("busy")).toEqual({
      next: "retry",
      notice: { of: "pdfFailure", key: "busy" },
      refresh: false,
    });
  });

  it("makes its place again once its hours are over, and puts it again when nothing arrived", () => {
    expect(pdfRefusal("expired")).toEqual({
      next: "again",
      notice: null,
      refresh: false,
    });
    expect(pdfRefusal("notUploaded")).toEqual({
      next: "upload",
      notice: null,
      refresh: false,
    });
  });

  it("keeps what may go on a second try, saying why it didn't", () => {
    for (const failure of ["failed", "invalid"] as const) {
      expect(pdfRefusal(failure)).toEqual({
        next: "retry",
        notice: { of: "pdfFailure", key: "failed" },
        refresh: false,
      });
    }
    expect(pdfRefusal("tooFast").notice).toEqual({
      of: "conversation",
      key: "tooFast",
    });
    expect(pdfRefusal("businessChanged").notice).toEqual({
      of: "conversation",
      key: "businessChanged",
    });
    expect(pdfRefusal("viewOnly")).toEqual({
      next: "retry",
      notice: null,
      refresh: false,
    });
  });

  it("draws the screen again where the chat closed or isn't the person's", () => {
    expect(pdfRefusal("closed")).toEqual({
      next: "retry",
      notice: null,
      refresh: true,
    });
    expect(pdfRefusal("noAccess").refresh).toBe(true);
  });
});

describe("putOutcome", () => {
  const json = (value: unknown) => JSON.stringify(value);

  it("takes a stored file, and one already there from an earlier try", () => {
    expect(
      putOutcome({ status: 200, body: json({ Key: "chat-files/a" }) }),
    ).toBe("done");
    expect(putOutcome({ status: 201, body: "" })).toBe("done");
    expect(putOutcome({ status: 409, body: "" })).toBe("done");
    expect(
      putOutcome({
        status: 400,
        body: json({
          statusCode: "409",
          error: "Duplicate",
          message: "The resource already exists",
        }),
      }),
    ).toBe("done");
  });

  it("knows a file over the bucket's limit", () => {
    expect(putOutcome({ status: 413, body: "" })).toBe("tooBig");
    expect(
      putOutcome({
        status: 400,
        body: json({
          statusCode: "413",
          error: "Payload too large",
          message: "The object exceeded the maximum allowed size",
        }),
      }),
    ).toBe("tooBig");
  });

  it("asks for a new place when the signature no longer holds", () => {
    expect(
      putOutcome({
        status: 400,
        body: json({
          statusCode: "400",
          error: "InvalidJWT",
          message: "jwt expired",
        }),
      }),
    ).toBe("again");
    expect(
      putOutcome({
        status: 403,
        body: json({
          statusCode: "403",
          error: "Unauthorized",
          message: "invalid signature",
        }),
      }),
    ).toBe("again");
  });

  it("tries the same address again for the network, CORS or a busy Storage", () => {
    expect(putOutcome({ status: 0, body: "" })).toBe("retry");
    expect(putOutcome({ status: 500, body: "oops" })).toBe("retry");
    expect(putOutcome({ status: 503, body: "" })).toBe("retry");
    expect(putOutcome({ status: 400, body: "not json" })).toBe("retry");
  });
});

/** A place the server made: its reservation `u<n>`, its signed upload `https://storage/<n>`. */
const placed = (n: number): ChatPdfStartResult => ({
  ok: true,
  value: {
    upload: `u${n}`,
    conversation: "c1",
    signedUrl: `https://storage/${n}`,
    name: "menu.pdf",
    size: 5,
  },
});
const sentAs: ChatPdfFinishResult = {
  ok: true,
  value: { conversation: "c1", message: "m1" },
};
const stored: PutAnswer = { status: 200, body: "" };

/**
 * A runner that answers from a script, one answer a call, and writes down
 * every call: what a PDF's way asked of the server and of Storage, in order.
 * A start may be held (`hold`) until the test lets it go.
 */
function scripted(script: {
  start?: (ChatPdfStartResult | Promise<ChatPdfStartResult>)[];
  put?: PutAnswer[];
  finish?: (ChatPdfFinishResult | "throws")[];
  cancel?: { sent: boolean };
}) {
  const calls: string[] = [];
  const steps: (PdfStep | null)[] = [];
  const starts = [...(script.start ?? [])];
  const puts = [...(script.put ?? [])];
  const finishes = [...(script.finish ?? [])];
  const runner: PdfRunner = {
    start: async () => {
      calls.push("start");
      const next = starts.shift();
      if (!next) throw new Error("no start in the script");
      return await next;
    },
    put: (signedUrl, _file, onProgress) => {
      calls.push(`put ${signedUrl}`);
      const next = puts.shift();
      if (!next) throw new Error("no put in the script");
      onProgress(0.5);
      onProgress(1);
      return {
        done: Promise.resolve(next),
        abort: () => calls.push("abort"),
      };
    },
    finish: async (upload) => {
      calls.push(`finish ${upload}`);
      const next = finishes.shift();
      if (!next || next === "throws") throw new Error("lost on the way");
      return next;
    },
    cancel: async (upload) => {
      calls.push(`cancel ${upload}`);
      return { ok: true, value: script.cancel ?? { sent: false } };
    },
    onStep: (step) => steps.push(step),
  };
  return { runner, calls, steps };
}

const chosen = () =>
  newPdfJob({ file: new Blob(["%PDF-1.7"]), name: "menu.pdf", size: 8 });

describe("runPdfJob", () => {
  it("goes in three steps: its place, its bytes with how far they went, its message", async () => {
    const job = chosen();
    const { runner, calls, steps } = scripted({
      start: [placed(1)],
      put: [stored],
      finish: [sentAs],
    });
    expect(await runPdfJob(job, runner)).toEqual({
      end: "sent",
      value: { conversation: "c1", message: "m1" },
    });
    expect(calls).toEqual(["start", "put https://storage/1", "finish u1"]);
    expect(steps).toEqual([
      { step: "start", progress: null },
      { step: "put", progress: 0 },
      { step: "put", progress: 0.5 },
      { step: "put", progress: 1 },
      { step: "finish", progress: null },
      null,
    ]);
  });

  it("after a sending whose end is unknown, keeps its place and bytes, and a retry only sends", async () => {
    const job = chosen();
    const first = scripted({
      start: [placed(1)],
      put: [stored],
      finish: ["throws"],
    });
    expect(await runPdfJob(job, first.runner)).toEqual({
      end: "failed",
      failure: "failed",
      notice: { of: "pdfFailure", key: "failed" },
      refresh: false,
    });
    expect(job).toMatchObject({
      upload: "u1",
      signedUrl: "https://storage/1",
      uploaded: true,
      mayHaveGone: true,
    });
    // It may be there: never stopped from now on, only tried again.
    expect(canStopPdf(job, "failed", undefined)).toBe(false);

    retryPdfJob(job);
    const second = scripted({ finish: [sentAs] });
    expect((await runPdfJob(job, second.runner)).end).toBe("sent");
    expect(second.calls).toEqual(["finish u1"]);
  });

  it("puts its bytes once more to the same address when they didn't arrive, then sends", async () => {
    const job = chosen();
    const { runner, calls } = scripted({
      start: [placed(1)],
      put: [stored, stored],
      finish: [{ ok: false, failure: "notUploaded" }, sentAs],
    });
    expect((await runPdfJob(job, runner)).end).toBe("sent");
    expect(calls).toEqual([
      "start",
      "put https://storage/1",
      "finish u1",
      "put https://storage/1",
      "finish u1",
    ]);
  });

  it("makes its place again once by itself when it expired, and ends as failed the second time", async () => {
    const job = chosen();
    const expired: ChatPdfFinishResult = { ok: false, failure: "expired" };
    const { runner, calls } = scripted({
      start: [placed(1), placed(2)],
      put: [stored, stored],
      finish: [expired, expired],
    });
    expect(await runPdfJob(job, runner)).toEqual({
      end: "failed",
      failure: "expired",
      notice: { of: "pdfFailure", key: "failed" },
      refresh: false,
    });
    expect(calls).toEqual([
      "start",
      "put https://storage/1",
      "finish u1",
      "start",
      "put https://storage/2",
      "finish u2",
    ]);
    // Known not sent: its place is gone, and it may be stopped.
    expect(job.upload).toBeNull();
    expect(job.mayHaveGone).toBe(false);
    expect(canStopPdf(job, "failed", undefined)).toBe(true);

    // Tried again by hand: a new place, its bytes, its message.
    retryPdfJob(job);
    const again = scripted({
      start: [placed(3)],
      put: [stored],
      finish: [sentAs],
    });
    expect((await runPdfJob(job, again.runner)).end).toBe("sent");
    expect(again.calls).toEqual([
      "start",
      "put https://storage/3",
      "finish u3",
    ]);
  });

  it("lets a place go that comes after it was stopped", async () => {
    const job = chosen();
    let give: (result: ChatPdfStartResult) => void = () => {};
    const late = new Promise<ChatPdfStartResult>((resolve) => {
      give = resolve;
    });
    const { runner, calls } = scripted({ start: [late] });
    const going = runPdfJob(job, runner);
    // Stopped while its place is being made: there is none to let go yet.
    expect(await stopPdfJob(job, runner.cancel)).toBeNull();
    give(placed(1));
    expect(await going).toEqual({ end: "stopped" });
    expect(calls).toEqual(["start", "cancel u1"]);
  });

  it("drops one over the bucket's limit and lets its place go", async () => {
    const job = chosen();
    const { runner, calls } = scripted({
      start: [placed(1)],
      put: [{ status: 413, body: "" }],
    });
    expect(await runPdfJob(job, runner)).toEqual({
      end: "dropped",
      failure: "tooBig",
      notice: { of: "pdfFailure", key: "tooBig" },
      refresh: false,
    });
    expect(calls).toEqual(["start", "put https://storage/1", "cancel u1"]);
  });

  it("drops one the database has no PDFs for yet, saying so, with no place to let go", async () => {
    const job = chosen();
    const { runner, calls } = scripted({
      start: [{ ok: false, failure: "notYet" }],
    });
    expect(await runPdfJob(job, runner)).toEqual({
      end: "dropped",
      failure: "notYet",
      notice: { of: "pdfFailure", key: "notYet" },
      refresh: false,
    });
    expect(calls).toEqual(["start"]);
  });

  it("keeps one while the business's last minutes are full, with its way to stop", async () => {
    const job = chosen();
    const { runner } = scripted({ start: [{ ok: false, failure: "busy" }] });
    expect(await runPdfJob(job, runner)).toEqual({
      end: "failed",
      failure: "busy",
      notice: { of: "pdfFailure", key: "busy" },
      refresh: false,
    });
    expect(canStopPdf(job, "failed", undefined)).toBe(true);
  });
});

describe("stopPdfJob", () => {
  it("stops its PUT and lets its place go, and says when it was sent after all", async () => {
    const job: PdfJob = {
      ...chosen(),
      upload: "u1",
      signedUrl: "https://storage/1",
    };
    const { runner, calls } = scripted({ cancel: { sent: true } });
    job.put = { done: new Promise(() => {}), abort: () => calls.push("abort") };
    expect(await stopPdfJob(job, runner.cancel)).toEqual({ sent: true });
    expect(job.stopped).toBe(true);
    expect(calls).toEqual(["abort", "cancel u1"]);
  });

  it("says nothing when the server can't be asked", async () => {
    const job: PdfJob = { ...chosen(), upload: "u1" };
    expect(
      await stopPdfJob(job, async () => ({ ok: false, failure: "failed" })),
    ).toBeNull();
    expect(
      await stopPdfJob(job, async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
  });
});

describe("canStopPdf", () => {
  it("offers a stop while it waits for its place or goes up, and once it didn't go", () => {
    const job = chosen();
    const at = (step: PdfStep["step"]): PdfStep => ({ step, progress: null });
    expect(canStopPdf(job, "sending", at("start"))).toBe(true);
    expect(canStopPdf(job, "sending", at("put"))).toBe(true);
    expect(canStopPdf(job, "sending", undefined)).toBe(true);
    expect(canStopPdf(job, "failed", undefined)).toBe(true);
  });

  it("never while it is being sent, once sent, or after a sending whose end is unknown", () => {
    const job = chosen();
    expect(canStopPdf(job, "sending", { step: "finish", progress: null })).toBe(
      false,
    );
    expect(canStopPdf(job, "sent", undefined)).toBe(false);
    expect(canStopPdf(undefined, "failed", undefined)).toBe(false);
    expect(canStopPdf({ ...job, mayHaveGone: true }, "failed", undefined)).toBe(
      false,
    );
  });
});
