"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { addDays } from "@domain/availability";
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
import { useState } from "react";
import {
  PushAsk,
  type PushAskOffer,
  usePushAskOnce,
} from "../../notifications/push-ask";
import type { SwapIntent } from "./actions";
import { DayTile } from "./day-tile";
import { PastRequests } from "./past-requests";
import { CardTarget, MyShiftHero } from "./shift-card";
import {
  personRow,
  ShiftSheet,
  type SwapAction,
  useShiftSheet,
} from "./shift-sheet";
import {
  assigneePeople,
  dayLabel,
  formOf,
  hasStarted,
  ltr,
  nameOf,
  outcomeLine,
  photoOf,
  positionName,
  type ShiftData,
  shiftLabel,
  shiftOutcome,
  timeRange,
} from "./shift-text";
import { SwapButton } from "./swap-button";
import { shiftTarget } from "./swap-focus";
import { SwapToast, useSwapNotice } from "./swap-notice";

export function MyShiftsBoard({
  mine,
  anyPublished,
  shifts,
  data,
  swap,
  ask = null,
}: {
  mine: OwnShift<WeekScheduleShift>[];
  anyPublished: boolean;
  shifts: WeekScheduleShift[];
  data: ShiftData;
  swap: SwapAction;
  /** Offered once, right after a shift is given away. */
  ask?: PushAskOffer | null;
}) {
  const t = useTranslations("app");
  const sheet = useShiftSheet();
  const pushAsk = usePushAskOnce(ask);
  const swapped = useSwapNotice();
  // The offer just taken in the sheet, taken from then on: its own words say
  // so, and hold the focus (`offerTarget`), before the screen is read again.
  // So no toast says them again.
  const [took, setTook] = useState<string | null>(null);
  const onSheetSwapped = (intent: SwapIntent) => {
    if (intent !== "take") swapped.onSwapped(intent);
  };
  const offers = offersFor(
    data.swaps,
    shifts,
    data.userId,
    new Date(data.now),
    data.timeZone,
  ).map((o) =>
    o.swap.id === took && o.state === "available"
      ? { ...o, state: "takenByYou" as const }
      : o,
  );
  const available = offers.filter((o) => o.state === "available").length;
  const [next, ...later] = mine;
  const tomorrow = addDays(data.today, 1);
  const whenNext = next?.shift.day;
  const offersTitle = t("shifts.swap.offers.title");
  const mineTitle = t("shifts.mine.title");

  return (
    <div className="grid items-start gap-8 md:grid-cols-2 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <PushAsk offer={pushAsk.asking} moment="swap" onClose={pushAsk.close} />
        {next && whenNext ? (
          <MyShiftHero
            shift={next.shift}
            // Once it has begun it is no longer the next one, but theirs now.
            label={
              hasStarted(data, next.shift)
                ? t("shifts.yours")
                : t("shifts.hero.next")
            }
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
            onSwapped={swapped.onSwapped}
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
                // Not approved, or the schedule cancelled it: said until they
                // ask again or the shift begins. The sheet gives it again.
                const outcome =
                  request || hasStarted(data, shift)
                    ? null
                    : shiftOutcome(data, shift.id);
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
                      shift={shift.id}
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
                                  form: formOf(data, request.takenBy),
                                })
                              : t("shifts.swap.open")}
                          </p>
                          <div className="relative pt-1">
                            <SwapButton
                              action={swap}
                              intent="cancel"
                              id={request.id}
                              subject={label}
                              onDone={swapped.onSwapped}
                              focusAfter={() => [shiftTarget(shift.id)]}
                            />
                          </div>
                        </>
                      ) : outcome ? (
                        <p className="pt-1 text-sm">
                          {outcomeLine(t, outcome)}
                        </p>
                      ) : null}
                    </div>
                    <AvatarStack
                      people={assigneePeople(t, data, shift)}
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

      <div className="flex min-w-0 flex-col gap-8">
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
                    <Avatar
                      name={from}
                      photo={photoOf(data, request.requestedBy)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/* The offer's place on the screen: once it is taken
                          its button goes, and the focus comes back here,
                          to the words that say so (`offerTarget`). */}
                      <span
                        data-offer-target={request.id}
                        className="font-medium"
                      >
                        {state === "takenByYou"
                          ? t("shifts.swap.offers.takenByYou")
                          : t("shifts.swap.offers.from", {
                              name: from,
                              form: formOf(data, request.requestedBy),
                            })}
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
        <PastRequests data={data} />
      </div>

      <ShiftSheet
        id={sheet.id}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
        shifts={shifts}
        offers={offers}
        data={data}
        swap={swap}
        onSwapped={onSheetSwapped}
        onTaken={setTook}
        onGiven={pushAsk.offer}
      />
      <SwapToast notice={swapped.notice} />
    </div>
  );
}
