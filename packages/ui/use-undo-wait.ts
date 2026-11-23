"use client";

import {
  type FocusEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  createUndoWait,
  lastPointerKind,
  notePointerKinds,
  restsWherePressed,
  type UndoWait,
  waitForFocusInside,
} from "./undo-wait";

// The press that brings a way back comes before it is drawn.
if (typeof document !== "undefined") notePointerKinds(document);

/** Whether an element shows its focus: the keyboard, not a tap, put it there. */
function showsFocus(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** The handlers a way back's root spreads, and what it does after its press. */
export type UndoWaitHandlers = {
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
};

/**
 * The rule of `@ui/undo-wait` on a way back's root (`root`): spread
 * `handlers` on it, and `onChange` hears whether it waits. A press anywhere
 * outside it ends a quiet focus's wait. Gone, it waits no more, so nothing
 * it held stays stopped once its way back went. `wait` is the rule itself,
 * for what the root does after its press (`taken`, `dispose`).
 */
export function useUndoWait(
  root: RefObject<HTMLElement | null>,
  onChange?: (waiting: boolean) => void,
): { handlers: UndoWaitHandlers; wait: UndoWait } {
  const heard = useRef(onChange);
  useLayoutEffect(() => {
    heard.current = onChange;
  });
  const [wait] = useState(() =>
    createUndoWait({ onChange: (waiting) => heard.current?.(waiting) }),
  );

  useEffect(() => {
    const elsewhere = (event: Event) => {
      if (event.target instanceof Node && root.current?.contains(event.target))
        return;
      wait.pressedElsewhere();
    };
    document.addEventListener("pointerdown", elsewhere, { capture: true });
    // Its `autoFocus` came first, and dev's second run of this effect
    // follows a cleanup that let go of it.
    waitForFocusInside(wait, root.current, document, showsFocus);
    return () => {
      document.removeEventListener("pointerdown", elsewhere, { capture: true });
      wait.dispose();
    };
  }, [root, wait]);

  const mouseOver = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    // Drawn under a mouse at rest where it was pressed: not brought here.
    if (restsWherePressed(event.clientX, event.clientY)) return;
    wait.mouse(true);
  };
  const lifted = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") wait.finger(false);
  };

  return {
    wait,
    handlers: {
      onFocus: (event) =>
        wait.focusIn(showsFocus(event.target), lastPointerKind()),
      onBlur: (event) => {
        if (root.current?.contains(event.relatedTarget as Node | null)) return;
        wait.focusOut();
      },
      onPointerEnter: mouseOver,
      onPointerMove: mouseOver,
      onPointerLeave: (event) => {
        if (event.pointerType === "mouse") wait.mouse(false);
        else wait.finger(false);
      },
      onPointerDown: (event) => {
        if (event.pointerType !== "mouse") wait.finger(true);
      },
      onPointerUp: lifted,
      onPointerCancel: lifted,
    },
  };
}
