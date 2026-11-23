import { describe, expect, it } from "vitest";
import {
  AFTER_SIGN_IN_MAX_LENGTH,
  afterSignInPath,
  afterSignInPathOf,
  isDocumentNavigation,
  isOpenedFromOutside,
} from "./after-sign-in";
import { isAppPath } from "./app-path";
import { INBOX_PATH } from "./notifications";

// The page a link asked for before sign-in (known issue 21): what can be
// kept, and when the proxy keeps it. Every trick a link could use to send
// someone off the site, or to a file, the console or a route handler, is
// refused, both as the proxy keeps it and as a door takes it back.

const ID = "00000000-0000-4000-b000-000000000001";

/** A path of exactly `length` characters on a kept screen. */
const long = (length: number) => {
  const head = "/lists?q=";
  return `${head}${"a".repeat(length - head.length)}`;
};

const TAKEN = [
  "/schedule?week=2026-11-22",
  "/schedule/build?week=2026-11-22",
  "/schedule/availability",
  `/lists/${ID}`,
  `/chat/${ID}`,
  `/chat/documents/${ID}`,
  "/me",
  "/me/file",
  `/me/past/${ID}`,
  `/team/${ID}/file`,
  "/clock/team?month=2026-11",
  `/orders/takeaway/${ID}`,
  "/manage/scheduling",
  "/notifications?before=x",
  "/lists?q=%D7%90",
  long(AFTER_SIGN_IN_MAX_LENGTH),
];

const REFUSED: unknown[] = [
  "/home",
  "/home?x=1",
  "//evil.example",
  "///evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/schedule\\..\\admin",
  "https://evil.example/schedule",
  "http:/schedule",
  "javascript:alert(1)",
  "data:text/html,x",
  "schedule",
  "/%2F%2Fevil.example",
  "/%2f/evil.example",
  "/schedule/%2e%2e/admin",
  "/schedule/%2E%2E%2Fadmin",
  "/schedule/..%2F..%2Fadmin",
  "/%5Cevil.example",
  "/schedule/../admin",
  "/./schedule",
  "/schedule/./build",
  "/schedule//evil.example",
  "/schedule/",
  "/\tschedule",
  "/schedule\n",
  "/sched%0aule",
  "/schedule%00",
  "/schedule\u007f",
  "/schedule#x",
  "/schedule?",
  "/lists/א",
  "/lists/%D7%90",
  "/clock/p%61y/export",
  "/∕∕evil.example",
  "/／／evil.example",
  "/ schedule",
  "/schedulex",
  "/schedule-x",
  "/Schedule",
  "/admin",
  "/admin/businesses/demo-restaurant",
  `/photos/${ID}/a.webp`,
  "/list-photos/a/b/c",
  "/chat-files/a/b/c",
  "/document-files/download",
  "/document-files/a/b",
  "/clock/pay/export?month=2026-10",
  "/clock/pay/export/",
  "/clock/Pay/Export?month=2026-10",
  "/clock/code/issue",
  `/notifications/open/${ID}`,
  "/notifications/open",
  "/cron/notifications",
  "/api/x",
  "/sign-in",
  "/enter",
  "/join/token",
  "/station",
  "/station/code",
  long(AFTER_SIGN_IN_MAX_LENGTH + 1),
  "",
  null,
  undefined,
  42,
  {},
];

describe("afterSignInPath", () => {
  it("keeps a page of the app as it was given", () => {
    for (const path of TAKEN) {
      expect(afterSignInPath(path), path).toBe(path);
    }
  });

  it("refuses anything that could leave the site, or isn't a screen to land on", () => {
    for (const raw of REFUSED) {
      expect(afterSignInPath(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("keeps only paths inside the app", () => {
    for (const path of TAKEN) expect(isAppPath(path), path).toBe(true);
  });
});

describe("afterSignInPathOf", () => {
  it("keeps the inbox for a notification opened after the session ended", () => {
    expect(afterSignInPathOf(`/notifications/open/${ID}`, "")).toBe(INBOX_PATH);
    expect(afterSignInPathOf("/notifications/open", "")).toBe(INBOX_PATH);
    // The one asking a signed-out phone to sign in again leads to the bare
    // inbox, kept bare: no earlier page of the last person's lines.
    expect(afterSignInPathOf(INBOX_PATH, "")).toBe(INBOX_PATH);
    expect(afterSignInPathOf(INBOX_PATH, "?before=x")).toBe(INBOX_PATH);
    // A page under the inbox is a page like any other.
    expect(afterSignInPathOf("/notifications/settings", "")).toBe(
      "/notifications/settings",
    );
  });

  it("keeps a page with its query, and nothing for Today", () => {
    expect(afterSignInPathOf("/schedule", "?week=2026-11-22")).toBe(
      "/schedule?week=2026-11-22",
    );
    expect(afterSignInPathOf("/home", "")).toBeNull();
    expect(afterSignInPathOf("/admin", "")).toBeNull();
  });
});

describe("isOpenedFromOutside", () => {
  const from = (site: string | null, path = `/chat/${ID}`) =>
    isOpenedFromOutside(
      new Headers(site === null ? {} : { "sec-fetch-site": site }),
      path,
    );

  it("is a link from another site or app, an address typed, or a browser that doesn't say", () => {
    for (const site of ["cross-site", "same-site", "none", null]) {
      expect(from(site), String(site)).toBe(true);
    }
  });

  it("is never a page the app's own sent there: a reload, a tab left open after its session ended", () => {
    expect(from("same-origin")).toBe(false);
    expect(from("same-origin", `/chat/with/${ID}`)).toBe(false);
    expect(from("same-origin", "/schedule")).toBe(false);
    // A page under the inbox is a page like any other.
    expect(from("same-origin", "/notifications/settings")).toBe(false);
    expect(from("same-origin", "/notifications/opened")).toBe(false);
  });

  it("is a phone's notification whatever its window says, its route or the bare inbox", () => {
    for (const site of ["same-origin", "none", "cross-site", null]) {
      expect(from(site, `/notifications/open/${ID}`), String(site)).toBe(true);
      expect(from(site, "/notifications/open"), String(site)).toBe(true);
      expect(from(site, `/Notifications/Open/${ID}`), String(site)).toBe(true);
      // The service worker's window opening the bare inbox (the one asking
      // a signed-out phone to sign in again) may report same-origin.
      expect(from(site, INBOX_PATH), String(site)).toBe(true);
    }
  });
});

describe("isDocumentNavigation", () => {
  const SAFARI_ACCEPT =
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const NAVIGATE = {
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
    "sec-fetch-site": "cross-site",
  };
  const asks = (headers: Record<string, string>, method = "GET", search = "") =>
    isDocumentNavigation(method, new Headers(headers), search);

  it("is a page opened in the window, with or without the Sec-Fetch headers", () => {
    expect(asks(NAVIGATE)).toBe(true);
    expect(asks(NAVIGATE, "GET", "?week=2026-11-22")).toBe(true);
    // Safari before 16.4 sends no Sec-Fetch headers: a page asks for HTML.
    expect(asks({ accept: SAFARI_ACCEPT })).toBe(true);
  });

  it("is never a request with no Sec-Fetch headers that doesn't ask for HTML", () => {
    for (const accept of [
      "*/*",
      "image/webp,image/*;q=0.8",
      "text/x-component",
    ]) {
      expect(asks({ accept }), accept).toBe(false);
    }
    expect(asks({})).toBe(false);
  });

  it("is never another method, the router's own fetch, a prefetch, an image or a frame", () => {
    expect(asks(NAVIGATE, "POST")).toBe(false);
    expect(asks(NAVIGATE, "HEAD")).toBe(false);
    const others: Record<string, string>[] = [
      { rsc: "1" },
      { "next-router-prefetch": "1" },
      { "next-router-segment-prefetch": "/x" },
      { "next-router-state-tree": "%5B%5D" },
      { "next-action": "abc" },
      { "sec-purpose": "prefetch" },
      { "sec-purpose": "prefetch;prerender" },
      { purpose: "prefetch" },
      { "sec-fetch-mode": "cors" },
      { "sec-fetch-mode": "no-cors" },
      { "sec-fetch-mode": "same-origin" },
      { "sec-fetch-dest": "image" },
      { "sec-fetch-dest": "iframe" },
      { "sec-fetch-dest": "empty" },
    ];
    for (const extra of others) {
      expect(asks({ ...NAVIGATE, ...extra }), JSON.stringify(extra)).toBe(
        false,
      );
      expect(
        asks({ accept: SAFARI_ACCEPT, ...extra }),
        JSON.stringify(extra),
      ).toBe(false);
    }
    expect(asks(NAVIGATE, "GET", "?_rsc=abc")).toBe(false);
    expect(asks(NAVIGATE, "GET", "?week=2026-11-22&_rsc=abc")).toBe(false);
  });
});
