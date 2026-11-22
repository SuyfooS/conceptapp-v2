import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoRevealPastAction, demoSaveFileStepAction } from "./actions";
import {
  FILE_DEMO_ADDRESS,
  FILE_DEMO_CHANGE_DUE,
  FILE_DEMO_NUMBERS,
  pastFileDemo,
} from "./data";

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

// The old file's twin (profile H5c): each "הצגה" shows the number whose
// last digits it showed before, and no two of a screen's look alike.
describe("the old file twin's numbers", () => {
  /** "הצגה" for one field, past the twin's moment. */
  async function revealed(
    state: Parameters<typeof demoRevealPastAction>[0],
    field: Parameters<typeof demoRevealPastAction>[1],
  ) {
    const answer = demoRevealPastAction(state, field);
    await vi.advanceTimersByTimeAsync(400);
    const got = await answer;
    return got.ok ? got.value : null;
  }

  it("shows the number its last digits are from, in every state", async () => {
    for (const state of ["file", "passport", "returned"] as const) {
      const { masked } = pastFileDemo("he", state);
      const id = await revealed(state, "id");
      const account = await revealed(state, "bank_account");
      expect(masked.id, state).toBe(`•••${id?.slice(-4)}`);
      expect(masked.bankAccount, state).toBe(`•••${account?.slice(-4)}`);
      expect(masked.id, state).not.toBe(masked.bankAccount);
    }
  });

  it("shows a passport on the passport's, never the ID", async () => {
    expect(await revealed("passport", "id")).toBe(FILE_DEMO_NUMBERS.passport);
    expect(await revealed("file", "id")).toBe(FILE_DEMO_NUMBERS.id);
    expect(await revealed("passport", "bank_account")).toBe(
      FILE_DEMO_NUMBERS.bankAccount,
    );
  });
});
