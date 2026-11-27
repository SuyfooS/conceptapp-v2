import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OLD_BROWSER_ATTRIBUTE,
  OldBrowserNotice,
  type OldBrowserNoticeProps,
} from "./old-browser-notice";

/*
 * The notice for a browser older than the app needs (closing the pilot,
 * PR 26), drawn on the server as the root layout draws it: hidden by
 * default, so only app/globals.css shows it, with no script; drawn whatever
 * the browser when the gallery asks; in the flow, never over the page; one
 * region named by its title. The rule that shows it is checked in
 * tooling/old-browser.test.ts, and the browser in e2e/old-browser.spec.ts.
 */

const draw = (props: Partial<OldBrowserNoticeProps> = {}) =>
  renderToString(
    createElement(
      OldBrowserNotice,
      // Its children come as createElement's own argument.
      { title: "Too old", ...props } as OldBrowserNoticeProps,
      createElement("p", null, "Update it"),
    ),
  );

/** The classes on the element carrying the attribute. */
function rootClasses(html: string): string[] {
  const root = new RegExp(`<div ${OLD_BROWSER_ATTRIBUTE}=""[^>]*>`).exec(
    html,
  )?.[0];
  if (!root) throw new Error(`No ${OLD_BROWSER_ATTRIBUTE} in ${html}`);
  return (/class="([^"]*)"/.exec(root)?.[1] ?? "").split(/\s+/);
}

describe("OldBrowserNotice", () => {
  it("is hidden by default, and carries the attribute the stylesheet shows it by", () => {
    const html = draw();
    expect(html.startsWith(`<div ${OLD_BROWSER_ATTRIBUTE}=""`)).toBe(true);
    expect(rootClasses(html)).toContain("hidden");
  });

  it("is drawn whatever the browser when shown, for the gallery", () => {
    const classes = rootClasses(draw({ shown: true }));
    expect(classes).not.toContain("hidden");
    expect(classes).not.toContain("block");
  });

  it("says its title and what to do, in one region named by the title", () => {
    const html = draw();
    expect(html).toContain("Too old");
    expect(html).toContain("<p>Update it</p>");
    const labelledBy = /<section aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
    // The icon says nothing a screen reader would hear twice.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("never blocks the page: in the flow, with no z-index, so every fixed bar is drawn over it", () => {
    const html = draw();
    const card = /<section [^>]*class="([^"]*)"/.exec(html)?.[1];
    expect(card).toBeTruthy();
    // Neither the full-width box nor its card is lifted: a lifted box would
    // lie over the desktop's sidebar beside the card, and the card over a
    // short phone's tab bar.
    for (const classes of [rootClasses(html), (card ?? "").split(/\s+/)]) {
      for (const lifted of ["relative", "fixed", "absolute", "sticky"]) {
        expect(classes).not.toContain(lifted);
      }
      expect(classes).not.toContain("inset-0");
      expect(classes.filter((name) => /^-?z-/.test(name))).toEqual([]);
    }
    expect(html).not.toMatch(/pointer-events|aria-modal|role="dialog"/);
  });

  it("takes a screen's own spacing in place of its own", () => {
    const classes = rootClasses(draw({ shown: true, className: "px-0 pt-0" }));
    expect(classes).toContain("px-0");
    expect(classes).toContain("pt-0");
    expect(classes).not.toContain("px-4");
  });
});
