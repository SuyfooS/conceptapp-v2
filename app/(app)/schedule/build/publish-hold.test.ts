import { describe, expect, it } from "vitest";
import { publishWaits, sendOf } from "./publish-hold";

describe("publishWaits", () => {
  it("holds publishing changes to a published week", () => {
    expect(
      publishWaits({ intent: "publish", published: true, leaving: false }),
    ).toBe(true);
  });

  it("sends a week's first publish and a draft at once", () => {
    expect(
      publishWaits({ intent: "publish", published: false, leaving: false }),
    ).toBe(false);
    expect(
      publishWaits({ intent: "save", published: false, leaving: false }),
    ).toBe(false);
  });

  it("sends publishing on the way out at once", () => {
    expect(
      publishWaits({ intent: "publish", published: true, leaving: true }),
    ).toBe(false);
  });
});

describe("sendOf", () => {
  it("takes the form a dock button sent as it is", () => {
    const form = new FormData();
    form.set("intent", "save");
    expect(sendOf(form)).toEqual({ form, sent: null });
  });

  it("takes a held publish with what to call once it is answered", () => {
    const form = new FormData();
    const sent = () => {};
    expect(sendOf({ form, sent })).toEqual({ form, sent });
  });
});
