"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { addDays, weekdayOf } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import type { OwnShift } from "@domain/schedule";
import { myRequestFor, offersFor } from "@domain/swaps";
import { Avatar, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { CardTarget, MyShiftHero } from "./shift-card";
import {
  personRow,
  ShiftSheet,
  type SwapAction,
  useShiftSheet,
} from "./shift-sheet";
import {
  assigneeNames,
  dayLabel,
  ltr,
  nameOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
} from "./shift-text";
import { SwapButton } from "./swap-button";

/** The day of a shift at a glance, as on the week strip. */
function DayTile({ date }: { date: string }) {
  const tDays = useTranslations("days");
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 flex-col items-center justify-center rounded-[13px] bg-surface-2 leading-none"
    >
      <span className="font-medium text-[11px] text-ink-2">
        {tDays(`${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`)}
      </span>
      <span className="font-bold text-md">{Number(date.slice(8))}</span>
    </span>
  );
}

export function MyShiftsBoard({
  mine,
  anyPublished,
  shifts,
  data,
  swap,
}: {
  mine: OwnShift<WeekScheduleShift>[];
  anyPublished: boolean;
  shifts: WeekScheduleShift[];
  data: ShiftData;
  swap: SwapAction;
}) {
  const t = useTranslations("app");
  const sheet = useShiftSheet();
  const offers = offersFor(data.swaps, shifts, data.userId, data.today);
  const available = offers.filter((o) => o.state === "available").length;
  const [next, ...later] = mine;
  const tomorrow = addDays(data.today, 1);
  const whenNext = next?.shift.day;
  const offersTitle = t("shifts.swap.offers.title");
  const mineTitle = t("shifts.mine.title");

  return (
    <div className="grid items-start gap-8 md:grid-cols-2 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {next && whenNext ? (
          <MyShiftHero
            shift={next.shift}
            label={t("shifts.hero.next")}
            heading="h2"
            chip={
              whenNext === data.today
                ? t("shifts.hero.today")
                : whenNext === tomorrow
                  ? t("shifts.hero.tomorrow")
                  : dayLabel(t, whenNext)
            }
            data={data}
            swap={swap}
            onOpen={sheet.show}
          />
        ) : (
          <Card padding="lg">
            <CardText>
              {anyPublished
                ? t("shifts.mine.empty")
                : t("shifts.mine.notPublished")}
            </CardText>
          </Card>
        )}
        {later.length > 0 ? (
          <PageSection title={t("shifts.mine.later")}>
            <ul
              aria-label={mineTitle}
              className="m-0 list-none overflow-hidden rounded-card bg-surface p-0 shadow-card"
            >
              {later.map(({ shift, position }) => {
                const role = positionName(data, position);
                const label = shiftLabel(t, shift);
                const request = myRequestFor(data.swaps, shift.id, data.userId);
                return (
                  <li
                    key={shift.id}
                    className={cn(
                      personRow,
                      "items-start transition-colors duration-150 hover:bg-surface-2",
                    )}
                  >
                    <CardTarget
                      label={t("shifts.board.open", { shift: label })}
                      onOpen={() => sheet.show(shift.id)}
                    />
                    <DayTile date={shift.day} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">
                        {dayLabel(t, shift.day)}
                      </span>
                      <span className="text-ink-2 text-sm">
                        {t.rich("shifts.mine.line", {
                          name: shift.name,
                          start: shift.start,
                          end: shift.end,
                          ltr,
                        })}
                        {role ? ` · ${role}` : null}
                      </span>
                      {request ? (
                        <>
                          <p className="pt-1 text-sm">
                            {request.status === "taken"
                              ? t("shifts.swap.taken", {
                                  name: nameOf(t, data, request.takenBy),
                                })
                              : t("shifts.swap.open")}
                          </p>
                          <div className="relative pt-1">
                            <SwapButton
                              action={swap}
                              intent="cancel"
                              id={request.id}
                              subject={label}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <AvatarStack
                      names={assigneeNames(t, data, shift)}
                      className="hidden self-center xl:flex"
                    />
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 self-center text-ink-2 rtl:-scale-x-100"
                    />
                  </li>
                );
              })}
            </ul>
          </PageSection>
        ) : null}
      </div>

      <PageSection
        title={offersTitle}
        action={
          available > 0 ? (
            <Badge tone="accent">
              {t("shifts.swap.offers.count", { count: available })}
            </Badge>
          ) : null
        }
      >
        {offers.length === 0 ? (
          <Card padding="lg">
            <CardText>{t("shifts.swap.offers.empty")}</CardText>
          </Card>
        ) : (
          <ul
            aria-label={offersTitle}
            className="m-0 list-none overflow-hidden rounded-card bg-surface p-0 shadow-card"
          >
            {offers.map(({ swap: request, shift, state }) => {
              const from = nameOf(t, data, request.requestedBy);
              const role = positionName(
                data,
                shift.assignees.find((a) => a.user === request.requestedBy)
                  ?.position,
              );
              return (
                <li
                  key={request.id}
                  className={cn(personRow, "items-start py-3.5")}
                >
                  <Avatar name={from} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">
                      {state === "takenByYou"
                        ? t("shifts.swap.offers.takenByYou")
                        : t("shifts.swap.offers.from", { name: from })}
                    </span>
                    <span className="text-ink-2 text-sm">
                      {dayLabel(t, shift.day)}
                    </span>
                    <span className="text-ink-2 text-sm">
                      {shift.name} · {timeRange(t, shift)}
                      {role ? ` · ${role}` : null}
                    </span>
                    {state === "busy" ? (
                      <p className="pt-1 text-sm text-warning">
                        {t("shifts.swap.offers.busy")}
                      </p>
                    ) : null}
                    {state === "available" ? (
                      <div className="pt-2">
                        <Button
                          variant="secondary"
                          onClick={() => sheet.show(shift.id)}
                          aria-label={`${t("shifts.swap.buttons.take")}, ${shiftLabel(t, shift)}`}
                        >
                          {t("shifts.swap.buttons.take")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      <ShiftSheet
        id={sheet.id}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
        shifts={shifts}
        offers={offers}
        data={data}
        swap={swap}
      />
    </div>
  );
}
