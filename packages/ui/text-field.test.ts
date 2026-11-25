import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextArea } from "./text-field";

/*
 * A text area's message (accessibility, part 9): its description, but kept
 * out of it for the moment a screen says it another way, as a draft line's
 * allergy saved without words is said by the announcer while the field has
 * the focus. On screen and marked invalid either way.
 */

/** The visible field, and the message drawn under it. */
function drawn(element: ReturnType<typeof createElement>) {
  const html = renderToString(element);
  const field = /<textarea[^>]*\sid="([^"]+)"[^>]*>/.exec(html);
  const id = field?.[1] ?? "";
  return {
    field: field?.[0] ?? "",
    message: new RegExp(`<p id="${id}-message"[^>]*>([^<]*)</p>`).exec(
      html,
    )?.[1],
    id,
  };
}

describe("TextArea", () => {
  it("is described by its message, and marked invalid for an error", () => {
    const area = drawn(
      createElement(TextArea, {
        label: "What to avoid",
        hint: "Shown in red.",
        error: "Write what to avoid.",
      }),
    );
    expect(area.message).toBe("Write what to avoid.");
    expect(area.field).toContain(`aria-describedby="${area.id}-message"`);
    expect(area.field).toContain('aria-invalid="true"');
  });

  it("keeps a quiet message on screen and out of its description, still invalid", () => {
    const area = drawn(
      createElement(TextArea, {
        label: "What to avoid",
        error: "Write what to avoid.",
        quietMessage: true,
      }),
    );
    expect(area.message).toBe("Write what to avoid.");
    expect(area.field).not.toContain("aria-describedby");
    expect(area.field).toContain('aria-invalid="true"');
  });

  it("is described by a hint as by an error, and not invalid", () => {
    const area = drawn(
      createElement(TextArea, { label: "Note", hint: "Shown on the order." }),
    );
    expect(area.message).toBe("Shown on the order.");
    expect(area.field).toContain(`aria-describedby="${area.id}-message"`);
    // Its classes name the invalid look; the attribute isn't there.
    expect(area.field).not.toContain("aria-invalid=");
  });
});
