"use client";

import {
  type BreakRecord,
  parseReason,
  REASON_MAX,
  type ShiftRecord,
} from "@domain/time-clock";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { ltrInputClass, TextField } from "@ui/text-field";
import { useSheetWrite } from "@ui/use-sheet-write";
import { Ban, History, Plus, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { RefreshOnReturn } from "../../home/refresh-on-return";
import { MonthHero } from "../month-hero";
import { ShiftList, ShiftSummary } from "../shift-list";
import type {
  BreakValues,
  EntryActionResult,
  EntryActions,
  EntryFailure,
  EntryTarget,
  EntryValues,
  PersonHoursData,
  TeamPaths,
} from "./team-types";

/**
 * How long the toast's "ביטול" stays after a cancel or a break removed, as a
 * removed document's.
 */
const UNDO_SHOWN_MS = 10_000;

/** What the toast says, with the way back from a cancel or a removal. */
type Toast = { text: string; stamp: string; undo?: () => void };

/**
 * Back on the fix from a step: what led there, for the focus to go back to
 * ("ביטול המשמרת", or a break's row, null for "הוספת הפסקה").
 */
type StepBack = "cancel" | { breakId: string | null };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Still drawn and shown: somewhere the keyboard's focus can go. */
function shownNow(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  return element.getClientRects().length > 0;
}

/**
 * One person's shifts in a month: a manager fixes them and adds what's
 * missing, cancels one entered by mistake (it stays, marked, with "ביטול" in a
 * toast for 10 seconds) and brings a cancelled one back, and fixes a shift's
 * breaks one at a time: changes one, adds one forgotten, removes one pressed
 * by mistake (with "ביטול" in the toast too).
 */
export function PersonHoursView({
  data,
  actions,
  paths,
  opens,
}: {
  data: PersonHoursData;
  actions: EntryActions;
  paths: TeamPaths;
  /** Opens with the sheet on this (the design demo's `?state=`). */
  opens?: EntryTarget;
}) {
  const t = useTranslations("app.clock.team");
  // The month and the shifts speak the history's words.
  const tHistory = useTranslations("app.clock.history");
  // The sheet stays mounted, closed, so it opens already inside the business's
  // colour; a sheet mounted open moves there on its first change and loses focus.
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<EntryTarget>({ kind: "add" });
  const [opened, setOpened] = useState(0);
  // Why the toast's "ביטול" didn't go, said as the cancelled shift opens, or
  // the shift whose break was removed.
  const [failed, setFailed] = useState<EntryFailure | null>(null);
  // Back on the fix from the cancel's or a break's step: the focus goes to
  // where it left, and the fix is as it was typed.
  const [stepBack, setStepBack] = useState<StepBack | null>(null);
  const [draft, setDraft] = useState<EntryValues | null>(null);
  // The shift's times as the sheet opened on them: what "typed and not
  // saved" is measured from, whatever a refresh reads meanwhile.
  const [baseline, setBaseline] = useState<EntryValues | null>(null);
  // A write from the sheet: the sheet stays until its answer (`held`), and
  // the spinner and the buttons until the page read again after it is drawn
  // (`saving`), so no second write goes out against what was there before.
  const { pending: saving, start, held } = useSheetWrite();
  // The toast's "ביטול" runs on its own, so a sheet opened meanwhile isn't held.
  const [, startUndo] = useTransition();
  // Whether a sheet is open as a write comes back (the state, read late).
  const sheetOpen = useRef(false);
  useEffect(() => {
    sheetOpen.current = open;
  }, [open]);
  const [toast, setToast] = useState<Toast | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /** What opened the sheet: where the focus goes once a toast holding it goes. */
  const opener = useRef<HTMLElement | null>(null);
  const name = data.person.name ?? t("noName");
  const personHref = `${paths.team}/${data.person.userId}`;
  // The shift as the page has it now: after a write it is read again.
  const record =
    target.kind === "add"
      ? null
      : (data.records.find((shift) => shift.id === target.record.id) ??
        target.record);
  // The break as the page has it now, the same way.
  const pause =
    target.kind === "break" && target.pause
      ? (record?.breaks.find((one) => one.id === target.pause?.id) ??
        target.pause)
      : null;

  function show(next: EntryTarget, failure: EntryFailure | null = null) {
    setTarget(next);
    setFailed(failure);
    setStepBack(null);
    setDraft(null);
    setBaseline(
      next.kind === "add"
        ? null
        : {
            date: next.record.date,
            in: next.record.in ?? "",
            out: next.record.out ?? "",
            reason: "",
          },
    );
    setOpened((count) => count + 1);
    setOpen(true);
  }

  /** Opened from the page: what was pressed is kept, to come back to. */
  function showFromPage(next: EntryTarget) {
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    show(next);
  }

  /**
   * The way on inside the open sheet: to the cancel's or a break's step, and
   * back to the fix (`from`: what led away from it).
   */
  function step(next: EntryTarget, from: StepBack | null = null) {
    setStepBack(next.kind === "edit" ? from : null);
    setFailed(null);
    setTarget(next);
  }

  /** The focus once the toast that held it goes: what opened the sheet, or the title. */
  function focusBack() {
    const back = [opener.current, heading.current].find(shownNow);
    back?.focus({ preventScroll: true });
  }

  // The design demo opens on a sheet once the page is drawn, inside its colour.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the page opens
  useEffect(() => {
    if (opens) show(opens);
  }, []);

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
          text: t(record ? "done.edit" : "done.add"),
          stamp: new Date().toISOString(),
        });
        setOpen(false);
      } catch {
        onFailure("failed");
      }
    });
  }

  /**
   * Cancel it at once, with "ביטול" in the toast for 10 seconds, rather than
   * asking first. The sheet's button goes with the sheet, so the keyboard's
   * focus goes on to that "ביטול".
   */
  function cancelShift(
    shift: ShiftRecord,
    reason: string,
    onFailure: (f: EntryFailure) => void,
  ) {
    start(async () => {
      try {
        const result = await actions.cancel(shift.id, reason);
        if (!result.ok) {
          onFailure(result.failure);
          return;
        }
        setOpen(false);
        setToast({
          text: t("done.cancel"),
          stamp: `cancel-${Date.now()}`,
          undo: () => restoreShift(shift),
        });
      } catch {
        onFailure("failed");
      }
    });
  }

  /**
   * Bring it back: from its sheet, which says why when it can't, or from the
   * toast's "ביטול", which then opens the cancelled shift to say why.
   */
  function restoreShift(
    shift: ShiftRecord,
    onFailure?: (f: EntryFailure) => void,
  ) {
    (onFailure ? start : startUndo)(async () => {
      let result: EntryActionResult;
      try {
        result = await actions.restore(shift.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (result.ok) {
        // From its sheet, the sheet closes; from the toast there was none,
        // and one opened meanwhile stays as it is.
        if (onFailure) setOpen(false);
        setToast({ text: t("done.restore"), stamp: `restore-${Date.now()}` });
      } else if (onFailure) {
        onFailure(result.failure);
      } else if (!sheetOpen.current) {
        // The toast's "ביטול" didn't go: the shift, cancelled, says why. The
        // focus comes back to what opened it before.
        show({ kind: "cancelled", record: shift }, result.failure);
      } else {
        // A sheet opened meanwhile keeps what is typed in it: the toast says it.
        setToast({
          text: t(`failure.${result.failure}`),
          stamp: `undo-${Date.now()}`,
        });
      }
    });
  }

  /** A break's new times, or a break added, with why: the sheet closes. */
  function saveBreak(
    shift: ShiftRecord,
    edited: BreakRecord | null,
    values: BreakValues,
    onFailure: (f: EntryFailure) => void,
  ) {
    start(async () => {
      try {
        const result = edited
          ? await actions.changeBreak(shift.id, edited.id, values)
          : await actions.addBreak(shift.id, values);
        if (!result.ok) {
          onFailure(result.failure);
          return;
        }
        setToast({
          text: t(edited ? "done.changeBreak" : "done.addBreak"),
          stamp: new Date().toISOString(),
        });
        setOpen(false);
      } catch {
        onFailure("failed");
      }
    });
  }

  /**
   * Remove a break pressed by mistake at once, with "ביטול" in the toast for
   * 10 seconds (the database takes it back for ten minutes), as a cancel.
   */
  function removeBreak(
    shift: ShiftRecord,
    removed: BreakRecord,
    reason: string,
    onFailure: (f: EntryFailure) => void,
  ) {
    start(async () => {
      try {
        const result = await actions.removeBreak(removed.id, reason);
        if (!result.ok) {
          onFailure(result.failure);
          return;
        }
        setOpen(false);
        setToast({
          text: t("done.removeBreak"),
          stamp: `remove-break-${Date.now()}`,
          undo: () => restoreBreak(shift, removed),
        });
      } catch {
        onFailure("failed");
      }
    });
  }

  /**
   * The toast's "ביטול" after a break removed, on its own as a shift's: when
   * it can't, the shift opens saying why, or the toast says it over a sheet
   * opened meanwhile.
   */
  function restoreBreak(shift: ShiftRecord, removed: BreakRecord) {
    startUndo(async () => {
      let result: EntryActionResult;
      try {
        result = await actions.restoreBreak(removed.id);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (result.ok) {
        setToast({
          text: t("done.restoreBreak"),
          stamp: `restore-break-${Date.now()}`,
        });
      } else if (!sheetOpen.current) {
        show({ kind: "edit", record: shift }, result.failure);
      } else {
        setToast({
          text: t(`failure.${result.failure}`),
          stamp: `undo-${Date.now()}`,
        });
      }
    });
  }

  const sheetTitle = {
    add: t("sheet.addTitle"),
    edit: t("sheet.editTitle"),
    cancel: t("cancel.title"),
    cancelled: t("cancelled.title"),
    break: t(pause ? "breakStep.editTitle" : "breakStep.addTitle"),
  }[target.kind];
  const sheetSubtitle =
    target.kind === "add"
      ? t("sheet.addSubtitle")
      : target.kind === "edit"
        ? t("sheet.editSubtitle")
        : target.kind === "break"
          ? t(pause ? "breakStep.editSubtitle" : "breakStep.addSubtitle")
          : undefined;

  return (
    <PageBody className={pageGlowClass}>
      <RefreshOnReturn />
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
        action={
          toast?.undo
            ? {
                label: t("done.undo"),
                onClick: () => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                },
              }
            : null
        }
        // The sheet that held the focus closed with the cancel: on to "ביטול".
        focusAction={toast?.undo !== undefined}
        onFocusLeave={focusBack}
      />
      <PageHeader
        back={{ href: `${paths.team}?month=${data.month}`, label: t("title") }}
        title={name}
        headingRef={heading}
        actions={
          <Button
            size="lg"
            disabled={data.viewOnly}
            onClick={() => showFromPage({ kind: "add" })}
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
          countId={`person-${data.person.userId}`}
          // A cancelled shift is listed, and counts as none.
          caption={t("caption", {
            count: data.records.filter((shift) => shift.cancelled === null)
              .length,
          })}
          t={tHistory}
          overlap={data.records.length > 0}
        />
        {data.records.length > 0 ? (
          <ShiftList
            records={data.records}
            t={tHistory}
            // Viewing only, nothing opens: no fix, no cancel, no way back.
            onEdit={
              data.viewOnly
                ? undefined
                : (shift) =>
                    showFromPage(
                      shift.cancelled
                        ? { kind: "cancelled", record: shift }
                        : { kind: "edit", record: shift },
                    )
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
          // A save under way finishes first: its answer belongs on this
          // sheet. Only its answer: a refusal shows at once, while the page
          // read again after it may still be on its way.
          if (!held()) setOpen(next);
        }}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        closeLabel={t("sheet.close")}
      >
        {target.kind === "cancel" && record ? (
          <CancelForm
            key={opened}
            record={record}
            saving={saving}
            cancel={(reason, onFailure) =>
              cancelShift(record, reason, onFailure)
            }
            back={() => step({ kind: "edit", record }, "cancel")}
          />
        ) : target.kind === "break" && record ? (
          <BreakForm
            key={`${opened}-${pause?.id ?? "new"}`}
            record={record}
            pause={pause}
            unpaidBreaks={data.unpaidBreaks}
            saving={saving}
            save={(values, onFailure) =>
              saveBreak(record, pause, values, onFailure)
            }
            remove={
              pause
                ? (reason, onFailure) =>
                    removeBreak(record, pause, reason, onFailure)
                : undefined
            }
            back={() =>
              step({ kind: "edit", record }, { breakId: pause?.id ?? null })
            }
          />
        ) : target.kind === "cancelled" && record ? (
          <CancelledForm
            key={opened}
            record={record}
            failed={failed}
            saving={saving}
            restore={(onFailure) => restoreShift(record, onFailure)}
          />
        ) : (
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
            failed={failed}
            returning={stepBack}
            initial={stepBack ? draft : null}
            baseline={baseline}
            toCancel={
              record
                ? (values) => {
                    setDraft(values);
                    step({ kind: "cancel", record });
                  }
                : undefined
            }
            toBreak={
              record
                ? (chosen, values) => {
                    setDraft(values);
                    step({ kind: "break", record, pause: chosen });
                  }
                : undefined
            }
          />
        )}
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
  failed,
  returning,
  initial,
  baseline,
  toCancel,
  toBreak,
}: {
  record: ShiftRecord | null;
  date: string;
  today: string;
  saving: boolean;
  save: (values: EntryValues, onFailure: (f: EntryFailure) => void) => void;
  /** Why the toast's "ביטול" of a break removed didn't go, said as it opens. */
  failed: EntryFailure | null;
  /** Back from a step: the focus goes to what led there. */
  returning: StepBack | null;
  /** The fix as it was typed before a step, back from it. */
  initial: EntryValues | null;
  /** The shift's times as the sheet opened on them. */
  baseline: EntryValues | null;
  /** A shift that is there: the way to cancel it, beside fixing it, with the fix as typed. */
  toCancel?: (values: EntryValues) => void;
  /**
   * A shift that is there: the way to fix one of its breaks, or to add one
   * (null), with the fix as typed.
   */
  toBreak?: (pause: BreakRecord | null, values: EntryValues) => void;
}) {
  const t = useTranslations("app.clock.team");
  const id = useId();
  const reasonField = useRef<HTMLInputElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const breakRows = useRef<HTMLDivElement>(null);
  // The reason starts empty each time it opens: it says why this change is
  // made. Back from the cancel's step, the fix is as it was typed.
  const [values, setValues] = useState<EntryValues>(
    initial ?? {
      date: record?.date ?? date,
      in: record?.in ?? "",
      out: record?.out ?? "",
      reason: "",
    },
  );
  const [failure, setFailure] = useState<EntryFailure | null>(failed);
  // Only a shift still running may be left with no end, while it's within limits.
  const canStayOpen = record?.out === null && !record.overdue;
  // Times typed and not saved: a break's save or removal closes the sheet,
  // so its rows wait until these are saved, rather than lose them.
  // Measured from the times the sheet opened on, not the shift as a refresh
  // reads it now, so nothing reads as typed that wasn't.
  const timesChanged =
    record !== null &&
    baseline !== null &&
    (values.date !== baseline.date ||
      values.in !== baseline.in ||
      values.out !== baseline.out);

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as it is drawn
  useEffect(() => {
    if (returning === "cancel") {
      cancelButton.current?.focus();
    } else if (returning && record) {
      // A break's row, or "הוספת הפסקה" after them all.
      const { breakId } = returning;
      const index =
        breakId === null
          ? record.breaks.length
          : record.breaks.findIndex((pause) => pause.id === breakId);
      const row = breakRows.current?.children.item(index);
      if (row instanceof HTMLElement) row.focus();
    }
  }, []);

  /** A missing reason is said under its field, which takes the focus. */
  function fail(next: EntryFailure) {
    setFailure(next);
    if (next === "reasonNeeded") reasonField.current?.focus();
  }

  function submit() {
    if (!canStayOpen && record && values.out === "") {
      fail("needsEnd");
      return;
    }
    if (parseReason(values.reason) === null) {
      fail("reasonNeeded");
      return;
    }
    setFailure(null);
    save(values, fail);
  }

  const field = (key: "date" | "in" | "out", type: "date" | "time") => (
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
      {record && toBreak ? (
        <BreakRows
          breaks={record.breaks}
          listRef={breakRows}
          disabled={saving || timesChanged}
          note={timesChanged ? t("breaks.saveFirst") : null}
          open={(pause) => toBreak(pause, values)}
        />
      ) : null}
      <TextField
        ref={reasonField}
        label={t("sheet.reason")}
        hint={t("sheet.reasonHint")}
        error={
          failure === "reasonNeeded" ? t("failure.reasonNeeded") : undefined
        }
        value={values.reason}
        maxLength={REASON_MAX}
        required
        autoComplete="off"
        onChange={(event) => {
          setValues({ ...values, reason: event.target.value });
          if (failure === "reasonNeeded") setFailure(null);
        }}
      />
      {failure && failure !== "reasonNeeded" ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      <Button size="lg" loading={saving} onClick={submit}>
        {t(record ? "sheet.saveEdit" : "sheet.saveAdd")}
      </Button>
      {toCancel ? (
        // Beside the fix, never the main action: a shift entered by mistake.
        <Button
          ref={cancelButton}
          variant="ghost"
          disabled={saving}
          onClick={() => toCancel(values)}
          className="text-danger"
        >
          <Ban aria-hidden="true" />
          {t("sheet.cancelShift")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A shift's breaks under its times, one row each: "13:00–13:30 · 30 דק׳",
 * "לא בתשלום" under one that came off the hours. One that ended opens its
 * step; one still running is shown and opens nothing (it ends with the
 * person, a clock-out or a fix of the shift's end). Then "הוספת הפסקה".
 */
function BreakRows({
  breaks,
  listRef,
  disabled,
  note,
  open,
}: {
  breaks: BreakRecord[];
  /** Its rows, in order, "הוספת הפסקה" last: to give the focus back to. */
  listRef: Ref<HTMLDivElement>;
  disabled: boolean;
  /** Why its rows wait, said under them. */
  note: string | null;
  open: (pause: BreakRecord | null) => void;
}) {
  const t = useTranslations("app.clock.team");
  const id = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would style and announce these rows as a form
    <div
      role="group"
      aria-labelledby={id}
      aria-describedby={`${id}-note`}
      className="flex flex-col"
    >
      <h3 id={id} className="px-3 pt-1 pb-1.5 font-semibold text-ink-2 text-sm">
        {t("breaks.title")}
      </h3>
      <ListGroup ref={listRef} className="bg-elevated">
        {breaks.map((pause) => {
          const title =
            pause.end === null
              ? t.rich("breaks.rowOpen", {
                  ltr,
                  start: pause.start,
                  minutes: pause.minutes,
                })
              : t.rich("breaks.row", {
                  ltr,
                  start: pause.start,
                  end: pause.end,
                  minutes: pause.minutes,
                });
          const subtitle = [
            pause.end === null ? t("breaks.running") : null,
            pause.unpaid ? t("breaks.unpaid") : null,
          ]
            .filter((line) => line !== null)
            .join(" · ");
          return pause.end === null ? (
            <ListRow key={pause.id} title={title} subtitle={subtitle} />
          ) : (
            <ListRow
              key={pause.id}
              title={title}
              subtitle={subtitle || undefined}
              disabled={disabled}
              onClick={() => open(pause)}
            />
          );
        })}
        <ListRow
          leading={<Plus aria-hidden="true" />}
          title={t("breaks.add")}
          disabled={disabled}
          onClick={() => open(null)}
        />
      </ListGroup>
      {/* Always there, so a screen reader hears it as the rows wait. */}
      <p
        id={`${id}-note`}
        role="status"
        // Empty, out of the flow but still read (not display: none, which a
        // reader would miss as it fills), as access-view's does.
        className="px-1 pt-1.5 text-ink-2 text-sm empty:sr-only"
      >
        {note}
      </p>
    </div>
  );
}

/**
 * A break's step: the shift, the break's start and end (HH:MM, one past
 * midnight takes no date), whether it comes off the hours, why (required, as
 * a correction's), and "שמירת ההפסקה" ("הוספת ההפסקה" for a new one). One
 * that is there can be removed instead, with the same why, at once: the
 * toast's "ביטול" brings it back.
 */
function BreakForm({
  record,
  pause,
  unpaidBreaks,
  saving,
  save,
  remove,
  back,
}: {
  record: ShiftRecord;
  /** Null: adding one. */
  pause: BreakRecord | null;
  /** A break added now comes off the hours. */
  unpaidBreaks: boolean;
  saving: boolean;
  save: (values: BreakValues, onFailure: (f: EntryFailure) => void) => void;
  remove?: (reason: string, onFailure: (f: EntryFailure) => void) => void;
  back: () => void;
}) {
  const t = useTranslations("app.clock.team");
  const tHistory = useTranslations("app.clock.history");
  const id = useId();
  const startField = useRef<HTMLInputElement>(null);
  const reasonField = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<BreakValues>({
    start: pause?.start ?? "",
    end: pause?.end ?? "",
    reason: "",
  });
  const [failure, setFailure] = useState<EntryFailure | null>(null);
  // Which of the two is under way, for its spinner.
  const [removing, setRemoving] = useState(false);

  // The times are what this step is about: the first has the focus.
  useEffect(() => {
    startField.current?.focus({ preventScroll: true });
  }, []);

  /** A missing reason is said under its field, which takes the focus. */
  function fail(next: EntryFailure) {
    setFailure(next);
    if (next === "reasonNeeded") reasonField.current?.focus();
  }

  /** Why is asked for whichever way it goes, saved or removed. */
  function withReason(run: () => void) {
    if (parseReason(values.reason) === null) {
      fail("reasonNeeded");
      return;
    }
    setFailure(null);
    run();
  }

  function submit() {
    if (values.start === "" || values.end === "") {
      fail("breakTimes");
      return;
    }
    setRemoving(false);
    withReason(() => save(values, fail));
  }

  const field = (key: "start" | "end") => (
    <FieldRow label={t(`breakStep.${key}`)} htmlFor={`${id}-${key}`}>
      <input
        id={`${id}-${key}`}
        ref={key === "start" ? startField : undefined}
        type="time"
        dir="ltr"
        value={values[key]}
        onChange={(event) =>
          setValues({ ...values, [key]: event.target.value })
        }
        className={cn(rowPillInputClass, ltrInputClass)}
      />
    </FieldRow>
  );

  // Whether it comes off the hours stays as it was recorded; a new one
  // follows the setting now.
  const paid = pause
    ? t(pause.unpaid ? "breakStep.unpaid" : "breakStep.paid")
    : t(unpaidBreaks ? "breakStep.newUnpaid" : "breakStep.newPaid");

  return (
    <div className="flex flex-col gap-3">
      <ShiftSummary record={record} t={tHistory} className="bg-elevated" />
      <ListGroup className="bg-elevated">
        {field("start")}
        {field("end")}
      </ListGroup>
      <p className="px-1 text-ink-2 text-sm">
        {t("breakStep.hint")}
        <span className="block">{paid}</span>
      </p>
      <TextField
        ref={reasonField}
        label={t("sheet.reason")}
        hint={t("sheet.reasonHint")}
        error={
          failure === "reasonNeeded" ? t("failure.reasonNeeded") : undefined
        }
        value={values.reason}
        maxLength={REASON_MAX}
        required
        autoComplete="off"
        onChange={(event) => {
          setValues({ ...values, reason: event.target.value });
          if (failure === "reasonNeeded") setFailure(null);
        }}
      />
      {failure && failure !== "reasonNeeded" ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      <Button
        size="lg"
        loading={saving && !removing}
        disabled={saving}
        onClick={submit}
      >
        {t(pause ? "breakStep.save" : "breakStep.saveAdd")}
      </Button>
      {remove ? (
        // Beside saving it, never the main action: a break pressed by mistake.
        <Button
          variant="ghost"
          loading={saving && removing}
          disabled={saving}
          onClick={() => {
            setRemoving(true);
            withReason(() => remove(values.reason, fail));
          }}
          className="text-danger"
        >
          <Trash2 aria-hidden="true" />
          {t("breakStep.remove")}
        </Button>
      ) : null}
      <Button variant="ghost" disabled={saving} onClick={back}>
        {t("breakStep.back")}
      </Button>
    </div>
  );
}

/**
 * The cancel's step: the shift, what a cancel does to it, why (required, as a
 * correction's), and the danger button. Pressed, it cancels at once; the
 * toast's "ביטול" brings it back.
 */
function CancelForm({
  record,
  saving,
  cancel,
  back,
}: {
  record: ShiftRecord;
  saving: boolean;
  cancel: (reason: string, onFailure: (f: EntryFailure) => void) => void;
  back: () => void;
}) {
  const t = useTranslations("app.clock.team");
  const tHistory = useTranslations("app.clock.history");
  const reasonField = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<EntryFailure | null>(null);

  // Why is the one thing to write here: it has the focus.
  useEffect(() => {
    reasonField.current?.focus({ preventScroll: true });
  }, []);

  /** A missing reason is said under its field, which takes the focus. */
  function fail(next: EntryFailure) {
    setFailure(next);
    if (next === "reasonNeeded") reasonField.current?.focus();
  }

  function submit() {
    if (parseReason(reason) === null) {
      fail("reasonNeeded");
      return;
    }
    setFailure(null);
    cancel(reason, fail);
  }

  return (
    <div className="flex flex-col gap-3">
      <ShiftSummary record={record} t={tHistory} className="bg-elevated" />
      <p className="px-1 text-ink-2 text-sm">
        {t("cancel.hint")}
        {/* One still open ends with it: the person can clock in again. */}
        {record.out === null ? (
          <span className="block">{t("cancel.openHint")}</span>
        ) : null}
      </p>
      <TextField
        ref={reasonField}
        label={t("cancel.reason")}
        hint={t("sheet.reasonHint")}
        error={
          failure === "reasonNeeded" ? t("cancel.reasonNeeded") : undefined
        }
        value={reason}
        maxLength={REASON_MAX}
        required
        autoComplete="off"
        onChange={(event) => {
          setReason(event.target.value);
          if (failure === "reasonNeeded") setFailure(null);
        }}
      />
      {failure && failure !== "reasonNeeded" ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      <Button variant="danger" size="lg" loading={saving} onClick={submit}>
        <Ban aria-hidden="true" />
        {t("cancel.save")}
      </Button>
      <Button variant="ghost" disabled={saving} onClick={back}>
        {t("cancel.back")}
      </Button>
    </div>
  );
}

/**
 * A cancelled shift: who cancelled it, when and why, and the way to bring it
 * back as it was, with no reason (the log keeps who and when).
 */
function CancelledForm({
  record,
  failed,
  saving,
  restore,
}: {
  record: ShiftRecord;
  /** Why it didn't come back from the toast's "ביטול", said as it opens. */
  failed: EntryFailure | null;
  saving: boolean;
  restore: (onFailure: (f: EntryFailure) => void) => void;
}) {
  const t = useTranslations("app.clock.team");
  const tHistory = useTranslations("app.clock.history");
  const [failure, setFailure] = useState<EntryFailure | null>(failed);

  return (
    <div className="flex flex-col gap-3">
      <ShiftSummary record={record} t={tHistory} className="bg-elevated" />
      <p className="px-1 text-ink-2 text-sm">
        {t("cancelled.hint")}
        {/* The cancel ended it: it comes back open. */}
        {record.cancelled && record.out === null ? (
          <span className="block">{t("cancelled.openHint")}</span>
        ) : null}
      </p>
      {failure ? (
        <p role="alert" className="px-1 font-medium text-danger">
          {t(`failure.${failure}`)}
        </p>
      ) : null}
      <Button
        size="lg"
        loading={saving}
        onClick={() => {
          setFailure(null);
          restore(setFailure);
        }}
      >
        <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />
        {t("cancelled.restore")}
      </Button>
    </div>
  );
}
