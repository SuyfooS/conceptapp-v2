"use client";

import { dateIn, weekdayOf } from "@domain/availability";
import {
  type AvailabilityFormErrors,
  dayMonth,
  dayProblems,
  parseAvailabilityForm,
  type RangeProblem,
  WEEKDAY_KEYS,
} from "@domain/availability-form";
import { timeIn } from "@domain/shabbat";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { Check, CircleAlert, MessageSquareText, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useActionState,
  useEffect,
  useState,
} from "react";
import type { AvailabilityWeek } from "../week";
import type { AvailabilityState } from "./actions";
import {
  closedDraft,
  type DayDraft,
  DaySheet,
  ltr,
  NoteSheet,
  newRow,
  openDraft,
  type Row,
} from "./availability-sheets";
import { HeroChip } from "./hero-chip";

const initialState: AvailabilityState = {};

export type AvailabilityFormProps = {
  week: AvailabilityWeek;
  /** The due moment has passed. */
  late: boolean;
  /** `saveAvailabilityAction`, or the design demo's stand-in. */
  save: (prev: AvailabilityState, form: FormData) => Promise<AvailabilityState>;
};

const cardClass =
  "pressable flex flex-col items-start rounded-card bg-surface p-4 text-start shadow-card transition-[box-shadow,transform] hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The worker's availability for one week: the status at the top, a row per day
 * with that day's answer, and Send always in reach. A tap opens the day in a
 * sheet. Phone: one grouped list, Send floating above the tab bar; tablet: a
 * grid of four; desktop: the whole week in a row, Send on the hero. The same
 * checks run here, in the sheet and on the server.
 */
export function AvailabilityForm({ week, late, save }: AvailabilityFormProps) {
  const t = useTranslations("app.availability");
  const [state, action, pending] = useActionState(save, initialState);
  const [days, setDays] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(
      week.dates.map((date) => [
        date,
        (week.mine?.ranges ?? []).filter((r) => r.day === date).map(newRow),
      ]),
    ),
  );
  const [note, setNote] = useState(week.mine?.note ?? "");
  // Checked on submit; after a failed try, again on every change.
  const [checked, setChecked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  // What the two sheets are editing. A closed sheet keeps its draft for as long
  // as it takes to slide away.
  const [dayDraft, setDayDraft] = useState(() => closedDraft(week.start));
  const [noteDraft, setNoteDraft] = useState({ text: "", open: false });

  // "Saved" shows for a moment; the hero keeps saying it was sent.
  useEffect(() => {
    if (!state.savedAt) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 5000);
    return () => clearTimeout(timer);
  }, [state.savedAt]);

  const flat = week.dates.flatMap((date) =>
    (days[date] ?? []).map((r) => ({
      id: r.id,
      day: date,
      start: r.start,
      end: r.end,
    })),
  );
  const local = parseAvailabilityForm(
    { ranges: flat.map(({ id: _, ...range }) => range), note },
    week.start,
    week.shabbat,
  );
  const errors: AvailabilityFormErrors =
    checked && !local.ok ? local.errors : dirty ? {} : (state.errors ?? {});
  const errorOf = new Map<number, RangeProblem>();
  for (const [index, error] of Object.entries(errors.ranges ?? {})) {
    const id = flat[Number(index)]?.id;
    if (id !== undefined) errorOf.set(id, error);
  }
  // The form stops at overlaps until nothing else is wrong; a day on its own
  // does not, so every day with a problem shows after one try.
  const hasProblem = (date: string) => {
    const rows = days[date] ?? [];
    return (
      rows.some((r) => errorOf.has(r.id)) ||
      (checked &&
        !local.ok &&
        Object.keys(dayProblems(rows, date, week.start, week.shabbat)).length >
          0)
    );
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!local.ok) {
      event.preventDefault();
      setChecked(true);
      return;
    }
    setChecked(false);
    setDirty(false);
  }

  const patchDay = (patch: Partial<DayDraft>) =>
    setDayDraft((current) => ({ ...current, ...patch }));

  function finishDay(rows: Row[]) {
    setDays((current) => ({ ...current, [dayDraft.day]: rows }));
    setDirty(true);
    patchDay({ open: false });
  }

  function finishNote() {
    if (noteDraft.text !== note) {
      setNote(noteDraft.text);
      setDirty(true);
    }
    setNoteDraft((current) => ({ ...current, open: false }));
  }

  const count = week.dates.filter((d) => (days[d] ?? []).length > 0).length;
  const dayProps = (date: string) => ({
    date,
    rows: days[date] ?? [],
    shabbat: week.shabbat,
    problem: hasProblem(date),
    onOpen: () =>
      setDayDraft(
        openDraft(date, days[date] ?? [], week.shabbat, hasProblem(date)),
      ),
  });
  const noteProps = {
    note,
    error: errors.note ? t(`errors.note.${errors.note}`) : undefined,
    onOpen: () => setNoteDraft({ text: note, open: true }),
  };
  const sendLabel = (
    <>
      <Send aria-hidden="true" className="rtl:-scale-x-100" />
      {t("submit")}
      <span className="font-medium text-sm">
        {"· "}
        {t("submitDays", { count })}
      </span>
    </>
  );

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 pb-12 xl:pb-0"
    >
      <input type="hidden" name="week" value={week.start} />
      <input
        type="hidden"
        name="ranges"
        value={JSON.stringify(flat.map(({ id: _, ...range }) => range))}
      />
      <input type="hidden" name="note" value={note} />

      <div className="flex flex-col">
        <Hero
          week={week}
          late={late}
          send={
            <Button
              type="submit"
              size="lg"
              loading={pending}
              className="bg-accent-ink text-accent hover:bg-accent-ink/90 active:bg-accent-ink/80"
            >
              {sendLabel}
            </Button>
          }
        />
        {/* phone: one grouped list, lifted over the hero */}
        <ListGroup className="relative z-10 -mt-11 shadow-float min-[360px]:mx-3 md:hidden">
          {week.dates.map((date) => (
            <DayRow key={date} {...dayProps(date)} />
          ))}
        </ListGroup>
        {/* tablet and desktop: the days side by side */}
        <div className="relative z-10 mx-3 -mt-11 hidden grid-cols-4 gap-3 md:grid xl:grid-cols-7">
          {week.dates.map((date) => (
            <DayCard key={date} {...dayProps(date)} />
          ))}
          <NoteCard {...noteProps} className="xl:hidden" />
        </div>
      </div>

      <p className="px-4 text-ink-2 text-sm md:px-1">
        {t("summary", { count })}
      </p>

      <ListGroup className="mt-3 md:hidden xl:block">
        <NoteRow {...noteProps} />
      </ListGroup>

      {/* Above the tab bar; on a phone, beside it once scrolling shrinks it. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 mx-auto flex max-w-[480px] flex-col gap-2 transition-[inset-inline-start,bottom] duration-500 ease-spring max-md:[body:has(nav[data-compact])_&]:start-[5.625rem] max-md:[body:has(nav[data-compact])_&]:bottom-[calc(env(safe-area-inset-bottom)+14px)] xl:inset-x-auto xl:end-8 xl:bottom-8 xl:mx-0 xl:w-96">
        <div role="alert">
          <Problems t={t} errors={errors} state={state} dirty={dirty} />
        </div>
        <div role="status" className="flex justify-center xl:justify-end">
          {saved && state.savedAt && !dirty ? (
            <p className="glass flex min-h-11 items-center gap-2 rounded-full px-[18px] font-medium text-base">
              <Check aria-hidden="true" className="size-5 text-success" />
              {t("saved")}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="pointer-events-auto w-full shadow-[0_14px_28px_-10px_color-mix(in_oklab,var(--accent)_70%,black),inset_0_0.5px_0_rgb(255_255_255/0.35)] transition-[min-height,background-color,transform] max-md:[body:has(nav[data-compact])_&]:min-h-16 xl:hidden"
        >
          {sendLabel}
        </Button>
      </div>

      <DaySheet
        draft={dayDraft}
        week={week}
        onChange={patchDay}
        onClose={() => patchDay({ open: false })}
        onDone={finishDay}
      />
      <NoteSheet
        text={noteDraft.text}
        open={noteDraft.open}
        onChange={(text) => setNoteDraft({ text, open: true })}
        onClose={() => setNoteDraft((current) => ({ ...current, open: false }))}
        onDone={finishNote}
      />
    </form>
  );
}

/** When it is due and where the person stands. The one strong thing here. */
function Hero({
  week,
  late,
  send,
}: {
  week: AvailabilityWeek;
  late: boolean;
  send: ReactNode;
}) {
  const t = useTranslations("app.availability");
  const moment = (iso: string) => {
    const date = dateIn(new Date(iso), week.timeZone);
    return {
      day: t(`weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`),
      date: dayMonth(date),
      time: timeIn(new Date(iso), week.timeZone),
    };
  };
  const due = moment(week.dueAt);

  return (
    <Card
      tone="hero"
      padding="lg"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 pb-[4.25rem]"
    >
      <span className="font-medium text-base">
        {late
          ? t("hero.duePassed", { date: due.date })
          : t("hero.sendBy", { date: due.date })}
      </span>
      <span className="justify-self-end">
        <HeroChip icon={week.mine ? <Check aria-hidden="true" /> : undefined}>
          {week.mine ? t("hero.sent") : t("hero.notSent")}
        </HeroChip>
      </span>
      <p className="col-span-full mt-3 font-bold text-2xl xl:col-span-1">
        {t.rich("hero.when", { ...due, ltr })}
      </p>
      <p className="col-span-full text-balance text-base xl:col-span-1">
        {week.mine
          ? t.rich("sent", { ...moment(week.mine.updatedAt), ltr })
          : late
            ? t("hero.stillCan")
            : t("intro")}
      </p>
      <div className="col-start-2 row-span-2 row-start-2 hidden self-end justify-self-end xl:block">
        {send}
      </div>
    </Card>
  );
}

function Problems({
  t,
  errors,
  state,
  dirty,
}: {
  t: ReturnType<typeof useTranslations<"app.availability">>;
  errors: AvailabilityFormErrors;
  state: AvailabilityState;
  dirty: boolean;
}) {
  const messages = [
    errors.form
      ? t(`errors.form.${errors.form}`)
      : errors.ranges || errors.note
        ? t("fix")
        : null,
    state.failure && !dirty ? t(`errors.${state.failure}`) : null,
  ].filter((message) => message !== null);
  if (messages.length === 0) return null;
  return (
    <Card
      tone="float"
      className="pointer-events-auto flex items-start gap-2 text-base text-danger"
    >
      <CircleAlert aria-hidden="true" className="mt-px size-5 shrink-0" />
      <span className="flex flex-col gap-1">
        {messages.map((message) => (
          <span key={message}>{message}</span>
        ))}
      </span>
    </Card>
  );
}

type DayProps = {
  date: string;
  rows: Row[];
  shabbat: AvailabilityWeek["shabbat"];
  problem: boolean;
  onOpen: () => void;
};

const dayOfMonth = (date: string) => dayMonth(date).split(".")[0];

/** The date, filled with the business's colour once the day has hours. */
function DayChip({ date, rows, problem }: DayProps) {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-full font-bold text-base",
        problem
          ? "bg-danger-soft text-danger"
          : rows.length > 0
            ? "hero-surface"
            : "bg-surface-2 text-ink-2",
      )}
    >
      {dayOfMonth(date)}
    </span>
  );
}

function useDayText({ date, shabbat }: DayProps) {
  const t = useTranslations("app.availability");
  return {
    name: t("dayName", {
      day: t(`weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`),
    }),
    hint:
      shabbat && date === shabbat.friday
        ? t.rich("candleLightingShort", { time: shabbat.candleLighting, ltr })
        : shabbat && date === shabbat.saturday
          ? t.rich("havdalahShort", { time: shabbat.havdalah, ltr })
          : null,
    none: t("noHours"),
    fix: t("dayProblem"),
  };
}

/** A day's hours, one range under another, each reading left to right. */
function Hours({
  rows,
  problem,
  className,
}: {
  rows: Row[];
  problem: boolean;
  className?: string;
}) {
  return rows.map((r) => (
    <span
      key={r.id}
      className={cn(
        "block whitespace-nowrap font-semibold",
        problem && "text-danger",
        className,
      )}
    >
      <span dir="ltr">
        {r.start}–{r.end}
      </span>
    </span>
  ));
}

function DayRow(props: DayProps) {
  const { rows, problem, onOpen } = props;
  const text = useDayText(props);
  return (
    <ListRow
      onClick={onOpen}
      leading={<DayChip {...props} />}
      title={text.name}
      subtitle={
        problem ? <span className="text-danger">{text.fix}</span> : text.hint
      }
      trailing={
        rows.length > 0 ? (
          <Hours
            rows={rows}
            problem={problem}
            className="max-[359px]:text-base"
          />
        ) : (
          <span className="text-base text-ink-2">{text.none}</span>
        )
      }
      className="min-h-14 py-2"
    />
  );
}

function DayCard(props: DayProps) {
  const { rows, problem, onOpen } = props;
  const text = useDayText(props);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(cardClass, "min-h-44 xl:max-2xl:p-3.5")}
    >
      <DayChip {...props} />
      <span className="mt-2.5 font-semibold">{text.name}</span>
      {text.hint ? (
        <span className="text-ink-2 text-sm">{text.hint}</span>
      ) : null}
      <span className="mt-auto pt-2">
        {rows.length > 0 ? (
          <Hours
            rows={rows}
            problem={problem}
            className="xl:max-2xl:text-base"
          />
        ) : (
          <span className="text-base text-ink-2">{text.none}</span>
        )}
        {problem ? (
          <span className="block text-danger text-sm">{text.fix}</span>
        ) : null}
      </span>
    </button>
  );
}

type NoteProps = {
  note: string;
  error?: string;
  onOpen: () => void;
  className?: string;
};

function NoteText({ note, error }: NoteProps) {
  const t = useTranslations("app.availability");
  if (error) return <span className="text-danger">{error}</span>;
  return (
    <span className="[overflow-wrap:anywhere]">{note || t("noteHint")}</span>
  );
}

function NoteRow(props: NoteProps) {
  const t = useTranslations("app.availability");
  return (
    <ListRow
      onClick={props.onOpen}
      leading={<MessageSquareText />}
      title={t("note")}
      subtitle={<NoteText {...props} />}
    />
  );
}

function NoteCard(props: NoteProps) {
  const t = useTranslations("app.availability");
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className={cn(cardClass, "min-h-44", props.className)}
    >
      <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5">
        <MessageSquareText aria-hidden="true" />
      </span>
      <span className="mt-2.5 font-semibold">{t("note")}</span>
      <span className="text-ink-2 text-sm">
        <NoteText {...props} />
      </span>
    </button>
  );
}
