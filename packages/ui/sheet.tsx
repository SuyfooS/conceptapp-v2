"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import {
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { sheetLiftStyle, useKeyboardLift } from "./use-keyboard-lift";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Name of the close button, for screen readers. */
  closeLabel: string;
  /** The main action at the end of the header, usually "done". */
  action?: { label: string; onClick: () => void };
  /**
   * Set for a sheet that only reads, with nothing inside to press: its body,
   * named by this, takes the keyboard, so it still scrolls by keys on a small
   * screen (axe scrollable-region-focusable).
   */
  readingLabel?: string;
  /**
   * Where the keyboard's focus goes once it has closed: what opened it, when
   * that is still there, else a place on the screen that makes sense (what
   * it acted on may have gone with it). By default, what held the focus
   * when it opened, if that is still on screen.
   */
  returnFocus?: () => HTMLElement | null | undefined;
  /**
   * Under the body, never scrolling away: the sheet's main action in a long
   * sheet, so it stays in sight (P6).
   */
  footer?: ReactNode;
  children: ReactNode;
};

/** Still drawn and shown: an element the focus can go back to. */
function onScreen(element: Element | null | undefined): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element !== document.body &&
    element.isConnected &&
    element.getClientRects().length > 0
  );
}

/**
 * A glass sheet that rises from the bottom, for one short task. Dragging the
 * grabber down closes it, and so do the button, the scrim and Escape. It renders
 * inside the nearest [data-accent] wrapper, so it keeps the business's colour.
 * Closed, it gives the keyboard's focus back (`returnFocus`), never to the
 * top of the page. On a phone it stands over the keyboard, never behind it
 * (`useKeyboardLift`): lifted as the keyboard opens, no taller than what is
 * on screen above it, and the field typed in kept in sight in its body.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  closeLabel,
  action,
  readingLabel,
  returnFocus,
  footer,
  children,
}: SheetProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  // What held the focus as it opened, before the sheet takes it.
  const opener = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement;
  }, [open]);
  const pull = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  // The scrim covers the layout viewport, which the sheet stands at the
  // foot of: its height says where that foot is while a keyboard is up.
  const [scrim, setScrim] = useState<HTMLDivElement | null>(null);
  const body = useRef<HTMLElement | null>(null);
  const setBody = (node: HTMLElement | null) => {
    body.current = node;
  };
  const lift = useKeyboardLift(scrim, body);
  const lifted = sheetLiftStyle(lift);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pull.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pull.current === null) return;
    setOffset(Math.max(0, event.clientY - pull.current));
  }
  function onPointerUp() {
    if (pull.current === null) return;
    pull.current = null;
    if (offset > 110) onOpenChange(false);
    setOffset(0);
  }

  const container =
    anchor.current?.closest<HTMLElement>("[data-accent]") ?? undefined;

  return (
    <>
      <span ref={anchor} hidden />
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal container={container}>
          <Dialog.Overlay
            ref={setScrim}
            className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=closed]:animate-[fade-out_200ms] data-[state=open]:animate-[fade-in_200ms]"
          />
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              const chosen = returnFocus ? returnFocus() : opener.current;
              opener.current = null;
              // Something already took the focus as it closed (a toast's
              // way back): it stays there.
              const active = document.activeElement;
              const inside =
                event.target instanceof Node &&
                active !== null &&
                event.target.contains(active);
              if (onScreen(active) && !inside) {
                event.preventDefault();
                return;
              }
              if (!onScreen(chosen)) return;
              event.preventDefault();
              chosen.focus({ preventScroll: true });
            }}
            // The lift moves `bottom` and `max-height`, never the transform
            // that a drag and the way in and out move.
            style={
              offset
                ? { ...lifted, transform: `translateY(${offset}px)` }
                : lifted
            }
            className="glass fixed inset-x-2 bottom-[var(--sheet-bottom,calc(env(safe-area-inset-bottom)+8px))] z-50 mx-auto flex max-h-[min(82dvh,var(--sheet-max,82dvh))] max-w-[560px] flex-col rounded-sheet bg-[var(--glass-strong)] transition-[bottom,max-height] duration-200 ease-calm motion-reduce:transition-none data-[state=closed]:animate-[sheet-out_220ms_ease-in] data-[state=open]:animate-[sheet-in_550ms_var(--ease-spring)]"
          >
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="grid cursor-grab touch-none place-items-center pt-2 pb-0.5"
            >
              <span
                aria-hidden="true"
                className="h-[5px] w-9 rounded-full bg-ink-2/40"
              />
            </div>
            {/* Positioned, so the glass's sheen does not wash out the buttons. */}
            <div className="relative flex items-center gap-2 px-3 pt-0.5 pb-2.5">
              <Dialog.Close
                aria-label={closeLabel}
                className="pressable grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-5"
              >
                <X aria-hidden="true" />
              </Dialog.Close>
              <div className="min-w-0 flex-1 text-center">
                <Dialog.Title className="font-semibold text-md">
                  {title}
                </Dialog.Title>
                {subtitle ? (
                  <p className="text-ink-2 text-sm">{subtitle}</p>
                ) : null}
              </div>
              {action ? (
                <Button onClick={action.onClick} className="shrink-0">
                  {action.label}
                </Button>
              ) : (
                <span aria-hidden="true" className="size-11 shrink-0" />
              )}
            </div>
            {readingLabel ? (
              <section
                ref={setBody}
                aria-label={readingLabel}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller with nothing to focus inside must take the keyboard itself to scroll by keys (axe scrollable-region-focusable)
                tabIndex={0}
                className={cn(
                  "relative min-h-0 overflow-y-auto px-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                  footer ? "pb-2" : "rounded-b-sheet pb-3",
                )}
              >
                {children}
              </section>
            ) : (
              <div
                ref={setBody}
                className={cn(
                  "relative min-h-0 overflow-y-auto px-2",
                  footer ? "pb-2" : "rounded-b-sheet pb-3",
                )}
              >
                {children}
              </div>
            )}
            {footer ? (
              // In the same glass, a hairline above it as the rows have.
              <div className="relative flex shrink-0 flex-col gap-2 rounded-b-sheet px-3 pt-2 pb-3 before:absolute before:start-4 before:end-4 before:top-0 before:h-px before:bg-line before:content-['']">
                {footer}
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
