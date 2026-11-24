import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupedField, GroupedPhoneField } from "./field-group";

/*
 * A grouped field's message (accessibility, part 2): its description, but
 * kept out of it for the moment a screen says it another way, as sign-in's
 * number does while the announcer says why it was refused. On screen and
 * marked invalid either way.
 */

/** The visible field, and the message drawn under it. */
function drawn(element: ReturnType<typeof createElement>) {
  const html = renderToString(element);
  const input = /<input[^>]*\sid="([^"]+)"[^>]*>/.exec(html);
  const id = input?.[1] ?? "";
  return {
    input: input?.[0] ?? "",
    message: new RegExp(`<p id="${id}-message"[^>]*>([^<]*)</p>`).exec(
      html,
    )?.[1],
    id,
  };
}

describe("GroupedField", () => {
  it("is described by its message, and marked invalid for an error", () => {
    const field = drawn(
      createElement(GroupedField, { label: "Name", error: "Needed." }),
    );
    expect(field.message).toBe("Needed.");
    expect(field.input).toContain(`aria-describedby="${field.id}-message"`);
    expect(field.input).toContain('aria-invalid="true"');
  });

  it("keeps a quiet message on screen and out of its description, still invalid", () => {
    for (const element of [
      createElement(GroupedField, {
        label: "Name",
        error: "Needed.",
        quietMessage: true,
      }),
      createElement(GroupedPhoneField, {
        label: "Phone",
        name: "phone",
        error: "Needed.",
        quietMessage: true,
      }),
    ]) {
      const field = drawn(element);
      expect(field.message).toBe("Needed.");
      expect(field.input).not.toContain("aria-describedby");
      expect(field.input).toContain('aria-invalid="true"');
    }
  });

  it("is described by a hint as by an error", () => {
    const field = drawn(
      createElement(GroupedField, { label: "Name", hint: "As on the ID." }),
    );
    expect(field.message).toBe("As on the ID.");
    expect(field.input).toContain(`aria-describedby="${field.id}-message"`);
    expect(field.input).not.toContain("aria-invalid");
  });
});
