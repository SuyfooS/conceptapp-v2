"use client";

import { Button } from "@ui/button";
import { EyeOff } from "lucide-react";
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { UndoRow } from "../manage/undo-row";
import { useHeldWrite } from "../use-held-write";

type Hides = {
  start: () => void;
  button: RefObject<HTMLButtonElement | null>;
};

const HidesContext = createContext<Hides | null>(null);

/**
 * Hiding the first steps on Today: the card goes at once and "ביטול" takes
 * its place, with the focus, while the write is held for it as every undo in
 * the app holds one (`useHeldWrite`). "ביטול" brings the card back, with the
 * focus on "הסתרה" again. Once written, Today is drawn again without the card;
 * if it couldn't be, the card comes back and says so. With no `hide`
 * (viewing as someone), there is nothing to hide with.
 */
export function FirstStepsHides({
  hide,
  hidden,
  failed,
  children,
}: {
  /** `hideFirstStepsAction`, the demo's stand-in, or null. */
  hide: (() => Promise<void>) | null;
  /** What the undo's row says while the card is gone. */
  hidden: string;
  /** What the card says when it couldn't be hidden. */
  failed: string;
  children: ReactNode;
}) {
  return hide ? (
    <HidesState hide={hide} hidden={hidden} failed={failed}>
      {children}
    </HidesState>
  ) : (
    children
  );
}

function HidesState({
  hide,
  hidden,
  failed,
  children,
}: {
  hide: () => Promise<void>;
  hidden: string;
  failed: string;
  children: ReactNode;
}) {
  const [gone, setGone] = useState(false);
  const [failure, setFailure] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const backToButton = useRef(false);

  const held = useHeldWrite<true>(async () => {
    try {
      await hide();
    } catch {
      setGone(false);
      setFailure(true);
    }
  });

  // Back from "ביטול", the keyboard goes where it was.
  useEffect(() => {
    if (!gone && backToButton.current) {
      backToButton.current = false;
      button.current?.focus();
    }
  }, [gone]);

  function start() {
    setFailure(false);
    setGone(true);
    held.hold(true);
  }

  function undo() {
    held.release();
    backToButton.current = true;
    setGone(false);
  }

  if (gone) {
    // Once written, the screen is drawn again without the card.
    return held.held ? (
      <div className="md:max-w-2xl">
        <UndoRow message={hidden} onUndo={undo} autoFocus />
      </div>
    ) : null;
  }
  return (
    <HidesContext value={{ start, button }}>
      {failure ? (
        <p role="alert" className="px-1 text-base text-danger">
          {failed}
        </p>
      ) : null}
      {children}
    </HidesContext>
  );
}

/** "הסתרה", for the owner themselves; nothing while viewing as someone. */
export function HideFirstStepsButton({ label }: { label: string }) {
  const hides = use(HidesContext);
  if (!hides) return null;
  return (
    <Button
      ref={hides.button}
      variant="ghost"
      onClick={hides.start}
      className="-me-2 shrink-0"
    >
      <EyeOff aria-hidden="true" />
      {label}
    </Button>
  );
}
