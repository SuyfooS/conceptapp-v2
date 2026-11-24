"use client";

import { type AwaySpan, awayByDay, awayOn } from "@domain/absences";
import {
  type AvailabilityRange,
  addDays,
  dateIn,
  weekdayOf,
} from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  type CopySource,
  copyLastWeek,
  type WeekCopy,
} from "@domain/copy-week";
import {
  begunShifts,
  edgeWeek,
  gapsAhead,
  lockBegun,
  type ShiftStage,
  shiftEnded,
  touchesSoon,
  weekWrite,
} from "@domain/running-week";
import {
  builderKey,
  changedSince,
  changesWeek,
  dayOfMoved,
  doubleBooked,
  type ScheduledShift,
  type ShiftBasis,
  scheduleGaps,
  shiftCoverage,
  shiftSlot,
  withShiftsAsNow,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import type { Position } from "@domain/staffing";
import { type ShiftSwap, swapsEndedBy } from "@domain/swaps";
import type { TeamMember } from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { Segmented } from "@ui/segmented";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { CopyPlus, Info, Save, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { HOLD_MS, useHeldWrite } from "../../use-held-write";
import { type ShareWeek, ShareWeekButton } from "../share-week";
import type { AvailabilityWeek } from "../week";
import type { MovedShifts, ScheduleState } from "./actions";
import { CopyWeekSheet } from "./copy-sheet";
import { type BuilderSend, publishWaits, sendOf } from "./publish-hold";
import {
  AddShiftRow,
  type CardDensity,
  PastDayNote,
  RemovedShift,
  ShiftCard,
} from "./shift-card";
import {
  type LockedShift,
  type SheetView,
  type ShiftDetails,
  type ShiftRow,
  ShiftSheet,
} from "./shift-sheet";
import { laterOf, useBuilderClock } from "./use-builder-clock";
import { useLeaveGuard } from "./use-leave-guard";
import {
  type DayInfo,
  DesktopWeek,
  PhoneWeek,
  TabletWeek,
} from "./week-shapes";

const initialState: ScheduleState = {};

/** A little longer than the sheet takes to slide away. */
const SHEET_CLOSES_MS = 240;

/** How long "ביטול" of a copy from last week stays in the toast. */
const COPY_UNDO_MS = 10_000;

/** One of the builder's two weeks, for the switch between them. */
export type BuilderWeek = {
  which: "this" | "next";
  /** Where it opens (`?week=` with its first day). */
  href: string;
  /** Its shifts still to start lacking someone, as the server read them. */
  gaps: number;
};

/**
 * Which of the two weeks the builder shows (the one running now, or the
 * next), the moment the server read it, and the switch between them.
 */
export type BuilderWeeks = {
  which: "this" | "next";
  /** ISO: the builder's clock goes on from it, once a minute. */
  now: string;
  /** The time clock is on: a shift that is over has its hours kept there. */
  clock: boolean;
  weeks: BuilderWeek[];
};

export type ScheduleBuilderProps = {
  week: Pick<AvailabilityWeek, "start" | "dates" | "timeZone" | "shabbat">;
  /** ISO timestamp of the last save, or null while it is a draft. */
  savedAt: string | null;
  /** ISO timestamp of the last publish, or null until it is published. */
  publishedAt: string | null;
  /** The saved shifts with their ids, or the pattern's with none. */
  shifts: ScheduledShift[];
  /** What was seen of each saved shift, sent back with the week. */
  basis: ShiftBasis | null;
  /**
   * The week's waiting swap requests, for the warning before publishing:
   * how many the changes on the screen would end (`swapsEndedBy`).
   */
  swaps: ShiftSwap[];
  /**
   * The week before, once someone built it: a draft offers copying it onto
   * the screen ("העתקה מהשבוע שעבר"). None offers no copy.
   */
  lastWeek?: CopySource | null;
  /**
   * Where the regular shifts are set, for a week with none; null for someone
   * who can't open the management page (a worker who builds the schedule):
   * the empty week then says only what can be done here.
   */
  manageHref: string | null;
  /** The business has regular shifts, which a week not saved is drawn from. */
  hasPattern: boolean;
  /** The staff: who can be put on a shift. */
  team: Pick<TeamMember, "userId" | "name" | "photo">[];
  /**
   * Everyone on the team, for the names of those on a shift: only someone
   * missing here is no longer on the team (what has begun keeps whoever was
   * on it, the accountant included).
   */
  people: Pick<TeamMember, "userId" | "name" | "photo">[];
  answers: { userId: string; ranges: AvailabilityRange[] }[];
  /**
   * Who on the staff is away this week, and when (known issue 19): never
   * why. The days and cards say so, the sheet groups them, and the copy
   * leaves them off those days. None by default.
   */
  away?: AwaySpan[];
  /** The business's positions (waiter, cook…); none hides the choice. */
  positions: Position[];
  /**
   * Which week this is, the server's moment and the switch. Without it (the
   * next-week demo) nothing is ever locked and there is no switch.
   */
  running?: BuilderWeeks;
  /**
   * `saveScheduleAction`, or the design demo's stand-in. The form's
   * `intent` says whether to save the draft or publish.
   */
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  /**
   * The person publishes the schedule too (`publishesSchedule`; the roles
   * plan's R3). Without it there is no publish: a draft is saved, with a line
   * that says who publishes it, and a published week is only read, with a
   * line that says why. True unless said otherwise.
   */
  publishes?: boolean;
  /**
   * Sharing the week with the team once it is published, with nothing new
   * on the screen; null while viewing as a role, which speaks for nobody.
   */
  share?: ShareWeek | null;
};

/** What the builder starts from: one reading of the week, kept together. */
type Reading = {
  key: string;
  week: ScheduleBuilderProps["week"];
  /** When the week was last saved, as read: what a copy is made over. */
  savedAt: string | null;
  shifts: ScheduledShift[];
  basis: ShiftBasis | null;
  swaps: ShiftSwap[];
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * A line in the dock (or the sheet that asks before leaving) said before
 * publishing: what the changes would end, or whom to check with directly.
 */
function DockLine({
  id,
  inSheet = false,
  icon = "warning",
  children,
}: {
  id?: string;
  inSheet?: boolean;
  icon?: "warning" | "info";
  children: ReactNode;
}) {
  const Icon = icon === "warning" ? TriangleAlert : Info;
  return (
    <p
      id={id}
      className={cn(
        "flex items-start gap-2 rounded-card px-4 py-3 font-medium text-base text-ink",
        inSheet ? "bg-elevated shadow-card" : "bg-surface shadow-float",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0",
          icon === "warning" ? "text-warning" : "text-ink-2",
        )}
      />
      {children}
    </p>
  );
}

/**
 * Moves focus to the one element matching `selector` that is on the screen,
 * and says whether there was one.
 */
function focusOnScreen(selector: string): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null) {
      el.focus();
      return true;
    }
  }
  return false;
}

/**
 * Whether the keyboard's focus is still where a closing sheet left it:
 * nowhere, or on what it went back to. Anything the person, or the toast of a
 * publish held for "ביטול", moved it to meanwhile keeps it.
 */
function focusLeftBySheet(back?: Element | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    active === back ||
    !active.isConnected
  );
}

/**
 * The manager builds a week's schedule: next week, or the week running now.
 * Phone: one day at a time under the week strip (on today, in the running
 * week). Tablet: the whole week, a row per day. Desktop: the whole week, a
 * column per day. Every shift opens the same sheet, where people go on and
 * off it, and publishing floats within reach on all three. A switch above
 * the days goes to the other week, through the same question as any way out
 * while there is unsaved work.
 *
 * Nothing reaches the server until the dock's buttons send the form, and the
 * form holds only what they need: the week as it stands on the screen, with
 * what was read of it. After each save or publish the server reads the week
 * again (new shifts get their ids), and the builder starts again from that
 * (`builderKey`): the form's state, the chosen day and the toast stay here,
 * and the dock stays busy until the new reading is on the screen, so a second
 * press never sends the same new shifts twice. Another week is another
 * builder altogether (the view keys it by the week). Once the week is
 * published with nothing new on the screen, the dock offers sharing it with
 * the team instead (`ShareWeekButton`), saying "עודכן" after this screen's
 * own "פרסום השינויים".
 *
 * Publishing changes to a week already published, in either week, waits
 * `HOLD_MS` for "ביטול" before anything reaches the server (Orel's answer 3
 * of 15 November 2026, `publishWaits`): the form as it was pressed is held
 * (`useHeldWrite`), the dock stays busy and the work stands as pressed, and a
 * toast says it goes in a few seconds, with "ביטול", which lets it go unsent
 * and brings the screen back as it was before the press: nobody was told.
 * The wait stops with the toast's, while the keyboard is on "ביטול" or a
 * mouse over it, so the way back is never offered once it would do nothing.
 * It goes sooner when the page is hidden or the screen is left, as the hook
 * sends any held write; a way out the screen sees (a tab, the switch to the
 * other week) sends it at once and goes once it worked, as "פרסום השינויים
 * ויציאה" does, which itself never waits. Should the clock put back a shift
 * the held publish changes, it goes unsent, and the rest waits with the line
 * that says why; should a shift begin that it only adds people to, or leaves
 * as it was, the form held is made again as the screen now sends it. A
 * week's first publish and a draft go at once.
 *
 * The builder works on one reading at a time: the week, its shifts and what
 * was seen of them, kept together. A new one from the server replaces it
 * only while nothing on the screen is unsaved, which is so right after this
 * screen's own write; a refresh that something else asked for while there is
 * work here, or after a write that failed, leaves the work and what it was
 * read from as they were.
 *
 * In a published week, what has begun stays as it was (Orel's answer of 15
 * November 2026, 20261115000300_running_week.sql), read on the screen's own
 * clock, which goes on once a minute from the server's moment: a shift that
 * is over is a muted card, and its sheet only says so; one under way says
 * since when, and its sheet only adds people, who go apart as `joins`;
 * neither is sent, nor what was read of it. Days that are over take no new
 * shift, and today takes only one that starts after now. A shift that begins
 * while it has changes on the screen goes back to how it was read, and says
 * so; the rest of the work stays. Counts are of the shifts still to start;
 * the check for someone on two shifts at once sees every shift. In a week
 * never published nothing is locked, and days that are over are only muted
 * in the week strip.
 *
 * A write refused because shifts it changed had changed meanwhile
 * (`weekMoved`) comes back with those shifts as they are now: they take the
 * place of this screen's versions, marked "השתנתה בינתיים", with what is seen
 * of them now, and everything else stays as it was on the screen, so the
 * manager looks and publishes again; on a phone the day shown is one of
 * theirs. One refused because shifts began or ended meanwhile does the same,
 * and they lock. With nothing of the screen's own left to send, it says so
 * and offers no publish. Before publishing, lines above the button (and in
 * the sheet that asks before leaving, beside its own publish) say how many
 * waiting swap requests the changes would end, and, when they touch a shift
 * under way or starting within 12 hours, to check with its people directly;
 * the button is described by them. A week that turned over while the screen
 * was open takes nothing more: it says so, with the way to the running week.
 *
 * A draft whose week before was built offers "העתקה מהשבוע שעבר"
 * (`copyLastWeek`): a sheet says what it would do, day by day, and who
 * wouldn't be copied and why, and its button puts the copy on the screen
 * only. The toast says nothing is saved yet, with "ביטול" for
 * `COPY_UNDO_MS`, which puts the screen back as it was before the copy. The
 * next change on the screen takes that way back away, since it would take
 * the change with it: the copy then stays as any other work on the screen.
 * The form then sends the save moment the reading had (`copied`), so a week
 * saved meanwhile on another screen takes no second copy (`copySaved`).
 */
export function ScheduleBuilder(props: ScheduleBuilderProps) {
  const t = useTranslations();
  const router = useRouter();
  const { save, running } = props;
  const ticking = useBuilderClock(running?.now ?? null);
  // The address names the week on the screen (`?week=`), a bare
  // /schedule/build too: a write made after the week turned, while next
  // week's screen was open, then reads back this same week, now the one
  // running, rather than the week after it that the bare address now opens.
  const here = running?.weeks.find(
    (option) => option.which === running.which,
  )?.href;
  useEffect(() => {
    if (!here) return;
    const at = new URL(window.location.href);
    if (at.searchParams.has("week")) return;
    if (!new URL(here, at).searchParams.has("week")) return;
    window.history.replaceState(null, "", here);
  }, [here]);
  const [dirty, setDirty] = useState(false);
  /** Where to go once the save in progress has worked. */
  const leaveTo = useRef<string | null>(null);
  /** The shifts the form sent last, as the screen had them. */
  const sent = useRef<ScheduledShift[]>([]);
  /** The publish pressed last was of changes to a week already out. */
  const changesPressed = useRef(false);
  /** What sharing says of the last publish that went out from here. */
  const [shareKind, setShareKind] = useState<"changes" | "other">("other");
  // The running week opens on today; any other on its first day.
  const [day, setDay] = useState(() => {
    const today = ticking ? dateIn(ticking, props.week.timeZone) : null;
    return today && props.week.dates.includes(today)
      ? today
      : (props.week.dates[0] ?? props.week.start);
  });

  /** What the toast says of a held publish: waiting, or let go unsent. */
  const [heldNotice, setHeldNotice] = useState<{
    kind: "waiting" | "undone";
    stamp: string;
  } | null>(null);
  /**
   * What the toast says of a copy from last week: made, with what puts the
   * screen back as it was before it, or undone.
   */
  const [copyNotice, setCopyNotice] = useState<
    | { kind: "copied"; count: number; stamp: string; undo: () => void }
    | { kind: "undone"; stamp: string }
    | null
  >(null);

  const [state, action, pending] = useActionState(
    async (prev: ScheduleState, payload: BuilderSend) => {
      const { form, sent: answered } = sendOf(payload);
      // Whatever the toast said of a held publish, or of a copy, is over once
      // one goes: what it would undo is on its way.
      setHeldNotice(null);
      setCopyNotice(null);
      try {
        const result = await save(prev, form);
        const target = leaveTo.current;
        leaveTo.current = null;
        if (result.savedAt && target) router.push(target);
        // Only a publish that went out says what it was: one let go unsent
        // for "ביטול" never got here.
        if (result.published) {
          setShareKind(changesPressed.current ? "changes" : "other");
        }
        // Publishing was taken from the person while the screen was open: it
        // draws again without "פרסום", as a draft to save or a week to read.
        if (result.failure === "noPublish") router.refresh();
        // Shifts changed (or begun) meanwhile come back: a phone shows a day
        // with one of them, should the day it shows have none.
        const moved = result.moved;
        if (moved) {
          const shifts = sent.current;
          setDay((current) => dayOfMoved(current, moved, shifts));
        }
        // A clash across the week's edge is with this week's first day (the
        // week before) or its last (the week after): a phone shows that day.
        const clash = result.edgeClash;
        if (clash) {
          const here = addDays(clash.day, clash.week === "previous" ? 1 : -1);
          if (props.week.dates.includes(here)) setDay(here);
        }
        return result;
      } finally {
        answered?.();
      }
    },
    initialState,
  );

  // Publishing changes, held for its undo before anything reaches the server
  // (`publishWaits`). Once the wait is over it goes as the dock's own press
  // would have, through the same action, and the promise is answered when the
  // server has: a switch to another business waits for it.
  const held = useHeldWrite<FormData>(
    (form) =>
      new Promise<void>((answered) => {
        startTransition(() => action({ form, sent: answered }));
      }),
  );
  const holding = held.held !== null;
  /** How the screen stood before the held publish was pressed, for "ביטול". */
  const restoreHeld = useRef<(() => void) | null>(null);

  function holdPublish(form: FormData, restore: () => void) {
    held.hold(form);
    restoreHeld.current = restore;
    setHeldNotice({ kind: "waiting", stamp: new Date().toISOString() });
  }

  /**
   * "ביטול": the publish goes unsent, and the screen is as it was before the
   * press, the line of a refused write or of a shift that began included.
   */
  function undoPublish() {
    if (held.release() === null) return;
    const restore = restoreHeld.current;
    restoreHeld.current = null;
    if (restore) restore();
    else setDirty(true);
    setHeldNotice({ kind: "undone", stamp: new Date().toISOString() });
  }

  /**
   * The clock put back a shift the held publish changes: the form held is
   * out of date and would be refused, so it goes unsent, and the rest of the
   * work waits as it now stands, with the line that says why.
   */
  function dropHeld() {
    if (held.release() === null) return;
    restoreHeld.current = null;
    setDirty(true);
    setHeldNotice({ kind: "undone", stamp: new Date().toISOString() });
  }

  /** A copy from last week went on the screen: the toast offers its way back. */
  function copyMade(count: number, undo: () => void) {
    setCopyNotice({
      kind: "copied",
      count,
      stamp: new Date().toISOString(),
      undo,
    });
  }

  /**
   * The screen changed after a copy (a shift added, changed, removed or
   * brought back): "ביטול" would put back the screen as it was before the
   * copy and take that change with it, so the toast goes with its way back.
   * The copy stays, as any other work on the screen.
   */
  function changedAfterCopy() {
    setCopyNotice((notice) => (notice?.kind === "copied" ? null : notice));
  }

  /** "ביטול" of a copy: the screen as it was before it. */
  function undoCopy() {
    // What is on its way stands as sent: the builder starts again from it.
    if (pending || holding || copyNotice?.kind !== "copied") return;
    copyNotice.undo();
    setCopyNotice({ kind: "undone", stamp: new Date().toISOString() });
  }

  /** The toast's button went with the focus before there was an answer. */
  const focusAfterAnswer = useRef(false);
  /**
   * Where the focus goes as the toast's button goes: to the publish button
   * when it can be pressed again, else to the line that says where the week
   * stands. While the publish is still on its way that waits for its answer,
   * as the dock is busy and, once it worked, the builder starts again.
   */
  function focusAfterToast() {
    if (focusOnScreen('button[value="publish"]:enabled')) return;
    if (pending || holding) {
      focusAfterAnswer.current = true;
      return;
    }
    focusOnScreen("[data-builder-status]");
  }
  /** After a copy's toast, the focus goes back to the copy's button. */
  function focusAfterCopy() {
    if (!focusOnScreen("[data-copy-week]:enabled")) focusAfterToast();
  }
  useEffect(() => {
    if (pending || holding || !focusAfterAnswer.current) return;
    focusAfterAnswer.current = false;
    // Unless the person has put it somewhere since.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    focusAfterToast();
  });

  const done = !dirty && !pending && !holding;
  // The clock only goes on: to the moment the server answered, when later.
  const now = laterOf(ticking, state.now);

  const latest: Reading = {
    key: builderKey(props.week.start, props.savedAt, props.publishedAt),
    week: props.week,
    savedAt: props.savedAt,
    shifts: props.shifts,
    basis: props.basis,
    swaps: props.swaps,
  };
  const [reading, setReading] = useState(latest);
  if (reading.key !== latest.key && done && state.failure === undefined) {
    setReading(latest);
  }
  const { week } = reading;

  // A publish held says so with its way back for as long as it waits; let
  // go, that nobody was told; then a copy from last week, with its way back,
  // or that it was undone; otherwise what the last write did, once done.
  const toast: {
    text: string;
    stamp: string;
    undo: "publish" | "copy" | null;
  } | null =
    holding && heldNotice?.kind === "waiting"
      ? {
          text: t("app.build.hold.waiting"),
          stamp: heldNotice.stamp,
          undo: "publish",
        }
      : heldNotice?.kind === "undone"
        ? {
            text: t("app.build.hold.undone"),
            stamp: heldNotice.stamp,
            undo: null,
          }
        : copyNotice
          ? copyNotice.kind === "copied"
            ? {
                text: t("app.build.copy.done", { count: copyNotice.count }),
                stamp: copyNotice.stamp,
                undo: "copy",
              }
            : {
                text: t("app.build.copy.undone"),
                stamp: copyNotice.stamp,
                undo: null,
              }
          : state.savedAt && done
            ? {
                text: state.published
                  ? t("app.build.published")
                  : t("app.build.saved"),
                stamp: state.savedAt,
                undo: null,
              }
            : null;

  return (
    <div className="flex flex-col gap-5 pb-20 xl:pb-16">
      <WeekBuilder
        key={reading.key}
        {...props}
        week={week}
        readSavedAt={reading.savedAt}
        shifts={reading.shifts}
        basis={reading.basis}
        swaps={reading.swaps}
        // A day of the week on the screen, should the week itself change.
        day={week.dates.includes(day) ? day : (week.dates[0] ?? week.start)}
        onDay={setDay}
        now={now}
        dirty={dirty}
        onDirty={setDirty}
        state={state}
        action={action}
        pending={pending}
        holding={holding}
        onHold={holdPublish}
        sendHeld={held.commit}
        replaceHeld={held.replace}
        dropHeld={dropHeld}
        leaveTo={leaveTo}
        sent={sent}
        changesPressed={changesPressed}
        shareKind={shareKind}
        onCopied={copyMade}
        onEdited={changedAfterCopy}
      />
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        // The way back lasts as long as the publish waits for it; a copy's,
        // as long as any other way back in the app.
        duration={
          toast?.undo === "publish"
            ? HOLD_MS
            : toast?.undo === "copy"
              ? COPY_UNDO_MS
              : undefined
        }
        action={
          toast?.undo
            ? {
                label: t("app.manage.undo"),
                onClick: toast.undo === "publish" ? undoPublish : undoCopy,
              }
            : null
        }
        // The dock's button went busy with the focus, or the copy's sheet
        // closed with it: the way back is next.
        focusAction={Boolean(toast?.undo)}
        onFocusLeave={copyNotice ? focusAfterCopy : focusAfterToast}
        // While the toast waits for the keyboard or a mouse on "ביטול", the
        // publish waits too: it never goes with the way back still offered.
        onWaitingChange={(waiting) => {
          if (waiting) held.pause();
          else held.resume();
        }}
      />
    </div>
  );
}

/** The builder as it stands between two saves. */
function WeekBuilder({
  week,
  savedAt,
  readSavedAt,
  publishedAt,
  shifts: initial,
  basis: firstBasis,
  swaps: firstSwaps,
  lastWeek = null,
  manageHref,
  hasPattern,
  team,
  people,
  answers,
  away = [],
  positions,
  running,
  publishes = true,
  share = null,
  day,
  onDay,
  now,
  dirty,
  onDirty: setDirty,
  state,
  action,
  pending,
  holding,
  onHold,
  sendHeld,
  replaceHeld,
  dropHeld,
  leaveTo,
  sent,
  changesPressed,
  shareKind,
  onCopied,
  onEdited,
}: Omit<ScheduleBuilderProps, "save"> & {
  /**
   * When the week was last saved, as the reading on the screen has it ("" is
   * sent for a week never saved): what a copy says it was made over.
   */
  readSavedAt: string | null;
  /** The phone's chosen day, kept as the builder starts again. */
  day: string;
  onDay: (day: string) => void;
  /** The screen's clock, or null for a screen with nothing to lock. */
  now: Date | null;
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
  state: ScheduleState;
  action: (form: FormData) => void;
  pending: boolean;
  /** A publish pressed waits for its undo: nothing has reached the server. */
  holding: boolean;
  /**
   * Holds a publish, the form as it was pressed, for its undo, with what
   * brings the screen back as it was before the press.
   */
  onHold: (form: FormData, restore: () => void) => void;
  /** Sends the held publish now. */
  sendHeld: () => void;
  /** Holds the publish as the screen now sends it, in the time it has left. */
  replaceHeld: (form: FormData) => void;
  /** Lets the held publish go unsent: the clock changed what it holds. */
  dropHeld: () => void;
  leaveTo: RefObject<string | null>;
  /** Where the form's submit puts the shifts it sends. */
  sent: RefObject<ScheduledShift[]>;
  /** Where the form's submit says whether a publish is of changes. */
  changesPressed: RefObject<boolean>;
  /** What sharing the week says of the last publish from this screen. */
  shareKind: "changes" | "other";
  /**
   * A copy from last week went on the screen: how many shifts, and what puts
   * the screen back as it was before it, for the toast's "ביטול".
   */
  onCopied: (count: number, undo: () => void) => void;
  /**
   * The person changed the screen: a copy's way back, should one be offered,
   * would take that change with it.
   */
  onEdited: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  // A publish on its way, or held for its undo: the work stands as pressed.
  const busy = pending || holding;
  // Each shift gets an id of its own on this screen, so cards and the open
  // sheet keep their place while shifts are added and removed around them.
  const nextId = useRef(initial.length);
  const [rows, setRows] = useState<ShiftRow[]>(() =>
    initial.map((shift, id) => ({ id, shift })),
  );
  /** Shifts taken off since the last save, each with the way back. */
  const [removed, setRemoved] = useState<ShiftRow[]>([]);
  /** The week's shifts as read: what the changes on the screen are from. */
  const [read, setRead] = useState(initial);
  /** What was seen of each shift read, sent back with the week. */
  const [basis, setBasis] = useState(firstBasis);
  /** The week's waiting swap requests, as last read. */
  const [swaps, setSwaps] = useState(firstSwaps);
  /** Shifts put back as they are now after a write refused (`weekMoved`). */
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  /**
   * Shifts deleted meanwhile, put among the removed after a write refused
   * (`weekMoved`): the screen's id of each, with the id it had.
   */
  const [goneMeanwhile, setGoneMeanwhile] = useState<
    ReadonlyMap<number, string>
  >(new Map());
  /**
   * Shifts that began (or ended, with people still to put on them) while
   * the screen had changes to them, put back as they were read on the
   * screen's own clock: said until the next change.
   */
  const [lockedBack, setLockedBack] = useState<{
    kind: "started" | "ended";
    shifts: ScheduledShift[];
  } | null>(null);
  /**
   * A copy from last week is on the screen, made over the week as read: the
   * save moment the reading had ("" for a week never saved), sent with the
   * week (`copied`). Null while there is none.
   */
  const [copied, setCopied] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  /** The copy's sheet replaces days with people on them too. */
  const [replace, setReplace] = useState(false);
  /**
   * What the copy's sheet showed as it closed, for as long as it slides away:
   * read again, a copy just put on the screen would leave nothing to copy.
   */
  const [shownCopy, setShownCopy] = useState<WeekCopy | null>(null);

  // The design demo stores nothing and doesn't start again after a publish,
  // so its own publish shows through `state`: the later of the two is the
  // last.
  const ownPublish = state.published ? state.savedAt : undefined;
  const lastPublish =
    ownPublish &&
    (publishedAt === null || Date.parse(ownPublish) > Date.parse(publishedAt))
      ? ownPublish
      : publishedAt;
  const published = lastPublish !== null;
  // Someone who builds without publishing only reads a published week: it
  // changes only by being published again (the roles plan's R3).
  const readOnly = !changesWeek(publishes, { published });
  // In a draft, the dock says who publishes it.
  const draftOnly = !publishes && !published;
  const { timeZone } = week;
  const today = now ? dateIn(now, timeZone) : null;
  const clockAt = now?.getTime() ?? null;
  /**
   * Where each stored shift that has begun at the screen's clock stands, as
   * it was read: under way, or over. Read once per minute of the clock, not
   * once per card. Nothing in a week never published.
   */
  const stages = useMemo(() => {
    const at = clockAt === null ? null : new Date(clockAt);
    const begunAt =
      at && published ? begunShifts(read, true, at, timeZone) : new Set();
    return new Map(
      read.flatMap((shift): [string, Exclude<ShiftStage, "ahead">][] =>
        at && shift.id !== undefined && begunAt.has(shift.id)
          ? [[shift.id, shiftEnded(shift, at, timeZone) ? "over" : "now"]]
          : [],
      ),
    );
  }, [read, clockAt, published, timeZone]);
  /** Begun at the screen's clock: kept as read, beyond people joining. */
  const begun = new Set(stages.keys());
  const readById = new Map(
    read.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
  );
  /** Where a stored shift stands, when it has begun: under way, or over. */
  const lockOf = (shift: ScheduledShift): LockedShift | null => {
    const stage = shift.id === undefined ? undefined : stages.get(shift.id);
    const was = shift.id === undefined ? undefined : readById.get(shift.id);
    return stage && was ? { stage, read: was } : null;
  };

  // What the last save or publish answered, until it is taken in below.
  const [handled, setHandled] = useState(state);

  // A shift that began on the screen's clock while it had changes here goes
  // back to how it was read, and the screen says so; the rest stays. Checked
  // each time the clock moves on, once a new answer from the server (which
  // may move the clock and put shifts back itself) has been taken in.
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  if (clockAt !== lockedAt && state === handled) {
    setLockedAt(clockAt);
    if (begun.size > 0) {
      const ended = new Set(
        [...stages].flatMap(([id, stage]) => (stage === "over" ? [id] : [])),
      );
      const locked = lockBegun({ rows, removed }, read, begun, ended);
      if (locked) {
        setRows(locked.rows);
        setRemoved(locked.removed);
        setLockedBack(
          locked.started.length > 0
            ? { kind: "started", shifts: locked.started }
            : { kind: "ended", shifts: locked.ended },
        );
      }
    }
  }

  /** The waiting requests that sending the screen as it is would end. */
  const ending = swapsEndedBy(
    read,
    rows.map((r) => r.shift),
    swaps,
    basis === null,
  );
  // What the last save or publish answered, taken in once. One that worked
  // takes the ways back and the marks with it, and what it sent is now what
  // was read. (After one the app's builder starts again anyway; the design
  // demo's stays.) One refused because shifts changed, began or ended
  // meanwhile puts them back as they are now, marked only when changed.
  if (state !== handled) {
    setHandled(state);
    if (state.savedAt) {
      setRemoved([]);
      setMarked(new Set());
      setGoneMeanwhile(new Map());
      setLockedBack(null);
      setRead(rows.map((r) => r.shift));
      setSwaps(swaps.filter((swap) => !ending.includes(swap)));
      // What was copied is saved now, as the week it was copied into.
      setCopied(null);
    }
    if (state.moved && basis) {
      putBack(state.moved, basis, state.failure === "weekMoved");
    }
  }
  const [blocked, setBlocked] = useState(false);
  /** The button that sent the form last: save the draft, or publish. */
  const [intent, setIntent] = useState<"save" | "publish">("publish");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<SheetView>({
    kind: "add",
    date: week.start,
  });
  /** What opened the sheet: where focus goes back to when it closes. */
  const opener = useRef<HTMLElement | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const shifts = rows.map((r) => r.shift);
  // Names come from the whole team: someone now the accountant is still
  // themselves on what has begun. Only someone missing here has left.
  const nameOf = new Map(
    people.map((m) => [m.userId, m.name ?? t("app.team.noName")]),
  );
  const photoOf = new Map(people.map((m) => [m.userId, m.photo]));
  // Counts leave out what has begun; the clash check sees every shift.
  const gaps = now ? gapsAhead(shifts, now, timeZone) : scheduleGaps(shifts);
  const ahead = now ? shifts.filter((s) => !lockOf(s)) : shifts;
  const clashes = doubleBooked(week.start, shifts);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const shortDay = (date: string) =>
    t(`days.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`);

  /**
   * The shifts changed (or begun, or ended) meanwhile, as they are now, in
   * place of this screen's versions (`withShiftsAsNow`), to be sent next with
   * what is seen of them now; the rest of the screen as it was. Marked
   * "השתנתה בינתיים" when someone changed them.
   */
  function putBack(moved: MovedShifts, seen: ShiftBasis, mark: boolean) {
    const next = withShiftsAsNow({ rows, removed }, moved, () => {
      const id = nextId.current;
      nextId.current += 1;
      return id;
    });
    const asNow = new Map(
      moved.shifts.map(({ seen: digest, ...shift }) => [
        shift.id,
        { shift, digest },
      ]),
    );
    const stale = (id: string | undefined) =>
      id !== undefined && (asNow.has(id) || moved.gone.includes(id));
    const gone = [...rows, ...removed].flatMap((row) =>
      row.shift.id !== undefined && moved.gone.includes(row.shift.id)
        ? [[row.id, row.shift.id] as const]
        : [],
    );
    setRows(next.rows);
    setRemoved(next.removed);
    setRead([
      ...read.filter((shift) => !stale(shift.id)),
      ...[...asNow.values()].map(({ shift }) => shift),
    ]);
    setBasis(
      Object.fromEntries([
        ...Object.entries(seen).filter(([id]) => !stale(id)),
        ...[...asNow].map(([id, now]) => [id, now.digest] as const),
      ]),
    );
    setSwaps(moved.swaps);
    if (mark) setMarked(new Set([...marked, ...asNow.keys()]));
    setGoneMeanwhile(new Map([...goneMeanwhile, ...gone]));
  }

  function edited(next: ShiftRow[]) {
    setRows(next);
    setDirty(true);
    setBlocked(false);
    setLockedBack(null);
    // A copy's "ביטול" would undo this change too: it goes.
    onEdited();
  }

  function change(id: number, shift: ScheduledShift) {
    // New hours may move the shift within its day.
    const rest = rows.filter((r) => r.id !== id);
    const at = shiftSlot(
      rest.map((r) => r.shift),
      shift,
    );
    edited([...rest.slice(0, at), { id, shift }, ...rest.slice(at)]);
  }

  function remove(id: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setRemoved([...removed, row]);
    edited(rows.filter((r) => r.id !== id));
    setSheetOpen(false);
    // The card is gone, so focus goes to the way back instead.
    opener.current = null;
    setTimeout(() => {
      if (focusLeftBySheet()) focusOnScreen(`[data-undo="${id}"]`);
    }, SHEET_CLOSES_MS);
  }

  function undoRemove(row: ShiftRow) {
    // What is on its way (or held) stands as sent: the builder starts again
    // from it.
    if (busy) return;
    setRemoved(removed.filter((r) => r.id !== row.id));
    // Brought back, a shift deleted meanwhile is a new one.
    if (goneMeanwhile.has(row.id)) {
      setGoneMeanwhile(
        new Map([...goneMeanwhile].filter(([id]) => id !== row.id)),
      );
    }
    const at = shiftSlot(shifts, row.shift);
    edited([...rows.slice(0, at), row, ...rows.slice(at)]);
    setTimeout(() => focusOnScreen(`[data-shift-card="${row.id}"]`));
  }

  function addShift(date: string, details: ShiftDetails) {
    const shift: ScheduledShift = {
      day: date,
      ...details,
      pattern: null,
      assignees: [],
    };
    const at = shiftSlot(shifts, shift);
    const id = nextId.current++;
    edited([...rows.slice(0, at), { id, shift }, ...rows.slice(at)]);
    // Who works it is the next thing to decide.
    setView({ kind: "shift", id });
  }

  function openSheet(next: SheetView, event: MouseEvent<HTMLElement>) {
    if (busy) return;
    opener.current = event.currentTarget;
    setView(next);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    const back = opener.current;
    // The sheet takes focus with it; give it back where the person was,
    // unless they (or the toast of a held publish) moved it on meanwhile.
    if (back) {
      setTimeout(() => {
        if (focusLeftBySheet(back)) back.focus();
      }, SHEET_CLOSES_MS);
    }
  }

  const moment = (iso: string | null | undefined) =>
    iso
      ? {
          date: dayMonth(dateIn(new Date(iso), timeZone)),
          time: timeIn(new Date(iso), timeZone),
        }
      : null;
  const savedMoment = moment(savedAt);
  const publishedMoment = moment(lastPublish);
  const done = !dirty && !busy;
  // A failed save leaves the work where it was: on the screen only. After
  // one refused because shifts changed, began or ended meanwhile, with those
  // put back as they are now, what is left is whatever still differs from
  // what was read. A week that is over takes nothing more: nothing on the
  // screen is kept for it, and only the way to the running week stays.
  const failed = done && state.failure !== undefined;
  const weekOver = state.failure === "weekOver";
  const putBackFailure =
    state.failure === "weekMoved" ||
    state.failure === "shiftStarted" ||
    state.failure === "shiftEnded";
  const leftOver =
    failed &&
    !weekOver &&
    (!putBackFailure ||
      state.moved === undefined ||
      changedSince(read, shifts));
  // Once the clock has put back a shift that began, only what still differs
  // from what was read is unsaved: that shift may have been all of it.
  const nothingLeft = lockedBack !== null && !changedSince(read, shifts);
  const unsaved = !weekOver && (dirty || leftOver) && !nothingLeft;
  // And the builder hears it, so a new reading may take this one's place.
  useEffect(() => {
    if (dirty && nothingLeft) setDirty(false);
  }, [dirty, nothingLeft, setDirty]);

  // Copying last week, offered on a draft only: a published week (this
  // screen's own publish included) changes only by being published again,
  // and one that is over takes nothing more. Worked out while its sheet is
  // open, from the screen as it stands.
  const offerCopy = lastWeek !== null && !published && !weekOver;
  const liveCopy =
    copyOpen && offerCopy && lastWeek
      ? copyLastWeek({
          weekStart: week.start,
          screen: shifts,
          source: lastWeek,
          staff: team.map((m) => m.userId),
          people: people.map((m) => m.userId),
          answers,
          away,
          replace,
          now,
          timeZone,
        })
      : null;
  const sheetCopy = liveCopy ?? shownCopy;

  function openCopy(event: MouseEvent<HTMLElement>) {
    if (busy) return;
    opener.current = event.currentTarget;
    setReplace(false);
    setCopyOpen(true);
  }

  function closeCopy() {
    setShownCopy(liveCopy);
    setCopyOpen(false);
    const back = opener.current;
    if (back) {
      setTimeout(() => {
        if (focusLeftBySheet(back)) back.focus();
      }, SHEET_CLOSES_MS);
    }
  }

  /**
   * The copy goes on the screen as the sheet showed it: the shifts that stay
   * keep their place and their screen ids, each copy gets one of its own, and
   * the days' own shifts that made way leave the screen. Nothing is sent: the
   * toast's "ביטול" puts back the screen as it was before.
   */
  function applyCopy() {
    const copy = liveCopy;
    if (busy || !copy || copy.shifts === 0 || copy.tooMany) return;
    const before = { rows, removed, dirty, copied };
    const next = copy.week.flatMap((place): ShiftRow[] => {
      if ("copied" in place) {
        const id = nextId.current;
        nextId.current += 1;
        return [{ id, shift: place.copied }];
      }
      const row = rows[place.kept];
      return row ? [row] : [];
    });
    edited(next);
    setCopied(readSavedAt ?? "");
    setShownCopy(copy);
    setCopyOpen(false);
    // The toast's "ביטול" takes the focus as the sheet closes. Said after
    // `edited`, which takes an earlier copy's way back: this one's comes in
    // its place.
    opener.current = null;
    onCopied(copy.shifts, () => {
      setRows(before.rows);
      setRemoved(before.removed);
      setDirty(before.dirty);
      setCopied(before.copied);
    });
  }

  const guard = useLeaveGuard(unsaved || busy);
  // A way out taken while a publish is held (a tab, the switch to the other
  // week) sends it now and goes once it worked, as "פרסום השינויים ויציאה"
  // does: the publish was chosen, so nothing is asked, and should it be
  // refused the screen stays and says why.
  useEffect(() => {
    if (!holding || guard.target === null) return;
    leaveTo.current = guard.target;
    guard.clear();
    sendHeld();
  }, [holding, guard, leaveTo, sendHeld]);

  function saveAndLeave() {
    leaveTo.current = guard.target;
    guard.clear();
    const button = form.current?.querySelector<HTMLButtonElement>(
      publishedMoment ? 'button[value="publish"]' : 'button[value="save"]',
    );
    // A save already on its way goes on to the same place when it is done.
    // Publishing on the way out goes at once, with no wait for its undo
    // (`publishWaits`): the screen is being left.
    if (button && !button.disabled) form.current?.requestSubmit(button);
  }

  function leaveWithoutSaving() {
    const target = guard.target;
    guard.clear();
    setDirty(false);
    if (target) router.push(target);
  }

  /** A day's shifts in order, with the way back in place of any removed. */
  const itemsOn = (date: string) =>
    [
      ...rows.map((row) => ({ row, gone: false })),
      ...removed.map((row) => ({ row, gone: true })),
    ]
      .filter(({ row }) => row.shift.day === date)
      .sort((a, b) => a.row.shift.start.localeCompare(b.row.shift.start));

  // Who is away each day, by name: the day says it, and each card its own.
  const awayDays = awayByDay(away, week.dates);
  const days: DayInfo[] = week.dates.map((date) => {
    const awayNames = (awayDays.get(date) ?? []).map(
      (user) => nameOf.get(user) ?? t("app.shifts.former"),
    );
    const onDay = shifts.filter((s) => s.day === date);
    // What has begun in a published week lacks nothing any more: a day counts
    // its shifts still to start, as every count of the week does.
    const { filled, needed } = shiftCoverage(onDay.filter((s) => !lockOf(s)));
    const shabbat = week.shabbat;
    const candles = shabbat?.friday === date;
    const havdalah = shabbat?.saturday === date;
    const over = today !== null && date < today;
    return {
      date,
      short: shortDay(date),
      weekday: weekday(date),
      dayMonth: dayMonth(date),
      heading: t("app.build.day", {
        day: weekday(date),
        date: dayMonth(date),
      }),
      filled,
      needed,
      hasShifts: onDay.length > 0,
      empty: itemsOn(date).length === 0,
      over,
      // In a published week a day that is over keeps what it had, and takes
      // no new shift; in a week never published, nothing is locked.
      muted: over && published,
      addable: !(over && published) && !readOnly,
      today: date === today,
      shabbatTime: candles
        ? (shabbat?.candleLighting ?? null)
        : havdalah
          ? (shabbat?.havdalah ?? null)
          : null,
      shabbatNote: candles
        ? t.rich("app.build.shabbat.candles", {
            time: shabbat?.candleLighting ?? "",
            ltr,
          })
        : havdalah
          ? t.rich("app.build.shabbat.havdalah", {
              time: shabbat?.havdalah ?? "",
              ltr,
            })
          : null,
      awayNote:
        awayNames.length > 0
          ? t("app.build.awayDay", { names: awayNames.join(", ") })
          : null,
    };
  });

  const renderAdd = (date: string, density: CardDensity) => {
    if (readOnly) return null;
    const alone = itemsOn(date).length === 0;
    if (today !== null && date < today && published) {
      // A day that is over takes nothing new; an empty one says so.
      return alone ? <PastDayNote density={density} /> : null;
    }
    return (
      <AddShiftRow
        label={t("app.build.addShiftOn", {
          day: weekday(date),
          date: dayMonth(date),
        })}
        alone={alone}
        // A week with no shifts at all says this once, at the top.
        hint={alone && rows.length > 0 ? t("app.build.noShifts") : undefined}
        density={density}
        onClick={(event) => openSheet({ kind: "add", date }, event)}
      />
    );
  };

  const renderCards = (date: string, density: CardDensity) =>
    itemsOn(date).map(({ row, gone }) =>
      gone ? (
        <RemovedShift
          key={row.id}
          id={row.id}
          shift={row.shift}
          meanwhile={goneMeanwhile.has(row.id)}
          weekday={weekday(date)}
          density={density}
          onUndo={() => undoRemove(row)}
        />
      ) : (
        <ShiftCard
          key={row.id}
          id={row.id}
          label={t("app.build.shift", {
            name: row.shift.name,
            day: weekday(date),
            date: dayMonth(date),
          })}
          shift={row.shift}
          stage={lockOf(row.shift)?.stage ?? null}
          people={row.shift.assignees.map((a) => ({
            // Someone no longer on the team, on a builder opened before, or
            // kept on a shift that has begun.
            name: nameOf.get(a.user) ?? t("app.shifts.former"),
            photo: photoOf.get(a.user) ?? null,
            former: !nameOf.has(a.user),
          }))}
          clashing={row.shift.assignees
            .filter((a) => clashes.has(`${rows.indexOf(row)}:${a.user}`))
            .map((a) => nameOf.get(a.user) ?? t("app.shifts.former"))}
          away={row.shift.assignees
            .filter((a) => awayOn(away, a.user, row.shift.day))
            .map((a) => nameOf.get(a.user) ?? t("app.shifts.former"))}
          meanwhile={row.shift.id !== undefined && marked.has(row.shift.id)}
          positions={positions}
          density={density}
          onOpen={(event) => openSheet({ kind: "shift", id: row.id }, event)}
        />
      ),
    );

  // A publish held has not gone yet: the team still sees the week as it was.
  const status = publishedMoment
    ? unsaved || holding
      ? t("app.build.unpublished")
      : t.rich("app.build.publishedAt", { ...publishedMoment, ltr })
    : unsaved
      ? t("app.build.unsaved")
      : savedMoment
        ? t.rich("app.build.savedAt", { ...savedMoment, ltr })
        : t("app.build.draft");

  /**
   * What a write refused because shifts changed meanwhile did, in words: a
   * single shift by its name and day, more by their count; then whether any
   * of the screen's own work is left to send.
   */
  function movedNotice(moved: MovedShifts) {
    const changed = moved.shifts.length;
    const gone = moved.gone.length;
    const named = (shift: Pick<ScheduledShift, "name" | "day">) => ({
      name: shift.name,
      day: weekday(shift.day),
    });
    const onlyChanged =
      changed === 1 && gone === 0 ? moved.shifts[0] : undefined;
    const onlyGone =
      changed === 0 && gone === 1
        ? removed.find((r) => goneMeanwhile.get(r.id) === moved.gone[0])?.shift
        : undefined;
    const what = onlyChanged
      ? [t("app.build.moved.changedOne", named(onlyChanged))]
      : onlyGone
        ? [t("app.build.moved.goneOne", named(onlyGone))]
        : changed > 0 && gone > 0
          ? [
              t("app.build.moved.changed", { count: changed }),
              t("app.build.moved.alsoGone", { count: gone }),
            ]
          : changed > 0
            ? [t("app.build.moved.changed", { count: changed })]
            : [t("app.build.moved.gone", { count: gone })];
    return [
      ...what,
      changedSince(read, shifts)
        ? t("app.build.moved.rest", { intent })
        : t("app.build.moved.nothingElse", {
            week: publishedMoment ? "published" : "draft",
          }),
    ].join(" ");
  }

  /**
   * Shifts that began (or ended) meanwhile, now locked as they are: one by
   * its day and start, more by their count; then whether the rest of the
   * work waits to be published, or nothing of it is left.
   */
  const lockedWords = (
    kind: "started" | "ended",
    locked: readonly Pick<ScheduledShift, "day" | "start">[],
  ): ReactNode => {
    const rest = changedSince(read, shifts) ? "waiting" : "none";
    const [one] = locked;
    if (locked.length === 1 && one) {
      return t.rich(
        kind === "started"
          ? "app.build.running.errors.shiftStarted"
          : "app.build.running.errors.shiftEnded",
        { day: weekday(one.day), time: one.start, rest, ltr },
      );
    }
    return t(
      kind === "started"
        ? "app.build.running.errors.shiftsStarted"
        : "app.build.running.errors.shiftsEnded",
      { count: locked.length, rest },
    );
  };

  /** What a refused write says, by why it was refused. */
  function failureWords(answer: ScheduleState): ReactNode {
    switch (answer.failure) {
      case undefined:
        return null;
      case "weekMoved":
        return answer.moved
          ? movedNotice(answer.moved)
          : t("app.build.errors.weekMoved");
      case "shiftStarted":
        return answer.moved
          ? lockedWords("started", answer.moved.shifts)
          : t("app.build.errors.shiftStarted");
      case "shiftEnded":
        return answer.moved
          ? lockedWords("ended", answer.moved.shifts)
          : t("app.build.running.errors.shiftEndedRefresh");
      case "past": {
        const [one] = answer.past ?? [];
        if (answer.past?.length === 1 && one) {
          return t.rich("app.build.running.errors.past", {
            day: weekday(one.day),
            time: one.start,
            ltr,
          });
        }
        return answer.past && answer.past.length > 1
          ? t("app.build.running.errors.pastMany", {
              count: answer.past.length,
            })
          : t("app.build.errors.past");
      }
      case "edgeClash": {
        // The shift of the week before or after, which this screen doesn't
        // show, named for it: its name, day and start, and its week said from
        // now. A phone shows the day of this week it meets.
        const clash = answer.edgeClash;
        if (!clash) return t("app.build.errors.edgeClashUnnamed", { intent });
        return t.rich("app.build.errors.edgeClash", {
          name: nameOf.get(clash.user) ?? t("app.shifts.former"),
          shift: clash.name,
          day: weekday(clash.day),
          time: clash.start,
          week: edgeWeek(running?.which ?? "next", clash.week),
          intent,
          ltr,
        });
      }
      case "published":
        // Someone who builds without publishing can't publish the changes
        // instead: the week is theirs only to read now.
        return t("app.build.errors.published", {
          publishes: publishes ? "yes" : "no",
        });
      case "noPublish":
        return t("app.build.errors.noPublish", {
          week: publishedMoment ? "published" : "draft",
        });
      case "weekOver":
        return (
          <>
            {t("app.build.running.errors.weekOver", { intent })}{" "}
            {answer.running ? (
              <Link
                href={`${pathname}?week=${answer.running}`}
                className="text-ink underline"
              >
                {t("app.build.running.errors.toRunning")}
              </Link>
            ) : null}
          </>
        );
      default:
        return t(`app.build.errors.${answer.failure}`);
    }
  }

  const problem: ReactNode = blocked
    ? t("app.build.errors.clash")
    : lockedBack
      ? lockedWords(lockedBack.kind, lockedBack.shifts)
      : failed || weekOver
        ? failureWords(state)
        : null;
  // Published, with nothing new to send and nothing wrong (a week that is
  // over says so): the team sees what is on the screen.
  const atRest = publishedMoment !== null && !unsaved && !busy && !problem;
  const warningId = useId();
  const leaveWarningId = useId();
  const soonId = useId();
  const leaveSoonId = useId();
  const warning =
    !weekOver && ending.length > 0
      ? t("app.build.swapsEnd", { count: ending.length })
      : null;
  // A change that touches a shift under way or starting within 12 hours:
  // whoever is on it may hear late, should their quiet hours hold the push
  // (Orel's answer 4), so the manager checks with them directly. It never
  // says whose. It stays while a publish is held, which may still be undone.
  const soon =
    now !== null &&
    !weekOver &&
    (unsaved || holding || !publishedMoment) &&
    touchesSoon(published ? read : [], shifts, now, timeZone);
  /** What the button that publishes says before it is pressed, by id. */
  const describedBy = (lines: [string, boolean][]) =>
    lines.flatMap(([id, shown]) => (shown ? [id] : [])).join(" ") || undefined;
  /** Said again in a shift's sheet, while the clock has just locked it. */
  const lockedNote = (row: ShiftRow): ReactNode =>
    lockedBack?.shifts.some(
      (shift) => shift.id !== undefined && shift.id === row.shift.id,
    )
      ? lockedWords(lockedBack.kind, [row.shift])
      : null;
  const write = weekWrite(shifts, read, basis, begun);
  // While a publish is held the clock goes on under it. A shift it changes
  // that began went back on the screen (`lockedBack`): what it holds would be
  // refused, so it goes unsent, and the rest waits with the line that says
  // why. One that only takes more people, or is as it was read, now goes
  // apart (`weekWrite`): the publish is held again as the screen now sends
  // it, in the time it has left.
  const sending = JSON.stringify(write);
  /** What the held publish sends, as it was last held. */
  const heldSending = useRef("");
  useEffect(() => {
    if (!holding) return;
    if (lockedBack) {
      dropHeld();
      return;
    }
    if (sending === heldSending.current || !form.current) return;
    heldSending.current = sending;
    const again = new FormData(form.current);
    again.set("intent", "publish");
    replaceHeld(again);
  }, [holding, lockedBack, sending, dropHeld, replaceHeld]);
  // The week on the screen counts as it stands here; the other as read.
  const segments = running
    ? running.weeks.map((option) => {
        const count =
          option.which === running.which ? gaps.shifts.length : option.gaps;
        return {
          value: option.which,
          label: t(`app.shifts.week.${option.which}`),
          badge: { count, label: t("app.build.gaps", { count }) },
        };
      })
    : null;

  return (
    <>
      {running && segments ? (
        <Segmented
          label={t("app.build.pickWeek")}
          value={running.which}
          onChange={(which) => {
            const to = running.weeks.find((option) => option.which === which);
            if (to && which !== running.which) guard.leave(to.href);
          }}
          options={segments}
          className="md:max-w-sm"
        />
      ) : null}

      {/* A week only read says why on its own card, below. One that has
          shifts on the screen now (copied, or added here) needs it no more. */}
      {initial.length === 0 && rows.length === 0 && !readOnly ? (
        <Card padding="lg" className="md:max-w-xl">
          <CardText>
            {/* The running week, drawn from the regular shifts still to
                start, may have none left: the shifts are there, the week
                is just late. */}
            {running?.which === "this" && firstBasis === null && hasPattern
              ? t("app.build.running.noneLeft")
              : manageHref
                ? t.rich("app.build.noPattern", {
                    manage: (chunks) => (
                      <Link
                        href={manageHref}
                        className="font-medium text-ink underline"
                      >
                        {chunks}
                      </Link>
                    ),
                  })
                : t("app.build.noPatternHere")}
          </CardText>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3">
        {ahead.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {gaps.people > 0 ? (
              <Badge tone="warning">
                {t("app.build.openPlaces", { count: gaps.people })}
              </Badge>
            ) : (
              <Badge tone="success">{t("app.build.full")}</Badge>
            )}
            {clashes.size > 0 ? (
              <Badge tone="danger">{t("app.build.clashBadge")}</Badge>
            ) : null}
          </div>
        ) : clashes.size > 0 ? (
          <Badge tone="danger" className="self-start">
            {t("app.build.clashBadge")}
          </Badge>
        ) : null}
        {/* Where the focus goes when the toast's "ביטול" goes with it and
            there is no publish to press again. */}
        <p
          data-builder-status
          tabIndex={-1}
          className="min-w-0 text-base text-ink-2 outline-none"
        >
          {status}
        </p>
        {/* A quiet action: publishing stays the screen's main one. */}
        {offerCopy ? (
          <Button
            variant="secondary"
            data-copy-week
            disabled={busy}
            onClick={openCopy}
            className="self-start md:ms-auto"
          >
            <CopyPlus aria-hidden="true" />
            {t("app.build.copy.action")}
          </Button>
        ) : null}
      </div>

      {readOnly ? (
        <Card padding="lg" className="md:max-w-xl">
          <CardText>{t("app.build.noPublish.published")}</CardText>
        </Card>
      ) : null}

      <PhoneWeek
        days={days}
        day={day}
        onDay={onDay}
        renderCards={renderCards}
        renderAdd={renderAdd}
      />
      <TabletWeek days={days} renderCards={renderCards} renderAdd={renderAdd} />
      <DesktopWeek
        days={days}
        renderCards={renderCards}
        renderAdd={renderAdd}
      />

      <form
        ref={form}
        action={action}
        onSubmit={(event) => {
          // Saving would fail on someone working two shifts at once.
          if (clashes.size > 0) {
            event.preventDefault();
            leaveTo.current = null;
            setBlocked(true);
            return;
          }
          sent.current = shifts;
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const pressed =
            submitter?.getAttribute("value") === "save" ? "save" : "publish";
          if (pressed === "publish") {
            changesPressed.current = publishedMoment !== null;
          }
          // What the press clears, for "ביטול" to bring back.
          const before = { dirty, lockedBack, intent };
          setIntent(pressed);
          setDirty(false);
          setLockedBack(null);
          // Changes to a published week wait for "ביטול" first: the form as
          // it stands now is held, and nothing reaches the server until the
          // wait is over. On the way out it goes at once.
          if (
            publishWaits({
              intent: pressed,
              published: publishedMoment !== null,
              leaving: leaveTo.current !== null,
            })
          ) {
            event.preventDefault();
            const held = new FormData(event.currentTarget);
            held.set("intent", pressed);
            heldSending.current = sending;
            onHold(held, () => {
              setIntent(before.intent);
              setDirty(before.dirty);
              setLockedBack(before.lockedBack);
            });
          }
        }}
      >
        <input type="hidden" name="week" value={week.start} />
        {/* What has begun goes apart: not sent, not read, and the people put
            on a shift under way as joins (20261115000300_running_week.sql). */}
        <input
          type="hidden"
          name="shifts"
          value={JSON.stringify(write.shifts)}
        />
        <input type="hidden" name="basis" value={JSON.stringify(write.basis)} />
        <input type="hidden" name="joins" value={JSON.stringify(write.joins)} />
        {/* A copy from last week was made over the week as read: a week
            saved since on another screen takes no second copy. */}
        {copied === null ? null : (
          <input type="hidden" name="copied" value={copied} />
        )}
        {/* Once published and with nothing new, there is nothing to send:
            only what went wrong, should something have. A publish held for
            its undo keeps the dock, busy, until it has gone. */}
        {atRest ? null : (
          <FloatingDock
            notice={
              problem || warning || soon || draftOnly ? (
                <div className="flex flex-col gap-2">
                  {problem ? (
                    <p
                      role="alert"
                      className="rounded-card bg-surface px-4 py-3 font-medium text-base text-danger shadow-float"
                    >
                      {problem}
                    </p>
                  ) : null}
                  {warning ? (
                    <DockLine id={warningId}>{warning}</DockLine>
                  ) : null}
                  {soon ? (
                    <DockLine id={soonId} icon="info">
                      {t("app.build.running.soon")}
                    </DockLine>
                  ) : null}
                  {draftOnly ? (
                    <DockLine icon="info">
                      {t("app.build.noPublish.draft")}
                    </DockLine>
                  ) : null}
                </div>
              ) : null
            }
          >
            {/* A draft can wait, while there is something to keep. What is
                published is what the team sees, so it is only published. A
                week that is over takes neither. Without publishing, saving
                is the screen's main action. */}
            {!weekOver && !publishedMoment && (unsaved || pending) ? (
              <DockButton
                type="submit"
                name="intent"
                value="save"
                tone={publishes ? "quiet" : "main"}
                icon={<Save aria-hidden="true" />}
                loading={pending && intent === "save"}
                disabled={pending}
              >
                {t("app.build.submit")}
              </DockButton>
            ) : null}
            {publishes && !weekOver && (!publishedMoment || unsaved || busy) ? (
              <DockButton
                type="submit"
                name="intent"
                value="publish"
                icon={<Send aria-hidden="true" className="rtl:-scale-x-100" />}
                // Held for its undo, it is on its way already.
                loading={holding || (pending && intent === "publish")}
                disabled={busy}
                aria-describedby={describedBy([
                  [warningId, warning !== null],
                  [soonId, soon],
                ])}
              >
                {publishedMoment
                  ? t("app.build.publishChanges")
                  : t("app.build.publish")}
              </DockButton>
            ) : null}
          </FloatingDock>
        )}
      </form>
      {/* Out of the form: sharing sends nothing to the server. */}
      {atRest && share ? (
        <ShareWeekButton
          shape="dock"
          {...share}
          start={week.start}
          dates={week.dates}
          kind={shareKind}
        />
      ) : null}

      <ShiftSheet
        open={sheetOpen}
        view={view}
        weekStart={week.start}
        rows={rows}
        removed={removed}
        team={team}
        people={people}
        answers={answers}
        away={away}
        positions={positions}
        lockOf={(row) => lockOf(row.shift)}
        lockedNote={lockedNote}
        readOnlyLine={readOnly ? t("app.build.noPublish.published") : null}
        clock={running?.clock ?? false}
        startsAfter={published ? now : null}
        timeZone={timeZone}
        onClose={closeSheet}
        onChange={change}
        onRemove={remove}
        onAdd={addShift}
      />

      {lastWeek ? (
        <CopyWeekSheet
          open={copyOpen && offerCopy}
          copy={sheetCopy}
          source={lastWeek}
          replace={replace}
          onReplace={setReplace}
          onCopy={applyCopy}
          onClose={closeCopy}
          nameOf={(user) => nameOf.get(user) ?? t("app.shifts.former")}
          weekday={weekday}
        />
      ) : null}

      <Sheet
        // Not while a publish is held: the way out sends it instead (above).
        open={guard.target !== null && !holding}
        onOpenChange={(next) => {
          if (!next) guard.clear();
        }}
        title={t("app.build.leave.title")}
        closeLabel={t("app.build.leave.stay")}
      >
        <div className="flex flex-col gap-3 px-2 pb-1">
          <p className="px-1 text-center text-ink-2">
            {publishedMoment
              ? t("app.build.leave.bodyPublished")
              : t("app.build.leave.body")}
          </p>
          {/* Publishing on the way out ends what it would from the dock, and
              reaches the same people as late. */}
          {publishedMoment && warning ? (
            <DockLine id={leaveWarningId} inSheet>
              {warning}
            </DockLine>
          ) : null}
          {publishedMoment && soon ? (
            <DockLine id={leaveSoonId} inSheet icon="info">
              {t("app.build.running.soon")}
            </DockLine>
          ) : null}
          <Button
            size="lg"
            onClick={saveAndLeave}
            aria-describedby={describedBy([
              [leaveWarningId, publishedMoment !== null && warning !== null],
              [leaveSoonId, publishedMoment !== null && soon],
            ])}
          >
            {publishedMoment
              ? t("app.build.leave.publish")
              : t("app.build.leave.save")}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={leaveWithoutSaving}
            className="text-danger"
          >
            {t("app.build.leave.discard")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
