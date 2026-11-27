"use client";

import { dateIn } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import {
  fixedAfterClose,
  type HistoryEntry,
  type HistoryPart,
  type ItemResult,
  isOutOfRange,
  itemHistory,
  itemLine,
  type ListItem,
  type ListItemChange,
  listProgress,
  MAX_PASS_NOTE,
  MAX_QUANTITY,
  numberRange,
  parseQuantity,
  parseReading,
  signed,
  withItemChange,
} from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import { announce } from "@ui/announcer";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChecklistItem, LIST_ITEM } from "@ui/checklist-item";
import { ChoiceList, ChoiceRow } from "@ui/choice-row";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import {
  firstOnScreen,
  focusFirst,
  focusLost,
  inViewWhenFocused,
} from "@ui/focus-after";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { encodeListPhoto, PhotoReadError } from "@ui/photo-encode";
import { ProgressRing } from "@ui/progress-ring";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { TextArea } from "@ui/text-field";
import { UndoRow } from "@ui/undo-row";
import {
  AlarmClock,
  ArrowLeftRight,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Pencil,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { z } from "zod";
import { useSignedInId } from "@/app/release-note";
import {
  type KeepForPage,
  reloadForRelease,
  takeKept,
  untilReloaded,
} from "@/app/stale-build";
import { byAttribute, refusalArrived } from "../../manage/editor-focus";
import { TYPING_MS } from "../../manage/use-draft";
import type {
  ItemFailure,
  ListActionResult,
  ListActions,
  ListFailure,
  ListPhotoFailure,
  ListPhotoResult,
  ListScreenData,
} from "../list-types";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * What a photo item says went wrong: the server's answer, or the phone's;
 * a removal that didn't happen has its own words.
 */
type PhotoProblem =
  | ListPhotoFailure
  | "unreadable"
  | "offline"
  | "removeOffline"
  | "removeFailed"
  | "removeFinished";
/** The problems a photo item says in its own words; the rest are a list's. */
const PHOTO_WORDS = [
  "demo",
  "empty",
  "tooBig",
  "type",
  "metadata",
  "pixels",
  "unreadable",
  "offline",
  "removeOffline",
  "removeFailed",
  "removeFinished",
  "failed",
  "notYet",
  "finished",
] as const;
type PhotoWord = (typeof PHOTO_WORDS)[number];
const isPhotoWord = (problem: PhotoProblem): problem is PhotoWord =>
  (PHOTO_WORDS as readonly string[]).includes(problem);

/** A photo as the server takes it: a form with the file, named by its type. */
function photoForm(photo: Blob): FormData {
  const form = new FormData();
  form.set(
    "photo",
    photo,
    photo.type === "image/jpeg" ? "photo.jpg" : "photo.webp",
  );
  return form;
}

/** Whether the phone says it has no connection now. */
const offline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/** Why a removal didn't happen, in a removal's own words. */
const removeProblem = (failure: ListPhotoFailure | "offline"): PhotoProblem =>
  failure === "offline"
    ? "removeOffline"
    : failure === "finished"
      ? "removeFinished"
      : failure === "failed"
        ? "removeFailed"
        : failure;

/**
 * A refusal that shows where the list really stands, read again: closed
 * meanwhile, opened again while it was fixed, moved on elsewhere, past the
 * window to fix it, or no longer theirs to fix (L6b-2). The screen starts
 * anew; any other refusal keeps it as it is.
 */
const movesOn = (reason: ItemFailure): boolean =>
  reason === "finished" ||
  reason === "noAccess" ||
  reason === "reopened" ||
  reason === "fixOver" ||
  reason === "fixNoAccess";

/** A photo prepared but not saved: no connection, or no answer. */
type PhotoWaiting = { bytes: Blob; failure: "offline" | "failed" };

/** The words the server worked out for this list. */
export type ListScreenWords = {
  holder: string;
  due: { tone: "neutral" | "warning"; label: ReactNode } | null;
  /** Why it is only read here, or null when it is being filled. */
  readOnly: ReactNode;
  /**
   * Until when someone given "תיקון רשימות שנסגרו" may still fix it
   * (L6b-2, `fixUntil`), or null.
   */
  fixUntil: ReactNode;
  /**
   * When their window ended, or ends, and who still fixes it (L6b-2,
   * `fixEndedAt`, else `fixUntil`), or null: said once it is over.
   */
  fixOver: ReactNode;
  details: { key: string; label: string; value: ReactNode }[];
  /** What happened, in order; a pass carries the note that came with it. */
  timeline: { key: string; text: ReactNode; note?: string | null }[];
};

/** What an item's result changes, as the screen keeps it. */
type ItemChange = Partial<
  Pick<ListItem, "checked" | "given" | "reading" | "answer" | "comment">
>;

/** A number as it is typed back into its field. */
const typed = (reading: number | null, minus: boolean) =>
  reading === null ? "" : String(minus ? Math.abs(reading) : reading);

/** An order's count as its stepper shows it. */
const countText = (count: number | null) =>
  count === null ? "" : String(count);

/**
 * What was typed on a list and not saved when a change met a page from the
 * release before (closing the pilot, PR 1b), kept for the page loaded
 * again, by item: each number's or note's field as typed, a number's minus
 * with it, an order's count, and a comment being saved or written.
 */
const KeptTyped = z.object({
  fields: z.record(z.string(), z.string()),
  minus: z.record(z.string(), z.boolean()),
  given: z.record(z.string(), z.string()),
  comment: z.object({ item: z.string(), text: z.string() }).nullable(),
});

type KeptTyped = z.infer<typeof KeptTyped>;

/** The range as words: "0–5", "from 0", "up to 5" (`numberRange`). */
const rangeOf = numberRange;

/** An item whose range goes below zero needs a minus sign to be typed. */
const needsMinus = (item: ListItem) =>
  item.kind === "number" &&
  ((item.min !== null && item.min < 0) || (item.max !== null && item.max < 0));

/**
 * A list being filled. A tick saves at once and shows at once, and goes back
 * with a word if it didn't save; ticking again is the undo. A number saves on
 * leaving its field or on Enter, a note on leaving it, a comment from its
 * sheet. On an order a tick gives what was asked for, and a stepper under it
 * says how many were given (L5). "Finish the list" waits for the required
 * items; once it's finished, whoever finished it can take it back for five
 * minutes: its "ביטול" has the focus as the screen comes back finished, and
 * the page's title once it is open again, which is said (accessibility,
 * part 8). Whoever holds it, or manages lists, passes it to another
 * department from a sheet, with a note. A photo item (L6) takes a photo with
 * the phone's camera or from its photos, re-encoded here, shown at once while
 * it saves, said in words when it can't be (too big, not a photo, a demo
 * business), kept with a way to try again when it didn't get there (no
 * connection, no answer), replaced, or removed with an undo that puts the
 * same photo back; the list waits to be finished while a photo is on its
 * way. Each item keeps its story (L6a): under it, who did it and when, or
 * what changed last, with how many more changes, which opens the sheet "what
 * happened to the item", one row a change; a change made here joins it at
 * once, and goes if it didn't save. Phone: the list and the dock, the
 * timeline folded at the end. Tablet: the items beside the details and the
 * timeline. Desktop: the same, the main action in the header, and the
 * readings as a table, whose "who" opens an item's story too.
 *
 * A finished list, for those it lets (`can.fix`, L6b-1), is fixed in place:
 * "תיקון הרשימה" in the header, once the finisher's undo is gone, puts the
 * screen in fix mode. The list stays closed; an accent card says so, with
 * "פתיחה מחדש לכולם" in it for whoever runs the lists. Every change saves
 * at once as a fix, the fixer's, and changing it back is its undo: the
 * history keeps both. A required item is changed or noted, never emptied: a
 * required tick taken back or a required reading or answer emptied stays as
 * it was and the screen says why, with the way to have it done again; a
 * required photo is replaced, not removed. "סיום התיקון", the main action
 * (the dock below the desktop, the header on it), saves what is still typed,
 * and once every change saved, leaves fix mode, back on "תיקון הרשימה", and
 * reads the list again, saying the fix was saved. A change that didn't save
 * keeps the screen where its words put it.
 *
 * Someone given "תיקון רשימות שנסגרו" (L6b-2) fixes a list that reaches them
 * the same way, until the business's window ends (`fixUntil`), which the
 * hero says while "תיקון הרשימה" is there, and in fix mode: "אפשר לתקן עד
 * …". They don't open it again for everyone: the card has no "פתיחה מחדש
 * לכולם", and a required item they would empty says to ask whoever edits
 * the lists to open it again. When the window ends while the screen is
 * open, "תיקון הרשימה" goes and the hero says when it ended and who still
 * fixes it, as it does when the screen opens after (`fixEndedAt`); a fix
 * sent after it is refused ("fixOver"), which ends fix mode and reads the
 * list again.
 */
type ListScreenProps = {
  data: ListScreenData;
  actions: ListActions;
  backHref: string;
  words: ListScreenWords;
  /** Opens the list being fixed, when it may be (the demo's twin). */
  fixing?: boolean;
};

/**
 * What the screen read again after its own press starts with: a finish, or
 * an opening again (the finish's undo, "פתיחה מחדש", "פתיחה מחדש לכולם"),
 * or why one of them was refused, read again with its answer (someone else
 * closed the list or opened it meanwhile).
 */
type Arrival = "finished" | "reopened" | { refused: ListFailure };

/**
 * The list's screen, with what it says while it starts anew (`screenKey`
 * changes: finished, opened again, fixed): a fix saved, or why a change
 * didn't, which the screen itself would lose with its state; after a fix
 * saved, the keyboard's place on "תיקון הרשימה" of the screen read again;
 * and after a finish or an opening again, where the focus goes on the
 * screen read again, and what is said (`arrival`, accessibility, part 8).
 */
export function ListScreenFrame({
  screenKey,
  ...props
}: ListScreenProps & { screenKey: string }) {
  const [notice, setNotice] = useState<{ text: string; stamp: number } | null>(
    null,
  );
  const refocusFix = useRef(false);
  // A finish or an opening again on its way: set as it is pressed, so the
  // screen read again has it however soon it comes, why in its place when
  // the press was refused, and forgotten once a screen took it.
  const [arrival, setArrival] = useState<Arrival | null>(null);
  return (
    <>
      <StatusToast
        message={notice?.text ?? null}
        stamp={notice ? String(notice.stamp) : undefined}
      />
      <ListScreen
        key={screenKey}
        {...props}
        notify={(text) => setNotice({ text, stamp: Date.now() })}
        refocusFix={refocusFix}
        arrival={arrival}
        arrive={setArrival}
      />
    </>
  );
}

function ListScreen({
  data,
  actions,
  backHref,
  words,
  fixing: startFixing = false,
  notify,
  refocusFix,
  arrival,
  arrive,
}: ListScreenProps & {
  /** Says something that outlasts the screen (`ListScreenFrame`). */
  notify: (text: string) => void;
  /**
   * Set when a fix saved and the list is read again (`ListScreenFrame`): the
   * screen that starts then puts the keyboard on "תיקון הרשימה".
   */
  refocusFix: { current: boolean };
  /**
   * The finish or opening again pressed on the screen before this one
   * (`ListScreenFrame`): the screen that starts with it puts the focus on
   * the finish's "ביטול", or its title, and says what happened.
   */
  arrival: Arrival | null;
  /** Tells the frame what is on its way, or that it arrived (null). */
  arrive: (arrival: Arrival | null) => void;
}) {
  const t = useTranslations("app.lists");
  const tl = useTranslations("app.lists.list");
  const th = useTranslations("app.lists.list.history");
  const router = useRouter();
  const { list, lookups, userId, timeZone, can } = data;
  // Whose press it is, for a page loaded again for a release: the frame's.
  const signedIn = useSignedInId();
  // Fixing a finished list in place (L6b-1): the screen's own state. How
  // many changes it saved, for "התיקון נשמר", the saves on their way, which
  // "סיום התיקון" waits for, and how many changes were refused, so it stays
  // when one was on the way out.
  const [fixing, setFixing] = useState(startFixing && can.fix);
  const fixedHere = useRef(0);
  const saving = useRef(new Set<Promise<boolean>>());
  const refused = useRef(0);
  const [ending, startEnding] = useTransition();
  const fixTitleId = useId();
  const reopenHintId = useId();
  const fixTitle = useRef<HTMLHeadingElement>(null);
  const focusFixCard = useRef(false);
  // "תיקון הרשימה", where the keyboard goes back when a fix ends.
  const fixButton = useRef<HTMLButtonElement>(null);
  const focusFixButton = useRef(false);
  const [items, setItems] = useState<ListItem[]>(list.items);
  // Each item's story (L6a), with the changes made here since it was read,
  // and the item whose story the sheet tells.
  const [changes, setChanges] = useState<ListItemChange[]>(list.changes);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const madeHere = useRef(0);
  // How far the server's clock is from this device's, so a change made here
  // carries the time the database will write: a phone whose clock is off,
  // or the demo's fixed morning, still reads the server's time.
  const clockOffset = useRef(0);
  useEffect(() => {
    clockOffset.current = Date.parse(data.now) - Date.now();
  }, [data.now]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      list.items.map((item) => [
        item.id,
        item.kind === "number"
          ? typed(item.reading, needsMinus(item) && (item.reading ?? 0) < 0)
          : (item.answer ?? ""),
      ]),
    ),
  );
  // Minus starts on for a reading below zero, or, before one, for a range
  // wholly below zero (a freezer).
  const [minus, setMinus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      list.items
        .filter(needsMinus)
        .map((item) => [
          item.id,
          item.reading !== null
            ? item.reading < 0
            : item.max !== null && item.max < 0,
        ]),
    ),
  );
  const [failure, setFailure] = useState<{
    reason: ItemFailure;
    stamp: number;
  } | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [finishing, startFinish] = useTransition();
  const [undoShown, setUndoShown] = useState(data.undoUntil !== null);
  // Someone given lists.fix (L6b-2): whether their window is still open.
  const [fixOpen, setFixOpen] = useState(true);
  const latest = useRef<Record<string, number>>({});
  // An order's counts given, as typed, and the save each waits for after the
  // last tap of its stepper.
  const [givenDrafts, setGivenDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      list.items.map((item) => [item.id, countText(item.given)]),
    ),
  );
  const givenTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Passing it on: the sheet, the department chosen, its note, and the word
  // that it went.
  const [passOpen, setPassOpen] = useState(false);
  const [passTo, setPassTo] = useState<string | null>(null);
  const [passNote, setPassNote] = useState("");
  const [passFailure, setPassFailure] = useState<ListFailure | null>(null);
  const [passed, setPassed] = useState<{ name: string; stamp: number } | null>(
    null,
  );
  const [passing, startPass] = useTransition();
  // Photo items (L6): what each is doing now (preparing the photo, saving it,
  // removing it), its photo while it saves, why the last one didn't go, the
  // photo that didn't get there, kept to try again, the removed photo's
  // bytes for its undo (whose "ביטול" takes the focus the remove button had,
  // `focus`), and the word that one was saved.
  const [photoBusy, setPhotoBusy] = useState<
    Record<string, "preparing" | "saving" | "removing">
  >({});
  const [photoPreview, setPhotoPreview] = useState<Record<string, string>>({});
  const [photoProblem, setPhotoProblem] = useState<
    Record<string, PhotoProblem>
  >({});
  const [photoWaiting, setPhotoWaiting] = useState<
    Record<string, PhotoWaiting>
  >({});
  const [photoUndo, setPhotoUndo] = useState<{
    itemId: string;
    bytes: Blob;
    failed: boolean;
    focus: boolean;
  } | null>(null);
  const [photoUndoing, setPhotoUndoing] = useState(false);
  const photoUndoButton = useRef<HTMLButtonElement>(null);
  // Its "ביטול" waits while the photo comes back, and the focus with it
  // goes: back on it when the photo didn't, unless put elsewhere, and then
  // the line under it says so (`photoUndoSaid`), once: said before that
  // move it would be cut off, and the row keeps its words, which its focus
  // says. Once for each time it didn't (a new `photoUndo` each time): the
  // screen shown again from a hidden <Activity> leaves the focus where it is.
  const refocusedUndo = useRef<typeof photoUndo>(null);
  const [photoUndoSaid, setPhotoUndoSaid] = useState<typeof photoUndo>(null);
  useEffect(() => {
    const refused = photoUndo?.failed ? photoUndo : null;
    if (refusalArrived(refocusedUndo, refused, photoUndoing)) {
      focusFirst([photoUndoButton.current], { title: false });
      setPhotoUndoSaid(refused);
    }
  }, [photoUndo, photoUndoing]);
  const [photoSaved, setPhotoSaved] = useState<number | null>(null);
  // Counts each item's picks: one that finishes after a newer one changes nothing.
  const photoPicks = useRef<Record<string, number>>({});
  // The same previews, for their addresses to go as soon as they are done.
  const previews = useRef<Record<string, string>>({});
  // A photo shown while it saved lives as long as the screen, at most.
  useEffect(
    () => () => {
      for (const url of Object.values(previews.current)) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // The newest items and counts typed, for a count saved after its timer,
  // and whether it is being fixed (L6b-1), for one saved on the way out.
  const itemsNow = useRef(items);
  const givenNow = useRef(givenDrafts);
  const fixingNow = useRef(fixing);
  useEffect(() => {
    itemsNow.current = items;
  }, [items]);
  useEffect(() => {
    givenNow.current = givenDrafts;
  }, [givenDrafts]);
  // And what is typed in the fields and the comment sheet, for a change that
  // meets the release before to keep across the page loaded again.
  const draftsNow = useRef(drafts);
  const minusNow = useRef(minus);
  const commentNow = useRef({ item: commentFor, text: commentDraft });
  useEffect(() => {
    draftsNow.current = drafts;
    minusNow.current = minus;
    commentNow.current = { item: commentFor, text: commentDraft };
  }, [drafts, minus, commentFor, commentDraft]);

  // Loaded again as a change met the release before: what was typed is back
  // in its field, or in its comment's sheet, unsaved, for the person to save
  // again; never saved by itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the screen opens, with the list it opened on
  useEffect(() => {
    const kept = takeKept(signedIn, "list", KeptTyped);
    if (!kept) return;
    const here = new Map(list.items.map((item) => [item.id, item]));
    const kindOf = (id: string) => here.get(id)?.kind;
    const only = <T,>(
      record: Record<string, T>,
      keep: (id: string) => boolean,
    ) => Object.fromEntries(Object.entries(record).filter(([id]) => keep(id)));
    const typedHere = (id: string) =>
      kindOf(id) === "number" || kindOf(id) === "note";
    setDrafts((current) => ({ ...current, ...only(kept.fields, typedHere) }));
    setMinus((current) => ({
      ...current,
      ...only(kept.minus, (id) => {
        const item = here.get(id);
        return item !== undefined && needsMinus(item);
      }),
    }));
    if (list.asksQuantities) {
      setGivenDrafts((current) => ({
        ...current,
        ...only(kept.given, (id) => kindOf(id) === "check"),
      }));
    }
    if (kept.comment && can.fill && here.has(kept.comment.item)) {
      setCommentDraft(kept.comment.text);
      setCommentFor(kept.comment.item);
    }
  }, [signedIn]);
  useEffect(() => {
    fixingNow.current = fixing;
  }, [fixing]);

  // Leaving with a count still waiting saves it on the way out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving, with the newest counts (read from refs)
  useEffect(
    () => () => {
      for (const itemId of Object.keys(givenTimers.current)) {
        commitGiven(itemId);
      }
    },
    [],
  );

  // The undo goes away by itself when its five minutes are up, counted from
  // the server's clock (`now`): a phone whose clock is off, or the demo's
  // fixed morning, still gets the time the server gave.
  useEffect(() => {
    if (!data.undoUntil) return;
    const left = Date.parse(data.undoUntil) - Date.parse(data.now);
    const timer = setTimeout(() => setUndoShown(false), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [data.undoUntil, data.now]);

  // The window of someone given lists.fix ends too (L6b-2): its line and
  // "תיקון הרשימה" go. Being fixed by then, the next change is refused
  // ("fixOver") and says why. Its end is put on this device's clock once
  // per payload, from the server's (`now`), so a screen shown again from an
  // old payload (back and forward, a route kept hidden) keeps the end it
  // had, and it is checked again whenever the screen is shown, since a
  // phone asleep holds its timers.
  const fixEnd = useRef<{ payload: string; at: number } | null>(null);
  useEffect(() => {
    if (!data.fixUntil) return;
    const payload = `${data.now} ${data.fixUntil}`;
    let measured = fixEnd.current;
    if (measured?.payload !== payload) {
      measured = {
        payload,
        at: Date.now() + (Date.parse(data.fixUntil) - Date.parse(data.now)),
      };
      fixEnd.current = measured;
    }
    const end = measured.at;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      const left = end - Date.now();
      setFixOpen(left > 0);
      // A timer holds up to about 24 days; the longest window is three.
      if (left > 0) timer = setTimeout(check, Math.min(left, 2_147_483_647));
    };
    const onShow = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", check);
    };
  }, [data.fixUntil, data.now]);

  const progress = listProgress(items);
  // Its items take changes while it is filled, or fixed (L6b-1).
  const fill = can.fill || fixing;

  /**
   * Why a change didn't happen, in words. A required item a fix would empty
   * says how to have it done again: "פתיחה מחדש לכולם" for whoever may,
   * and otherwise (someone given lists.fix, L6b-2) to ask whoever runs the
   * lists.
   */
  const failedWords = (reason: ItemFailure): string =>
    reason === "keepRequired" && !can.reopen
      ? tl("failed.keepRequiredAsk")
      : tl(`failed.${reason}`);

  function fail(reason: ItemFailure) {
    refused.current += 1;
    // Closed meanwhile, opened again while it was fixed, moved on
    // elsewhere, past the window to fix it, or no longer theirs to fix
    // (L6b-2): show where it really stands, and say why from the frame,
    // since the screen starts anew.
    if (movesOn(reason)) {
      // A fix ends with it: the list is filled now, or no longer theirs to
      // fix.
      setFixing(false);
      notify(failedWords(reason));
      router.refresh();
      return;
    }
    setFailure({ reason, stamp: Date.now() });
  }

  /** A save on its way, for "סיום התיקון" to wait for. */
  function track(run: Promise<boolean>): Promise<boolean> {
    saving.current.add(run);
    void run.finally(() => saving.current.delete(run));
    return run;
  }

  /**
   * Into fix mode (L6b-1): nothing changes until something is saved. The
   * button pressed goes, so the focus goes to the card that says what this
   * is.
   */
  function startFix() {
    fixedHere.current = 0;
    focusFixCard.current = true;
    setFailure(null);
    setFixing(true);
  }
  // Out of it, the keyboard goes back to "תיקון הרשימה", whose place it took.
  useEffect(() => {
    if (fixing && focusFixCard.current) {
      focusFixCard.current = false;
      fixTitle.current?.focus();
    }
    if (!fixing && focusFixButton.current) {
      focusFixButton.current = false;
      fixButton.current?.focus();
    }
  }, [fixing]);
  // Read again after a fix saved: the screen starts anew, back there too.
  useEffect(() => {
    if (!refocusFix.current) return;
    refocusFix.current = false;
    fixButton.current?.focus();
  }, [refocusFix]);

  // Read again after a finish or an opening again pressed here: what was
  // pressed went with the screen before. After a finish, "ביטול" takes the
  // focus, which says the list closed (its row `quiet` meanwhile); else, or
  // with the focus put elsewhere meanwhile, the page's title takes a focus
  // lost, and what happened is said. Refused, and read again with its
  // answer (closed or opened again elsewhere meanwhile), the title takes a
  // focus lost, and only then is why said: said before that move, it would
  // be cut off. Once: a screen shown again from a hidden <Activity> runs
  // this again. Only for the list as it is now: a press whose screen was
  // left before its answer leaves what it pressed to the next screen, maybe
  // a later one, of a list changed since (finished again, opened again),
  // which this would mis-say.
  const [came] = useState(arrival);
  const cameSeen = useRef(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only as the screen starts, with what it came with
  useEffect(() => {
    if (came === null || cameSeen.current) return;
    cameSeen.current = true;
    arrive(null);
    if (typeof came === "object") {
      focusFirst([]);
      fail(came.refused);
      return;
    }
    if ((came === "finished") !== (list.status !== "open")) return;
    if (came === "finished") {
      const undo = undoButton.current;
      if (undo && focusFirst([undo], { title: false }) === undo) return;
      focusFirst([]);
      announce(list.status === "cancelled" ? tl("cancelled") : tl("finished"));
      return;
    }
    focusFirst([]);
    announce(tl("reopened"));
  }, [came]);

  // A finish or an opening again refused: what was pressed (the finish, the
  // finish's "ביטול", "פתיחה מחדש", "פתיחה מחדש לכולם") waited, disabled,
  // and the focus went with it. Held until nothing is on its way, for when
  // this screen is still the one shown then (else the screen read again
  // says it, `came`, and this one never runs): then the focus is back on it,
  // unless something else took the focus meanwhile, or on the title for a
  // refusal that reads the list again, where it may go, and only then is
  // why said: said before that move, it would be cut off.
  const pressRefused = useRef<{
    reason: ListFailure;
    pressed: Element | null;
  } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the press no longer waits, with the refusal it held (a ref)
  useEffect(() => {
    const held = pressRefused.current;
    if (finishing || !held) return;
    pressRefused.current = null;
    arrive(null);
    if (movesOn(held.reason)) focusFirst([]);
    else focusFirst([held.pressed], { title: false });
    fail(held.reason);
  }, [finishing]);

  /** Now, by the server's clock (`clockOffset`). */
  function serverNow(): string {
    return new Date(Date.now() + clockOffset.current).toISOString();
  }

  /** An id for a change made here, until the list is read again. */
  function madeChange(): string {
    madeHere.current += 1;
    return `here:${madeHere.current}`;
  }

  /** What an item's result is with this change, for `set_list_item`. */
  function resultOf(item: ListItem, change: ItemChange): ItemResult {
    const next = { ...item, ...change };
    const result: NonNullable<ItemResult> = {};
    if (item.kind === "check" && next.checked) {
      // An order's count says it was ticked; a tick alone gives what was
      // asked for.
      if (list.asksQuantities && next.given !== null) result.given = next.given;
      else result.checked = true;
    }
    if (item.kind === "number" && next.reading !== null) {
      result.reading = next.reading;
    }
    if (item.kind === "note" && next.answer) result.answer = next.answer;
    if (next.comment) result.comment = next.comment;
    return Object.keys(result).length > 0 ? result : null;
  }

  /** Shows the change at once, saves it, and puts it back if it didn't save. */
  function save(item: ListItem, change: ItemChange): Promise<boolean> {
    return track(saveNow(item, change));
  }

  /** Puts the fields of an item back as it is, after a change that didn't go. */
  function putBack(item: ListItem) {
    setDrafts((current) => ({
      ...current,
      [item.id]:
        item.kind === "number"
          ? typed(item.reading, minus[item.id] ?? false)
          : (item.answer ?? ""),
    }));
    if (item.kind === "check" && list.asksQuantities) {
      setGivenDrafts((current) => ({
        ...current,
        [item.id]: countText(item.given),
      }));
    }
  }

  /**
   * What was typed on the list and isn't saved, for the page loaded again
   * as `change` to `saving` meets the release before: each field and
   * count typed that differs from its item as saved here (`saving` as it
   * was before this change), and the comment being saved or written.
   * Nothing, for the press's own words, when nothing typed would be lost: a
   * tick, its count with it, or a minus is pressed again.
   */
  function typedToKeep(
    saving: ListItem,
    change: ItemChange,
  ): KeepForPage | undefined {
    const kept: KeptTyped = { fields: {}, minus: {}, given: {}, comment: null };
    for (const shown of itemsNow.current) {
      const item = shown.id === saving.id ? saving : shown;
      const draft = draftsNow.current[item.id];
      if (item.kind === "number" && draft !== undefined) {
        const sign = minusNow.current[item.id] ?? false;
        if (draft !== typed(item.reading, sign)) {
          kept.fields[item.id] = draft;
          if (needsMinus(item)) kept.minus[item.id] = sign;
        }
      }
      if (
        item.kind === "note" &&
        draft !== undefined &&
        draft !== (item.answer ?? "")
      ) {
        kept.fields[item.id] = draft;
      }
      const count = givenNow.current[item.id];
      const ticked = item.id === saving.id && "checked" in change;
      if (
        item.kind === "check" &&
        list.asksQuantities &&
        !ticked &&
        count !== undefined &&
        count !== countText(item.given)
      ) {
        kept.given[item.id] = count;
      }
    }
    const writing = commentNow.current;
    if ("comment" in change && change.comment) {
      kept.comment = { item: saving.id, text: change.comment };
    } else if (writing.item !== null && writing.text.trim() !== "") {
      kept.comment = { item: writing.item, text: writing.text };
    }
    const any =
      Object.keys(kept.fields).length > 0 ||
      Object.keys(kept.given).length > 0 ||
      kept.comment !== null;
    return any ? { of: "list", value: kept, words: "typed" } : undefined;
  }

  async function saveNow(item: ListItem, change: ItemChange): Promise<boolean> {
    // A fix of the finished list (L6b-1), as this change began; read from
    // the ref, so a count saved on the way out is a fix too.
    const fix = fixingNow.current;
    const before = item;
    // On an order, a tick gives what was asked for, and taking it back
    // gives none, as the database has it.
    const counted: ItemChange =
      item.kind === "check" && list.asksQuantities && "checked" in change
        ? {
            given: change.checked
              ? (change.given ?? item.given ?? item.requested)
              : null,
          }
        : {};
    const result = resultOf(item, { ...change, ...counted });
    const next: ListItem = { ...item, ...change, ...counted };
    const done =
      item.kind === "check"
        ? next.checked
        : item.kind === "number"
          ? next.reading !== null
          : item.kind === "note"
            ? next.answer !== null
            : item.done;
    // A required item of a finished list is changed, never emptied: the
    // database refuses it (23514), so it isn't sent, and says why.
    if (fix && item.required && !done) {
      putBack(item);
      fail("keepRequired");
      return false;
    }
    // As the database has it (`set_list_item`, `fix_list_item`): who did it
    // and when move only with its value, so a comment alone keeps them, and
    // a photo's comment leaves who took it; taken back, nobody did it. A fix
    // keeps them while the item stays done; the fix has its own time.
    const at = serverNow();
    const valueChanged =
      next.checked !== item.checked ||
      next.given !== item.given ||
      next.reading !== item.reading ||
      next.answer !== item.answer;
    const kept = fix && item.done && done;
    const changed: ListItem =
      item.kind === "photo" || !valueChanged
        ? next
        : {
            ...next,
            done,
            doneBy: done ? (kept ? item.doneBy : userId) : null,
            doneAt: done ? (kept ? item.doneAt : at) : null,
          };
    const shown: ListItem = fix ? { ...changed, fixedAt: at } : changed;
    const mine = (latest.current[item.id] ?? 0) + 1;
    latest.current[item.id] = mine;
    setItems((current) => current.map((i) => (i.id === item.id ? shown : i)));
    // Its story has the change at once, and loses it if it didn't save.
    const made = madeChange();
    setChanges((current) =>
      withItemChange(current, item, shown, {
        id: made,
        by: userId,
        at,
        fixed: fix,
      }),
    );
    const ordered = item.kind === "check" && list.asksQuantities;
    if (ordered) {
      setGivenDrafts((current) => ({
        ...current,
        [item.id]: countText(next.given),
      }));
    }
    let saved: ListActionResult<unknown, ItemFailure>;
    try {
      saved = await actions.setItem(item.id, result, fix);
    } catch (error) {
      // A page from the release before loads again, the change shown until
      // it has gone, and is never sent again: the page loaded shows the item
      // as the list has it, and the person ticks it again; what was typed
      // is kept for it, and put back unsaved. A page that stays puts it back
      // and says it failed, as any other failure.
      const keep = typedToKeep(before, change);
      if (reloadForRelease(error, signedIn, keep)) await untilReloaded();
      saved = { ok: false, failure: "failed" };
    }
    if (saved.ok) {
      if (fix) fixedHere.current += 1;
      return true;
    }
    setChanges((current) => current.filter((change) => change.id !== made));
    // A later change to the same item has the last word.
    if (latest.current[item.id] === mine) {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? before : i)),
      );
      putBack(before);
    }
    fail(saved.failure);
    return false;
  }

  /**
   * An order's count given, as it is typed or stepped: saved shortly after
   * the last change, or on leaving the field (`commitGiven`).
   */
  function changeGiven(item: ListItem, value: string) {
    setGivenDrafts((current) => ({ ...current, [item.id]: value }));
    const waiting = givenTimers.current[item.id];
    if (waiting) clearTimeout(waiting);
    givenTimers.current[item.id] = setTimeout(
      () => commitGiven(item.id),
      TYPING_MS,
    );
  }

  function commitGiven(itemId: string) {
    const waiting = givenTimers.current[itemId];
    if (waiting) clearTimeout(waiting);
    delete givenTimers.current[itemId];
    const item = itemsNow.current.find((i) => i.id === itemId);
    if (!item) return;
    const text = givenNow.current[itemId] ?? "";
    const given = parseQuantity(text);
    if (given === null) {
      // Not a count: back to what it was, and said.
      setGivenDrafts((drafts) => ({
        ...drafts,
        [itemId]: countText(item.given),
      }));
      if (text.trim() !== "") fail("invalid");
      return;
    }
    if (given !== item.given) void save(item, { given });
  }

  function commitNumber(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    if (text === "") {
      if (item.reading !== null) void save(item, { reading: null });
      return;
    }
    const parsed = parseReading(text);
    if (parsed === null) {
      setDrafts((current) => ({
        ...current,
        [item.id]: typed(item.reading, minus[item.id] ?? false),
      }));
      fail("invalid");
      return;
    }
    const reading = minus[item.id] ? -Math.abs(parsed) : parsed;
    if (reading !== item.reading) void save(item, { reading });
  }

  function toggleMinus(item: ListItem) {
    const on = !(minus[item.id] ?? false);
    setMinus((current) => ({ ...current, [item.id]: on }));
    const parsed = parseReading(drafts[item.id] ?? "");
    if (parsed === null) return;
    const reading = on ? -Math.abs(parsed) : Math.abs(parsed);
    if (reading !== item.reading) void save(item, { reading });
  }

  function commitNote(item: ListItem) {
    const text = (drafts[item.id] ?? "").trim();
    const answer = text === "" ? null : text;
    if (answer !== item.answer) void save(item, { answer });
  }

  function openComment(item: ListItem) {
    setCommentDraft(item.comment ?? "");
    setCommentFor(item.id);
  }

  async function saveComment() {
    const item = items.find((i) => i.id === commentFor);
    if (!item) return;
    const text = commentDraft.trim();
    setCommentFor(null);
    const comment = text === "" ? null : text;
    if (comment !== item.comment) await save(item, { comment });
  }

  // Photos ----------------------------------------------------------------

  function busyWith(
    itemId: string,
    doing: "preparing" | "saving" | "removing" | null,
  ) {
    setPhotoBusy((current) => {
      const { [itemId]: _, ...rest } = current;
      return doing ? { ...rest, [itemId]: doing } : rest;
    });
  }

  function problemFor(itemId: string, problem: PhotoProblem | null) {
    setPhotoProblem((current) => {
      const { [itemId]: _, ...rest } = current;
      return problem ? { ...rest, [itemId]: problem } : rest;
    });
  }

  /** Shows a photo being saved in place of the item's, or stops; the old one's address goes. */
  function previewFor(itemId: string, url: string | null) {
    const { [itemId]: old, ...rest } = previews.current;
    if (old && old !== url) URL.revokeObjectURL(old);
    const next = url ? { ...rest, [itemId]: url } : rest;
    previews.current = next;
    setPhotoPreview(next);
  }

  /**
   * The item as it is now that its photo changed (saved): done by this
   * person, or not, and the change in its story. A fix (`fix`, L6b-1) keeps
   * who took it and when while it has one, and has its own time.
   */
  function photoChanged(itemId: string, photo: string | null, fix: boolean) {
    const at = serverNow();
    if (fix) fixedHere.current += 1;
    const changed = (i: ListItem): ListItem => {
      const kept = fix && i.done && photo !== null;
      return {
        ...i,
        photo,
        photoRemoved: false,
        done: photo !== null,
        doneBy: photo !== null ? (kept ? i.doneBy : userId) : null,
        doneAt: photo !== null ? (kept ? i.doneAt : at) : null,
        fixedAt: fix ? at : i.fixedAt,
      };
    };
    const before = itemsNow.current.find((i) => i.id === itemId);
    setItems((current) =>
      current.map((i) => (i.id === itemId ? changed(i) : i)),
    );
    if (before) {
      const made = madeChange();
      setChanges((current) =>
        withItemChange(current, before, changed(before), {
          id: made,
          by: userId,
          at,
          photo: true,
          fixed: fix,
        }),
      );
    }
  }

  /** What a photo write answers, or "offline"/"failed" when it didn't arrive. */
  async function photoAnswer(
    run: () => Promise<ListPhotoResult>,
  ): Promise<ListPhotoResult | { ok: false; failure: "offline" }> {
    if (offline()) return { ok: false, failure: "offline" };
    try {
      return await run();
    } catch {
      return { ok: false, failure: offline() ? "offline" : "failed" };
    }
  }

  /** A new attempt for the item's photo; one that ends after a newer one changes nothing. */
  function nextPick(itemId: string): () => boolean {
    const mine = (photoPicks.current[itemId] ?? 0) + 1;
    photoPicks.current[itemId] = mine;
    return () => photoPicks.current[itemId] === mine;
  }

  /** The photo kept to try again goes (saved, replaced, or refused for good). */
  function waitingFor(itemId: string, waiting: PhotoWaiting | null) {
    setPhotoWaiting((current) => {
      const { [itemId]: _, ...rest } = current;
      return waiting ? { ...rest, [itemId]: waiting } : rest;
    });
  }

  /**
   * A photo taken or chosen: re-encoded here first (`encodeListPhoto`), so
   * what leaves the phone is about 0.3 MB with nothing from the camera inside,
   * shown at once while it saves, and said when it can't be.
   */
  async function pickPhoto(item: ListItem, file: File) {
    const current = nextPick(item.id);
    problemFor(item.id, null);
    // A new photo takes the place of one that didn't get there.
    waitingFor(item.id, null);
    previewFor(item.id, null);
    if (photoUndo?.itemId === item.id) setPhotoUndo(null);
    busyWith(item.id, "preparing");
    let blob: Blob;
    try {
      blob = await encodeListPhoto(file);
    } catch (error) {
      if (!current()) return;
      busyWith(item.id, null);
      problemFor(
        item.id,
        error instanceof PhotoReadError ? error.problem : "unreadable",
      );
      return;
    }
    if (!current()) return;
    previewFor(item.id, URL.createObjectURL(blob));
    await uploadPhoto(item.id, blob, current);
  }

  /**
   * Saves a prepared photo, shown while it saves. One that didn't get there
   * (no connection, or no answer) stays on the screen with its bytes, and the
   * way to try again with them, rather than asking for it again; one refused
   * for good goes, and says why.
   */
  async function uploadPhoto(
    itemId: string,
    blob: Blob,
    current: () => boolean,
  ) {
    const fix = fixing;
    busyWith(itemId, "saving");
    const result = await photoAnswer(() =>
      actions.setPhoto(itemId, photoForm(blob), fix),
    );
    if (!current()) return;
    busyWith(itemId, null);
    if (!result.ok) {
      const { failure } = result;
      if (failure === "offline" || failure === "failed") {
        waitingFor(itemId, { bytes: blob, failure });
        return;
      }
      previewFor(itemId, null);
      // Opened again while it was fixed, past the window to fix it, or no
      // longer theirs to fix (L6b-2): from here, as the frame says.
      if (
        failure === "reopened" ||
        failure === "fixOver" ||
        failure === "fixNoAccess"
      ) {
        fail(failure);
        return;
      }
      problemFor(itemId, failure);
      // Closed meanwhile, or no longer theirs: show where it really stands.
      if (failure === "finished" || failure === "noAccess") router.refresh();
      return;
    }
    previewFor(itemId, null);
    photoChanged(itemId, result.value.photo, fix);
    setPhotoSaved(Date.now());
  }

  /** The photo that didn't get there, sent again as it was. */
  function retryPhoto(itemId: string) {
    const waiting = photoWaiting[itemId];
    if (!waiting) return;
    const current = nextPick(itemId);
    waitingFor(itemId, null);
    problemFor(itemId, null);
    void uploadPhoto(itemId, waiting.bytes, current);
  }

  /**
   * Removing a photo reads its bytes first, from the address the screen
   * shows: without them there would be nothing to bring back, so nothing is
   * removed. The undo then sets them again. Its "ביטול" comes in place of
   * the remove button, which goes with the photo, and takes the focus
   * where that still had it (or none had it: a tap), never from where the
   * person put it meanwhile.
   */
  async function removePhoto(item: ListItem) {
    const shown = item.photo;
    if (!shown) return;
    const pressed = document.activeElement;
    problemFor(item.id, null);
    busyWith(item.id, "removing");
    let kept: Blob;
    try {
      const response = await fetch(shown);
      if (!response.ok) throw new Error(String(response.status));
      kept = await response.blob();
    } catch {
      busyWith(item.id, null);
      problemFor(item.id, offline() ? "removeOffline" : "removeFailed");
      return;
    }
    const fix = fixing;
    const result = await photoAnswer(() => actions.removePhoto(item.id, fix));
    busyWith(item.id, null);
    if (!result.ok) {
      if (
        result.failure === "reopened" ||
        result.failure === "fixOver" ||
        result.failure === "fixNoAccess"
      ) {
        fail(result.failure);
        return;
      }
      problemFor(item.id, removeProblem(result.failure));
      if (result.failure === "finished" || result.failure === "noAccess") {
        router.refresh();
      }
      return;
    }
    photoChanged(item.id, null, fix);
    setPhotoUndo({
      itemId: item.id,
      bytes: kept,
      failed: false,
      focus: focusLost() || document.activeElement === pressed,
    });
  }

  async function bringPhotoBack() {
    const undo = photoUndo;
    if (!undo || photoUndoing) return;
    const fix = fixing;
    setPhotoUndoing(true);
    const result = await photoAnswer(() =>
      actions.setPhoto(undo.itemId, photoForm(undo.bytes), fix),
    );
    setPhotoUndoing(false);
    if (result.ok) {
      setPhotoUndo(null);
      photoChanged(undo.itemId, result.value.photo, fix);
      setPhotoSaved(Date.now());
    } else if (result.failure === "failed" || result.failure === "offline") {
      // It didn't get there: the row stays, saying so, and "ביטול" tries again.
      setPhotoUndo({ ...undo, failed: true });
    } else if (
      result.failure === "reopened" ||
      result.failure === "fixOver" ||
      result.failure === "fixNoAccess"
    ) {
      setPhotoUndo(null);
      fail(result.failure);
    } else {
      // Refused for good (closed meanwhile, a demo): the row goes and says why.
      setPhotoUndo(null);
      problemFor(undo.itemId, result.failure);
    }
  }

  const photoWords = (problem: PhotoProblem): string =>
    isPhotoWord(problem)
      ? tl(`photo.failures.${problem}`)
      : failedWords(problem);

  /** A photo item's part, as this person may fill it or only read it. */
  const photoOf = (item: ListItem) => {
    const busy = photoBusy[item.id];
    const problem = photoProblem[item.id];
    const waiting = busy ? undefined : photoWaiting[item.id];
    const taking = data.photos.taking;
    return {
      src: photoPreview[item.id] ?? item.photo,
      alt: tl("photo.alt", { label: item.label }),
      empty: item.photoRemoved
        ? tl("photo.removedAfter")
        : fill
          ? null
          : tl("photo.none"),
      busy: busy ? tl(`photo.${busy}`) : null,
      problem: problem ? photoWords(problem) : null,
      locked: fill && taking !== "yes" ? tl(`photo.${taking}`) : null,
      take: fill
        ? {
            label: tl("photo.take"),
            replaceLabel: tl("photo.replace"),
            hint: tl("photo.takeHint"),
            onPick: (file: File) => void pickPhoto(item, file),
          }
        : null,
      // A photo that didn't get there isn't stored: it is tried again, or
      // replaced, rather than removed. A required one of a closed list is
      // replaced, never removed (L6b-1).
      remove:
        fill && !waiting && !(fixing && item.required)
          ? {
              label: tl("photo.remove"),
              onRemove: () => void removePhoto(item),
            }
          : null,
      after: waiting ? (
        <div className="flex min-h-[3.25rem] items-center justify-between gap-3 rounded-card bg-surface-2 ps-4 pe-1.5">
          <p role="alert" className="min-w-0 py-2 text-base">
            {tl(`photo.failures.${waiting.failure}`)}
          </p>
          <Button
            variant="ghost"
            aria-label={`${tl("photo.retry")}: ${item.label}`}
            onClick={() => retryPhoto(item.id)}
            className="shrink-0"
          >
            <RotateCw aria-hidden="true" />
            {tl("photo.retry")}
          </Button>
        </div>
      ) : photoUndo?.itemId === item.id ? (
        <>
          <UndoRow
            // Its words stay as a refusal comes: the line under it says
            // that, and its focus these.
            message={tl("photo.removed")}
            onUndo={() => void bringPhotoBack()}
            pending={photoUndoing}
            autoFocus={photoUndo.focus}
            buttonRef={photoUndoButton}
            // Back, its remove button, maybe far above in a long list,
            // brought into view; refused for good, the way to take one. Each
            // in this item's own row (LIST_ITEM): another can have its label.
            focusAfter={() => {
              const own = (words: string) =>
                `${byAttribute(LIST_ITEM, item.id)} ${byAttribute("aria-label", `${words}: ${item.label}`)}`;
              return [
                inViewWhenFocused(firstOnScreen([own(tl("photo.remove"))])),
                own(tl("photo.take")),
              ];
            }}
          />
          {/* Drawn again for each refusal, after the focus is back. */}
          {photoUndo === photoUndoSaid && !photoUndoing ? (
            <p role="alert" className="font-medium text-danger text-sm">
              {tl("photo.undoFailed")}
            </p>
          ) : null}
        </>
      ) : null,
    };
  };

  // A photo on its way (prepared, saved, removed or brought back): the list
  // waits for it to be finished, so the photo isn't lost.
  const photosBusy = Object.keys(photoBusy).length > 0 || photoUndoing;

  /**
   * Finishing, or opening again: the list is read again, and the screen
   * starts anew, which the frame tells where the focus goes (`arrive`), as
   * it is pressed: the screen read again can come before the answer.
   * Refused, why arrives instead (`refusedPress`).
   */
  function finish() {
    if (photosBusy) return;
    const pressed = document.activeElement;
    arrive("finished");
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.finish(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) refusedPress(result.failure, pressed);
    });
  }

  function reopen() {
    const pressed = document.activeElement;
    arrive("reopened");
    startFinish(async () => {
      let result: ListActionResult;
      try {
        result = await actions.reopen(list.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) refusedPress(result.failure, pressed);
    });
  }

  /**
   * A finish or an opening again refused: why, held both in the frame, for
   * a screen read again with the answer (someone else closed it or opened
   * it meanwhile: `came`), and here (`pressRefused`), for this screen
   * when it is still the one shown once nothing is on its way. Whichever
   * says it forgets it in the other.
   */
  function refusedPress(reason: ListFailure, pressed: Element | null) {
    arrive({ refused: reason });
    pressRefused.current = { reason, pressed };
  }

  /**
   * "סיום התיקון" (L6b-1): a count still waiting and a number or a note
   * typed but not yet left are saved first, then it waits for every save on
   * its way. When one of them was refused, the screen stays where its words
   * put it: still fixing, filled now, or no longer theirs (`fail`), and
   * nothing says the fix was saved. Otherwise it leaves fix mode, the
   * keyboard back on "תיקון הרשימה", and, when something was saved, reads
   * the list again (its close's words, its timeline) and says so.
   */
  function finishFix() {
    if (photosBusy) return;
    startEnding(async () => {
      const refusedBefore = refused.current;
      for (const itemId of Object.keys(givenTimers.current)) {
        commitGiven(itemId);
      }
      for (const item of items) {
        if (item.kind === "number") commitNumber(item);
        if (item.kind === "note") commitNote(item);
      }
      const saved = await Promise.all([...saving.current]);
      if (
        !fixingNow.current ||
        refused.current !== refusedBefore ||
        saved.some((ok) => !ok)
      ) {
        return;
      }
      focusFixButton.current = true;
      setFixing(false);
      if (fixedHere.current > 0) {
        fixedHere.current = 0;
        refocusFix.current = true;
        notify(tl("fix.saved"));
        router.refresh();
      }
    });
  }

  const passTarget = data.pass?.targets.find((d) => d.id === passTo) ?? null;

  function openPass() {
    setPassTo(null);
    setPassNote("");
    setPassFailure(null);
    setPassOpen(true);
  }

  function pass() {
    const target = passTarget;
    if (!target || !data.pass) return;
    const stays = data.pass.stays;
    startPass(async () => {
      let result: ListActionResult;
      try {
        result = await actions.pass(list.id, target.id, passNote.trim());
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setPassFailure(result.failure);
        return;
      }
      setPassOpen(false);
      // Still theirs to read: the screen shows where it went, and says so.
      // Otherwise, back to their lists, which say so (`?passed=`): this
      // screen, and its word, leave.
      if (stays) {
        setPassed({ name: target.name, stamp: Date.now() });
        router.refresh();
      } else {
        router.push(`${backHref}?passed=${target.id}`);
      }
    });
  }

  // Each item's story (L6a) -------------------------------------------------

  const histories = new Map(
    items.map((item) => [item.id, itemHistory(item, changes)]),
  );
  const historyOf = (item: ListItem): HistoryEntry[] =>
    histories.get(item.id) ?? [];
  const listDay = dateIn(new Date(list.opensAt), timeZone);
  // Someone no longer among the colleagues left the team; nobody named (an
  // account deleted) or a colleague with no name has none.
  const nameOf = (person: string | null) => {
    const colleague = person === null ? undefined : lookups.people[person];
    if (person !== null && !colleague) return t("former");
    return colleague?.name || t("noName");
  };
  /** When, as a time, with its day when that isn't the list's. */
  const whenOf = (at: string) => {
    const instant = new Date(at);
    const day = dateIn(instant, timeZone);
    return {
      time: timeIn(instant, timeZone),
      date: day === listDay ? null : dayMonth(day),
    };
  };
  /** "נועה · 07:42". */
  const whoWhen = (by: string | null, at: string): ReactNode => {
    const { time, date } = whenOf(at);
    const name = nameOf(by);
    return date === null
      ? tl.rich("doneBy", { name, time, ltr })
      : tl.rich("doneByOn", { name, time, date, ltr });
  };
  /** A reading as the item shows it: its sign, and its unit. */
  const readingText = (item: ListItem, value: number) =>
    `${signed(value)}${item.unit ? ` ${item.unit}` : ""}`;

  /** What a change did, as a row of the item's story says it. */
  function partWords(item: ListItem, part: HistoryPart): ReactNode {
    switch (part.field) {
      case "checked":
        return th(part.on ? "checked" : "unchecked");
      case "given":
        return item.requested !== null
          ? tl("given", { given: part.given, requested: item.requested })
          : tl("givenOnly", { count: part.given });
      case "reading":
        if (part.to === null) return th("readingCleared");
        return part.from === null
          ? th.rich("reading", { value: readingText(item, part.to), ltr })
          : th.rich("readingChanged", {
              from: readingText(item, part.from),
              to: readingText(item, part.to),
              ltr,
            });
      case "answer":
        if (part.to === null) return th("answerCleared");
        return part.from === null
          ? th("answer", { answer: part.to })
          : th("answerChanged", { answer: part.to });
      case "comment":
        if (part.to === null) return th("commentRemoved");
        return part.from === null
          ? th("comment", { comment: part.to })
          : th("commentChanged", { comment: part.to });
      case "photo":
        return th(
          part.photo === "added"
            ? "photo"
            : part.photo === "replaced"
              ? "photoReplaced"
              : "photoRemoved",
        );
    }
  }

  /**
   * What changed, as the line under an item says it: short, since the item
   * shows its comment itself. Null for what an item not done can't have
   * changed last (a reading or an answer written); its line then says only
   * who and when.
   */
  function lineWhat(item: ListItem, part: HistoryPart): string | null {
    switch (part.field) {
      case "checked":
        return th(part.on ? "checked" : "unchecked");
      case "given":
        return item.requested !== null
          ? tl("given", { given: part.given, requested: item.requested })
          : tl("givenOnly", { count: part.given });
      case "reading":
        return part.to === null ? th("readingCleared") : null;
      case "answer":
        return part.to === null ? th("answerCleared") : null;
      case "comment":
        return part.to === null
          ? th("commentRemoved")
          : part.from === null
            ? th("commentAdded")
            : th("commentEdited");
      case "photo":
        return th(
          part.photo === "added"
            ? "photo"
            : part.photo === "replaced"
              ? "photoReplaced"
              : "photoRemoved",
        );
    }
  }

  /**
   * The line under an item, and how many more changes it has: who did it and
   * when, or what changed last, by whom and when; fixed after its list
   * closed (L6b-1), "תוקן אחרי הסגירה", by whom and when. Null when nothing
   * happened.
   */
  function lineOf(
    item: ListItem,
  ): { words: ReactNode; more: number; done: boolean } | null {
    const line = itemLine(item, historyOf(item), list);
    if (!line) return null;
    const done = line.kind === "done";
    const what =
      line.kind === "changed"
        ? lineWhat(item, line.part)
        : line.kind === "fixed"
          ? tl("fix.item")
          : null;
    if (what === null) {
      return { words: whoWhen(line.by, line.at), more: line.more, done };
    }
    const { time, date } = whenOf(line.at);
    const name = nameOf(line.by);
    return {
      words:
        date === null
          ? th.rich("line", { what, name, time, ltr })
          : th.rich("lineOn", { what, name, time, date, ltr }),
      more: line.more,
      done,
    };
  }

  /**
   * An item's story under it: its done line alone when that is all there is
   * (done once, as before), else a row that opens the sheet.
   */
  function storyOf(item: ListItem) {
    const line = lineOf(item);
    if (!line) return { doneLine: null, history: null };
    const once = line.done && line.more === 0;
    return {
      doneLine: once ? line.words : null,
      history: once
        ? null
        : {
            line: line.words,
            more: line.more > 0 ? th("more", { count: line.more }) : null,
            label: th("open", { label: item.label }),
            onOpen: () => setHistoryFor(item.id),
          },
    };
  }

  const historyItem = items.find((item) => item.id === historyFor) ?? null;

  const hintOf = (item: ListItem): ReactNode => {
    const parts: ReactNode[] = [];
    if (item.hint) parts.push(item.hint);
    if (list.asksQuantities && item.requested !== null) {
      parts.push(tl("requested", { count: item.requested }));
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  const finishButton = (className?: string) => (
    <Button
      size="lg"
      loading={finishing}
      disabled={progress.requiredLeft > 0 || photosBusy}
      onClick={finish}
      className={className}
    >
      <CheckCheck aria-hidden="true" />
      {tl("finish")}
    </Button>
  );

  // The fix's main action (L6b-1): in the header on a desktop.
  const finishFixButton = (
    <Button
      size="lg"
      loading={ending}
      disabled={photosBusy}
      onClick={finishFix}
    >
      <Check aria-hidden="true" />
      {tl("fix.done")}
    </Button>
  );

  // Who closed it and when, as the fix's card says it.
  const closedBy = list.finishedAt
    ? (() => {
        const { time, date } = whenOf(list.finishedAt);
        return tl.rich("fix.body", {
          name: nameOf(list.finishedBy),
          time: date === null ? time : `${date}, ${time}`,
          ltr,
        });
      })()
    : null;

  const leftWords =
    progress.requiredLeft > 0
      ? tl("leftRequired", { count: progress.requiredLeft })
      : photosBusy
        ? tl("photoStillSaving")
        : tl("readyToFinish");

  const numbers = items.filter((item) => item.kind === "number");

  const timeline = (
    <ol className="flex flex-col gap-3">
      {words.timeline.map((entry) => (
        <li key={entry.key} className="flex items-start gap-3 text-base">
          <span
            aria-hidden="true"
            className="mt-2 size-2 shrink-0 rounded-full bg-accent"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{entry.text}</span>
            {entry.note ? (
              <span className="whitespace-pre-line text-ink-2 text-sm">
                {entry.note}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );

  /** An order's check: how many were given, beside what was asked for. */
  const quantityOf = (item: ListItem) => {
    if (!list.asksQuantities || item.kind !== "check") return null;
    const given = item.given;
    const short =
      given !== null && item.requested !== null && given < item.requested
        ? tl("short", { count: item.requested - given })
        : null;
    return {
      label: tl("givenLabel"),
      value: givenDrafts[item.id] ?? "",
      onValueChange: (value: string) => changeGiven(item, value),
      onCommit: () => commitGiven(item.id),
      fieldLabel: tl("givenOf", { label: item.label }),
      decreaseLabel: tl("fewer", { label: item.label }),
      increaseLabel: tl("more", { label: item.label }),
      max: MAX_QUANTITY,
      short,
      text:
        given === null
          ? null
          : item.requested !== null
            ? tl("given", { given, requested: item.requested })
            : tl("givenOnly", { count: given }),
    };
  };

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast
        message={failure ? failedWords(failure.reason) : null}
        stamp={failure ? String(failure.stamp) : undefined}
      />
      <StatusToast
        message={passed ? tl("pass.passed", { name: passed.name }) : null}
        stamp={passed ? String(passed.stamp) : undefined}
      />
      <StatusToast
        message={photoSaved ? tl("photo.saved") : null}
        stamp={photoSaved ? String(photoSaved) : undefined}
      />
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={list.name}
        subtitle={words.holder}
        actions={
          can.fill ? (
            <div className="hidden xl:flex">{finishButton()}</div>
          ) : fixing ? (
            <div className="hidden xl:flex">{finishFixButton}</div>
          ) : can.fix && fixOpen && !undoShown ? (
            // A finished list is fixed in place (L6b-1); opening it again
            // for everyone is inside the fix's card, for whoever may.
            <Button
              ref={fixButton}
              variant="secondary"
              size="lg"
              onClick={startFix}
            >
              <Pencil aria-hidden="true" />
              {tl("fix.action")}
            </Button>
          ) : can.reopen && !undoShown ? (
            <Button
              variant="secondary"
              size="lg"
              loading={finishing}
              onClick={reopen}
            >
              <RotateCcw aria-hidden="true" />
              {tl("reopen")}
            </Button>
          ) : null
        }
      />

      {undoShown && list.status !== "open" && !fixing ? (
        <UndoRow
          message={
            list.status === "cancelled" ? tl("cancelled") : tl("finished")
          }
          onUndo={reopen}
          pending={finishing}
          // Just finished here: the screen puts the focus on it, which says
          // its words (`came`).
          quiet={came === "finished"}
          buttonRef={undoButton}
        />
      ) : null}

      {/* Fixing a closed list (L6b-1): the screen's one accent card. */}
      {fixing ? (
        <section aria-labelledby={fixTitleId}>
          <Card tone="accent" padding="lg" className="flex flex-col gap-2">
            <h2
              ref={fixTitle}
              id={fixTitleId}
              tabIndex={-1}
              className="font-bold text-ink text-lg outline-none"
            >
              {tl("fix.title")}
            </h2>
            {closedBy ? <p className="text-base text-ink">{closedBy}</p> : null}
            {can.reopen ? (
              <div className="mt-1 flex flex-col items-start gap-1">
                <Button
                  variant="ghost"
                  loading={finishing}
                  disabled={ending}
                  onClick={reopen}
                  aria-describedby={reopenHintId}
                  className="-ms-3"
                >
                  <RotateCcw aria-hidden="true" />
                  {tl("fix.reopenAll")}
                </Button>
                <p id={reopenHintId} className="text-ink text-sm">
                  {tl("fix.reopenHint")}
                </p>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label={tl("progressLabel")}>
            <Card tone="hero" padding="lg" className="flex items-center gap-5">
              <span className="relative grid shrink-0 place-items-center">
                <ProgressRing
                  value={progress.done}
                  max={progress.total}
                  tone="hero"
                  className="size-20"
                />
                <span
                  aria-hidden="true"
                  className="absolute font-bold text-lg tabular-nums"
                >
                  <span dir="ltr">
                    {progress.done}/{progress.total}
                  </span>
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-bold text-xl">
                  {t("card.progress", {
                    done: progress.done,
                    total: progress.total,
                  })}
                </span>
                <span className="text-base">
                  {list.status === "open" ? leftWords : words.readOnly}
                </span>
                {/* Someone given lists.fix (L6b-2): until when they may,
                    while "תיקון הרשימה" is there or they fix it; once their
                    time is over, when it ended and who still fixes it. */}
                {data.fixEndedAt !== null ||
                (data.fixUntil !== null && !fixOpen) ? (
                  <span className="text-base">{words.fixOver}</span>
                ) : words.fixUntil && can.fix && !undoShown ? (
                  <span className="text-base">{words.fixUntil}</span>
                ) : null}
                {words.due ? (
                  // Near or late, a clock says so beside the words, which
                  // carry it; warning colours don't read on the accent.
                  <span className="mt-1 inline-flex min-h-[30px] w-fit items-center gap-1.5 rounded-full bg-accent-press px-3 font-semibold text-sm shadow-[inset_0_0.5px_0_var(--glass-sheen)]">
                    {words.due.tone === "warning" ? (
                      <AlarmClock
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    ) : null}
                    <span>{words.due.label}</span>
                  </span>
                ) : null}
              </span>
            </Card>
          </section>

          {list.note ? (
            <Card tone="flat" padding="lg" className="whitespace-pre-line">
              <span className="sr-only">{tl("note")}: </span>
              {list.note}
            </Card>
          ) : null}

          {words.readOnly && list.status === "open" ? (
            <p className="px-1 text-ink-2">{words.readOnly}</p>
          ) : null}

          <PageSection title={tl("items")}>
            <ListGroup>
              {items.map((item) => {
                const range = rangeOf(item);
                const out = isOutOfRange(item);
                const minusOf = needsMinus(item)
                  ? {
                      label: tl("minus"),
                      on: minus[item.id] ?? false,
                      onToggle: () => toggleMinus(item),
                    }
                  : null;
                const story = storyOf(item);
                return (
                  <ChecklistItem
                    key={item.id}
                    kind={item.kind}
                    label={item.label}
                    // Its photo's buttons found again in its own row.
                    itemId={item.id}
                    hint={hintOf(item)}
                    required={item.required}
                    optionalLabel={tl("optional")}
                    done={item.done}
                    doneLine={story.doneLine}
                    history={story.history}
                    comment={item.comment}
                    readOnly={!fill}
                    commentAction={
                      fill && item.kind !== "note"
                        ? {
                            label: item.comment
                              ? tl("comment.edit")
                              : tl("comment.add"),
                            onClick: () => openComment(item),
                          }
                        : null
                    }
                    check={
                      item.kind === "check"
                        ? {
                            checked: item.done,
                            // Taking back a required tick while a closed
                            // list is fixed (L6b-1) keeps it ticked and
                            // says why (`saveNow`, "keepRequired").
                            onToggle: () =>
                              void save(item, { checked: !item.done }),
                          }
                        : undefined
                    }
                    quantity={quantityOf(item)}
                    number={
                      item.kind === "number"
                        ? {
                            // Read-only, the minus toggle isn't there to say
                            // the sign, so the reading carries its own.
                            value: fill
                              ? (drafts[item.id] ?? "")
                              : typed(item.reading, false),
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNumber(item),
                            fieldLabel: tl("readingOf", { label: item.label }),
                            unit: item.unit,
                            range: range
                              ? t.rich(`list.range.${range.kind}`, {
                                  range: range.range,
                                  ltr,
                                })
                              : null,
                            outOfRange:
                              out && range
                                ? t.rich("list.outOfRange", {
                                    range: range.range,
                                    ltr,
                                  })
                                : null,
                            minus: fill ? minusOf : null,
                          }
                        : undefined
                    }
                    note={
                      item.kind === "note"
                        ? {
                            value: drafts[item.id] ?? "",
                            onValueChange: (value) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: value,
                              })),
                            onCommit: () => commitNote(item),
                            fieldLabel: item.label,
                            placeholder: tl("answerPlaceholder"),
                          }
                        : undefined
                    }
                    photo={item.kind === "photo" ? photoOf(item) : undefined}
                  />
                );
              })}
            </ListGroup>
          </PageSection>

          {/* Second to finishing it: passing it to another department (L5). */}
          {data.pass ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="secondary"
                size="lg"
                className="w-full md:w-auto"
                // Not while a photo is on its way: once passed, the list
                // may no longer be theirs to save it on.
                disabled={finishing || passing || photosBusy}
                onClick={openPass}
              >
                <ArrowLeftRight aria-hidden="true" />
                {tl("pass.action")}
              </Button>
            </div>
          ) : null}

          {/* Desktop: the readings at a glance, out of range flagged. */}
          {numbers.length > 0 ? (
            <PageSection
              title={tl("readings.title")}
              className="hidden xl:flex"
            >
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                <table className="w-full border-collapse text-base">
                  <caption className="sr-only">{tl("readings.title")}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.item")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.reading")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.range")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.who")}
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-start font-medium text-ink-2 text-sm"
                      >
                        {tl("readings.when")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.map((item) => {
                      const range = rangeOf(item);
                      // Who read it and when: whoever gave its reading.
                      const readAt = item.reading !== null ? item.doneAt : null;
                      const reader = readAt ? nameOf(item.doneBy) : null;
                      const readWhen = readAt ? whenOf(readAt) : null;
                      // Its story, when there is more to it than who read it.
                      const story = storyOf(item).history;
                      return (
                        <tr key={item.id}>
                          <td className="border-line border-t px-4 py-3">
                            {item.label}
                          </td>
                          <td className="border-line border-t px-4 py-3">
                            {item.reading === null ? (
                              <span className="text-ink-2">—</span>
                            ) : isOutOfRange(item) ? (
                              <Badge tone="warning">
                                <span dir="ltr">
                                  {signed(item.reading)}
                                  {item.unit ? ` ${item.unit}` : ""}
                                </span>
                              </Badge>
                            ) : (
                              <span dir="ltr">
                                {signed(item.reading)}
                                {item.unit ? ` ${item.unit}` : ""}
                              </span>
                            )}
                            {/* Fixed after the list closed (L6b-1). */}
                            {fixedAfterClose(item.fixedAt, list) ? (
                              <span className="text-ink-2">
                                {" · "}
                                {tl("readings.fixed")}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={cn(
                              "border-line border-t px-4 py-3 text-ink-2",
                            )}
                          >
                            {range ? <span dir="ltr">{range.range}</span> : "—"}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {/*
                              With a story: who read it, or the line under the
                              item when its reading is gone ("הקריאה נמחקה ·
                              …"), and how many more changes, the way to it.
                            */}
                            {story ? (
                              <button
                                type="button"
                                onClick={story.onOpen}
                                className="pressable -mx-2 -my-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-start hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                <span className="sr-only">{story.label}: </span>
                                <span>
                                  {reader ?? story.line}
                                  {story.more ? <> · {story.more}</> : null}
                                </span>
                                <ChevronRight
                                  aria-hidden="true"
                                  className="size-4 shrink-0 rtl:-scale-x-100"
                                />
                              </button>
                            ) : (
                              (reader ?? "—")
                            )}
                          </td>
                          <td className="border-line border-t px-4 py-3 text-ink-2">
                            {readWhen ? (
                              <span dir="ltr">
                                {readWhen.date === null
                                  ? readWhen.time
                                  : `${readWhen.date}, ${readWhen.time}`}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>
          ) : null}
        </div>

        <aside
          aria-label={tl("details.title")}
          className="flex min-w-0 flex-col gap-6"
        >
          <Card tone="flat" padding="lg" className="hidden md:block">
            <dl className="flex flex-col gap-3">
              {words.details.map((detail) => (
                <div key={detail.key} className="flex flex-col gap-0.5">
                  <dt className="text-ink-2 text-sm">{detail.label}</dt>
                  <dd className="text-base">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Phone: what happened, folded at the end. Its title is a
              heading too, just before it, for the headings a screen reader
              moves by: one inside the summary, which reads as a button,
              isn't one for all of them (accessibility, part 8). */}
          <h2 className="sr-only md:hidden">{tl("timeline.title")}</h2>
          <details className="group md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              {tl("timeline.title")}
              <ChevronDown
                aria-hidden="true"
                className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <Card tone="flat" padding="lg" className="mt-3">
              {timeline}
            </Card>
          </details>
          <PageSection title={tl("timeline.title")} className="hidden md:flex">
            <Card tone="flat" padding="lg">
              {timeline}
            </Card>
          </PageSection>
        </aside>
      </div>

      {can.fill ? (
        <div className="xl:hidden">
          <div aria-hidden="true" className="h-36" />
          <FloatingDock
            notice={
              <p className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base">
                {leftWords}
              </p>
            }
          >
            <DockButton
              icon={<CheckCheck />}
              loading={finishing}
              disabled={progress.requiredLeft > 0 || photosBusy}
              onClick={finish}
            >
              {tl("finish")}
            </DockButton>
          </FloatingDock>
        </div>
      ) : fixing ? (
        // The fix's main action below the desktop (L6b-1), saying why it
        // waits while a photo is on its way, as filling does.
        <div className="xl:hidden">
          <div aria-hidden="true" className={photosBusy ? "h-36" : "h-28"} />
          <FloatingDock
            notice={
              photosBusy ? (
                <p className="glass mx-auto w-fit rounded-[22px] px-4 py-2 text-center font-medium text-base">
                  {tl("photoStillSaving")}
                </p>
              ) : undefined
            }
          >
            <DockButton
              icon={<Check />}
              loading={ending}
              disabled={photosBusy}
              onClick={finishFix}
            >
              {tl("fix.done")}
            </DockButton>
          </FloatingDock>
        </div>
      ) : null}

      <Sheet
        open={commentFor !== null}
        onOpenChange={(open) => {
          if (!open) setCommentFor(null);
        }}
        title={tl("comment.title")}
        subtitle={items.find((item) => item.id === commentFor)?.label}
        closeLabel={tl("comment.close")}
        action={{
          label: tl("comment.save"),
          onClick: () => void saveComment(),
        }}
      >
        <div className="px-2 pt-1 pb-2">
          {/* Its earlier text stays in the item's story (L6a): said here. */}
          <TextArea
            label={tl("comment.label")}
            hint={tl("comment.kept")}
            value={commentDraft}
            maxLength={200}
            rows={3}
            onChange={(event) => setCommentDraft(event.target.value)}
          />
        </div>
      </Sheet>

      {/* An item's story (L6a): one row a change, oldest first; only read. */}
      <Sheet
        open={historyItem !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryFor(null);
        }}
        title={th("title")}
        subtitle={historyItem?.label}
        closeLabel={th("close")}
        readingLabel={th("title")}
      >
        {historyItem ? (
          <HistoryRows
            entries={historyOf(historyItem)}
            partWords={(part) => partWords(historyItem, part)}
            whoWhen={whoWhen}
            photosGone={th("photosGone")}
            fixedBadge={tl("fix.badge")}
          />
        ) : null}
      </Sheet>

      {data.pass ? (
        <Sheet
          open={passOpen}
          onOpenChange={setPassOpen}
          title={tl("pass.title")}
          subtitle={list.name}
          closeLabel={tl("pass.close")}
        >
          <div className="flex flex-col gap-4 px-2 pt-1 pb-2">
            <ChoiceList legend={tl("pass.to")}>
              {data.pass.targets.map((target) => (
                <ChoiceRow
                  key={target.id}
                  name="pass-to"
                  value={target.id}
                  checked={passTo === target.id}
                  // Nobody there to take it: said, and not taken.
                  disabled={target.people === 0}
                  onChange={() => {
                    setPassTo(target.id);
                    setPassFailure(null);
                  }}
                  title={target.name}
                  hint={tl("pass.people", { count: target.people })}
                  leading={<Building2 />}
                />
              ))}
            </ChoiceList>
            <TextArea
              label={tl("pass.note")}
              hint={tl("pass.noteHint")}
              value={passNote}
              maxLength={MAX_PASS_NOTE}
              rows={3}
              onChange={(event) => {
                setPassNote(event.target.value);
                setPassFailure(null);
              }}
            />
            {passFailure ? (
              <p role="alert" className="px-2 font-medium text-danger">
                {tl(`failed.${passFailure}`)}
              </p>
            ) : null}
            <Button
              size="lg"
              loading={passing}
              disabled={passTarget === null}
              onClick={pass}
            >
              <ArrowLeftRight aria-hidden="true" />
              {passTarget
                ? tl("pass.submit", { name: passTarget.name })
                : tl("pass.choose")}
            </Button>
          </div>
        </Sheet>
      ) : null}
    </PageBody>
  );
}

/**
 * The rows of an item's story, oldest first: what happened, each change on
 * its own line, and who and when under it, a fix after the close marked
 * "אחרי הסגירה" (L6b-1); then, when a photo was replaced or removed, that
 * earlier photos aren't kept.
 */
function HistoryRows({
  entries,
  partWords,
  whoWhen,
  photosGone,
  fixedBadge,
}: {
  entries: readonly HistoryEntry[];
  partWords: (part: HistoryPart) => ReactNode;
  whoWhen: (by: string | null, at: string) => ReactNode;
  photosGone: string;
  fixedBadge: string;
}) {
  const photoGone = entries.some((entry) =>
    entry.parts.some(
      (part) => part.field === "photo" && part.photo !== "added",
    ),
  );
  return (
    <div className="flex flex-col gap-3 px-2 pt-1 pb-2">
      <ListGroup className="bg-elevated">
        {entries.map((entry) => (
          <ListRow
            key={entry.key}
            title={
              <span className="flex flex-col gap-0.5">
                {entry.parts.map((part) => (
                  <span key={part.field}>{partWords(part)}</span>
                ))}
              </span>
            }
            subtitle={whoWhen(entry.by, entry.at)}
            trailing={
              entry.fixed ? <Badge tone="accent">{fixedBadge}</Badge> : null
            }
          />
        ))}
      </ListGroup>
      {photoGone ? (
        <p className="px-2 text-ink-2 text-sm">{photosGone}</p>
      ) : null}
    </div>
  );
}
