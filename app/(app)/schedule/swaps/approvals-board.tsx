"use client";

import type { WeekScheduleShift } from "@db/schedule";
import { type Approval, type EndedSwap, toApprove } from "@domain/swaps";
import { Avatar } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import type { FocusCandidate } from "@ui/focus-after";
import { useFocusWhenGone } from "@ui/use-focus-after";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  type AppT,
  dayLabel,
  formOf,
  nameOf,
  photoOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
} from "../shifts/shift-text";
import type { DecideState } from "./actions";
import { DecideButton } from "./decide-button";
import { EndedRequests } from "./ended-requests";
import { afterDecision } from "./next-request";

type Row = Approval<WeekScheduleShift>;
type DecideAction = (
  state: DecideState,
  form: FormData,
) => Promise<DecideState>;
type Names = Pick<ShiftData, "people" | "positions">;
type Decision = "approve" | "decline";
type Settled = { id: string; decision: Decision; text: string };

const position = (t: AppT, names: Names, row: Row) =>
  positionName(names, row.position) ?? t("swaps.noPosition");

const subject = (t: AppT, names: Names, row: Row) =>
  t("swaps.subject", {
    from: nameOf(t, names, row.swap.requestedBy),
    fromForm: formOf(names, row.swap.requestedBy),
    to: nameOf(t, names, row.swap.takenBy),
    toForm: formOf(names, row.swap.takenBy),
    shift: shiftLabel(t, row.shift),
  });

/**
 * The requests waiting for a decision. A decided request leaves the list at
 * once and says what was decided, as the prototype's request card does; the
 * database has no way to undo a decision. One whose shift has begun says so
 * and offers only declining, as the database refuses approving it; the
 * count and the main action are for the ones still to approve. Under them,
 * what no longer waits (`ended`), so a decision stays in sight once the
 * screen is read again. What was decided is said by a live region that is
 * there from the start, so the first decision is heard too, and only the
 * new line of each; the focus, gone with the decided request, goes on to the
 * next one's first decision (`afterDecision`), or to the card saying
 * nothing waits once none is left.
 */
export function ApprovalsBoard({
  rows,
  ended,
  viewer,
  people,
  positions,
  decide,
}: {
  rows: Row[];
  /** Requests a colleague took that no longer wait (`noLongerWaiting`). */
  ended: readonly EndedSwap[];
  /** The person reading, for "אישרת". */
  viewer: string;
  people: Names["people"];
  positions: Names["positions"];
  decide: DecideAction;
}) {
  const t = useTranslations("app");
  const [settled, setSettled] = useState<Settled[]>([]);
  const names = { people, positions };
  const waiting = rows.filter(
    (row) => !settled.some((s) => s.id === row.swap.id),
  );
  const approvable = toApprove(waiting);
  // The first one still to approve carries the screen's main action.
  const main = approvable[0]?.swap.id;
  const title = t("swaps.list.title");
  // As drawn now: a request that goes next time is among them.
  const ids = waiting.map((row) => row.swap.id);
  const after = (id: string) => () => afterDecision(ids, id);

  function onDecided(row: Row, decision: Decision) {
    const from = nameOf(t, names, row.swap.requestedBy);
    const to = nameOf(t, names, row.swap.takenBy);
    const shift = shiftLabel(t, row.shift);
    setSettled((list) =>
      list.some((s) => s.id === row.swap.id)
        ? list
        : [
            {
              id: row.swap.id,
              decision,
              text:
                decision === "approve"
                  ? t("swaps.settled.approved", { from, to, shift })
                  : t("swaps.settled.declined", {
                      from,
                      fromForm: formOf(names, row.swap.requestedBy),
                      shift,
                    }),
            },
            ...list,
          ],
    );
  }

  const view = { t, names, decide, onDecided, main, after };

  return (
    <div className="flex flex-col gap-4">
      {/* In the page from the start, out of the layout while empty: a live
          region drawn with its first line already in it is often not heard.
          Only the line added is read: a status is read whole by default, so
          each decision would say the ones before it again. */}
      <div
        role="status"
        aria-atomic="false"
        aria-relevant="additions"
        data-decisions=""
        className="flex flex-col gap-2 empty:sr-only"
      >
        {settled.map((s) => (
          <p
            key={s.id}
            data-settled=""
            className={cn(
              "rounded-card p-4 font-medium text-base",
              s.decision === "approve"
                ? "bg-success-soft text-success"
                : "bg-surface-2 text-ink",
            )}
          >
            {s.text}
          </p>
        ))}
      </div>

      {waiting.length === 0 ? (
        <Card padding="lg" data-swaps-empty="" className="md:max-w-xl">
          <CardText>{t("swaps.empty")}</CardText>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 data-swaps-title="" className="font-bold text-lg">
              {title}
            </h2>
            {approvable.length > 0 ? (
              <Badge tone="warning">
                {t("swaps.count", { count: approvable.length })}
              </Badge>
            ) : null}
          </div>
          <ul
            aria-label={title}
            className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4 xl:hidden"
          >
            {waiting.map((row) => (
              <RequestCard key={row.swap.id} {...view} row={row} />
            ))}
          </ul>
          <RequestTable {...view} rows={waiting} title={title} />
          <p className="px-1 text-ink-2 text-sm md:max-w-xl">
            {t("swaps.explain")}
          </p>
        </>
      )}

      {ended.length > 0 ? (
        <EndedRequests rows={ended} names={names} viewer={viewer} />
      ) : null}
    </div>
  );
}

type RowView = {
  t: AppT;
  names: Names;
  decide: DecideAction;
  onDecided: (row: Row, decision: Decision) => void;
  /** The request whose approval is the screen's main action, if any. */
  main: string | undefined;
  /** Where the focus goes once a request went with it (`afterDecision`). */
  after: (id: string) => () => readonly FocusCandidate[];
};

/**
 * The decision buttons of one request. Once its shift has begun: why it
 * can no longer be approved, and declining alone.
 */
function Decisions({
  t,
  decide,
  onDecided,
  main,
  row,
  about,
  block = false,
}: Omit<RowView, "names" | "after"> & {
  row: Row;
  about: string;
  block?: boolean;
}) {
  const decline = (
    <DecideButton
      action={decide}
      decision="decline"
      id={row.swap.id}
      subject={about}
      variant={row.started ? "secondary" : "ghost"}
      block={block}
      onDone={() => onDecided(row, "decline")}
    />
  );
  if (row.started) {
    return (
      <div className={cn("flex flex-col gap-2", block ? null : "items-end")}>
        <p
          className={cn(
            "text-ink-2",
            block ? "text-base" : "max-w-64 text-end text-sm",
          )}
        >
          {t("swaps.failures.started")}
        </p>
        {decline}
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-2", block ? null : "justify-end")}>
      <DecideButton
        action={decide}
        decision="approve"
        id={row.swap.id}
        subject={about}
        variant={row.swap.id === main ? "primary" : "secondary"}
        block={block}
        onDone={() => onDecided(row, "approve")}
      />
      {decline}
    </div>
  );
}

/**
 * Who gives it away and who takes it, the arrow pointing the way it moves,
 * each written about as they chose ("מוסרת", "לוקח").
 */
function Handover({
  t,
  names,
  row,
}: Pick<RowView, "t" | "names"> & { row: Row }) {
  const from = nameOf(t, names, row.swap.requestedBy);
  const to = nameOf(t, names, row.swap.takenBy);
  const person = (name: string, role: string, photo: string | null) => (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <Avatar name={name} photo={photo} />
      <span className="font-semibold text-base">{name}</span>
      <span className="text-ink-2 text-sm">{role}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-1 rounded-[20px] bg-surface-2/60 px-2 py-3">
      {person(
        from,
        t("swaps.handover.from", { form: formOf(names, row.swap.requestedBy) }),
        photoOf(names, row.swap.requestedBy),
      )}
      <ArrowLeft
        aria-hidden="true"
        className="size-5 shrink-0 text-ink-2 ltr:-scale-x-100"
      />
      {person(
        to,
        t("swaps.handover.to", { form: formOf(names, row.swap.takenBy) }),
        photoOf(names, row.swap.takenBy),
      )}
    </div>
  );
}

function RequestCard({ names, row, after, ...view }: RowView & { row: Row }) {
  const { t } = view;
  const about = subject(t, names, row);
  const card = useRef<HTMLLIElement>(null);
  useFocusWhenGone(card, after(row.swap.id));
  return (
    <li
      ref={card}
      className="flex min-w-0 flex-col gap-3.5 rounded-[28px] bg-surface p-4 shadow-card"
    >
      <div>
        <h3 className="font-bold text-lg">{dayLabel(t, row.shift.day)}</h3>
        <p className="text-base text-ink-2">
          {row.shift.name} · {timeRange(t, row.shift)}
          {` · ${position(t, names, row)}`}
        </p>
      </div>
      <Handover t={t} names={names} row={row} />
      <Decisions {...view} row={row} about={about} block />
    </li>
  );
}

const th = "px-4 py-3 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "px-4 py-3 align-middle";

function RequestTable({
  names,
  rows,
  title,
  ...view
}: RowView & { rows: Row[]; title: string }) {
  const { t } = view;
  const columns = ["day", "shift", "position", "from", "to"] as const;
  return (
    <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
      <table className="w-full border-collapse text-base">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className={th}>
                {t(`swaps.columns.${c}`)}
              </th>
            ))}
            <th scope="col" className={th}>
              <span className="sr-only">{t("swaps.columns.decision")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RequestRow key={row.swap.id} {...view} names={names} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One request as a row of the desktop's table. */
function RequestRow({ names, row, after, ...view }: RowView & { row: Row }) {
  const { t } = view;
  const about = subject(t, names, row);
  const line = useRef<HTMLTableRowElement>(null);
  useFocusWhenGone(line, after(row.swap.id));
  const person = (name: string, photo: string | null) => (
    <span className="flex items-center gap-2.5">
      <Avatar name={name} photo={photo} size="sm" />
      <span className="min-w-0 font-medium">{name}</span>
    </span>
  );
  return (
    <tr ref={line} className="border-line border-t">
      <th scope="row" className={cn(td, "text-start font-medium")}>
        {dayLabel(t, row.shift.day)}
      </th>
      <td className={td}>
        {row.shift.name}
        <span className="block text-ink-2 text-sm">
          {timeRange(t, row.shift)}
        </span>
      </td>
      <td className={td}>{position(t, names, row)}</td>
      <td className={td}>
        {person(
          nameOf(t, names, row.swap.requestedBy),
          photoOf(names, row.swap.requestedBy),
        )}
      </td>
      <td className={td}>
        {person(
          nameOf(t, names, row.swap.takenBy),
          photoOf(names, row.swap.takenBy),
        )}
      </td>
      <td className={td}>
        <Decisions {...view} row={row} about={about} />
      </td>
    </tr>
  );
}
