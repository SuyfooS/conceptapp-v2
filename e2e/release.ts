import type { Page } from "@playwright/test";

/*
 * A page from the release before, on a design twin (closing the pilot, PRs
 * 1a and 1b): no database, no sign-in, its frame's person Shiran. One build
 * is enough: a press goes out with an action id the server doesn't have
 * (its own, the last digit changed, so the same length), which Next.js
 * answers as it answers a page from the release before (409,
 * `x-nextjs-action-not-found`), and the client throws its own
 * `UnrecognizedActionError`. What the specs share: e2e/clock-release.spec.ts
 * and e2e/release.spec.ts, and the chat's, in e2e/chat.spec.ts, on the
 * demo's real /chat (its own sends only, so its reads go as they are).
 */

/** An action id of the same length that the server doesn't have. */
export const unknownId = (id: string) =>
  `${id.slice(0, -1)}${id.endsWith("0") ? "1" : "0"}`;

/**
 * Sends the presses on `path` as a page from the release before would: each
 * with an action id the server doesn't know. Returns the ids sent, and the
 * way to stop.
 */
export async function pressAsBeforeRelease(page: Page, path: string) {
  const sent: string[] = [];
  const onPath = (url: URL) => url.pathname === path;
  await page.route(onPath, async (route) => {
    const request = route.request();
    const id = request.headers()["next-action"];
    if (request.method() !== "POST" || id === undefined) {
      await route.fallback();
      return;
    }
    sent.push(id);
    const headers = await request.allHeaders();
    await route.continue({
      headers: { ...headers, "next-action": unknownId(id) },
    });
  });
  return { sent, stop: () => page.unroute(onPath) };
}

type Seen = Window & {
  statusWordsSeen?: string[];
  wordsSaid?: string[];
  beforeRelease?: boolean;
};

/**
 * On every page this tab loads, the reloaded one included: the words each
 * status region shows, each time they come in (a toast leaves by itself, or
 * at the next press), and each line the page's announcer says
 * (`@ui/announcer`, where the frame says its note), each time it does.
 * Nothing is told once for twice, so a test can count them.
 */
export async function watchStatusWords(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    const said: string[] = [];
    (window as Seen).statusWordsSeen = seen;
    (window as Seen).wordsSaid = said;
    const had = new WeakMap<Element, string>();
    const heard = new WeakSet<Element>();
    new MutationObserver(() => {
      for (const region of document.querySelectorAll('[role="status"]')) {
        const words = region.textContent ?? "";
        if (had.get(region) === words) continue;
        had.set(region, words);
        if (words) seen.push(words);
      }
      for (const line of document.querySelectorAll("[data-announcer] p")) {
        if (heard.has(line)) continue;
        heard.add(line);
        said.push(line.textContent ?? "");
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/** The words this page's status regions have shown so far, each time. */
export const statusWordsSeen = (page: Page) =>
  page.evaluate(() => (window as Seen).statusWordsSeen ?? []);

/** The lines this page's announcer has said so far, each time. */
export const wordsSaid = (page: Page) =>
  page.evaluate(() => (window as Seen).wordsSaid ?? []);

/** How many times `words` were shown (`seen`) and said (`said`) on this page. */
export async function timesTold(page: Page, words: string) {
  const count = (all: string[]) => all.filter((w) => w === words).length;
  return {
    seen: count(await statusWordsSeen(page)),
    said: count(await wordsSaid(page)),
  };
}

/**
 * Leaves the frame's note in this tab before the page at `path` loads, as a
 * press of the release before would (`@/app/stale-build`, `UPDATED_KEY`),
 * for `person` (`pressedBy`), in `words`: once, as the first page at that
 * address loads.
 */
export async function noteBeforeLoad(
  page: Page,
  path: string,
  person: string,
  words: string,
) {
  await page.addInitScript(
    ({ path, note }) => {
      if (window.location.pathname !== path) return;
      try {
        if (sessionStorage.getItem("e2e-noted") !== null) return;
        sessionStorage.setItem("e2e-noted", "");
        sessionStorage.setItem("stale-build-updated", `${Date.now()} ${note}`);
      } catch {
        // No storage: the test then says so, as nothing is said.
      }
    },
    { path, note: `${person} ${words}` },
  );
}

/** Marks the window as it is, to tell a whole new page from it later. */
export const markBeforeRelease = (page: Page) =>
  page.evaluate(() => {
    (window as Seen).beforeRelease = true;
  });

/** Whether this is still the window marked (`markBeforeRelease`). */
export const stillBeforeRelease = (page: Page) =>
  page.evaluate(() => (window as Seen).beforeRelease === true);

/** Counts the pages this tab loads from now on. */
export function countLoads(page: Page) {
  const loads = { count: 0 };
  page.on("load", () => {
    loads.count += 1;
  });
  return loads;
}
