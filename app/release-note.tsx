"use client";

import { StatusToast } from "@ui/status-toast";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  forgetOthersKept,
  type ReleaseWords,
  takeUpdatedNote,
} from "./stale-build";

/** The signed-in person, as the frame has them; none outside a frame. */
const SignedIn = createContext<string | null>(null);

/**
 * Whose press it is, for a press that loads its page again for a release
 * (`reloadForRelease`) and for a chat's words kept across one: the person
 * the frame was drawn for, so the note left is the one the frame loaded
 * again says. Null outside a frame (the /design gallery), where a press
 * says its failure as before.
 */
export function useSignedInId(): string | null {
  return useContext(SignedIn);
}

/**
 * The app's frame, for a release that came while a screen was open
 * (closing the pilot, PR 1b): it hands the signed-in person to the presses
 * under it, and once the page was loaded again for a press of theirs
 * (`@/app/stale-build`), it says "האפליקציה התעדכנה, והלחיצה לא נרשמה.
 * לוחצים שוב." once, in a toast, whichever screen the press was on, or the
 * words of the screen that kept what was written with the press (the
 * availability's, or what was typed). Said only to the person who pressed,
 * not to whoever signed in next on that tab; and what was kept for anyone
 * else goes as it opens. The toast goes at the person's next press, as the
 * screen's own toast, in the same place, may say what that press did; else
 * when its time is up. Nothing wraps the screen, and nothing is drawn after
 * it but on a page loaded again for a release: then the toast's live
 * region, fixed, drawn first and given its words after, so screen readers
 * hear them; a status region on every page would be one more beside each
 * screen's own.
 */
export function ReleaseNote({
  userId,
  children,
}: {
  userId: string;
  children?: ReactNode;
}) {
  const t = useTranslations("app.updated");
  /**
   * This page was loaded again for a press of the person's: the region is
   * drawn, and these are its words.
   */
  const [noted, setNoted] = useState<ReleaseWords | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Loaded again for a release (a press met it): said once, and the press is
  // the person's to make again.
  useEffect(() => {
    forgetOthersKept(userId);
    const words = takeUpdatedNote(userId);
    if (words) setNoted(words);
  }, [userId]);

  // The region there, its words come in, once: the frame drawn again (a
  // screen's refresh brings new words for it) says nothing again.
  const said = useRef(false);
  useEffect(() => {
    if (!noted || said.current) return;
    said.current = true;
    setMessage(t(noted));
  }, [noted, t]);

  // Pressed again: the screen says what came of it, where this stood.
  useEffect(() => {
    if (message === null) return;
    const pressed = () => setMessage(null);
    document.addEventListener("click", pressed, true);
    return () => document.removeEventListener("click", pressed, true);
  }, [message]);

  return (
    <SignedIn value={userId}>
      {children}
      {noted ? <StatusToast message={message} /> : null}
    </SignedIn>
  );
}
