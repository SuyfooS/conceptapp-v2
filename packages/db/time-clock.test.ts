import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashPunchCode, newPunchCode } = await import("./time-clock");

describe("punch codes", () => {
  it("are fresh, URL-safe codes", () => {
    const a = newPunchCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(newPunchCode());
  });

  it("are stored as the SHA-256 the database expects", () => {
    // echo -n abc | sha256sum
    expect(hashPunchCode("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashPunchCode(newPunchCode())).toMatch(/^[0-9a-f]{64}$/);
  });
});
