"use client";

import { useLayoutEffect, useState } from "react";

/**
 * What the server has of a list an editor saves whole (the menu's places
 * and categories), for a refusal to show: the latest list a save went
 * through with (`saved`, its new rows with their ids), until the server's
 * own list is drawn again (`drawn`), and then none (`refused` gives null),
 * so the screen shows the list it was given.
 *
 * Next draws an action's answer (the server's list, with the menu's new
 * version) only once every action sent after it has answered too: each one
 * sets the router's state in a transition, and React holds them together
 * until the latest is ready, while the action's own answer comes first. So
 * the latest change refused while an earlier one saved finds the list from
 * before both still drawn: shown, the saved change seemed undone until its
 * list came a moment later, and a move it carried was said where it no
 * longer was ("4 עכשיו בשורה 4" for a table the server has in row 5: CI's
 * third run of orders-menu.spec.ts).
 */
export function lastSaved<T>(): {
  /** A save went through with `list`: the server has it now. */
  saved: (list: T[]) => void;
  /** The server's list was drawn: as new as any save answered before it. */
  drawn: () => void;
  /** Refused: the list the server has, or null for the one drawn. */
  refused: () => T[] | null;
} {
  let kept: T[] | null = null;
  return {
    saved(list) {
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
