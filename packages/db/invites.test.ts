import { isInviteToken } from "@domain/invites";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashInviteToken, newInviteToken } = await import("./invites");

describe("invite tokens", () => {
  it("are fresh, link-safe tokens", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(isInviteToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("are stored as the SHA-256 the database expects", () => {
    // echo -n abc | sha256sum
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashInviteToken(newInviteToken())).toMatch(/^[0-9a-f]{64}$/);
  });
});
