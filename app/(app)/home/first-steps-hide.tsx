"use client";

import { Button } from "@ui/button";
import { UndoRow } from "@ui/undo-row";
import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHeldWrite } from "../use-held-write";
import { headingsAfter } from "./heading-after";
import { sendHide } from "./hide-request";

type Hides = {
  start: () => void;
  button: RefObject<HTMLButtonElement | null>;
};

const HidesContext = createContext<Hides | null>(null);

/**
 * Hiding the first steps on Today: the card goes at once and "ביטול" takes
 * its place, with the focus, while the write is held for it as every undo in
 * the app holds one (`useHeldWrite`). "ביטול" brings the card back, with the
 * focus on "הסתרה" again. Its wait stops while "ביטול" is being reached
 * (the keyboard on it, a finger, a screen reader's focus: `@ui/undo-wait`).
 * Once it is up with the focus still on it, the focus goes on to the next
 * section's title (`headingsAfter`), else the page's. Once written, Today is
 * drawn again without the card, while it is still on screen; if it couldn't
 * be, the card comes back and says so. With no `url` (viewing as someone),
 * there is nothing to hide with.
 */
export function FirstStepsHides({
  url,
  hidden,
  failed,
  children,
}: {
  /** /home/first-steps, the demo's stand-in, or null. */
  url: string | null;
  /** What the undo's row says while the card is gone. */
  hidden: string;
  /** What the card says when it couldn't be hidden. */
  failed: string;
  children: ReactNode;
}) {
  return url ? (
    <HidesState url={url} hidden={hidden} failed={failed}>
      {children}
    </HidesState>
  ) : (
    children
  );
}

function HidesState({
  url,
  hidden,
  failed,
  children,
}: {
  url: string;
  hidden: string;
  failed: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [gone, setGone] = useState(false);
  const [failure, setFailure] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const backToButton = useRef(false);
  // Where the card was, still there once its "ביטול" went.
  const anchor = useRef<HTMLSpanElement>(null);
  // Today is on screen: not once it is left, while Next keeps it for the way
  // back, so a hide sent on leaving never draws the next screen again.
  const shown = useRef(false);
  useLayoutEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const held = useHeldWrite<true>(async () => {
    if (!(await sendHide(url))?.ok) {
      setGone(false);
      setFailure(true);
    } else if (shown.current) {
      router.refresh();
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
    return (
      <>
        <span ref={anchor} hidden />
        {held.held ? (
          <div className="md:max-w-2xl">
            <UndoRow
              message={hidden}
              onUndo={undo}
              autoFocus
              onWaitingChange={(waiting) =>
                waiting ? held.pause() : held.resume()
              }
              focusAfter={() => headingsAfter(anchor.current)}
            />
          </div>
        ) : null}
      </>
    );
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
