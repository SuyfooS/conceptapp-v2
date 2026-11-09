"use client";

import { shortNames } from "@domain/people";
import {
  positionCounts,
  type ScheduledShift,
  stillNeeded,
} from "@domain/schedule";
import type { Position } from "@domain/staffing";
import { type AvatarPerson, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { CoverageBar } from "@ui/coverage-bar";
import { IconButton } from "@ui/icon-button";
import { ChevronRight, Plus, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";

/**
 * How much room a card has: a whole phone's width, a cell of the tablet's
 * grid, or a column of the desktop's week.
 */
export type CardDensity = "full" | "tile" | "column";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const pressClass =
  "pressable focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * One shift at a glance: its name and hours, how full it is, who is on it and
 * what is missing. Tapping it opens the shift's sheet. The hidden line gives
 * the whole picture to a screen reader, with the day the card cannot show.
 */
export function ShiftCard({
  id,
  label,
  shift,
  people,
  clashing,
  positions,
  density,
  onOpen,
}: {
  id: number;
  label: string;
  shift: ScheduledShift;
  /** Who is on the shift, as their names read everywhere, with their photos. */
  people: AvatarPerson[];
  /** Those of them who are on another shift at the same time. */
  clashing: string[];
  positions: Position[];
  density: CardDensity;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations("app.build");
  const names = people.map((p) => p.name);
  const missing = stillNeeded(shift);
  const full = density === "full";
  const column = density === "column";
  const inPositions = positionCounts(shift, positions);
  const status =
    missing > 0 ? (
      <Badge tone="warning">{t("missing", { count: missing })}</Badge>
    ) : (
      <Badge tone="success">{t("staffed")}</Badge>
    );

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-shift-card={id}
      onClick={onOpen}
      className={cn(
        pressClass,
        "flex w-full min-w-0 flex-col items-stretch bg-surface text-start shadow-card",
        full ? "rounded-[28px] p-4" : "rounded-card p-3",
        // Most cards line up across the week's columns.
        column && "min-h-[13.75rem]",
      )}
    >
      <span className="sr-only">
        {label}.{" "}
        {t("people", {
          assigned: shift.assignees.length,
          needed: shift.needed,
        })}
        .{" "}
      </span>
      <span className="flex items-start justify-between gap-x-2.5">
        <span className="min-w-0">
          <span className={cn("block font-bold", full ? "text-lg" : "text-md")}>
            {shift.name}
          </span>
          <span
            className={cn("block text-ink-2", full ? "text-base" : "text-sm")}
          >
            {t.rich("time", { start: shift.start, end: shift.end, ltr })}
          </span>
        </span>
        {column ? null : status}
      </span>
      <CoverageBar
        filled={shift.assignees.length}
        total={shift.needed}
        className={full ? "my-3.5" : "my-2.5"}
      />
      {column ? <span className="mb-2.5 flex">{status}</span> : null}
      <span
        className={cn(
          "flex gap-2.5",
          column ? "flex-col items-start gap-1.5" : "min-h-8 items-center",
        )}
      >
        {names.length > 0 || missing > 0 ? (
          <span className="flex shrink-0">
            <AvatarStack people={people} max={column ? 3 : 4} />
            {missing > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 place-items-center rounded-full bg-surface text-ink-2 shadow-[inset_0_0_0_1.5px_var(--ink-2)] [&_svg]:size-4",
                  names.length > 0 && "-ms-[7px]",
                )}
              >
                <Plus />
              </span>
            ) : null}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 text-ink-2",
            full ? "text-base" : "text-sm",
          )}
        >
          {names.length > 0 ? shortNames(names).join(", ") : t("nobody")}
          {inPositions.length > 0 ? (
            <span className="flex flex-wrap gap-x-2 text-sm">
              {inPositions.map(({ position, count }) => (
                <span key={position.key} className="whitespace-nowrap">
                  {t("inPosition", { name: position.name, count })}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {full ? (
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
          />
        ) : null}
      </span>
      {clashing.length > 0 ? (
        <span className="mt-2 block font-medium text-danger text-sm">
          {t("clashOnShift", { names: shortNames(clashing).join(", ") })}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Where a removed shift was, with the way back. It stays in place until the
 * week is saved, so undoing needs no hurry and nothing covers the screen.
 */
export function RemovedShift({
  id,
  shift,
  weekday,
  density,
  onUndo,
}: {
  id: number;
  shift: ScheduledShift;
  weekday: string;
  density: CardDensity;
  onUndo: () => void;
}) {
  const t = useTranslations("app.build");
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 bg-surface shadow-card",
        density === "full" ? "rounded-[28px] p-4" : "rounded-card p-3",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 basis-36 text-ink-2",
          density === "full" ? "text-base" : "text-sm",
        )}
      >
        {t("removedShift", { name: shift.name, day: weekday })}
      </span>
      <Button
        variant="secondary"
        data-undo={id}
        onClick={onUndo}
        className={density === "column" ? "w-full px-2" : undefined}
      >
        {density === "column" ? null : <Undo2 aria-hidden="true" />}
        {t("undoRemove")}
      </Button>
    </div>
  );
}

/** The clear way to add a shift to a day, at the end of its shifts. */
export function AddShiftRow({
  label,
  alone,
  hint,
  density,
  onClick,
}: {
  /** Says which day, for a screen reader. */
  label: string;
  /** The day has nothing else to show. */
  alone: boolean;
  /** What to do next on an empty day, unless the screen already says so. */
  hint?: string;
  density: CardDensity;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations("app.build");
  // On a tablet it sits small under the day's name, leaving the grid to shifts.
  if (density === "tile" && !alone) {
    return (
      <IconButton
        label={label}
        icon={<Plus />}
        variant="secondary"
        aria-haspopup="dialog"
        onClick={onClick}
      />
    );
  }
  if (density === "full") {
    return (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={onClick}
        className={cn(
          pressClass,
          "flex min-h-16 w-full items-center gap-3 rounded-card bg-surface px-4 py-2.5 text-start shadow-card",
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5">
          <Plus aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{t("addShift")}</span>
          {hint ? <span className="text-ink-2 text-sm">{hint}</span> : null}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
      className={cn(
        pressClass,
        "flex min-h-11 w-full flex-wrap items-center justify-center gap-x-1 rounded-card bg-surface-2/60 px-2 py-2 text-center font-medium text-ink-2 text-sm transition-colors hover:bg-surface-2 [&_svg]:size-4",
      )}
    >
      <Plus aria-hidden="true" />
      {t("addShift")}
      {hint ? <span className="w-full font-normal">{hint}</span> : null}
    </button>
  );
}
