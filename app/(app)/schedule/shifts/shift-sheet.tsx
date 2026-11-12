"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { dayMonth } from "@domain/availability-form";
import { firstNameOf } from "@domain/people";
import { myRequestFor, type Offer } from "@domain/swaps";
import { Avatar } from "@ui/avatar";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useState } from "react";
import type { SwapState } from "./actions";
import {
  formOf,
  nameOf,
  photoOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
  weekdayName,
} from "./shift-text";
import { SwapButton } from "./swap-button";

export type SwapAction = (
  state: SwapState,
  form: FormData,
) => Promise<SwapState>;

/** A row of a grouped list, hairline starting at the text. */
export const personRow =
  "relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:end-0 not-first:before:start-[68px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/** Which shift's sheet is up. It stays set while the sheet slides away. */
export function useShiftSheet() {
  const [state, setState] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const show = useCallback((id: string) => setState({ open: true, id }), []);
  const onOpenChange = useCallback(
    (open: boolean) => setState((s) => ({ ...s, open })),
    [],
  );
  return { ...state, show, onOpenChange };
}

function Consequence({
  children,
  note,
  action,
}: {
  children: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1 rounded-card bg-elevated p-4">
      <p className="text-md">{children}</p>
      {note ? <p className="text-base text-ink-2">{note}</p> : null}
      {action ? <div className="pt-3">{action}</div> : null}
    </section>
  );
}

/**
 * One shift in a sheet: who is on it, and what the person can do about it.
 * Giving a shift away and taking one are confirmed here, each saying what
 * will happen. `shifts` are the published shifts the id is looked up in,
 * `offers` the colleagues' requests for them. `onGiven` runs once a shift
 * was given away.
 */
export function ShiftSheet({
  id,
  open,
  onOpenChange,
  shifts,
  offers,
  data,
  swap,
  onGiven,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: readonly WeekScheduleShift[];
  offers: readonly Offer<WeekScheduleShift>[];
  data: ShiftData;
  swap: SwapAction;
  onGiven?: () => void;
}) {
  const t = useTranslations("app");
  const shift = shifts.find((s) => s.id === id);
  return (
    <Sheet
      open={open && shift !== undefined}
      onOpenChange={onOpenChange}
      closeLabel={t("shifts.sheet.close")}
      title={
        shift
          ? t("shifts.sheet.title", {
              name: shift.name,
              day: weekdayName(t, shift.day),
              date: dayMonth(shift.day),
            })
          : ""
      }
      subtitle={shift ? timeRange(t, shift) : undefined}
    >
      {shift ? (
        <SheetBody
          shift={shift}
          offers={offers.filter((o) => o.shift.id === shift.id)}
          data={data}
          swap={swap}
          onDone={() => onOpenChange(false)}
          onGiven={onGiven}
        />
      ) : null}
    </Sheet>
  );
}

function SheetBody({
  shift,
  offers,
  data,
  swap,
  onDone,
  onGiven,
}: {
  shift: WeekScheduleShift;
  offers: readonly Offer<WeekScheduleShift>[];
  data: ShiftData;
  swap: SwapAction;
  onDone: () => void;
  onGiven?: () => void;
}) {
  const t = useTranslations("app");
  const subject = shiftLabel(t, shift);
  const mine = shift.assignees.some((a) => a.user === data.userId);
  const request = myRequestFor(data.swaps, shift.id, data.userId);
  const upcoming = shift.day >= data.today;
  const title = t("shifts.sheet.people");

  return (
    <div className="flex flex-col gap-3">
      <section>
        <h3 className="px-3 pt-1 pb-1.5 font-semibold text-ink-2 text-sm">
          {title}
        </h3>
        {shift.assignees.length === 0 ? (
          <p className="rounded-card bg-elevated p-4 text-ink-2">
            {t("shifts.nobody")}
          </p>
        ) : (
          <ul
            aria-label={title}
            className="m-0 list-none overflow-hidden rounded-card bg-elevated p-0"
          >
            {shift.assignees.map((a) => {
              const name = nameOf(t, data, a.user);
              const role = positionName(data, a.position);
              return (
                <li key={a.user} className={personRow}>
                  <Avatar name={name} photo={photoOf(data, a.user)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{name}</span>
                    {role ? (
                      <span className="text-ink-2 text-sm">{role}</span>
                    ) : null}
                  </span>
                  {a.user === data.userId ? (
                    <span className="text-ink-2 text-sm">
                      {t("shifts.sheet.me")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mine && upcoming && !request ? (
        <Consequence
          note={t("shifts.sheet.giveNote")}
          action={
            <SwapButton
              action={swap}
              intent="give"
              id={shift.id}
              subject={subject}
              variant="primary"
              size="lg"
              block
              onDone={() => {
                onDone();
                onGiven?.();
              }}
            />
          }
        >
          {t("shifts.sheet.give")}
        </Consequence>
      ) : null}

      {mine && request ? (
        <Consequence
          action={
            <SwapButton
              action={swap}
              intent="cancel"
              id={request.id}
              subject={subject}
              block
              onDone={onDone}
            />
          }
        >
          {request.status === "taken"
            ? t("shifts.swap.taken", {
                name: nameOf(t, data, request.takenBy),
                form: formOf(data, request.takenBy),
              })
            : t("shifts.swap.open")}
        </Consequence>
      ) : null}

      {offers.map((offer) => {
        const from = firstNameOf(nameOf(t, data, offer.swap.requestedBy));
        if (offer.state === "takenByYou") {
          return (
            <Consequence key={offer.swap.id}>
              {t("shifts.swap.offers.takenByYou")}
            </Consequence>
          );
        }
        if (offer.state === "busy") {
          return (
            <Consequence
              key={offer.swap.id}
              note={t("shifts.swap.offers.busy")}
            >
              {t("shifts.swap.offers.from", {
                name: from,
                form: formOf(data, offer.swap.requestedBy),
              })}
            </Consequence>
          );
        }
        return (
          <Consequence
            key={offer.swap.id}
            note={t("shifts.sheet.takeNote", { name: from })}
            action={
              <SwapButton
                action={swap}
                intent="take"
                id={offer.swap.id}
                subject={subject}
                variant="primary"
                size="lg"
                block
                onDone={onDone}
              />
            }
          >
            {t("shifts.sheet.take", { name: from })}
          </Consequence>
        );
      })}
    </div>
  );
}
