"use client";

import { useLayoutEffect, useState } from "react";

/**
 * What the server has of a list an editor saves whole (the menu's places
 * and categories), for a refusal to show: the list of the newest change a
 * save went through with (`saved`, its new rows with their ids, by the
 * change's number), until the server's own list is drawn again (`drawn`),
 * and then none (`refused` gives null), so the screen shows the list it was
 * given.
 *
 * Next draws an action's answer (the server's list, with the menu's new
 * version) only once every action sent after it has answered too: each one
 * sets the router's state in a transition, and React holds them together
 * until the latest is ready. So the latest change refused while an earlier
 * one saved can find the list from before both still drawn: shown, the
 * saved change seemed undone until its list came a moment later (CI's
 * third run of orders-menu.spec.ts). The answers themselves can come out of
 * turn too: Next sends the next save once an answer's first row is read,
 * and settles the earlier save's promise only once its result's own row is
 * (CI's fourth run). The server took the saves in turn, so the newest
 * change that saved is kept, and an older one's answer, come late, never
 * replaces it.
 */
export function lastSaved<T>(): {
  /** Change `change` went through with `list`: the server has it, unless a newer one did since. */
  saved: (list: T[], change: number) => void;
  /** The server's list was drawn: as new as any save answered before it. */
  drawn: () => void;
  /** Refused: the list the server has, or null for the one drawn. */
  refused: () => T[] | null;
} {
  let kept: T[] | null = null;
  // The newest change kept, drawn since or not: an older one answering
  // after it is behind what the server has.
  let newest = 0;
  return {
    saved(list, change) {
      if (change <= newest) return;
      newest = change;
      kept = list;
    },
    drawn() {
      kept = null;
    },
    refused: () => kept,
  };
}

/**
 * `lastSaved` for an editor given `serverList`: each new one drawn (an
 * answer's list, or any other drawing of the server's) is the server's
 * own, so what a save kept before it is forgotten as it is drawn.
 */
export function useLastSaved<T>(
  serverList: readonly T[],
): ReturnType<typeof lastSaved<T>> {
  const [kept] = useState(lastSaved<T>);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the server's list drawn anew is what forgets the save's
  useLayoutEffect(() => {
    kept.drawn();
  }, [serverList, kept]);
  return kept;
}
