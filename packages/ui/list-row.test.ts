import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListRow, type ListRowProps } from "./list-row";

/*
 * A row that waits (accessibility, part 1): dimmed like a disabled one but
 * still where the focus can land ("focusable": aria-disabled, no disabled),
 * and a row on its way (busy). A disabled row is disabled for real.
 */

const button = (props: ListRowProps) =>
  renderToString(createElement(ListRow, props)).match(/<button[^>]*>/)?.[0] ??
  "";

describe("ListRow", () => {
  it("keeps a row that waits reachable: aria-disabled, never disabled", () => {
    for (const row of [
      button({ title: "Role", onClick: () => {}, disabled: "focusable" }),
      button({ title: "Shop", submit: true, disabled: "focusable" }),
    ]) {
      expect(row).toContain('aria-disabled="true"');
      expect(row).not.toMatch(/\sdisabled=""/);
      expect(row).toContain("opacity-50");
      expect(row).not.toContain("hover:bg-surface-2");
      // Its focus still shows.
      expect(row).toContain("focus-visible:outline-accent");
    }
  });

  it("disables a disabled row for real", () => {
    const row = button({ title: "Role", onClick: () => {}, disabled: true });
    expect(row).toMatch(/\sdisabled=""/);
    expect(row).not.toContain("aria-disabled=");
  });

  it("says a row on its way is busy", () => {
    expect(button({ title: "Shop", submit: true, busy: true })).toContain(
      'aria-busy="true"',
    );
    expect(button({ title: "Role", onClick: () => {}, busy: true })).toContain(
      'aria-busy="true"',
    );
    expect(button({ title: "Role", onClick: () => {} })).not.toContain(
      "aria-busy=",
    );
  });
});
