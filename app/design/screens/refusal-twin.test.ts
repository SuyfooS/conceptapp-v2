import { describe, expect, it } from "vitest";
import { refusalTwinOf, TWIN_NETWORK_MINUTES } from "./refusal-twin";

// The refusal a twin of sign-in or joining opens with, from its `?error=`:
// the check's, too many codes from this network with its minutes, or none.

describe("refusalTwinOf", () => {
  it("opens on a send refused for the check, or on too many from this network with its minutes", () => {
    expect(refusalTwinOf("captcha")).toEqual({ error: "captcha" });
    expect(refusalTwinOf("network")).toEqual({
      error: "tooManyNetwork",
      minutes: TWIN_NETWORK_MINUTES,
    });
  });

  it("opens refused for nothing else", () => {
    for (const param of [undefined, "", "tooMany", "failed", "Network"]) {
      expect(refusalTwinOf(param), String(param)).toBeNull();
    }
  });
});
