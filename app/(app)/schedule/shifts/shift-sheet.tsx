"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { dayMonth } from "@domain/availability-form";
import { firstNameOf } from "@domain/people";
import { myRequestFor, type Offer } from "@domain/swaps";
import { Avatar } from "@ui/avatar";
import { focusFirst } from "@ui/focus-after";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SwapIntent, SwapState } from "./actions";
import {
  formOf,
  hasStarted,
  nameOf,
  outcomeLine,
  photoOf,
  positionName,
  type ShiftData,
  shiftLabel,
  shiftOutcome,
  timeRange,
  weekdayName,
} from "./shift-text";
import { SwapButton } from "./swap-button";
import { offerTarget, shiftTarget } from "./swap-focus";

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
 * `offers` the colleagues' requests for them. `onTaken` runs as soon as an
 * offer was taken, with its request (the board marks it taken, before the
 * focus lands on its words), and `onGiven` once a shift was given away and
 * the focus is back, after `onSwapped` (below), so the question it brings
 * (notifications on the phone) is not cut off by the focus coming back.
 * Closed, the focus goes back to what opened it; after a step, to the
 * offer's words once one was taken (`offerTarget`), else to the shift's own
 * place on the screen (`shiftTarget`), which the screen read again keeps,
 * while the button that opened it may have given way to what came of the
 * step. `onSwapped` runs once that focus is back, with the step, so what
 * the board says of it comes after the focus's own read: said as the sheet
 * slides away, it would be cut off by the focus moving. While a step is on
 * its way the sheet stays, as Sheet asks: closed before its answer, the
 * focus would go back to a button the answer then takes away.
 */
export function ShiftSheet({
  id,
  open,
  onOpenChange,
  shifts,
  offers,
  data,
  swap,
  onSwapped,
  onTaken,
  onGiven,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: readonly WeekScheduleShift[];
  offers: readonly Offer<WeekScheduleShift>[];
  data: ShiftData;
  swap: SwapAction;
  /** A step went through and the focus is back: the board says it now. */
  onSwapped?: (intent: SwapIntent) => void;
  /** An offer was taken, its request: at once, before the sheet closes. */
  onTaken?: (offer: string) => void;
  /** A shift was given away and the focus is back, after `onSwapped`. */
  onGiven?: () => void;
}) {
  const t = useTranslations("app");
  const shift = shifts.find((s) => s.id === id);
  // What held the focus as it opened, the step that went through since, and
  // the request it took, if it took one.
  const opener = useRef<Element | null>(null);
  const step = useRef<SwapIntent | null>(null);
  const taken = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    step.current = null;
    taken.current = null;
  }, [open]);
  // Steps sent and not answered yet: ✕, Escape, the scrim and a swipe wait.
  const waiting = useRef(0);
  const onWaiting = useCallback((now: boolean) => {
    waiting.current += now ? 1 : -1;
  }, []);

  function done(intent: SwapIntent, offer?: string) {
    step.current = intent;
    taken.current = offer ?? null;
    onOpenChange(false);
    if (offer) onTaken?.(offer);
  }

  // Put there as focusFirst puts it (a line given a tabindex, the page's
  // title last), only while nothing else took it as the sheet closed. Then
  // the step is said, after what the focus reads, and after a give what
  // follows it (`onGiven`).
  function returnFocus() {
    const target = id ? shiftTarget(id) : null;
    const offer = taken.current ? offerTarget(taken.current) : null;
    const stepped = step.current;
    const candidates = stepped ? [offer, target] : [opener.current, target];
    opener.current = null;
    step.current = null;
    taken.current = null;
    const landed = focusFirst(candidates, { preventScroll: true });
    if (stepped) onSwapped?.(stepped);
    if (stepped === "give") onGiven?.();
    return landed;
  }

  return (
    <Sheet
      open={open && shift !== undefined}
      onOpenChange={(next) => {
        if (next || waiting.current === 0) onOpenChange(next);
      }}
      returnFocus={returnFocus}
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
          onDone={done}
          onWaiting={onWaiting}
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
  onWaiting,
}: {
  shift: WeekScheduleShift;
  offers: readonly Offer<WeekScheduleShift>[];
  data: ShiftData;
  swap: SwapAction;
  /** A step went through: the step, and for a take the request taken. */
  onDone: (intent: SwapIntent, offer?: string) => void;
  onWaiting: (waiting: boolean) => void;
}) {
  const t = useTranslations("app");
  const subject = shiftLabel(t, shift);
  const mine = shift.assignees.some((a) => a.user === data.userId);
  const request = myRequestFor(data.swaps, shift.id, data.userId);
  // From its start on, the database refuses to give it away.
  const upcoming = !hasStarted(data, shift);
  // Their last request wasn't approved, or the schedule cancelled it: said
  // above giving it away again.
  const outcome =
    mine && upcoming && !request ? shiftOutcome(data, shift.id) : null;
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

      {outcome ? <Consequence>{outcomeLine(t, outcome)}</Consequence> : null}

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
              onDone={onDone}
              onWaiting={onWaiting}
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
              onWaiting={onWaiting}
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
                onDone={() => onDone("take", offer.swap.id)}
                onWaiting={onWaiting}
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
