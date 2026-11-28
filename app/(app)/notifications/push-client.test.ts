import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_PUT_AWAY_KEY,
  installPutAway,
  putInstallAway,
} from "./push-client";

// The steps to the home screen put away in this browser (closing the pilot,
// PR 6): kept in its own storage, never for the person, and nothing breaks
// where storage is blocked (a private window, cleared site data).

/** A browser's localStorage, or one that refuses every call. */
function storage(refuses = false) {
  const kept = new Map<string, string>();
  const refuse = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (refuses ? refuse() : (kept.get(key) ?? null)),
    setItem: (key: string, value: string) =>
      refuses ? refuse() : kept.set(key, value),
  });
  return kept;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the steps put away in this browser", () => {
  it("aren't, until they are, and then stay put away", () => {
    const kept = storage();
    expect(installPutAway()).toBe(false);
    putInstallAway();
    expect(kept.has(INSTALL_PUT_AWAY_KEY)).toBe(true);
    expect(installPutAway()).toBe(true);
  });

  it("come again where storage is blocked, and nothing throws", () => {
    storage(true);
    expect(() => putInstallAway()).not.toThrow();
    expect(installPutAway()).toBe(false);
  });

  it("come again where there is no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => putInstallAway()).not.toThrow();
    expect(installPutAway()).toBe(false);
  });
});
