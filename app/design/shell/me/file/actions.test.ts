import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSaveFileStepAction } from "./actions";
import { FILE_DEMO_ADDRESS, FILE_DEMO_CHANGE_DUE } from "./data";

/*
 * The twin's stand-in for saving a step (profile H5a): on `done`, whose 101
 * is handed in, only a move makes an updated one due, as in the app, where
 * the person's own save leaves out an address typed again as it is stored
 * and the database then finds nothing changed.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The address step's save, as the screen sends it, past the twin's moment. */
async function saveAddress(
  state: Parameters<typeof demoSaveFileStepAction>[0],
  address: Record<string, unknown>,
) {
  const answer = demoSaveFileStepAction(state, "address", {
    address,
    email: null,
  });
  await vi.advanceTimersByTimeAsync(400);
  return answer;
}

describe("the twin's address save", () => {
  it("makes no 101 due for Noa's own address typed again", async () => {
    expect(await saveAddress("done", { ...FILE_DEMO_ADDRESS })).toEqual({
      ok: true,
      changeDueBy: null,
    });
    // Typed with room around it, as the screen sends it: tidied the same.
    expect(
      await saveAddress("done", {
        ...FILE_DEMO_ADDRESS,
        street: ` ${FILE_DEMO_ADDRESS.street} `,
      }),
    ).toEqual({ ok: true, changeDueBy: null });
  });

  it("makes it due after a move", async () => {
    expect(
      await saveAddress("done", { ...FILE_DEMO_ADDRESS, number: "14" }),
    ).toEqual({ ok: true, changeDueBy: FILE_DEMO_CHANGE_DUE });
    expect(
      await saveAddress("done", { ...FILE_DEMO_ADDRESS, apartment: "3" }),
    ).toEqual({ ok: true, changeDueBy: FILE_DEMO_CHANGE_DUE });
  });

  it("never before this year's 101 is handed in", async () => {
    expect(
      await saveAddress("stopped", { ...FILE_DEMO_ADDRESS, number: "14" }),
    ).toEqual({ ok: true, changeDueBy: null });
  });

  it("refuses what the app would", async () => {
    expect(
      await saveAddress("done", { ...FILE_DEMO_ADDRESS, zip: "61000" }),
    ).toEqual({ ok: false, failure: "invalid" });
  });
});
