"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { firstNameOf } from "@domain/people";
import { type ScheduledShift, stillNeeded } from "@domain/schedule";
import { myRequestFor, type Offer } from "@domain/swaps";
import { AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { SwapAction } from "./shift-sheet";
import {
  type AppT,
  assigneePeople,
  firstNames,
  formOf,
  ltr,
  nameOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
} from "./shift-text";
import { SwapButton } from "./swap-button";

/** A shift on the board: published ones have an id, drafts do not yet. */
export type BoardShift = ScheduledShift & { id?: string };

/**
 * A tap target covering its card, so the card keeps real buttons of its own
 * above it. Opens the shift's sheet, or goes to `href` for a draft.
 */
export function CardTarget({
  label,
  onOpen,
  href,
}: {
  label: string;
  onOpen?: () => void;
  href?: string;
}) {
  const target =
    "absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  if (href) {
    return <Link href={href} aria-label={label} className={target} />;
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onOpen}
      className={target}
    />
  );
}

/** The places of a shift, filled ones in the business's colour. */
function Bars({ shift }: { shift: BoardShift }) {
  return (
    <div aria-hidden="true" className="flex gap-1">
      {Array.from({ length: shift.needed }, (_, i) => (
        <span
          // The places have no identity of their own.
          key={i.toString()}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            i < shift.assignees.length ? "bg-accent" : "bg-surface-2",
          )}
        />
      ))}
    </div>
  );
}

/** A manager's read of one shift: how many are missing, or that it is full. */
export function CoverageBadge({ shift }: { shift: BoardShift }) {
  const t = useTranslations("app.shifts.board");
  const missing = stillNeeded(shift);
  return missing > 0 ? (
    <Badge tone="warning" className="shrink-0">
      {t("missing", { count: missing })}
    </Badge>
  ) : (
    <Badge tone="success" className="shrink-0">
      {t("full")}
    </Badge>
  );
}

export type ShiftCardProps = {
  shift: BoardShift;
  data: ShiftData;
  /** Colleagues' requests for this shift. */
  offers: readonly Offer<WeekScheduleShift>[];
  /** Managers see how filled it is. */
  manager: boolean;
  swap: SwapAction;
  onOpen: (id: string) => void;
  /** Where a draft shift leads: the screen that builds it. */
  draftHref?: string;
};

/**
 * One shift of the day: its hours, who is on it, and the step this person
 * can take with it. The whole card opens the shift's sheet.
 */
export function ShiftCard({
  shift,
  data,
  offers,
  manager,
  swap,
  onOpen,
  draftHref,
}: ShiftCardProps) {
  const t = useTranslations("app");
  const label = shiftLabel(t, shift);
  const people = assigneePeople(t, data, shift);
  const names = people.map((p) => p.name);
  const { id } = shift;
  const mine = shift.assignees.find((a) => a.user === data.userId);
  const role = mine ? positionName(data, mine.position) : null;
  const upcoming = shift.day >= data.today;
  const request = id ? myRequestFor(data.swaps, id, data.userId) : null;
  const offer = offers[0];

  return (
    <section
      aria-label={label}
      className="pressable relative flex min-w-0 flex-col gap-3.5 rounded-[28px] bg-surface p-4 shadow-card"
    >
      {id ? (
        <CardTarget
          label={t("shifts.board.open", { shift: label })}
          onOpen={() => onOpen(id)}
        />
      ) : (
        <CardTarget label={label} href={draftHref} />
      )}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="font-bold text-lg">{shift.name}</h3>
          <p className="text-base text-ink-2">
            {timeRange(t, shift)}
            {role ? ` · ${role}` : null}
          </p>
          {manager && mine ? (
            <p className="pt-0.5 font-semibold text-base">
              {t("shifts.yours")}
            </p>
          ) : null}
        </div>
        {manager ? (
          <CoverageBadge shift={shift} />
        ) : mine ? (
          <Badge tone="accent" className="shrink-0">
            {t("shifts.yours")}
          </Badge>
        ) : null}
      </div>
      {manager ? <Bars shift={shift} /> : null}
      <div className="flex min-h-10 items-center gap-2.5">
        {names.length > 0 ? (
          <>
            <AvatarStack people={people} />
            <span className="min-w-0 flex-1 text-base text-ink-2">
              {firstNames(names)}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-base text-ink-2">
            {t("shifts.nobody")}
          </span>
        )}
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
        />
      </div>
      {id && mine && upcoming ? (
        <div className="relative flex flex-col gap-2 border-line border-t pt-3">
          {request ? (
            <>
              <p className="text-base">
                {request.status === "taken"
                  ? t("shifts.swap.taken", {
                      name: nameOf(t, data, request.takenBy),
                      form: formOf(data, request.takenBy),
                    })
                  : t("shifts.swap.open")}
              </p>
              <SwapButton
                action={swap}
                intent="cancel"
                id={request.id}
                subject={label}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => onOpen(id)}
              aria-label={`${t("shifts.swap.buttons.give")}, ${label}`}
              className="w-full"
            >
              {t("shifts.swap.buttons.give")}
            </Button>
          )}
        </div>
      ) : null}
      {id && offer ? (
        <div className="relative flex flex-col gap-2 border-line border-t pt-3">
          <p className="text-base">
            {offer.state === "takenByYou"
              ? t("shifts.swap.offers.takenByYou")
              : t("shifts.swap.offers.from", {
                  name: nameOf(t, data, offer.swap.requestedBy),
                  form: formOf(data, offer.swap.requestedBy),
                })}
          </p>
          {offer.state === "busy" ? (
            <p className="text-base text-warning">
              {t("shifts.swap.offers.busy")}
            </p>
          ) : null}
          {offer.state === "available" ? (
            <Button
              variant="secondary"
              onClick={() => onOpen(id)}
              aria-label={`${t("shifts.swap.buttons.take")}, ${label}`}
              className="w-full"
            >
              {t("shifts.swap.buttons.take")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** "עד 23:30, מלצר/ית, עם יואב ואיתי" */
function heroLine(
  t: AppT,
  format: ReturnType<typeof useFormatter>,
  data: ShiftData,
  shift: BoardShift,
): ReactNode {
  const mine = shift.assignees.find((a) => a.user === data.userId);
  const role = mine ? positionName(data, mine.position) : null;
  const others = shift.assignees
    .filter((a) => a.user !== data.userId)
    .map((a) => firstNameOf(nameOf(t, data, a.user)));
  return (
    <>
      {t.rich("shifts.hero.until", { end: shift.end, ltr })}
      {role ? `, ${role}` : null}
      {others.length > 0
        ? `, ${t("shifts.hero.with", {
            names: format.list(others, { type: "conjunction" }),
          })}`
        : null}
    </>
  );
}

/**
 * The person's own shift, the one strong moment of the screen: the business's
 * colour, with a card lifted over its edge for what they can do about it.
 */
export function MyShiftHero({
  shift,
  label,
  chip,
  heading: Heading = "h3",
  data,
  swap,
  onOpen,
}: {
  shift: WeekScheduleShift;
  /** "המשמרת שלך" or "המשמרת הבאה שלך". */
  label: string;
  /** When it is, if the screen does not already say. */
  chip?: string;
  /** `h2` when it sits right under the page title. */
  heading?: "h2" | "h3";
  data: ShiftData;
  swap: SwapAction;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("app");
  const format = useFormatter();
  const subject = shiftLabel(t, shift);
  const request = myRequestFor(data.swaps, shift.id, data.userId);
  return (
    <section aria-label={subject}>
      <Card
        tone="hero"
        padding="none"
        className="pressable relative px-5 pt-5 pb-[68px]"
      >
        <CardTarget
          label={t("shifts.board.open", { shift: subject })}
          onOpen={() => onOpen(shift.id)}
        />
        <div className="flex items-center justify-between gap-2.5">
          <span className="font-medium text-base">{label}</span>
          {chip ? (
            <span className="inline-flex min-h-[30px] shrink-0 items-center rounded-full bg-accent-press px-3 font-semibold text-sm">
              {chip}
            </span>
          ) : null}
        </div>
        <Heading className="mt-3.5 font-bold text-2xl">
          {t.rich("shifts.hero.title", {
            name: shift.name,
            start: shift.start,
            ltr,
          })}
        </Heading>
        <p className="text-base">{heroLine(t, format, data, shift)}</p>
      </Card>
      <Card
        tone="float"
        className="relative z-10 mx-3 -mt-11 flex flex-col gap-3"
      >
        {request ? (
          <>
            <p className="font-medium text-base">
              {request.status === "taken"
                ? t("shifts.swap.taken", {
                    name: nameOf(t, data, request.takenBy),
                    form: formOf(data, request.takenBy),
                  })
                : t("shifts.swap.open")}
            </p>
            <SwapButton
              action={swap}
              intent="cancel"
              id={request.id}
              subject={subject}
            />
          </>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-base">
                {t("shifts.hero.giveQuestion")}
              </span>
              <span className="text-ink-2 text-sm">
                {t("shifts.hero.giveHint")}
              </span>
            </p>
            <Button
              variant="secondary"
              onClick={() => onOpen(shift.id)}
              aria-label={`${t("shifts.swap.buttons.give")}, ${subject}`}
              className="shrink-0"
            >
              {t("shifts.swap.buttons.give")}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
