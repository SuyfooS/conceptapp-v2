/**
 * Asks `url` to hide a card on Today on this device (the first steps, a
 * bank change), with `body` as JSON when it carries one, and gives the
 * answer, or null when none came. A route (/home/first-steps,
 * /home/bank-seen) rather than a server action: the hide is held for its
 * undo and goes once the screen is left inside the app, from the page the
 * person went to. Next sends an action posted there on to Today's worker,
 * which has it, and drops the Set-Cookie of a forwarded action's answer,
 * so the cookie that hides the card would never be kept. `keepalive` lets
 * it reach the server from a page being hidden or closed too. A signed-out
 * device gets the door's redirect, which `redirect: "manual"` keeps as an
 * answer that isn't ok instead of following it to a page.
 */
export async function sendHide(
  url: string,
  body?: unknown,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    return null;
  }
}
