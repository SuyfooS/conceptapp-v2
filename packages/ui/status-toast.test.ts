import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusToast } from "./status-toast";

/*
 * The toast's live region is there before it has anything to say, with an
 * aria-live of its own (accessibility, part 1): Radix keeps a live region
 * out of what it hides behind an open or closing sheet, and a role alone
 * isn't one to it. Its words and its undo come after the first drawing.
 */

describe("StatusToast", () => {
  it("draws its region empty, a status with its own aria-live, before any words", () => {
    const html = renderToString(
      createElement(StatusToast, {
        message: "The row was removed",
        action: { label: "Undo", onClick: () => {} },
        focusAction: true,
      }),
    );
    const root = html.match(/^<div[^>]*>/)?.[0] ?? "";
    expect(root).toContain('role="status"');
    expect(root).toContain('aria-live="polite"');
    expect(html).not.toContain("The row was removed");
    expect(html).not.toContain("<button");
  });

  // A message the focus already says (a line that says the same): still a
  // status, shown, and said by nothing.
  it("keeps a quiet message out of its live region", () => {
    const root = (quiet?: boolean) =>
      renderToString(
        createElement(StatusToast, { message: "The draft is saved.", quiet }),
      ).match(/^<div[^>]*>/)?.[0] ?? "";
    expect(root(true)).toContain('role="status"');
    expect(root(true)).toContain('aria-live="off"');
    expect(root(false)).toContain('aria-live="polite"');
    expect(root()).toContain('aria-live="polite"');
  });
});
