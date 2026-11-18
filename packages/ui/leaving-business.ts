/**
 * Leaving one business for another (payroll P3b). The business a person works
 * in is one cookie for the whole browser, and each server action reads it when
 * it runs. A screen that holds a write for its undo would send it only after
 * a switch made from the sidebar had changed the cookie, and it would run in
 * the other business. So the switcher says it is leaving first. Every screen
 * holding a write sends it at once and hands it back, and the switch waits
 * for those writes. The server checks each write against the business the
 * screen was drawn for anyway.
 */

const LEAVING = "ca:leaving-business";

/** How long a switch waits for the writes it set off before it goes ahead. */
const WAIT_MS = 5000;

type Leaving = CustomEvent<{ wait: (write: Promise<unknown>) => void }>;

/**
 * Say the business is changing. Resolves once every write the screens send
 * because of it has finished, or after five seconds at most.
 */
export async function leaveBusiness(): Promise<void> {
  if (typeof window === "undefined") return;
  const writes: Promise<unknown>[] = [];
  window.dispatchEvent(
    new CustomEvent(LEAVING, {
      detail: { wait: (write: Promise<unknown>) => writes.push(write) },
    }),
  );
  if (writes.length === 0) return;
  let timer: number | undefined;
  await Promise.race([
    Promise.allSettled(writes),
    new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, WAIT_MS);
    }),
  ]);
  window.clearTimeout(timer);
}

/**
 * Send what the screen holds when the person switches business: `send`
 * writes it now and returns the write, or nothing when nothing is held.
 * Returns what stops listening, for an effect's cleanup.
 */
export function onLeavingBusiness(
  send: () => Promise<unknown> | null | undefined,
): () => void {
  const listener = (event: Event) => {
    const write = send();
    if (write) (event as Leaving).detail.wait(write);
  };
  window.addEventListener(LEAVING, listener);
  return () => window.removeEventListener(LEAVING, listener);
}
