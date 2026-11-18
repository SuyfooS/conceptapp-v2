import { describe, expect, it } from "vitest";
import { FILES_GUARD_BYTES } from "./chat-files";
import {
  DATABASE_TELL_BYTES,
  STORAGE_TELL_BYTES,
  storageAlerts,
  storageAmount,
  storageShare,
} from "./storage-use";

const MB = 1024 * 1024;

describe("storageAmount", () => {
  it("writes small sizes in KB, at least 1 for anything there", () => {
    expect(storageAmount(0)).toEqual({ unit: "kb", value: 0 });
    expect(storageAmount(10)).toEqual({ unit: "kb", value: 1 });
    expect(storageAmount(300 * 1024)).toEqual({ unit: "kb", value: 300 });
  });

  it("writes MB with one decimal under 10, and GB past a gigabyte", () => {
    expect(storageAmount(MB)).toEqual({ unit: "mb", value: 1 });
    expect(storageAmount(3.25 * MB)).toEqual({ unit: "mb", value: 3.3 });
    expect(storageAmount(123.4 * MB)).toEqual({ unit: "mb", value: 123 });
    expect(storageAmount(1536 * MB)).toEqual({ unit: "gb", value: 1.5 });
  });

  it("never goes below zero", () => {
    expect(storageAmount(-5)).toEqual({ unit: "kb", value: 0 });
    expect(storageAmount(Number.NaN)).toEqual({ unit: "kb", value: 0 });
  });
});

describe("storageShare", () => {
  it("is whole percent from 0 to 100", () => {
    expect(storageShare(0, 100)).toBe(0);
    expect(storageShare(25, 100)).toBe(25);
    expect(storageShare(1, 3)).toBe(33);
    expect(storageShare(300, 100)).toBe(100);
    expect(storageShare(5, 0)).toBe(0);
  });
});

describe("storageAlerts", () => {
  const quiet = {
    databaseBytes: 20 * MB,
    storageBytes: 100 * MB,
    guardBytes: FILES_GUARD_BYTES,
    chatCapsBytes: 400 * MB,
    documentCapsBytes: 200 * MB,
  };

  it("says nothing while everything is well under the plan", () => {
    expect(storageAlerts(quiet)).toEqual({
      filesRefused: false,
      storageHigh: false,
      capsOver: false,
      databaseHigh: false,
    });
  });

  it("warns when the caps add up past the guard, before anything is refused", () => {
    expect(storageAlerts({ ...quiet, chatCapsBytes: 800 * MB }).capsOver).toBe(
      true,
    );
    expect(storageAlerts({ ...quiet, chatCapsBytes: 700 * MB }).capsOver).toBe(
      false,
    );
  });

  it("says when Storage or the database are worth telling Orel about, and when files are refused", () => {
    expect(
      storageAlerts({ ...quiet, storageBytes: STORAGE_TELL_BYTES + 1 }),
    ).toMatchObject({ storageHigh: true, filesRefused: false });
    expect(
      storageAlerts({ ...quiet, storageBytes: FILES_GUARD_BYTES }),
    ).toMatchObject({ storageHigh: true, filesRefused: true });
    expect(
      storageAlerts({ ...quiet, databaseBytes: DATABASE_TELL_BYTES + 1 })
        .databaseHigh,
    ).toBe(true);
  });
});
