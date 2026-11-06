"use client";

import type { ShiftRecord } from "@domain/time-clock";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { History, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { MonthHero } from "../month-hero";
import { ShiftList } from "../shift-list";
import type {
  EntryActionResult,
  EntryActions,
  EntryFailure,
  EntryValues,
  PersonHoursData,
  TeamPaths,
} from "./team-types";

type Target = { kind: "add" } | { kind: "edit"; record: ShiftRecord };

/** One person's shifts in a month: a manager fixes them and adds what's missing. */
export function PersonHoursView({
  data,
  actions,
  paths,
}: {
  data: PersonHoursData;
  actions: EntryActions;
  paths: TeamPaths;
}) {
  const t = useTranslations("app.clock.team");
  const [target, setTarget] = useState<Target | null>(null);
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  const name = data.person.name ?? t("noName");
  const personHref = `${paths.team}/${data.person.userId}`;
  const add = () => setTarget({ kind: "add" });

  return (
    <PageBody className={pageGlowClass}>
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <PageHeader
        back={{ href: `${paths.team}?month=${data.month}`, label: t("title") }}
        title={name}
        actions={
          <Button size="lg" disabled={data.viewOnly} onClick={add}>
            <Plus aria-hidden="true" />
            {t("person.add")}
          </Button>
        }
      />

      <div className="flex flex-col md:mx-auto md:w-full md:max-w-2xl xl:max-w-none">
        <MonthHero
          month={data.month}
          currentMonth={data.currentMonth}
          hrefFor={(month) => `${personHref}?month=${month}`}
          minutes={data.minutes}
          caption={t("caption", { count: data.records.length })}
          overlap={data.records.length > 0}
        />
        {data.records.length > 0 ? (
          <ShiftList
            records={data.records}
            onEdit={
              data.viewOnly
                ? undefined
                : (record) => setTarget({ kind: "edit", record })
            }
            className="relative z-10 mx-3 -mt-[56px] shadow-float xl:mx-5"
          />
        ) : (
          <EmptyState
            icon={<History />}
            headingLevel="h2"
            title={t("person.emptyTitle")}
            body={t("person.emptyBody")}
            className="py-8"
          />
        )}
      </div>

      {data.viewOnly ? (
        <p className="text-center text-ink-2 text-sm">
          {t("failure.viewOnly")}
        </p>
      ) : null}

      {target ? (
        <EntrySheet
          key={target.kind === "edit" ? target.record.id : "add"}
          target={target}
          today={data.today}
          onClose={() => setTarget(null)}
          save={(values) =>
            target.kind === "edit"
              ? actions.correct(target.record.id, values)
              : actions.add(data.person.userId, values)
          }
          onSaved={() => {
            setToast({
              text: t(`done.${target.kind}`),
              stamp: new Date().toISOString(),
            });
            setTarget(null);
          }}
        />
      ) : null}
    </PageBody>
  );
}

function EntrySheet({
  target,
  today,
  onClose,
  save,
  onSaved,
}: {
  target: Target;
  today: string;
  onClose: () => void;
  save: (values: EntryValues) => Promise<EntryActionResult>;
  onSaved: () => void;
}) {
  const t = useTranslations("app.clock.team");
  const id = useId();
  const record = target.kind === "edit" ? target.record : null;
  const [values, setValues] = useState<EntryValues>({
    date: record?.date ?? today,
    in: record?.in ?? "",
    out: record?.out ?? "",
  });
  const [failure, setFailure] = useState<EntryFailure | null>(null);
  const [pending, start] = useTransition();
  // Left open past the limit, it can't stay open.
  const canStayOpen = record?.out === null && !record.overdue;

  function submit() {
    setFailure(null);
    start(async () => {
      try {
        const result = await save(values);
        if (result.ok) onSaved();
        else setFailure(result.failure);
      } catch {
        setFailure("failed");
      }
    });
  }

  const field = (key: keyof EntryValues, type: "date" | "time") => (
    <FieldRow label={t(`sheet.${key}`)} htmlFor={`${id}-${key}`}>
      <input
        id={`${id}-${key}`}
        type={type}
        dir="ltr"
        max={type === "date" ? today : undefined}
        value={values[key]}
        onChange={(event) =>
          setValues({ ...values, [key]: event.target.value })
        }
        className={rowPillInputClass}
      />
    </FieldRow>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(record ? "sheet.editTitle" : "sheet.addTitle")}
      subtitle={t(record ? "sheet.editSubtitle" : "sheet.addSubtitle")}
      closeLabel={t("sheet.close")}
    >
      <div className="flex flex-col gap-3">
        <ListGroup className="bg-elevated">
          {field("date", "date")}
          {field("in", "time")}
          {field("out", "time")}
        </ListGroup>
        <p className="px-1 text-ink-2 text-sm">
          {canStayOpen ? t("sheet.openHint") : t("sheet.nextDayHint")}
        </p>
        {failure ? (
          <p role="alert" className="px-1 font-medium text-danger">
            {t(`failure.${failure}`)}
          </p>
        ) : null}
        <Button size="lg" loading={pending} onClick={submit}>
          {t(record ? "sheet.saveEdit" : "sheet.saveAdd")}
        </Button>
      </div>
    </Sheet>
  );
}
