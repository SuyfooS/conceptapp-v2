"use client";

import {
  type AvailabilityRange,
  dateIn,
  weekdayOf,
} from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  doubleBooked,
  type ScheduledShift,
  scheduleGaps,
  shiftCoverage,
  shiftSlot,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import type { Position } from "@domain/staffing";
import type { TeamMember } from "@domain/team";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type MouseEvent,
  type ReactNode,
  useActionState,
  useRef,
  useState,
} from "react";
import type { AvailabilityWeek } from "../week";
import type { ScheduleState } from "./actions";
import {
  AddShiftRow,
  type CardDensity,
  RemovedShift,
  ShiftCard,
} from "./shift-card";
import {
  type SheetView,
  type ShiftDetails,
  type ShiftRow,
  ShiftSheet,
} from "./shift-sheet";
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

export type ScheduleBuilderProps = {
  week: Pick<AvailabilityWeek, "start" | "dates" | "timeZone" | "shabbat">;
  /** ISO timestamp of the last save, or null while it is a draft. */
  savedAt: string | null;
  /** ISO timestamp of the last publish, or null until it is published. */
  publishedAt: string | null;
  shifts: ScheduledShift[];
  team: Pick<TeamMember, "userId" | "name">[];
  answers: { userId: string; ranges: AvailabilityRange[] }[];
  /** The business's positions (waiter, cook…); none hides the choice. */
  positions: Position[];
  /**
   * `saveScheduleAction`, or the design demo's stand-in. The form's
   * `intent` says whether to save the draft or publish.
   */
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Moves focus to the one element matching `selector` that is on the screen. */
function focusOnScreen(selector: string) {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null) {
      el.focus();
      return;
    }
  }
}

/**
 * The manager builds next week's schedule. Phone: one day at a time under the
 * week strip. Tablet: the whole week, a row per day. Desktop: the whole week, a
 * column per day. Every shift opens the same sheet, where people go on and off
 * it, and publishing floats within reach on all three.
 *
 * Nothing reaches the server until the dock's buttons send the form, and the
 * form holds only what they need: the week as it stands on the screen.
 */
export function ScheduleBuilder({
  week,
  savedAt,
  publishedAt,
  shifts: initial,
  team,
  answers,
  positions,
  save,
}: ScheduleBuilderProps) {
  const t = useTranslations();
  const router = useRouter();
  // Each shift gets an id of its own on this screen, so cards and the open
  // sheet keep their place while shifts are added and removed around them.
  const nextId = useRef(initial.length);
  const [rows, setRows] = useState<ShiftRow[]>(() =>
    initial.map((shift, id) => ({ id, shift })),
  );
  /** Shifts taken off since the last save, each with the way back. */
  const [removed, setRemoved] = useState<ShiftRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(week.dates[0] ?? week.start);
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
  /** Where to go once the save in progress has worked. */
  const leaveTo = useRef<string | null>(null);

  const [state, action, pending] = useActionState(
    async (prev: ScheduleState, data: FormData) => {
      const result = await save(prev, data);
      const target = leaveTo.current;
      leaveTo.current = null;
      if (result.savedAt) {
        setRemoved([]);
        if (target) router.push(target);
      }
      return result;
    },
    initialState,
  );

  const shifts = rows.map((r) => r.shift);
  const nameOf = new Map(
    team.map((m) => [m.userId, m.name ?? t("app.team.noName")]),
  );
  const gaps = scheduleGaps(shifts);
  const clashes = doubleBooked(week.start, shifts);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const shortDay = (date: string) =>
    t(`days.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`);

  function edited(next: ShiftRow[]) {
    setRows(next);
    setDirty(true);
    setBlocked(false);
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
    setTimeout(() => focusOnScreen(`[data-undo="${id}"]`), SHEET_CLOSES_MS);
  }

  function undoRemove(row: ShiftRow) {
    setRemoved(removed.filter((r) => r.id !== row.id));
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
    opener.current = event.currentTarget;
    setView(next);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    const back = opener.current;
    // The sheet takes focus with it; give it back where the person was.
    if (back) setTimeout(() => back.focus(), SHEET_CLOSES_MS);
  }

  const moment = (iso: string | null | undefined) =>
    iso
      ? {
          date: dayMonth(dateIn(new Date(iso), week.timeZone)),
          time: timeIn(new Date(iso), week.timeZone),
        }
      : null;
  const savedMoment = moment(savedAt);
  // The design demo stores nothing, so its publish shows through `state`.
  const publishedMoment = moment(
    publishedAt ?? (state.published ? state.savedAt : null),
  );
  const done = !dirty && !pending;
  // A failed save leaves the work where it was: on the screen only.
  const failed = done && state.failure !== undefined;
  const unsaved = dirty || failed;

  const guard = useLeaveGuard(unsaved || pending);

  function saveAndLeave() {
    leaveTo.current = guard.target;
    guard.clear();
    const button = form.current?.querySelector<HTMLButtonElement>(
      publishedMoment ? 'button[value="publish"]' : 'button[value="save"]',
    );
    // A save already on its way goes on to the same place when it is done.
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

  const days: DayInfo[] = week.dates.map((date) => {
    const onDay = shifts.filter((s) => s.day === date);
    const { filled, needed } = shiftCoverage(onDay);
    const shabbat = week.shabbat;
    const candles = shabbat?.friday === date;
    const havdalah = shabbat?.saturday === date;
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
    };
  });

  const renderAdd = (date: string, density: CardDensity) => {
    const alone = itemsOn(date).length === 0;
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
          names={row.shift.assignees.map(
            (a) => nameOf.get(a.user) ?? t("app.team.noName"),
          )}
          clashing={row.shift.assignees
            .filter((a) => clashes.has(`${rows.indexOf(row)}:${a.user}`))
            .map((a) => nameOf.get(a.user) ?? t("app.team.noName"))}
          positions={positions}
          density={density}
          onOpen={(event) => openSheet({ kind: "shift", id: row.id }, event)}
        />
      ),
    );

  const status = publishedMoment
    ? unsaved
      ? t("app.build.unpublished")
      : t.rich("app.build.publishedAt", { ...publishedMoment, ltr })
    : unsaved
      ? t("app.build.unsaved")
      : savedMoment
        ? t.rich("app.build.savedAt", { ...savedMoment, ltr })
        : t("app.build.draft");

  const problem = blocked
    ? t("app.build.errors.clash")
    : failed && state.failure
      ? t(`app.build.errors.${state.failure}`)
      : null;

  return (
    <div className="flex flex-col gap-5 pb-20 xl:pb-16">
      {initial.length === 0 ? (
        <Card padding="lg" className="md:max-w-xl">
          <CardText>{t("app.build.noPattern")}</CardText>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3">
        {shifts.length > 0 ? (
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
        ) : null}
        <p className="min-w-0 text-base text-ink-2">{status}</p>
      </div>

      <PhoneWeek
        days={days}
        day={day}
        onDay={setDay}
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
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          setIntent(
            submitter?.getAttribute("value") === "save" ? "save" : "publish",
          );
          setDirty(false);
        }}
      >
        <input type="hidden" name="week" value={week.start} />
        <input type="hidden" name="shifts" value={JSON.stringify(shifts)} />
        {/* Once published and with nothing new, there is nothing to send. */}
        {publishedMoment && !unsaved && !pending ? null : (
          <FloatingDock
            notice={
              problem ? (
                <p
                  role="alert"
                  className="rounded-card bg-surface px-4 py-3 font-medium text-base text-danger shadow-float"
                >
                  {problem}
                </p>
              ) : null
            }
          >
            {/* A draft can wait, while there is something to keep. What is
                published is what the team sees, so it is only published. */}
            {!publishedMoment && (unsaved || pending) ? (
              <DockButton
                type="submit"
                name="intent"
                value="save"
                tone="quiet"
                icon={<Save aria-hidden="true" />}
                loading={pending && intent === "save"}
                disabled={pending}
              >
                {t("app.build.submit")}
              </DockButton>
            ) : null}
            <DockButton
              type="submit"
              name="intent"
              value="publish"
              icon={<Send aria-hidden="true" className="rtl:-scale-x-100" />}
              loading={pending && intent === "publish"}
              disabled={pending}
            >
              {publishedMoment
                ? t("app.build.publishChanges")
                : t("app.build.publish")}
            </DockButton>
          </FloatingDock>
        )}
      </form>

      <StatusToast
        message={
          state.savedAt && done
            ? state.published
              ? t("app.build.published")
              : t("app.build.saved")
            : null
        }
        stamp={state.savedAt}
      />

      <ShiftSheet
        open={sheetOpen}
        view={view}
        weekStart={week.start}
        rows={rows}
        removed={removed}
        team={team}
        answers={answers}
        positions={positions}
        onClose={closeSheet}
        onChange={change}
        onRemove={remove}
        onAdd={addShift}
      />

      <Sheet
        open={guard.target !== null}
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
          <Button size="lg" onClick={saveAndLeave}>
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
    </div>
  );
}
