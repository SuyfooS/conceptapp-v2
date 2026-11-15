import { useEffect, useState } from "react";

/** How often the builder's clock moves on. */
const TICK_MS = 60_000;

/**
 * The moment the builder reads what has begun at. It starts at `from`, the
 * moment the server read the week (ISO), so the server's render, hydration
 * and the design demo's fixed moment agree; once mounted it moves on once a
 * minute by the time gone since, so a shift that begins while the screen is
 * open locks, and the demo's day goes on from its own moment. A new `from`
 * (the server read the week again) starts it from there. Null without one:
 * a screen with nothing to lock.
 */
export function useBuilderClock(from: string | null): Date | null {
  const [clock, setClock] = useState({ from, at: from });
  if (clock.from !== from) setClock({ from, at: from });

  useEffect(() => {
    if (from === null) return;
    const origin = Date.parse(from);
    const mounted = Date.now();
    const id = window.setInterval(() => {
      setClock({
        from,
        at: new Date(origin + Date.now() - mounted).toISOString(),
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [from]);

  return clock.at === null ? null : new Date(clock.at);
}

/** The later of two moments (ISO for the second), for a clock that only goes on. */
export function laterOf(clock: Date | null, answered: string | undefined) {
  if (clock === null || answered === undefined) return clock;
  const at = Date.parse(answered);
  return at > clock.getTime() ? new Date(at) : clock;
}
