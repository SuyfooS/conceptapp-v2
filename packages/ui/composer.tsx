"use client";

import { checkMessage } from "@domain/chat";
import { ImagePlus, Lock, Paperclip, SendHorizontal, X } from "lucide-react";
import Image from "next/image";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ANNOUNCE_CLEAR_MS } from "./announcer-store";
import { AttachmentChip } from "./attachment-chip";
import { Button } from "./button";
import { cn } from "./cn";
import { focusFirst, watchFocusIn } from "./focus-after";
import { IconButton } from "./icon-button";
import { Spinner } from "./spinner";
import { Switch } from "./switch";

/**
 * The attach button: the phone's picture picker, which offers its camera too
 * (C4); what it opens instead, such as the AttachSheet with a picture and a
 * PDF (C5: `onOpen`, given the button for the focus once that closes); or,
 * where nothing can be attached (a demo business), the button says why when
 * pressed, and nothing opens.
 */
export type ComposerAttach =
  | {
      /** Its name and tooltip ("צירוף תמונה או קובץ"). */
      label: string;
      /** What the picker offers (`PICKED_PHOTO_ACCEPT` in @ui/photo-encode). */
      accept: string;
      onPick: (file: File) => void;
    }
  | {
      label: string;
      /** Opens what to attach (the AttachSheet), from this button. */
      onOpen: (trigger: HTMLElement) => void;
    }
  | {
      label: string;
      /** Why nothing can be attached here ("בעסק הדגמה אי אפשר לצרף קבצים"). */
      refused: ReactNode;
    };

/**
 * What goes with the next message, over the field, with the way to take it
 * out: a picture (C4), or a file (C5, a PDF: its name and size).
 */
export type ComposerAttached =
  | {
      kind?: "picture";
      /** Its preview (a data URL, `photoDataUrl`), or null while it is made ready. */
      src: string | null;
      /** What it is, for those who don't see it. */
      alt: string;
      /** Said while it is made ready ("מכינים את התמונה"). */
      busyLabel: string;
      /** Told to screen readers once it is ready ("התמונה מוכנה לשליחה"). */
      readyLabel: string;
      /** "הסרת התמונה": it doesn't go. */
      remove: { label: string; onRemove: () => void };
    }
  | {
      kind: "file";
      /** Its name, as it goes. */
      name: string;
      /** Its size and kind ("2.4 MB · PDF"). */
      meta: ReactNode;
      /** What it is, heard before its name ("הקובץ שבחרת"). */
      label: string;
      /** Told to screen readers once it is chosen ("הקובץ מוכן לשליחה"). */
      readyLabel: string;
      /** "הסרת הקובץ": it doesn't go. */
      remove: { label: string; onRemove: () => void };
    };

export type ComposerProps = {
  /** The field's name, also its placeholder ("כתיבת הודעה"). */
  label: string;
  /** The send button's words: a verb ("שליחה"). */
  sendLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  /**
   * The message, cleaned as the database will keep it (`checkMessage` in
   * @domain/chat). The screen sends it and empties the field.
   */
  onSend: (body: string) => void;
  /**
   * Why nobody can write here now (a removed department, someone who left
   * the team, a group only management writes in): it takes the place of the
   * field and the button. Given while the composer is drawn (the chat
   * closed while someone wrote), the line takes the keyboard's focus that
   * was in the composer, which went with the field; with the focus
   * elsewhere, a screen reader hears it where it is. Drawn so from the
   * start, or shown again so after the screen was hidden for going back,
   * nothing is said and the focus stays.
   */
  blocked?: ReactNode;
  /** A line over the field that doesn't stop writing ("יותר מדי הודעות בדקה…"). */
  notice?: ReactNode;
  /** Said while the text is longer than a message can be; sending waits. */
  tooLong: ReactNode;
  /**
   * What floats just over the composer, such as NewBelow: over the reason
   * nobody can write too, so new messages there still say so.
   */
  above?: ReactNode;
  /**
   * A switch over the field that changes what is sent, such as "הודעה
   * מההנהלה" for management in a group (C3), with a line saying what it
   * does: shown while it is on, and told to screen readers before they turn
   * it on.
   */
  toggle?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    hint?: ReactNode;
  } | null;
  /** The attach button at the field's start (C4), or none. */
  attach?: ComposerAttach | null;
  /**
   * The picture or file that goes with the next message: over the field,
   * with a way to take it out. What is typed is its caption, and may stay
   * empty.
   */
  attached?: ComposerAttached | null;
  /** The field, for a screen that moves the keyboard to it. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /** The field's name in a form. */
  name?: string;
  /**
   * False shows it in place, as the /design gallery does, instead of
   * sticking to the bottom of the screen.
   */
  floating?: boolean;
  className?: string;
};

/** Enter sends where there is a mouse or a trackpad; on touch it is a new line. */
const FINE_POINTER = "(pointer: fine)";

/**
 * Where a conversation's messages are written, floating in glass at the
 * bottom: above the safe area on phones, where the tab bar steps aside
 * (ImmersiveScreen); above the floating tab bar on tablets; at the foot of
 * the column on desktop. Place it last in the conversation's column, so it
 * sticks there while the messages scroll and never covers the last of them.
 *
 * The field grows with what is typed, up to a few lines, and keeps the
 * writer's own direction (`dir="auto"`). Sending is the screen's main action,
 * in the business's colour. The button keeps the focus in the field, so a
 * phone's keyboard stays open between messages; pressed from the keyboard, it
 * gives the focus back to the field, as it goes off once the field empties.
 * On desktop a soft fade under it, where the messages pass, as the tab bar's
 * has on phones and tablets. The attach button opens the phone's picture
 * picker (C4) or the attach sheet (C5); a chosen picture, or a PDF with its
 * name and size, shows over the field until it goes with the next message,
 * whose words are then its caption and may be left out.
 * Screen readers hear it being made ready, and that it is ready, from a live
 * region that is always there (one that came with its words would be missed).
 * Where nobody can write, the line that says why stands in the same place,
 * in the same wrapper, so what floats over it stays put.
 */
export function Composer({
  label,
  sendLabel,
  value,
  onValueChange,
  onSend,
  blocked,
  notice,
  tooLong,
  above,
  toggle,
  attach,
  attached,
  fieldRef,
  name,
  floating = true,
  className,
}: ComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const setField = useCallback(
    (node: HTMLTextAreaElement | null) => {
      field.current = node;
      if (fieldRef) fieldRef.current = node;
    },
    [fieldRef],
  );
  const linesId = useId();
  const toggleId = useId();
  const hintId = useId();
  const refusedId = useId();
  const [finePointer, setFinePointer] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // "In a demo business no files": said once the button is pressed.
  const [refusedSaid, setRefusedSaid] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const stoppedLine = useRef<HTMLParagraphElement>(null);
  const writing = !blocked;
  /** Whether the focus is, or was last, in the form: watched while it is drawn. */
  const hadFocus = useRef<() => boolean>(() => false);
  /**
   * Whether it was writing at its last drawing: null before its first, and
   * again once it was hidden (a screen kept in an <Activity> for going
   * back), so a screen shown again is drawn so from the start.
   */
  const wasWriting = useRef<boolean | null>(null);
  /** Why writing stopped, said where the focus is: it didn't land on the line. */
  const [stopSaid, setStopSaid] = useState(false);
  const checked = checkMessage(value);
  const over = !checked.ok && checked.reason === "tooLong";
  // A picture goes with words or without them, once it is ready: until
  // then sending waits, so its caption never goes without it. A file is
  // ready once chosen.
  const withPicture = attached
    ? attached.kind === "file" || Boolean(attached.src)
    : false;
  const preparing = Boolean(attached) && !withPicture;
  const sendable =
    !preparing &&
    (checked.ok || (withPicture && !checked.ok && checked.reason === "empty"));

  useEffect(() => {
    const query = window.matchMedia(FINE_POINTER);
    setFinePointer(query.matches);
    const onChange = () => setFinePointer(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The field as tall as its text, up to its max height, then it scrolls.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the text is what changes the height
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  // Hidden (an <Activity> keeps the screen for going back) or gone: what it
  // knew of its last drawing is forgotten. Shown again, perhaps closed
  // meanwhile, nothing stopped while it was drawn, and the focus that was in
  // the form then is no reason to move it now.
  useLayoutEffect(
    () => () => {
      wasWriting.current = null;
      hadFocus.current = () => false;
    },
    [],
  );

  // While writing, where the focus is in the form is watched: a move away
  // from it forgets it, a fall to nowhere (the field gone) doesn't.
  useLayoutEffect(() => {
    if (!writing) return;
    const element = form.current;
    if (!element) return;
    const watch = watchFocusIn(element);
    hadFocus.current = watch.had;
    return () => watch.stop();
  }, [writing]);

  // Writing stopped while the composer was drawn: the line that says why
  // takes the focus that was in the form, gone with it, without moving the
  // page; else its words are said where the focus is. Drawn so from the
  // start (`was` null: its first drawing, or shown again after hidden), it
  // is read in its place like any line.
  useLayoutEffect(() => {
    const was = wasWriting.current;
    wasWriting.current = writing;
    if (writing || was !== true) {
      setStopSaid(false);
      return;
    }
    const had = hadFocus.current();
    hadFocus.current = () => false;
    const landed = had
      ? focusFirst([stoppedLine.current], { preventScroll: true, title: false })
      : null;
    if (!landed) setStopSaid(true);
  }, [writing]);

  // Read out by now: the line goes quiet, so the reason isn't found twice.
  useEffect(() => {
    if (!stopSaid) return;
    const timer = setTimeout(() => setStopSaid(false), ANNOUNCE_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [stopSaid]);

  function send(fromButton: boolean) {
    if (!sendable) return;
    onSend(checked.ok ? checked.body : "");
    setRefusedSaid(false);
    // The field empties and the button goes off, which would drop a
    // keyboard's focus to the page: the next message starts in the field.
    if (fromButton) field.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter ?? null;
    send(submitter !== null && submitter === document.activeElement);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      !window.matchMedia(FINE_POINTER).matches
    ) {
      return;
    }
    event.preventDefault();
    send(false);
  }

  const position = floating
    ? "sticky z-20 bottom-[calc(env(safe-area-inset-bottom)+14px)] md:bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] xl:bottom-6"
    : "relative";

  const overIt = above ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2">
      {above}
    </div>
  ) : null;
  // On desktop, from behind the glass down to the foot of the screen, where
  // the messages pass under it; on phones and tablets the tab bar's own fade
  // is there.
  const fade = floating ? (
    <div
      aria-hidden="true"
      className="edge-fade-bottom pointer-events-none absolute inset-x-0 top-1/2 -bottom-6 -z-10 hidden xl:block"
    />
  ) : null;

  const refused = attach && "refused" in attach ? attach.refused : null;
  const said = Boolean(notice) || over || (refusedSaid && refused !== null);
  const pictureSaid = attached
    ? attached.kind === "file" || attached.src
      ? attached.readyLabel
      : attached.busyLabel
    : null;
  return (
    // One wrapper for both shapes: a switch to the line that says why
    // nobody can write keeps what floats over it, and this live line.
    <div className={cn(position, className)}>
      {fade}
      {overIt}
      <p className="sr-only" aria-live="polite">
        {stopSaid && blocked ? blocked : null}
      </p>
      {blocked ? (
        <p
          ref={stoppedLine}
          className="glass flex items-start gap-2 rounded-card bg-[var(--glass-strong)] px-5 py-3.5 text-base text-ink-2"
        >
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{blocked}</span>
        </p>
      ) : (
        <form ref={form} onSubmit={onSubmit}>
          <div
            className={cn(
              "glass flex flex-col rounded-card bg-[var(--glass-strong)] p-1.5",
              "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-accent",
            )}
          >
            {toggle ? (
              <div className="flex flex-col gap-0.5 px-3.5 pt-0.5">
                <div className="flex items-center justify-between gap-3">
                  <span
                    id={toggleId}
                    className="font-medium text-base text-ink"
                  >
                    {toggle.label}
                  </span>
                  <Switch
                    aria-labelledby={toggleId}
                    aria-describedby={toggle.hint ? hintId : undefined}
                    checked={toggle.checked}
                    onChange={toggle.onChange}
                  />
                </div>
                {toggle.hint ? (
                  <p
                    id={hintId}
                    className={
                      toggle.checked ? "pb-1 text-ink-2 text-sm" : "sr-only"
                    }
                  >
                    {toggle.hint}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {pictureSaid}
            </p>
            <div id={linesId} aria-live="polite">
              {said ? (
                <div className="flex flex-col gap-0.5 px-3.5 pt-1.5 pb-1 text-sm">
                  {notice ? <p className="text-ink-2">{notice}</p> : null}
                  {refusedSaid && refused ? (
                    <p className="text-ink-2">{refused}</p>
                  ) : null}
                  {over ? <p className="text-danger">{tooLong}</p> : null}
                </div>
              ) : null}
            </div>
            {attached?.kind === "file" ? (
              <div className="flex items-start gap-2 px-1.5 pt-1.5">
                <AttachmentChip
                  name={attached.name}
                  meta={attached.meta}
                  href={null}
                  label={attached.label}
                  className="flex-1"
                />
                <IconButton
                  label={attached.remove.label}
                  icon={<X />}
                  variant="secondary"
                  onClick={attached.remove.onRemove}
                  className="self-center"
                />
              </div>
            ) : attached ? (
              <div className="flex items-start gap-2 px-1.5 pt-1.5">
                <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-2">
                  {attached.src ? (
                    <Image
                      src={attached.src}
                      alt={attached.alt}
                      fill
                      unoptimized
                      draggable={false}
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <Spinner className="size-5" />
                  )}
                </span>
                {/* Heard from the live region above. */}
                <p
                  aria-hidden="true"
                  className="min-w-0 flex-1 self-center text-ink-2 text-sm"
                >
                  {attached.src ? null : attached.busyLabel}
                </p>
                <IconButton
                  label={attached.remove.label}
                  icon={<X />}
                  variant="secondary"
                  onClick={attached.remove.onRemove}
                />
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
              {attach ? (
                <>
                  {"onPick" in attach ? (
                    <input
                      ref={picker}
                      type="file"
                      accept={attach.accept}
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        // The same file can be picked again after a problem.
                        event.target.value = "";
                        if (file) attach.onPick(file);
                      }}
                    />
                  ) : null}
                  {/* Why nothing can be attached, told before it is pressed. */}
                  {refused !== null && !refusedSaid ? (
                    <span id={refusedId} hidden>
                      {refused}
                    </span>
                  ) : null}
                  <IconButton
                    label={attach.label}
                    icon={"onPick" in attach ? <ImagePlus /> : <Paperclip />}
                    aria-haspopup={"onOpen" in attach ? "dialog" : undefined}
                    aria-describedby={
                      said ? linesId : refused !== null ? refusedId : undefined
                    }
                    onClick={(event) => {
                      if ("onPick" in attach) picker.current?.click();
                      else if ("onOpen" in attach) {
                        attach.onOpen(event.currentTarget);
                      } else setRefusedSaid(true);
                    }}
                    className="text-ink-2"
                  />
                </>
              ) : null}
              <textarea
                ref={setField}
                name={name}
                value={value}
                onChange={(event) => {
                  setRefusedSaid(false);
                  onValueChange(event.target.value);
                }}
                onKeyDown={onKeyDown}
                aria-label={label}
                aria-describedby={said ? linesId : undefined}
                aria-invalid={over || undefined}
                placeholder={label}
                rows={1}
                dir="auto"
                autoComplete="off"
                enterKeyHint={finePointer ? "send" : "enter"}
                className={cn(
                  "max-h-40 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 pe-3.5 text-md text-ink text-start",
                  attach ? "ps-1" : "ps-3.5",
                  "placeholder:text-ink-3 focus-visible:outline-none",
                )}
              />
              <Button
                type="submit"
                disabled={!sendable}
                // Keeps the focus, and a phone's keyboard, in the field.
                onPointerDown={(event) => event.preventDefault()}
                className="shrink-0 px-4"
              >
                <SendHorizontal
                  aria-hidden="true"
                  className="rtl:-scale-x-100"
                />
                {sendLabel}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
