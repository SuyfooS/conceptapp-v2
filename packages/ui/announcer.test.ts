import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Announcer, announce } from "./announcer";

/*
 * The page's announcer as the root layout draws it first: two regions, a
 * polite one and an assertive one, each with its own aria-live from the
 * first drawing (so a sheet never hides them), out of sight, and empty.
 * On the server, saying something does nothing.
 */

describe("Announcer", () => {
  it("draws a polite and an assertive region, out of sight and empty", () => {
    announce("said on the server");
    const html = renderToString(createElement(Announcer));
    expect(html).toBe(
      '<div data-announcer="" class="sr-only"><div aria-live="polite" data-announcer="polite"></div><div aria-live="assertive" data-announcer="assertive"></div></div>',
    );
  });
});
