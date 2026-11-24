"use client";

import { type AwaySpan, awayOn } from "@domain/absences";
import { type AvailabilityRange, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { formArg } from "@domain/profile";
import {
  availableFor,
  type CandidateState,
  doubleBooked,
  overlappingShift,
  rangesOn,
  type ScheduledShift,
  type ShiftDetailsProblem,
  shiftCandidates,
  shiftDetailsProblem,
  shiftStarted,
} from "@domain/schedule";
import type { Position } from "@domain/staffing";
import type { TeamMember } from "@domain/team";
import { announce } from "@ui/announcer";
import { Avatar } from "@ui/avatar";
import { ChoiceMenu } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { FieldRow, rowInputClass, rowPillInputClass } from "@ui/field-row";
import type { FocusCandidate } from "@ui/focus-after";
import { IconButton, type IconButtonProps } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { useFocusWhenGone } from "@ui/use-focus-after";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { afterPerson, type PeopleList } from "./builder-focus";
import { SheetSection } from "./sheet-section";

export type ShiftRow = { id: number; shift: ScheduledShift };

/** What the sheet shows: one shift, or a new shift for a day. */
export type SheetView =
  | { kind: "shift"; id: number }
  | { kind: "add"; date: string };

export type ShiftDetails = Pick<
  ScheduledShift,
  "name" | "start" | "end" | "needed"
>;

/**
 * A shift of a published week that has begun, as the sheet shows it: under
 * way ("now"), when it only takes more people, or over, when it only says so;
 * with how it was read, whose people stay on it.
 */
export type LockedShift = { stage: "now" | "over"; read: ScheduledShift };

/**
 * What is wrong with a shift's details as typed: the details themselves, or,
 * in a published week, a new shift (`past`) or one moved (`pastMoved`)
 * that would start at or before now.
 */
type FieldsProblem = ShiftDetailsProblem | "past" | "pastMoved";

/** Someone on the team, with how the app writes about them when known. */
type TeamPerson = Pick<TeamMember, "userId" | "name" | "photo"> &
  Partial<Pick<TeamMember, "addressForm">>;
type Answer = { userId: string; ranges: AvailabilityRange[] };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The people who can be added, in the order they are shown. */
const GROUPS = [
  "available",
  "noAnswer",
  "unavailable",
  "away",
  "busy",
] as const satisfies readonly PeopleList[];

/** The lists shown after one of those: the next ones, then who is on it. */
const listsAfter = (group: (typeof GROUPS)[number]): PeopleList[] => [
  ...GROUPS.slice(GROUPS.indexOf(group) + 1),
  "assigned",
];

type Draft = { name: string; start: string; end: string; needed: string };

const EMPTY_DRAFT: Draft = { name: "", start: "", end: "", needed: "1" };

const detailsOf = (draft: Draft): ShiftDetails => ({
  name: draft.name.trim(),
  start: draft.start,
  end: draft.end,
  needed: Number(draft.needed),
});

/**
 * The sheet of the "build the week" screen: who is on a shift and who could
 * be, the shift's own details, and adding a new shift. Everything in it
 * changes the schedule on the screen straight away; saving stays with the
 * screen's own buttons. One sheet for all three layouts. In a published
 * week, a shift that is over only says so, with its people, and one under
 * way only takes more people; a new shift, or new hours, start after now.
 */
export function ShiftSheet({
  open,
  view,
  weekStart,
  rows,
  removed,
  team,
  people = team,
  answers,
  away = [],
  positions,
  lockOf = () => null,
  lockedNote = () => null,
  readOnlyLine = null,
  clock = false,
  startsAfter = null,
  timeZone,
  onClose,
  onChange,
  onRemove,
  onAdd,
}: {
  open: boolean;
  view: SheetView;
  weekStart: string;
  rows: ShiftRow[];
  removed: ShiftRow[];
  /** The staff, who can be put on a shift. */
  team: TeamPerson[];
  /**
   * Everyone on the team, for the names of those on a shift: someone missing
   * here is no longer on the team. The staff, unless said otherwise.
   */
  people?: TeamPerson[];
  answers: Answer[];
  /** Who is away this week, and when (known issue 19): never why. */
  away?: AwaySpan[];
  positions: Position[];
  /** Whether a shift has begun in a published week, and how it was read. */
  lockOf?: (row: ShiftRow) => LockedShift | null;
  /**
   * Why a shift locked as the screen's clock reached it, with its changes put
   * back, while that is still said (null otherwise): the sheet says it too,
   * since it covers the dock's own line.
   */
  lockedNote?: (row: ShiftRow) => ReactNode;
  /**
   * The week is only read here (published, by someone who builds it without
   * publishing it: the roles plan's R3): this line says why, in place of the
   * shift's own changes, with its people as they are. Null otherwise.
   */
  readOnlyLine?: ReactNode;
  /** The time clock is on: a shift that is over has its hours kept there. */
  clock?: boolean;
  /**
   * In a published week, the moment a new shift or new hours must start
   * after; null in a week that is free.
   */
  startsAfter?: Date | null;
  timeZone: string;
  onClose: () => void;
  onChange: (id: number, shift: ScheduledShift) => void;
  onRemove: (id: number) => void;
  onAdd: (date: string, details: ShiftDetails) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("app.build");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [problem, setProblem] = useState<FieldsProblem | null>(null);
  // Each opening of "add a shift" starts empty.
  const [draftFor, setDraftFor] = useState(view);
  if (draftFor !== view) {
    setDraftFor(view);
    setDraft(EMPTY_DRAFT);
    setProblem(null);
  }

  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

  function add() {
    if (view.kind !== "add") return;
    const details = detailsOf(draft);
    const found =
      shiftDetailsProblem(details) ??
      (startsAfter &&
      shiftStarted(
        { day: view.date, start: details.start },
        startsAfter,
        timeZone,
      )
        ? "past"
        : null);
    setProblem(found);
    if (!found) onAdd(view.date, details);
  }

  const common = {
    open,
    onOpenChange: (next: boolean) => {
      if (!next) onClose();
    },
    closeLabel: tb("close"),
  };

  if (view.kind === "add") {
    return (
      <Sheet
        {...common}
        title={tb("addShift")}
        subtitle={tb("day", {
          day: weekday(view.date),
          date: dayMonth(view.date),
        })}
        action={{ label: tb("editor.add"), onClick: add }}
      >
        <ShiftFields
          draft={draft}
          problem={problem}
          onChange={setDraft}
          onEnter={add}
        />
      </Sheet>
    );
  }

  // A removed shift keeps its place in the list while the sheet slides away.
  const row =
    rows.find((r) => r.id === view.id) ?? removed.find((r) => r.id === view.id);
  if (!row) return null;
  const context = rows.includes(row) ? rows : [...rows, row];
  const { shift } = row;
  const locked = lockOf(row);
  const note = locked ? lockedNote(row) : null;
  const onShift = (
    fixed: ReadonlySet<string>,
    readOnly: boolean,
    over = readOnly,
  ) => (
    <ShiftPeople
      weekStart={weekStart}
      shifts={context.map((r) => r.shift)}
      index={context.indexOf(row)}
      team={team}
      people={people}
      answers={answers}
      away={away}
      positions={positions}
      fixed={fixed}
      readOnly={readOnly}
      over={over}
      onChange={(next) => onChange(row.id, next)}
    />
  );

  return (
    <Sheet
      {...common}
      title={tb("sheetTitle", {
        name: shift.name,
        day: weekday(shift.day),
        date: dayMonth(shift.day),
      })}
      subtitle={tb.rich("sheetSubtitle", {
        assigned: shift.assignees.length,
        needed: shift.needed,
        start: shift.start,
        end: shift.end,
        ltr,
      })}
      action={{ label: tb("done"), onClick: onClose }}
    >
      {readOnlyLine ? (
        // Read only: who is on it, as they are, and why nothing changes.
        <div className="flex flex-col">
          <p className="px-3 pt-1 pb-2 text-base text-ink-2">{readOnlyLine}</p>
          {onShift(new Set(shift.assignees.map((a) => a.user)), true, false)}
        </div>
      ) : locked ? (
        // Begun: who is on it stays. Over, nobody joins; under way, people
        // do, and nothing else changes.
        <div className="flex flex-col">
          {note ? <LockedNotice>{note}</LockedNotice> : null}
          <p className="px-3 pt-1 pb-2 text-base text-ink-2">
            {locked.stage === "over"
              ? clock
                ? `${tb("running.overLine")} ${tb("running.clockLine")}`
                : tb("running.overLine")
              : tb.rich("running.begunLine", {
                  time: locked.read.start,
                  ltr,
                })}
          </p>
          {onShift(
            new Set(locked.read.assignees.map((a) => a.user)),
            locked.stage === "over",
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          <EditDetails
            key={row.id}
            shift={shift}
            startsAfter={startsAfter}
            timeZone={timeZone}
            onChange={(details) => onChange(row.id, { ...shift, ...details })}
            onRemove={() => onRemove(row.id)}
          />
          {onShift(new Set(), false)}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Why the open shift locked as the clock reached it, its changes put back:
 * said in the sheet, which covers the dock's own line. The details, and the
 * field that had focus, go as it locks, so focus comes here rather than being
 * lost; when focus is still somewhere in the sheet, it stays there.
 */
function LockedNotice({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (
      active === null ||
      active === document.body ||
      active.getAttribute("role") === "dialog"
    ) {
      ref.current?.focus();
    }
  }, []);
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className="mb-2 rounded-card bg-elevated px-4 py-3 font-medium text-base text-ink shadow-card outline-none"
    >
      {children}
    </p>
  );
}

/**
 * Who is on the shift, then everyone who could be, those available first.
 * On a shift that has begun, those already on it (`fixed`) stay as they
 * are, in their positions; on one that is over (`readOnly`) nobody else is
 * offered, and so on one only read (`over` false: nobody on it is said as of
 * now, not as of a shift gone by).
 */
function ShiftPeople({
  weekStart,
  shifts,
  index,
  team,
  people,
  answers,
  away,
  positions,
  fixed,
  readOnly,
  over = readOnly,
  onChange,
}: {
  weekStart: string;
  shifts: ScheduledShift[];
  index: number;
  /** The staff: who could be on the shift. */
  team: TeamPerson[];
  /** Everyone on the team: the names of who is on it. */
  people: TeamPerson[];
  answers: Answer[];
  away: AwaySpan[];
  positions: Position[];
  fixed: ReadonlySet<string>;
  readOnly: boolean;
  /** The shift is over: who was on it is said as of then. */
  over?: boolean;
  onChange: (shift: ScheduledShift) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("app.build");
  const locale = useLocale();
  const shift = shifts[index];
  if (!shift) return null;

  const noName = t("app.team.noName");
  const nameOf = new Map(people.map((m) => [m.userId, m.name ?? noName]));
  const photoOf = new Map(people.map((m) => [m.userId, m.photo]));
  // How the app writes about each, from the staff, who carry it.
  const formOf = new Map(
    [...people, ...team].map((m) => [m.userId, m.addressForm ?? null]),
  );
  const onIt = shift.assignees.map((a) => a.user);

  /**
   * Says what a press of "+" or "×" did, and how many are on the shift now:
   * the row and its button went with the person, and nothing else on the
   * sheet says it as it happens.
   */
  const say = (
    key: "added" | "removed",
    user: string,
    name: string,
    assigned: number,
  ) =>
    announce(
      tb(key, {
        name,
        form: formArg(formOf.get(user)),
        assigned,
        needed: shift.needed,
      }),
      { lang: locale },
    );
  const rangesOf = new Map(answers.map((a) => [a.userId, a.ranges]));
  const clashes = doubleBooked(weekStart, shifts);
  const candidates = shiftCandidates(
    weekStart,
    shifts,
    index,
    team,
    answers,
    away,
  );
  const byState = (state: CandidateState) =>
    candidates.filter((c) => c.state === state);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const hours = (from: string, to: string) =>
    tb.rich("time", { start: from, end: to, ltr });

  const noteOf = (userId: string) => {
    if (clashes.has(`${index}:${userId}`)) return "busy" as const;
    if (awayOn(away, userId, shift.day)) return "away" as const;
    const ranges = rangesOf.get(userId);
    if (!ranges) return "noAnswer" as const;
    return availableFor(shift, ranges) ? null : ("unavailable" as const);
  };

  /** Their availability that day, in their own words. */
  const availability = (userId: string): ReactNode => {
    const ranges = rangesOn(rangesOf.get(userId) ?? [], shift.day);
    if (ranges.length === 0) return tb("notes.noDay");
    return ranges.map((range, i) => (
      <Fragment key={`${range.start}-${range.end}`}>
        {i > 0 ? ", " : null}
        {hours(range.start, range.end)}
      </Fragment>
    ));
  };

  /** A shift they already work that day, when it does not get in the way. */
  const alsoOn = (userId: string) =>
    shifts.find(
      (other, i) =>
        i !== index &&
        other.day === shift.day &&
        other.assignees.some((a) => a.user === userId),
    );

  const subtitleOf = (group: (typeof GROUPS)[number], userId: string) => {
    if (group === "busy") {
      const other = overlappingShift(weekStart, shifts, index, userId);
      if (!other) return null;
      return other.day === shift.day
        ? tb.rich("busyOn", {
            name: other.name,
            start: other.start,
            end: other.end,
            ltr,
          })
        : tb.rich("busyOnDay", {
            name: other.name,
            day: weekday(other.day),
            start: other.start,
            end: other.end,
            ltr,
          });
    }
    const other = alsoOn(userId);
    const also = other ? tb("alsoOn", { name: other.name }) : null;
    if (group === "noAnswer") return also;
    return (
      <>
        {availability(userId)}
        {also ? ` · ${also}` : null}
      </>
    );
  };

  return (
    <>
      <SheetSection title={tb("groups.assigned")} mark="assigned">
        {shift.assignees.length === 0 ? (
          <ListRow title={over ? tb("running.nobodyPast") : tb("nobody")} />
        ) : (
          shift.assignees.map(({ user, position }) => {
            // Someone no longer on the team, on a builder opened before, or
            // kept on a shift that has begun.
            const name = nameOf.get(user) ?? t("app.shifts.former");
            const note = readOnly ? null : noteOf(user);
            const positionName =
              positions.find((p) => p.key === position)?.name ??
              tb("noPosition");
            const stays = readOnly || fixed.has(user);
            return (
              <ListRow
                key={user}
                leading={
                  <Avatar name={name} photo={photoOf.get(user) ?? null} />
                }
                title={name}
                subtitle={
                  positions.length > 0 || note ? (
                    <span className="flex flex-wrap items-center gap-x-1.5">
                      {positions.length > 0 && stays ? (
                        <span>{positionName}</span>
                      ) : positions.length > 0 ? (
                        <ChoiceMenu
                          label={tb("position", {
                            name,
                            position: positionName,
                          })}
                          value={position ?? ""}
                          options={[
                            { key: "", label: tb("noPosition") },
                            ...positions.map((p) => ({
                              key: p.key,
                              label: p.name,
                            })),
                          ]}
                          onChange={(key) =>
                            onChange({
                              ...shift,
                              assignees: shift.assignees.map((a) =>
                                a.user === user
                                  ? { ...a, position: key || null }
                                  : a,
                              ),
                            })
                          }
                          className="-my-3"
                        />
                      ) : null}
                      {note ? (
                        <span
                          className={
                            note === "busy" ? "text-danger" : "text-warning"
                          }
                        >
                          {tb(`notes.${note}`)}
                        </span>
                      ) : null}
                    </span>
                  ) : null
                }
                trailing={
                  stays ? null : (
                    <PersonButton
                      label={tb("remove", { name })}
                      icon={<X />}
                      className="-me-2"
                      data-remove-person={user}
                      onClick={() => {
                        onChange({
                          ...shift,
                          assignees: shift.assignees.filter(
                            (a) => a.user !== user,
                          ),
                        });
                        say("removed", user, name, onIt.length - 1);
                      }}
                      // The next one's "×", else the list's heading.
                      focusAfter={() =>
                        afterPerson("remove", onIt, user, "assigned")
                      }
                    />
                  )
                }
              />
            );
          })
        )}
      </SheetSection>
      {GROUPS.map((group) => {
        const people = readOnly ? [] : byState(group);
        if (people.length === 0) return null;
        const inGroup = people.map(({ member }) => member.userId);
        return (
          <SheetSection key={group} title={tb(`groups.${group}`)} mark={group}>
            {people.map(({ member }) => {
              const name = member.name ?? noName;
              return (
                <ListRow
                  key={member.userId}
                  leading={
                    <Avatar
                      name={name}
                      className={group === "busy" ? "opacity-60" : undefined}
                    />
                  }
                  title={
                    <span
                      className={group === "busy" ? "text-ink-2" : undefined}
                    >
                      {name}
                    </span>
                  }
                  subtitle={subtitleOf(group, member.userId)}
                  trailing={
                    group === "busy" ? null : (
                      <PersonButton
                        label={tb("addPerson", { name })}
                        icon={<Plus />}
                        className="-me-2 text-accent"
                        data-add-person={member.userId}
                        onClick={() => {
                          onChange({
                            ...shift,
                            assignees: [
                              ...shift.assignees,
                              { user: member.userId, position: null },
                            ],
                          });
                          say("added", member.userId, name, onIt.length + 1);
                        }}
                        // The next one's "+" in the list, else its heading,
                        // else (the list left empty) the next list's.
                        focusAfter={() =>
                          afterPerson(
                            "add",
                            inGroup,
                            member.userId,
                            group,
                            listsAfter(group),
                          )
                        }
                      />
                    )
                  }
                />
              );
            })}
          </SheetSection>
        );
      })}
    </>
  );
}

/**
 * A person's "+" or "×" in the sheet. It goes with their row as they go on or
 * off the shift (they show in another list then), so the focus it had would
 * fall to the sheet's frame, and a screen reader would start again at its
 * top: it goes where `focusAfter` says instead (`useFocusWhenGone`), once the
 * sheet is drawn again. Escape with the focus here closes the sheet, which
 * gives the focus back to the shift's card itself.
 */
function PersonButton({
  focusAfter,
  ...props
}: IconButtonProps & { focusAfter: () => readonly FocusCandidate[] }) {
  const button = useRef<HTMLButtonElement>(null);
  useFocusWhenGone(button, focusAfter);
  return <IconButton ref={button} {...props} />;
}

/**
 * The shift's own details, folded away under one clear row at the top, since
 * most visits are about people. A valid change applies straight away, so the
 * lists under it follow new hours as they are typed.
 */
function EditDetails({
  shift,
  startsAfter,
  timeZone,
  onChange,
  onRemove,
}: {
  shift: ScheduledShift;
  /** In a published week: new hours start after this moment. */
  startsAfter: Date | null;
  timeZone: string;
  onChange: (details: ShiftDetails) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.build");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    name: shift.name,
    start: shift.start,
    end: shift.end,
    needed: String(shift.needed),
  }));
  const [problem, setProblem] = useState<FieldsProblem | null>(null);

  function update(next: Draft) {
    setDraft(next);
    const details = detailsOf(next);
    const found =
      shiftDetailsProblem(details) ??
      (startsAfter &&
      shiftStarted(
        { day: shift.day, start: details.start },
        startsAfter,
        timeZone,
      )
        ? "pastMoved"
        : null);
    setProblem(found);
    if (!found) onChange(details);
  }

  return (
    <div className="flex flex-col">
      <ListGroup className="bg-elevated shadow-none">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5">
            <Pencil aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">
              {t("edit", { name: shift.name })}
            </span>
            <span className="text-ink-2 text-sm">{t("editHint")}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-5 shrink-0 text-ink-2 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </ListGroup>
      {open ? (
        <div className="flex flex-col gap-3 pt-2">
          <ShiftFields draft={draft} problem={problem} onChange={update} />
          <ListGroup className="bg-elevated shadow-none">
            <button
              type="button"
              onClick={onRemove}
              className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 px-4 font-medium text-danger transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&_svg]:size-5"
            >
              <Trash2 aria-hidden="true" />
              {t("editor.delete")}
            </button>
          </ListGroup>
        </div>
      ) : null}
    </div>
  );
}

/** A shift's name, hours and people needed, as one grouped list. */
function ShiftFields({
  draft,
  problem,
  onChange,
  onEnter,
}: {
  draft: Draft;
  problem: FieldsProblem | null;
  onChange: (draft: Draft) => void;
  /** Enter in a field, where the sheet has an action to take. */
  onEnter?: () => void;
}) {
  const t = useTranslations("app.build.editor");
  const id = useId();
  const errorId = `${id}-error`;
  const marked = { "aria-invalid": true, "aria-describedby": errorId } as const;
  const invalid = (field: ShiftDetailsProblem) =>
    problem === field || (field === "time" && problem === "same") ? marked : {};
  // A start at or before now is the start's alone.
  const late = problem === "past" || problem === "pastMoved" ? marked : {};
  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter" && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <ListGroup className="bg-elevated shadow-none">
        <FieldRow label={t("name")} htmlFor={`${id}-name`}>
          <input
            id={`${id}-name`}
            value={draft.name}
            maxLength={40}
            placeholder={t("namePlaceholder")}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            onKeyDown={onKeyDown}
            className={rowInputClass}
            {...invalid("name")}
          />
        </FieldRow>
        <FieldRow label={t("start")} htmlFor={`${id}-start`}>
          <input
            id={`${id}-start`}
            type="time"
            dir="ltr"
            value={draft.start}
            onChange={(event) =>
              onChange({ ...draft, start: event.target.value })
            }
            onKeyDown={onKeyDown}
            className={rowPillInputClass}
            {...invalid("time")}
            {...late}
          />
        </FieldRow>
        <FieldRow label={t("end")} htmlFor={`${id}-end`}>
          <input
            id={`${id}-end`}
            type="time"
            dir="ltr"
            value={draft.end}
            onChange={(event) =>
              onChange({ ...draft, end: event.target.value })
            }
            onKeyDown={onKeyDown}
            className={rowPillInputClass}
            {...invalid("time")}
          />
        </FieldRow>
        <FieldRow label={t("needed")} htmlFor={`${id}-needed`}>
          <Stepper
            id={`${id}-needed`}
            value={draft.needed}
            onValueChange={(needed) => onChange({ ...draft, needed })}
            min={1}
            max={50}
            decreaseLabel={t("fewer")}
            increaseLabel={t("more")}
            invalid={problem === "needed"}
            describedBy={problem === "needed" ? errorId : undefined}
            onKeyDown={onKeyDown}
          />
        </FieldRow>
      </ListGroup>
      {problem ? (
        <p id={errorId} role="alert" className="px-3 text-danger text-sm">
          {t(`problems.${problem}`)}
        </p>
      ) : null}
      <p className="px-3 text-ink-2 text-sm">{t("night")}</p>
    </div>
  );
}
