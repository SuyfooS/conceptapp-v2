import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ignoreHeldEnter } from "./focus-after";
import { IconButton } from "./icon-button";
import { ScanCircle, type ScanCircleState } from "./scan-circle";

/*
 * The camera's stop takes the focus from the circle pressed to open it
 * (accessibility, part 5): Enter held down on the circle must not go on to
 * press it, so only a key's first press stops scanning. A sheet that leads
 * back to the camera gives the stop the focus itself once it has gone, so
 * the stop is handed over (`ref`) and takes none as it appears. A code read
 * shows on the line, and the clock's toast says it after the focus has moved
 * on (`quietRead`). ScanCircle keeps no state, so it is drawn here as the
 * element it returns.
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

/** The line under the circle's `aria-live`, drawn in `state`. */
function liveOf(state: ScanCircleState, quietRead?: boolean): unknown {
  const line = first(ScanCircle({ state, status: "Got it", quietRead }), "p");
  if (!line) throw new Error("no line drawn");
  return (line.props as { "aria-live"?: unknown })["aria-live"];
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

  it("hands its stop to a screen that brings the focus there itself", () => {
    const ref = { current: null };
    const drawn = ScanCircle({
      state: "aiming",
      status: "Point at the code",
      cancel: {
        label: "Stop scanning",
        onClick: () => {},
        autoFocus: false,
        ref,
      },
    });
    const stop = first(drawn, IconButton);
    if (!stop) throw new Error("no stop drawn");
    const props = stop.props as { ref?: unknown; autoFocus?: unknown };
    expect(props.ref).toBe(ref);
    expect(props.autoFocus).toBe(false);
  });

  it("says each state's line, and keeps a code read to the eye with quietRead", () => {
    expect(liveOf("read", true)).toBe("off");
    expect(liveOf("read")).toBe("polite");
    for (const state of ["starting", "aiming", "reading", "problem"] as const) {
      expect(liveOf(state, true)).toBe("polite");
    }
  });
});
