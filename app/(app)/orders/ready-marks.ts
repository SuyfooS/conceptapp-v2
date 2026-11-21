import type { MyOrders } from "@domain/orders";

/**
 * What this phone said of tickets' "מוכן" (waiter mode P4), which the mode's
 * ready news leaves out. A ticket marked ready here was told by its own
 * toast, until a read made after the mark sees it not ready: put back on
 * another phone, it is news again once it is made ready again. One put back
 * here is no news until a read made after the put-back has come: a sync that
 * started before its answer (the heavier request, on a slow link) may answer
 * after it, still seeing the ticket ready. A read made after a mark or a
 * put-back is one of a sync started once its answer had come. Pure, for the
 * provider (orders-provider.tsx) and its tests.
 */
export function readyMarks() {
  /** Marked ready here, by how many syncs had started when the mark answered. */
  const marked = new Map<string, number>();
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
        marked.set(ticket, started);
        putBack.delete(ticket);
      } else {
        marked.delete(ticket);
        putBack.set(ticket, started);
      }
    },
    /**
     * The read of sync `read` of one's own rounds: a ticket marked here that
     * it shows not ready, read after the mark, was put back elsewhere, and
     * is news again when it turns ready. A read from before the mark may
     * still show it as it was, and changes nothing.
     */
    seen(read: number, mine: MyOrders): void {
      for (const round of mine.rounds) {
        for (const ticket of round.tickets) {
          const at = marked.get(ticket.id);
          if (at === undefined || read <= at) continue;
          if (ticket.status !== "ready") marked.delete(ticket.id);
        }
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
      return new Set([...marked.keys(), ...putBack.keys()]);
    },
    /** Whether a ticket is no news now: for what waited to be told. */
    quiet(ticket: string): boolean {
      return marked.has(ticket) || putBack.has(ticket);
    },
  };
}

export type ReadyMarks = ReturnType<typeof readyMarks>;
