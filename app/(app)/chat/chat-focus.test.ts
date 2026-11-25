import type { DocLike } from "@ui/focus-after";
import { describe, expect, it } from "vitest";
import { CHAT_LIST, screenTitle, titleTakesFocus } from "./chat-focus";

/*
 * Where a chat screen's title takes the keyboard's focus as it opens
 * (accessibility, part 7). Elements and the page are stood in for: what an
 * element answers here is all the helpers read.
 */

/** An element, as far as the helpers ask. */
type Spot = {
  /** In the chat list beside the screen (InboxPane). */
  inList?: boolean;
  /** In a sheet that is closing. */
  inClosingSheet?: boolean;
  drawn?: boolean;
  connected?: boolean;
  disabled?: boolean;
  name?: string;
};

function element({
  inList = false,
  inClosingSheet = false,
  drawn = true,
  connected = true,
  disabled = false,
  name = "",
}: Spot = {}) {
  return {
    name,
    isConnected: connected,
    getClientRects: () => ({ length: drawn ? 1 : 0 }),
    matches: (selectors: string) =>
      selectors === ":disabled" ? disabled : false,
    closest: (selectors: string) => {
      if (selectors === `[${CHAT_LIST}]`) return inList ? {} : null;
      if (selectors === '[role="dialog"][data-state="closed"]') {
        return inClosingSheet ? {} : null;
      }
      return null;
    },
    hasAttribute: () => false,
    setAttribute: () => {},
    focus: () => {},
  } as unknown as Element;
}

/** A page whose focus is on `active` ("body": the page), and its titles. */
function pageWith(
  active: Element | null | "body",
  titles: Element[] = [],
): DocLike {
  const body = element();
  return {
    activeElement: active === "body" ? body : active,
    body,
    querySelectorAll: (selectors: string) =>
      selectors === "main h1" ? titles : [],
  };
}

describe("titleTakesFocus", () => {
  it("takes it when the focus is lost: the page, nowhere, gone, hidden, a closing sheet", () => {
    const cases: [string, Element | null | "body"][] = [
      ["the page", "body"],
      ["nowhere", null],
      ["gone", element({ connected: false })],
      // The phone's list, put away as the conversation opened.
      ["hidden", element({ inList: true, drawn: false })],
      // "שליחת הודעה" closing onto the chat chosen in it.
      ["a closing sheet", element({ inClosingSheet: true })],
    ];
    for (const [name, active] of cases) {
      expect(titleTakesFocus(pageWith(active)), name).toBe(true);
    }
  });

  it("takes it from the chat list beside the screen, where the row pressed keeps it", () => {
    expect(titleTakesFocus(pageWith(element({ inList: true })))).toBe(true);
  });

  it("leaves a focus put anywhere else on the screen", () => {
    expect(titleTakesFocus(pageWith(element()))).toBe(false);
  });

  it("does nothing with no page", () => {
    expect(titleTakesFocus(undefined)).toBe(false);
  });
});

describe("screenTitle", () => {
  it("is the title beside the list, never the list's own", () => {
    const list = element({ inList: true, name: "צ'אט" });
    const chat = element({ name: "כל הצוות" });
    expect(screenTitle(pageWith("body", [list, chat]))).toBe(chat);
  });

  it("skips a title not drawn: a conversation kept hidden for going back", () => {
    const hidden = element({ drawn: false, name: "מטבח" });
    const shown = element({ name: "שירן הדגמה" });
    expect(screenTitle(pageWith("body", [hidden, shown]))).toBe(shown);
  });

  it("is none while only the list is drawn, or on no page", () => {
    expect(screenTitle(pageWith("body", [element({ inList: true })]))).toBe(
      null,
    );
    expect(screenTitle(undefined)).toBe(null);
  });
});
