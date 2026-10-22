import { describe, expect, it } from "vitest";
import {
  INVITE_TOKEN_LENGTH,
  inviteLink,
  isInviteToken,
  phoneEnding,
} from "./invites";

const token = `${"a".repeat(INVITE_TOKEN_LENGTH - 2)}-_`;

describe("isInviteToken", () => {
  it("accepts 43 base64url characters", () => {
    expect(isInviteToken(token)).toBe(true);
  });

  it("refuses other lengths and characters", () => {
    expect(isInviteToken(token.slice(1))).toBe(false);
    expect(isInviteToken(`${token}a`)).toBe(false);
    expect(isInviteToken(`${token.slice(1)}=`)).toBe(false);
    expect(isInviteToken(`${token.slice(1)}/`)).toBe(false);
    expect(isInviteToken("")).toBe(false);
  });
});

describe("inviteLink", () => {
  it("puts the token under /join on the origin", () => {
    expect(inviteLink("https://app.example.com", token)).toBe(
      `https://app.example.com/join/${token}`,
    );
    expect(inviteLink("http://127.0.0.1:3100/", token)).toBe(
      `http://127.0.0.1:3100/join/${token}`,
    );
  });

  it("refuses an origin with a path and a malformed token", () => {
    expect(() => inviteLink("https://app.example.com/admin", token)).toThrow();
    expect(() => inviteLink("https://app.example.com", "short")).toThrow();
    expect(() => inviteLink("not a url", token)).toThrow();
  });
});

describe("phoneEnding", () => {
  it("keeps the last four digits", () => {
    expect(phoneEnding("+972500000702")).toBe("0702");
  });
});
