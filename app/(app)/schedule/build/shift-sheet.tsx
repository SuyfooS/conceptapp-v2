"use client";

import { type AvailabilityRange, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
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
} from "@domain/schedule";
import type { Position } from "@domain/staffing";
import type { TeamMember } from "@domain/team";
import { Avatar } from "@ui/avatar";
import { ChoiceMenu } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { FieldRow, rowInputClass, rowPillInputClass } from "@ui/field-row";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { Stepper } from "@ui/stepper";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useId, useState } from "react";

export type ShiftRow = { id: number; shift: ScheduledShift };

/** What the sheet shows: one shift, or a new shift for a day. */
export type SheetView =
  | { kind: "shift"; id: number }
  | { kind: "add"; date: string };

export type ShiftDetails = Pick<
  ScheduledShift,
  "name" | "start" | "end" | "needed"
>;

type TeamPerson = Pick<TeamMember, "userId" | "name" | "photo">;
type Answer = { userId: string; ranges: AvailabilityRange[] };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The people who can be added, in the order they are shown. */
const GROUPS = ["available", "noAnswer", "unavailable", "busy"] as const;

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
 * screen's own buttons. One sheet for all three layouts.
 */
export function ShiftSheet({
  open,
  view,
  weekStart,
  rows,
  removed,
  team,
  answers,
  positions,
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
  team: TeamPerson[];
  answers: Answer[];
  positions: Position[];
  onClose: () => void;
  onChange: (id: number, shift: ScheduledShift) => void;
  onRemove: (id: number) => void;
  onAdd: (date: string, details: ShiftDetails) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("app.build");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [problem, setProblem] = useState<ShiftDetailsProblem | null>(null);
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
    const found = shiftDetailsProblem(details);
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
      <div className="flex flex-col">
        <EditDetails
          key={row.id}
          shift={shift}
          onChange={(details) => onChange(row.id, { ...shift, ...details })}
          onRemove={() => onRemove(row.id)}
        />
        <ShiftPeople
          weekStart={weekStart}
          shifts={context.map((r) => r.shift)}
          index={context.indexOf(row)}
          team={team}
          answers={answers}
          positions={positions}
          onChange={(next) => onChange(row.id, next)}
        />
      </div>
    </Sheet>
  );
}

function SheetSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would style and announce these rows as a form
    <div role="group" aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className="px-3 pt-3 pb-1.5 font-semibold text-ink-2 text-sm">
        {title}
      </h3>
      <ListGroup className="bg-elevated shadow-none">{children}</ListGroup>
    </div>
  );
}

/** Who is on the shift, then everyone who could be, those available first. */
function ShiftPeople({
  weekStart,
  shifts,
  index,
  team,
  answers,
  positions,
  onChange,
}: {
  weekStart: string;
  shifts: ScheduledShift[];
  index: number;
  team: TeamPerson[];
  answers: Answer[];
  positions: Position[];
  onChange: (shift: ScheduledShift) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("app.build");
  const shift = shifts[index];
  if (!shift) return null;

  const noName = t("app.team.noName");
  const nameOf = new Map(team.map((m) => [m.userId, m.name ?? noName]));
  const photoOf = new Map(team.map((m) => [m.userId, m.photo]));
  const rangesOf = new Map(answers.map((a) => [a.userId, a.ranges]));
  const clashes = doubleBooked(weekStart, shifts);
  const candidates = shiftCandidates(weekStart, shifts, index, team, answers);
  const byState = (state: CandidateState) =>
    candidates.filter((c) => c.state === state);
  const weekday = (date: string) =>
    t(`app.availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  const hours = (from: string, to: string) =>
    tb.rich("time", { start: from, end: to, ltr });

  const noteOf = (userId: string) => {
    if (clashes.has(`${index}:${userId}`)) return "busy" as const;
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
      <SheetSection title={tb("groups.assigned")}>
        {shift.assignees.length === 0 ? (
          <ListRow title={tb("nobody")} />
        ) : (
          shift.assignees.map(({ user, position }) => {
            const name = nameOf.get(user) ?? noName;
            const note = noteOf(user);
            const positionName =
              positions.find((p) => p.key === position)?.name ??
              tb("noPosition");
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
                      {positions.length > 0 ? (
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
                  <IconButton
                    label={tb("remove", { name })}
                    icon={<X />}
                    className="-me-2"
                    onClick={() =>
                      onChange({
                        ...shift,
                        assignees: shift.assignees.filter(
                          (a) => a.user !== user,
                        ),
                      })
                    }
                  />
                }
              />
            );
          })
        )}
      </SheetSection>
      {GROUPS.map((group) => {
        const people = byState(group);
        if (people.length === 0) return null;
        return (
          <SheetSection key={group} title={tb(`groups.${group}`)}>
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
                      <IconButton
                        label={tb("addPerson", { name })}
                        icon={<Plus />}
                        className="-me-2 text-accent"
                        onClick={() =>
                          onChange({
                            ...shift,
                            assignees: [
                              ...shift.assignees,
                              { user: member.userId, position: null },
                            ],
                          })
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
 * The shift's own details, folded away under one clear row at the top, since
 * most visits are about people. A valid change applies straight away, so the
 * lists under it follow new hours as they are typed.
 */
function EditDetails({
  shift,
  onChange,
  onRemove,
}: {
  shift: ScheduledShift;
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
  const [problem, setProblem] = useState<ShiftDetailsProblem | null>(null);

  function update(next: Draft) {
    setDraft(next);
    const details = detailsOf(next);
    const found = shiftDetailsProblem(details);
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
  problem: ShiftDetailsProblem | null;
  onChange: (draft: Draft) => void;
  /** Enter in a field, where the sheet has an action to take. */
  onEnter?: () => void;
}) {
  const t = useTranslations("app.build.editor");
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = (field: ShiftDetailsProblem) =>
    problem === field || (field === "time" && problem === "same")
      ? ({ "aria-invalid": true, "aria-describedby": errorId } as const)
      : {};
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
