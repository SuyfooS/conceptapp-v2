"use client";

import type { WeekScheduleShift } from "@db/schedule";
import type { Approval } from "@domain/swaps";
import { Avatar } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  type AppT,
  dayLabel,
  nameOf,
  positionName,
  type ShiftData,
  shiftLabel,
  timeRange,
} from "../shifts/shift-text";
import type { DecideState } from "./actions";
import { DecideButton } from "./decide-button";

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
    to: nameOf(t, names, row.swap.takenBy),
    shift: shiftLabel(t, row.shift),
  });

/**
 * The requests waiting for a decision. A decided request leaves the list at
 * once and says what was decided, as the prototype's request card does; the
 * database has no way to undo a decision.
 */
export function ApprovalsBoard({
  rows,
  people,
  positions,
  decide,
}: {
  rows: Row[];
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
  const title = t("swaps.list.title");

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
                  : t("swaps.settled.declined", { from, shift }),
            },
            ...list,
          ],
    );
  }

  const view = { t, names, decide, onDecided };

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="flex flex-col gap-2 empty:hidden">
        {settled.map((s) => (
          <p
            key={s.id}
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
        <Card padding="lg" className="md:max-w-xl">
          <CardText>{t("swaps.empty")}</CardText>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="font-bold text-lg">{title}</h2>
            <Badge tone="warning">
              {t("swaps.count", { count: waiting.length })}
            </Badge>
          </div>
          <ul
            aria-label={title}
            className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4 xl:hidden"
          >
            {waiting.map((row, i) => (
              <RequestCard
                key={row.swap.id}
                {...view}
                row={row}
                main={i === 0}
              />
            ))}
          </ul>
          <RequestTable {...view} rows={waiting} title={title} />
          <p className="px-1 text-ink-2 text-sm md:max-w-xl">
            {t("swaps.explain")}
          </p>
        </>
      )}
    </div>
  );
}

type RowView = {
  t: AppT;
  names: Names;
  decide: DecideAction;
  onDecided: (row: Row, decision: Decision) => void;
};

/** Who gives it away and who takes it, the arrow pointing the way it moves. */
function Handover({
  t,
  names,
  row,
}: Pick<RowView, "t" | "names"> & { row: Row }) {
  const from = nameOf(t, names, row.swap.requestedBy);
  const to = nameOf(t, names, row.swap.takenBy);
  const person = (name: string, role: string) => (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <Avatar name={name} />
      <span className="font-semibold text-base">{name}</span>
      <span className="text-ink-2 text-sm">{role}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-1 rounded-[20px] bg-surface-2/60 px-2 py-3">
      {person(from, t("swaps.columns.from"))}
      <ArrowLeft
        aria-hidden="true"
        className="size-5 shrink-0 text-ink-2 ltr:-scale-x-100"
      />
      {person(to, t("swaps.columns.to"))}
    </div>
  );
}

function RequestCard({
  t,
  names,
  decide,
  onDecided,
  row,
  main,
}: RowView & { row: Row; main: boolean }) {
  const about = subject(t, names, row);
  return (
    <li className="flex min-w-0 flex-col gap-3.5 rounded-[28px] bg-surface p-4 shadow-card">
      <div>
        <h3 className="font-bold text-lg">{dayLabel(t, row.shift.day)}</h3>
        <p className="text-base text-ink-2">
          {row.shift.name} · {timeRange(t, row.shift)}
          {` · ${position(t, names, row)}`}
        </p>
      </div>
      <Handover t={t} names={names} row={row} />
      <div className="flex items-start gap-2">
        <DecideButton
          action={decide}
          decision="approve"
          id={row.swap.id}
          subject={about}
          variant={main ? "primary" : "secondary"}
          block
          onDone={() => onDecided(row, "approve")}
        />
        <DecideButton
          action={decide}
          decision="decline"
          id={row.swap.id}
          subject={about}
          variant="ghost"
          block
          onDone={() => onDecided(row, "decline")}
        />
      </div>
    </li>
  );
}

const th = "px-4 py-3 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "px-4 py-3 align-middle";

function RequestTable({
  t,
  names,
  decide,
  onDecided,
  rows,
  title,
}: RowView & { rows: Row[]; title: string }) {
  const columns = ["day", "shift", "position", "from", "to"] as const;
  const person = (name: string) => (
    <span className="flex items-center gap-2.5">
      <Avatar name={name} size="sm" />
      <span className="min-w-0 font-medium">{name}</span>
    </span>
  );
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
          {rows.map((row, i) => {
            const about = subject(t, names, row);
            return (
              <tr key={row.swap.id} className="border-line border-t">
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
                  {person(nameOf(t, names, row.swap.requestedBy))}
                </td>
                <td className={td}>
                  {person(nameOf(t, names, row.swap.takenBy))}
                </td>
                <td className={td}>
                  <div className="flex items-start justify-end gap-2">
                    <DecideButton
                      action={decide}
                      decision="approve"
                      id={row.swap.id}
                      subject={about}
                      variant={i === 0 ? "primary" : "secondary"}
                      onDone={() => onDecided(row, "approve")}
                    />
                    <DecideButton
                      action={decide}
                      decision="decline"
                      id={row.swap.id}
                      subject={about}
                      variant="ghost"
                      onDone={() => onDecided(row, "decline")}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
