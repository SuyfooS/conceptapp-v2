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
import type { SwapIntent } from "./actions";
import type { SwapAction } from "./shift-sheet";
import {
  type AppT,
  assigneePeople,
  awayOnShift,
  firstNames,
  formOf,
  hasEnded,
  hasStarted,
  ltr,
  nameOf,
  outcomeLine,
  positionName,
  type ShiftData,
  shiftLabel,
  shiftOutcome,
  timeRange,
} from "./shift-text";
import { SwapButton } from "./swap-button";
import { shiftTarget } from "./swap-focus";

/**
 * A shift on the board: published ones have an id, and so does a draft's
 * once it was saved (it is written in place).
 */
export type BoardShift = ScheduledShift & { id?: string };

/**
 * A tap target covering its card, so the card keeps real buttons of its own
 * above it. Opens the shift's sheet, or goes to `href` for a draft. A
 * published shift's is its place on the screen (`shift`, its id, as
 * `shiftTarget` finds it): the focus comes back to it once a swap step
 * took the button pressed away.
 */
export function CardTarget({
  label,
  onOpen,
  href,
  shift,
}: {
  label: string;
  onOpen?: () => void;
  href?: string;
  /** The published shift it opens. */
  shift?: string;
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
      data-shift-target={shift}
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

/**
 * A manager's read of one shift: how many are missing, or that it is full.
 * Not for a shift that is over (`hasEnded`), which takes nobody.
 */
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
  /** A swap step on the card went through ("ביטול הבקשה"), for the board's toast. */
  onSwapped?: (intent: SwapIntent) => void;
  /**
   * Set for a draft's shift: where it leads, the screen that builds its week.
   * The card then opens no sheet and offers nothing to give away or take.
   */
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
  onSwapped,
  draftHref,
}: ShiftCardProps) {
  const t = useTranslations("app");
  const label = shiftLabel(t, shift);
  const people = assigneePeople(t, data, shift);
  const names = people.map((p) => p.name);
  // A draft's shift opens its week's builder, saved with an id or not: only
  // a published shift has a sheet, and can be given away or taken.
  const id = draftHref ? undefined : shift.id;
  const mine = shift.assignees.find((a) => a.user === data.userId);
  const role = mine ? positionName(data, mine.position) : null;
  // From its start on, the database refuses to give it away. A request
  // already made stays in sight until the day is over, as on the sheet: its
  // "ביטול הבקשה" still works.
  const upcoming = !hasStarted(data, shift);
  const request = id ? myRequestFor(data.swaps, id, data.userId) : null;
  // Not approved, or the schedule cancelled it: said until they ask again or
  // the shift begins, with the way to give it away again under it.
  const outcome =
    id && mine && !request && upcoming ? shiftOutcome(data, id) : null;
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
          shift={id}
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
          // A shift that is over takes nobody: nothing to say it lacks.
          hasEnded(data, shift) ? null : (
            <CoverageBadge shift={shift} />
          )
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
      {manager && awayOnShift(t, data, shift).length > 0 ? (
        <p className="font-medium text-sm text-warning">
          {t("build.awayOnShift", {
            names: awayOnShift(t, data, shift).join(", "),
          })}
        </p>
      ) : null}
      {id && mine && (request ? shift.day >= data.today : upcoming) ? (
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
                onDone={onSwapped}
                focusAfter={() => [shiftTarget(id)]}
              />
            </>
          ) : (
            <>
              {outcome ? (
                <p className="text-base">{outcomeLine(t, outcome)}</p>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => onOpen(id)}
                aria-label={`${t("shifts.swap.buttons.give")}, ${label}`}
                className="w-full"
              >
                {t("shifts.swap.buttons.give")}
              </Button>
            </>
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
 * Once the shift has begun it can't be given away: a request already made
 * stays on the card with its "ביטול הבקשה", as on the sheet, and otherwise
 * the card goes and the hero stands alone. Until then, a last request that
 * wasn't approved, or that the schedule cancelled, is said in place of the
 * question, and the shift can be offered again.
 */
export function MyShiftHero({
  shift,
  label,
  chip,
  heading: Heading = "h3",
  data,
  swap,
  onOpen,
  onSwapped,
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
  /** "ביטול הבקשה" on the card went through, for the board's toast. */
  onSwapped?: (intent: SwapIntent) => void;
}) {
  const t = useTranslations("app");
  const format = useFormatter();
  const subject = shiftLabel(t, shift);
  const request = myRequestFor(data.swaps, shift.id, data.userId);
  // Nothing to do about it: begun, and not asked to give away.
  const alone = !request && hasStarted(data, shift);
  const outcome = request || alone ? null : shiftOutcome(data, shift.id);
  return (
    <section aria-label={subject}>
      <Card
        tone="hero"
        padding="none"
        className={cn(
          "pressable relative px-5 pt-5",
          alone ? "pb-5" : "pb-[68px]",
        )}
      >
        <CardTarget
          label={t("shifts.board.open", { shift: subject })}
          onOpen={() => onOpen(shift.id)}
          shift={shift.id}
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
      {alone ? null : (
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
                onDone={onSwapped}
                focusAfter={() => [shiftTarget(shift.id)]}
              />
            </>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-base">
                  {outcome
                    ? outcomeLine(t, outcome)
                    : t("shifts.hero.giveQuestion")}
                </span>
                <span className="text-ink-2 text-sm">
                  {outcome
                    ? t("shifts.hero.giveAgain")
                    : t("shifts.hero.giveHint")}
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
      )}
    </section>
  );
}
