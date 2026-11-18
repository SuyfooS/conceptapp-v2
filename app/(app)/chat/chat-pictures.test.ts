import { describe, expect, it } from "vitest";
import { pictureForm, pictureRefusal } from "./chat-pictures";

const DRAFT = "6f2b7c1e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const CONVERSATION = "0d6e4c3b-2a19-4f08-9e7d-6c5b4a392817";
const PERSON = "00000000-0000-4000-a000-000000000004";

const files = (type: string) => ({
  full: new Blob([new Uint8Array(10)], { type }),
  thumb: new Blob([new Uint8Array(4)], { type }),
});

describe("pictureRefusal", () => {
  it("lets what can't go as it is leave, with its words back in the field", () => {
    for (const failure of [
      "demo",
      "noRoom",
      "tooBig",
      "type",
      "metadata",
      "pixels",
    ] as const) {
      expect(pictureRefusal(failure)).toEqual({
        next: "drop",
        notice: { of: "fileFailure", key: failure },
        refresh: false,
      });
    }
  });

  it("keeps what may go on a second try, saying why it didn't", () => {
    expect(pictureRefusal("failed").next).toBe("retry");
    expect(pictureRefusal("notYet").notice).toEqual({
      of: "fileFailure",
      key: "failed",
    });
    expect(pictureRefusal("empty").notice).toEqual({
      of: "fileFailure",
      key: "empty",
    });
    expect(pictureRefusal("tooFast")).toEqual({
      next: "retry",
      notice: { of: "conversation", key: "tooFast" },
      refresh: false,
    });
    expect(pictureRefusal("businessChanged").notice).toEqual({
      of: "conversation",
      key: "businessChanged",
    });
  });

  it("draws the screen again where the chat closed or isn't the person's", () => {
    expect(pictureRefusal("closed").refresh).toBe(true);
    expect(pictureRefusal("noAccess").refresh).toBe(true);
    expect(pictureRefusal("viewOnly").refresh).toBe(false);
  });
});

describe("pictureForm", () => {
  it("sends both files of one type, the draft and the words to a conversation", () => {
    const form = pictureForm(
      files("image/webp"),
      { draft: DRAFT, words: "", announce: false },
      { conversation: CONVERSATION },
    );
    const full = form.get("full");
    const thumb = form.get("thumb");
    expect(full).toBeInstanceOf(File);
    expect((full as File).name).toBe("photo.webp");
    expect((thumb as File).name).toBe("photo-s.webp");
    expect((thumb as File).size).toBe(4);
    expect(form.get("draft")).toBe(DRAFT);
    expect(form.get("words")).toBe("");
    expect(form.get("conversation")).toBe(CONVERSATION);
    expect(form.has("announce")).toBe(false);
    expect(form.has("toPerson")).toBe(false);
  });

  it("says when it is an announcement, and opens a private chat by its person", () => {
    expect(
      pictureForm(
        files("image/jpeg"),
        { draft: DRAFT, words: "המקרר", announce: true },
        { conversation: CONVERSATION },
      ).get("announce"),
    ).toBe("true");
    const first = pictureForm(
      files("image/jpeg"),
      { draft: DRAFT, words: "המקרר" },
      { toPerson: PERSON },
    );
    expect((first.get("full") as File).name).toBe("photo.jpg");
    expect(first.get("toPerson")).toBe(PERSON);
    expect(first.has("conversation")).toBe(false);
    expect(first.get("words")).toBe("המקרר");
  });
});
