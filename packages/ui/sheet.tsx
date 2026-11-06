"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "./button";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Name of the close button, for screen readers. */
  closeLabel: string;
  /** The main action at the end of the header, usually "done". */
  action?: { label: string; onClick: () => void };
  children: ReactNode;
};

/**
 * A glass sheet that rises from the bottom, for one short task. Dragging the
 * grabber down closes it, and so do the button, the scrim and Escape. It renders
 * inside the nearest [data-accent] wrapper, so it keeps the business's colour.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  closeLabel,
  action,
  children,
}: SheetProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const pull = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);

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
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=closed]:animate-[fade-out_200ms] data-[state=open]:animate-[fade-in_200ms]" />
          <Dialog.Content
            aria-describedby={undefined}
            style={
              offset ? { transform: `translateY(${offset}px)` } : undefined
            }
            className="glass fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-50 mx-auto flex max-h-[82dvh] max-w-[560px] flex-col rounded-sheet bg-[var(--glass-strong)] data-[state=closed]:animate-[sheet-out_220ms_ease-in] data-[state=open]:animate-[sheet-in_550ms_var(--ease-spring)]"
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
            <div className="relative min-h-0 overflow-y-auto rounded-b-sheet px-2 pb-3">
              {children}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
