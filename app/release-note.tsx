"use client";

import { announce } from "@ui/announcer";
import { StatusToast } from "@ui/status-toast";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  forgetOthersKept,
  PUT_BACK_WAIT_MS,
  pressedBy,
  type ReleaseWords,
  takeUpdatedNote,
  wordsOnceBack,
} from "./stale-build";

/**
 * What the frame hands the screens under it: the signed-in person in its
 * business (`pressedBy`), and how a screen tells it whether it put back
 * what a press kept. None and nothing outside a frame.
 */
type Frame = { person: string | null; putBack: (back: boolean) => void };

const InFrame = createContext<Frame>({ person: null, putBack: () => {} });

/**
 * How long the toast stays for a screen's own words (the availability's,
 * what was typed), about twice as many as the press's: twice the toast's
 * usual time, which the press's own words keep.
 */
export const LONG_WORDS_MS = 8_000;

/**
 * Whose press it is, for a press that loads its page again for a release
 * (`reloadForRelease`) and for a chat's words kept across one: the person
 * the frame was drawn for, in the business it was drawn for (`pressedBy`),
 * so the note left is the one the frame loaded again says, and only in
 * that business. Null outside a frame (the /design gallery), where a press
 * says its failure as before.
 */
export function useSignedInId(): string | null {
  return useContext(InFrame).person;
}

/**
 * For a screen that takes back what a press kept (`takeKept`), as it opens:
 * tells the frame whether it put it back where it was written (true) or had
 * nothing to put back (false), so the frame says the screen's words only
 * when they are so. The first answer counts.
 */
export function usePutBack(): (back: boolean) => void {
  return useContext(InFrame).putBack;
}

/**
 * The app's frame, for a release that came while a screen was open
 * (closing the pilot, PR 1b): it hands the signed-in person to the presses
 * under it, and once the page was loaded again for a press of theirs
 * (`@/app/stale-build`), it says "האפליקציה התעדכנה, והלחיצה לא נרשמה.
 * לוחצים שוב." once, in a toast, whichever screen the press was on, or the
 * words of the screen that kept what was written with the press (the
 * availability's, or what was typed), once that screen says it put it back
 * (`usePutBack`); a screen that took nothing back, or none in
 * `PUT_BACK_WAIT_MS`, leaves the press's words (nothing, should the person
 * press meanwhile). Said only to the person who
 * pressed, in the business they pressed in, not to whoever signed in next on
 * that tab, nor in another business the reload opened; and what was kept
 * for anyone else, or for another business, goes as it opens. The toast
 * goes at the person's next press, as the screen's own toast, in the same
 * place, may say what that press did; else when its time is up, longer for
 * the screens' longer words (`LONG_WORDS_MS`). Said through the page's
 * announcer (`@ui/announcer`), whose regions are there from the root
 * layout's first drawing, so a screen reader hears a line that comes in
 * later; the toast, drawn only as the page loaded is told, only shows it
 * (`quiet`): its own region would arrive a moment before its words, and
 * be missed. Nothing wraps the screen, and nothing is drawn after it but on
 * a page loaded again for a release; a status region on every page would
 * be one more beside each screen's own.
 */
export function ReleaseNote({
  userId,
  businessId,
  children,
}: {
  userId: string;
  /** The business the frame was drawn for: the note is said only there. */
  businessId: string;
  children?: ReactNode;
}) {
  const t = useTranslations("app.updated");
  /**
   * This page was loaded again for a press of the person's: the region is
   * drawn, and these are the note's words.
   */
  const [noted, setNoted] = useState<ReleaseWords | null>(null);
  // Whether the screen put back what the press kept: its first answer, as it
  // opens (before the frame's own effects when drawn with it, or after),
  // or none in time.
  const [back, setBack] = useState<boolean | null>(null);
  const answered = useRef(false);
  const putBack = useCallback((done: boolean) => {
    if (answered.current) return;
    answered.current = true;
    setBack(done);
  }, []);
  const person = pressedBy(userId, businessId);
  const frame = useMemo(() => ({ person, putBack }), [person, putBack]);
  const [message, setMessage] = useState<{
    words: ReleaseWords;
    text: string;
  } | null>(null);

  // Loaded again for a release (a press met it): said once, and the press is
  // the person's to make again.
  useEffect(() => {
    forgetOthersKept(person);
    const words = takeUpdatedNote(person);
    if (words) setNoted(words);
  }, [person]);

  // The region there, its words come in, once: the frame drawn again (a
  // screen's refresh brings new words for it) says nothing again.
  const said = useRef(false);

  // The screen's words wait for it to say it put the writing back, a while
  // at most. Pressed meanwhile, the person is making the press again, and
  // that press's screen says what came of it: nothing is said over it.
  useEffect(() => {
    if (noted === null || noted === "toast" || back !== null) return;
    const timer = setTimeout(() => putBack(false), PUT_BACK_WAIT_MS);
    const pressed = () => {
      said.current = true;
    };
    document.addEventListener("click", pressed, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", pressed, true);
    };
  }, [noted, back, putBack]);

  useEffect(() => {
    if (noted === null || said.current) return;
    const words = wordsOnceBack(noted, back);
    if (words === null) return;
    said.current = true;
    const text = t(words);
    announce(text);
    setMessage({ words, text });
  }, [noted, back, t]);

  // Pressed again: the screen says what came of it, where this stood.
  useEffect(() => {
    if (message === null) return;
    const pressed = () => setMessage(null);
    document.addEventListener("click", pressed, true);
    return () => document.removeEventListener("click", pressed, true);
  }, [message]);

  return (
    <InFrame value={frame}>
      {children}
      {noted ? (
        <StatusToast
          message={message?.text ?? null}
          duration={message?.words === "toast" ? undefined : LONG_WORDS_MS}
          quiet
        />
      ) : null}
    </InFrame>
  );
}
