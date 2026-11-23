import { join } from "node:path";
import {
  AFTER_SIGN_IN_SCREENS,
  afterSignInPath,
  NEVER_AFTER_SIGN_IN,
} from "@domain/after-sign-in";
import { describe, expect, it } from "vitest";
import { PRIVATE } from "../proxy";
import { sourceFiles } from "./boundaries";

// The page a link asked for before sign-in (known issue 21) is kept only for
// a screen of the app. These hold the lists in @domain/after-sign-in to the
// app's own files: every private screen is kept or left out on purpose, so
// a new one fails here until someone decides; no route handler is ever kept,
// since one kept through sign-in would come back as the app's own request
// and pass a `Sec-Fetch-Site` check meant for the app's own links (the
// month's pay file); and every page of a kept screen is kept as it is.

const root = join(__dirname, "..");
const ID = "00000000-0000-4000-b000-000000000001";

/**
 * The address a route or page file answers: route groups dropped, a
 * dynamic segment filled with an id, a catch-all with two segments.
 */
function urlOf(file: string): string {
  const segments = file
    .split("/")
    .slice(1, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .map((segment) => {
      if (/^\[\[?\.\.\..+\]\]?$/.test(segment)) return "a/b";
      return /^\[.+\]$/.test(segment) ? ID : segment;
    });
  return `/${segments.join("/")}`;
}

const files = sourceFiles("app", root);
const routes = files.filter((file) => file.endsWith("/route.ts")).map(urlOf);
const pages = (group: string) =>
  files
    .filter((file) => file.startsWith(`app/${group}/`))
    .filter((file) => file.endsWith("/page.tsx"))
    .map(urlOf);

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

describe("the screens a link can keep", () => {
  it("are the private screens but Today, the files and the console", () => {
    for (const screen of AFTER_SIGN_IN_SCREENS) {
      expect(PRIVATE, screen).toContain(screen);
    }
    expect(
      PRIVATE.filter(
        (path) => !(AFTER_SIGN_IN_SCREENS as readonly string[]).includes(path),
      ),
    ).toEqual([
      "/home",
      "/photos",
      "/list-photos",
      "/chat-files",
      "/document-files",
      "/admin",
    ]);
  });
});

describe("a route handler", () => {
  it("is found, under the kept screens too", () => {
    expect(routes).toContain("/clock/pay/export");
    expect(routes).toContain(`/notifications/open/${ID}`);
    expect(routes.length).toBeGreaterThan(20);
  });

  it("is never kept, with a query or without", () => {
    for (const route of routes) {
      expect(afterSignInPath(route), route).toBeNull();
      expect(afterSignInPath(`${route}?month=2026-10`), route).toBeNull();
    }
  });

  it("under a kept screen is listed, and every listed one is a route", () => {
    for (const route of routes) {
      if (!AFTER_SIGN_IN_SCREENS.some((screen) => under(route, screen))) {
        continue;
      }
      expect(
        NEVER_AFTER_SIGN_IN.some((never) => under(route, never)),
        route,
      ).toBe(true);
    }
    for (const never of NEVER_AFTER_SIGN_IN) {
      expect(
        routes.some((route) => under(route, never)),
        never,
      ).toBe(true);
    }
  });
});

describe("a page", () => {
  it("of a kept screen is kept as it is, and Today's never", () => {
    const app = [...pages("(app)"), ...pages("(account)")];
    expect(app).toContain("/schedule");
    expect(app).toContain(`/me/past/${ID}`);
    for (const page of app) {
      if (under(page, "/home")) {
        expect(afterSignInPath(page), page).toBeNull();
      } else {
        expect(afterSignInPath(page), page).toBe(page);
      }
    }
  });

  it("of the console is never kept", () => {
    const admin = pages("(admin)");
    expect(admin).toContain("/admin");
    for (const page of admin) {
      expect(afterSignInPath(page), page).toBeNull();
    }
  });
});
