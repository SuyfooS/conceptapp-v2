import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ignoreHeldEnter } from "./focus-after";
import { IconButton } from "./icon-button";
import { ScanCircle } from "./scan-circle";

/*
 * The camera's stop takes the focus from the circle pressed to open it
 * (accessibility, part 5): Enter held down on the circle must not go on to
 * press it, so only a key's first press stops scanning. ScanCircle keeps no
 * state, so it is drawn here as the element it returns.
 */

/** The first element of `type` in what was drawn. */
function first(node: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = first(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  return first((node.props as { children?: ReactNode }).children, type);
}

describe("ScanCircle", () => {
  it("lets Enter held down from the press that opened it stop nothing", () => {
    const drawn = ScanCircle({
      state: "aiming",
      status: "Point at the code",
      cancel: { label: "Stop scanning", onClick: () => {}, autoFocus: true },
    });
    const stop = first(drawn, IconButton);
    if (!stop) throw new Error("no stop drawn");
    expect((stop.props as { onKeyDown?: unknown }).onKeyDown).toBe(
      ignoreHeldEnter,
    );
  });
});
