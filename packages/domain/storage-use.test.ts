import { describe, expect, it } from "vitest";
import { FILES_GUARD_BYTES } from "./chat-files";
import { DOCUMENT_PHOTO_MAX_BYTES } from "./documents";
import {
  businessSpaceAlerts,
  chatSpaceState,
  DATABASE_TELL_BYTES,
  documentSpaceState,
  megabytes,
  SPACE_NEAR_PERCENT,
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

describe("a business's own spaces", () => {
  const space = 50 * MB;

  it("says the documents' space is filling from 80%, and full with less than a page's photo left", () => {
    expect(documentSpaceState(0, space)).toBe("ok");
    expect(documentSpaceState(0.79 * space, space)).toBe("ok");
    expect(documentSpaceState(0.8 * space, space)).toBe("near");
    expect(documentSpaceState(space - DOCUMENT_PHOTO_MAX_BYTES, space)).toBe(
      "near",
    );
    expect(
      documentSpaceState(space - DOCUMENT_PHOTO_MAX_BYTES + 1, space),
    ).toBe("full");
    expect(documentSpaceState(space, space)).toBe("full");
    expect(documentSpaceState(space + MB, space)).toBe("full");
    expect(documentSpaceState(10 * MB, 0)).toBe("ok");
    expect(SPACE_NEAR_PERCENT).toBe(80);
  });

  it("says chat files are filling from 80%, never full: the oldest go", () => {
    expect(chatSpaceState(0, 100 * MB)).toBe("ok");
    expect(chatSpaceState(79 * MB, 100 * MB)).toBe("ok");
    expect(chatSpaceState(80 * MB, 100 * MB)).toBe("near");
    expect(chatSpaceState(120 * MB, 100 * MB)).toBe("near");
    expect(chatSpaceState(5 * MB, 0)).toBe("ok");
  });

  it("writes megabytes with one decimal under 10, whole above", () => {
    expect(megabytes(0)).toBe(0);
    expect(megabytes(0.34 * MB)).toBe(0.3);
    expect(megabytes(9.96 * MB)).toBe(10);
    expect(megabytes(41.6 * MB)).toBe(42);
    expect(megabytes(-MB)).toBe(0);
  });

  it("warns of the businesses near or past their spaces, the most urgent first", () => {
    const business = (
      id: string,
      overrides: Partial<Parameters<typeof businessSpaceAlerts>[0][number]>,
    ) => ({
      id,
      name: id,
      filesOpen: true,
      chatBytes: 0,
      chatCapBytes: 100 * MB,
      documentBytes: 0,
      documentCapBytes: 50 * MB,
      ...overrides,
    });
    const alerts = businessSpaceAlerts([
      business("quiet", {}),
      business("chatty", { chatBytes: 171 * MB, chatCapBytes: 200 * MB }),
      business("filling", { documentBytes: 47 * MB }),
      business("busier", { documentBytes: 48 * MB }),
      business("full", { documentBytes: 49.6 * MB }),
      business("closed", { filesOpen: false, documentBytes: 50 * MB }),
      business("before", { documentBytes: null, chatBytes: 90 * MB }),
    ]);
    expect(alerts.map((a) => [a.id, a.kind, a.state])).toEqual([
      ["full", "documents", "full"],
      ["busier", "documents", "near"],
      ["filling", "documents", "near"],
      ["before", "chat", "near"],
      ["chatty", "chat", "near"],
    ]);
    expect(alerts[0]).toEqual({
      id: "full",
      name: "full",
      kind: "documents",
      state: "full",
      usedBytes: 49.6 * MB,
      capBytes: 50 * MB,
    });
  });
});
