import type { DocLike } from "@ui/focus-after";
import { describe, expect, it } from "vitest";
import { firstRefused, OWN_FIELDS, refusedAt } from "./invite-answer";

// What the invite form does with a refusal (accessibility, part 6): the
// first field refused takes the focus that was anywhere in the form, never
// one the person put outside it. The page is stood in for, as far as
// `refusedAt` and `focusLost` ask.

describe("the first field refused", () => {
  it("is the name before the number, in the form's order", () => {
    expect(OWN_FIELDS).toEqual(["name", "phone"]);
    expect(firstRefused({ name: "required", phone: "required" })).toBe("name");
    expect(firstRefused({ phone: "invalid" })).toBe("phone");
    expect(firstRefused({ name: "tooLong", role: "required" })).toBe("name");
  });

  it("is none when only the role was refused, or nothing was", () => {
    // The role's own line says it, as an alert.
    expect(firstRefused({ role: "notAllowed" })).toBe(null);
    expect(firstRefused({})).toBe(null);
    expect(firstRefused(undefined)).toBe(null);
  });
});

/** An element, as far as `refusedAt` and `focusLost` ask. */
function element({
  form,
  disabled = false,
  connected = true,
}: {
  form: object | null;
  disabled?: boolean;
  connected?: boolean;
}) {
  return {
    isConnected: connected,
    getClientRects: () => ({ length: 1 }),
    matches: (selectors: string) =>
      selectors === ":disabled" ? disabled : false,
    closest: (selectors: string) => (selectors === "form" ? form : null),
    hasAttribute: () => false,
    setAttribute: () => {},
    focus: () => {},
  } as unknown as Element;
}

/** A page whose focus is on `active` (null: none at all). */
function pageWith(active: Element | null | "body"): DocLike {
  const body = element({ form: null });
  return {
    activeElement: active === "body" ? body : active,
    body,
    querySelectorAll: () => [],
  };
}

describe("where the focus is as a refusal arrives", () => {
  const form = {};
  const name = element({ form });

  it("on the field refused itself", () => {
    expect(refusedAt(name, pageWith(name))).toBe("field");
  });

  it("lost: on the page, nowhere, on something gone or disabled", () => {
    const cases: [string, Element | null | "body"][] = [
      ["the page", "body"],
      ["nowhere", null],
      ["gone", element({ form, connected: false })],
      [
        "the press, disabled while it waited",
        element({ form, disabled: true }),
      ],
    ];
    for (const [what, active] of cases) {
      expect(refusedAt(name, pageWith(active)), what).toBe("lost");
    }
  });

  it("lost anywhere else in the same form: the number it was sent from, the press", () => {
    const phone = element({ form });
    const press = element({ form });
    expect(refusedAt(name, pageWith(phone))).toBe("lost");
    expect(refusedAt(name, pageWith(press))).toBe("lost");
  });

  it("elsewhere outside the form: the way back, another form, the page's links", () => {
    const cases: [string, Element][] = [
      ["another form's control", element({ form: {} })],
      ["a link in no form", element({ form: null })],
    ];
    for (const [what, active] of cases) {
      expect(refusedAt(name, pageWith(active)), what).toBe("elsewhere");
    }
  });

  it("elsewhere for a field in no form, wherever the focus is", () => {
    const loose = element({ form: null });
    const other = element({ form: null });
    expect(refusedAt(loose, pageWith(other))).toBe("elsewhere");
  });
});
