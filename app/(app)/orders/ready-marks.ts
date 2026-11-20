/**
 * What this phone said of tickets' "מוכן" (waiter mode P4), which the mode's
 * ready news leaves out. A ticket marked ready here was told by its own
 * toast. One put back here is no news until a read made after the put-back
 * has come: a sync that started before its answer (the heavier request, on a
 * slow link) may answer after it, still seeing the ticket ready. A read made
 * after it is one of a sync started once the put-back had answered. Pure,
 * for the provider (orders-provider.tsx) and its tests.
 */
export function readyMarks() {
  const marked = new Set<string>();
  /** Put back here, by how many syncs had started when the put-back answered. */
  const putBack = new Map<string, number>();
  let started = 0;
  return {
    /** A sync starts: the number its read is known by. */
    started(): number {
      started += 1;
      return started;
    },
    /** Marked ready here (true), or put back (false), as its answer came. */
    said(ticket: string, ready: boolean): void {
      if (ready) {
        marked.add(ticket);
        putBack.delete(ticket);
      } else {
        marked.delete(ticket);
        putBack.set(ticket, started);
      }
    },
    /**
     * What the read of sync `read` leaves out of the news: what was marked
     * ready here, and what was put back here since a sync that started
     * before it. A put-back this read is newer than counts no more.
     */
    quietFor(read: number): ReadonlySet<string> {
      for (const [ticket, at] of putBack) {
        if (read > at) putBack.delete(ticket);
      }
      return new Set([...marked, ...putBack.keys()]);
    },
    /** Whether a ticket is no news now: for what waited to be told. */
    quiet(ticket: string): boolean {
      return marked.has(ticket) || putBack.has(ticket);
    },
  };
}

export type ReadyMarks = ReturnType<typeof readyMarks>;
