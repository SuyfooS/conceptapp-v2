/** The mode's writes on their way, for the ones that wait their turn. */
export type WritesOnWay = { going: Set<Promise<unknown>> };

export function writesOnWay(): WritesOnWay {
  return { going: new Set() };
}

type Writes = Record<string, (...args: never[]) => Promise<unknown>>;

/**
 * The mode's writes, each kept on `onWay` until it answers; those named in
 * `waiting` go only once every write sent before them has answered,
 * whatever it answered (waiter mode P5). A line's fix held for its "ביטול"
 * is sent when its screen is left: the till's close, pressed a moment
 * later, goes after it, so it never serves a ticket the cancel then finds
 * too late. Next sends server actions one at a time today, but says that
 * may change, and a navigation lets the next one past one still going.
 * `onWay` outlives a new set of writes (the layout drawn again).
 */
export function inTurn<W extends Writes>(
  writes: W,
  waiting: readonly (keyof W)[],
  onWay: WritesOnWay,
): W {
  const { going } = onWay;
  const inLine = new Set<PropertyKey>(waiting);
  const turned: Record<string, (...args: never[]) => Promise<unknown>> = {};
  for (const [name, write] of Object.entries(writes)) {
    const waits = inLine.has(name);
    turned[name] = (...args) => {
      const before = waits ? [...going] : [];
      const call =
        before.length > 0
          ? Promise.allSettled(before).then(() => write(...args))
          : write(...args);
      going.add(call);
      const done = () => {
        going.delete(call);
      };
      call.then(done, done);
      return call;
    };
  }
  return turned as W;
}
