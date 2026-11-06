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
import { RefreshOnReturn } from "../../home/refresh-on-return";
import { MonthHero } from "../month-hero";
import { ShiftList } from "../shift-list";
import type {
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
  // The sheet stays mounted, closed, so it opens already inside the business's
  // colour; a sheet mounted open moves there on its first change and loses focus.
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>({ kind: "add" });
  const [opened, setOpened] = useState(0);
  const [saving, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; stamp: string } | null>(
    null,
  );
  const name = data.person.name ?? t("noName");
  const personHref = `${paths.team}/${data.person.userId}`;
  const record = target.kind === "edit" ? target.record : null;

  function show(next: Target) {
    setTarget(next);
    setOpened((count) => count + 1);
    setOpen(true);
  }

  function save(values: EntryValues, onFailure: (f: EntryFailure) => void) {
    start(async () => {
      try {
        const result = record
          ? await actions.correct(record.id, values)
          : await actions.add(data.person.userId, values);
        if (!result.ok) {
          onFailure(result.failure);
          return;
        }
        setToast({
          text: t(`done.${target.kind}`),
          stamp: new Date().toISOString(),
        });
        setOpen(false);
      } catch {
        onFailure("failed");
      }
    });
  }

  return (
    <PageBody className={pageGlowClass}>
      <RefreshOnReturn />
      <StatusToast message={toast?.text ?? null} stamp={toast?.stamp} />
      <PageHeader
        back={{ href: `${paths.team}?month=${data.month}`, label: t("title") }}
        title={name}
        actions={
          <Button
            size="lg"
            disabled={data.viewOnly}
            onClick={() => show({ kind: "add" })}
          >
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
                : (shift) => show({ kind: "edit", record: shift })
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

      <Sheet
        open={open}
        onOpenChange={(next) => {
          // A save under way finishes first: its answer belongs on this sheet.
          if (!saving) setOpen(next);
        }}
        title={t(record ? "sheet.editTitle" : "sheet.addTitle")}
        subtitle={t(record ? "sheet.editSubtitle" : "sheet.addSubtitle")}
        closeLabel={t("sheet.close")}
      >
        <EntryForm
          key={opened}
          record={record}
          // A new shift starts in the month on screen.
          date={
            data.month === data.currentMonth ? data.today : `${data.month}-01`
          }
          today={data.today}
          saving={saving}
          save={save}
        />
      </Sheet>
    </PageBody>
  );
}

function EntryForm({
  record,
  date,
  today,
  saving,
  save,
}: {
  record: ShiftRecord | null;
  date: string;
  today: string;
  saving: boolean;
  save: (values: EntryValues, onFailure: (f: EntryFailure) => void) => void;
}) {
  const t = useTranslations("app.clock.team");
  const id = useId();
  const [values, setValues] = useState<EntryValues>({
    date: record?.date ?? date,
    in: record?.in ?? "",
    out: record?.out ?? "",
  });
  const [failure, setFailure] = useState<EntryFailure | null>(null);
  // Only a shift still running may be left with no end, while it's within limits.
  const canStayOpen = record?.out === null && !record.overdue;

  function submit() {
    if (!canStayOpen && record && values.out === "") {
      setFailure("needsEnd");
      return;
    }
    setFailure(null);
    save(values, setFailure);
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
      <Button size="lg" loading={saving} onClick={submit}>
        {t(record ? "sheet.saveEdit" : "sheet.saveAdd")}
      </Button>
    </div>
  );
}
