"use client";

import { addDays } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import type {
  CopyDay,
  CopySkip,
  CopySource,
  WeekCopy,
} from "@domain/copy-week";
import { MAX_SHIFTS_IN_A_WEEK } from "@domain/staffing";
import { Button } from "@ui/button";
import { FieldRow } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { SheetSection } from "./sheet-section";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Who wasn't copied, in the order the sheet groups them. */
const NAMED = ["unavailable", "busy", "offStaff"] as const;

/** Before the sheet first opens: nothing worked out yet. */
const NOTHING: WeekCopy = {
  week: [],
  days: [],
  shifts: 0,
  people: 0,
  places: 0,
  skipped: [],
  staffedDays: 0,
  tooMany: false,
};

/**
 * What copying last week would do, before anything changes on the screen:
 * how many shifts and people, each day and what becomes of it, the switch to
 * replace days that already have people, and who wasn't copied and why (who
 * left is counted, never named). Its main action puts the copy on the
 * screen; nothing is saved or sent until the dock's buttons are pressed, and
 * the sheet says so. When there is nothing to copy it says why instead. It is
 * drawn closed before anything is worked out (`copy` null), as the builder's
 * other sheets are, so it opens inside the business's colour.
 */
export function CopyWeekSheet({
  open,
  copy: worked,
  source,
  replace,
  onReplace,
  onCopy,
  onClose,
  nameOf,
  weekday,
}: {
  open: boolean;
  /** What the copy would do; null before it was first worked out. */
  copy: WeekCopy | null;
  source: CopySource;
  replace: boolean;
  onReplace: (replace: boolean) => void;
  onCopy: () => void;
  onClose: () => void;
  /** A name on the team, by id. */
  nameOf: (userId: string) => string;
  /** A date's weekday in words ("ראשון"). */
  weekday: (date: string) => string;
}) {
  const t = useTranslations("app.build");
  const switchId = useId();
  const hintId = useId();
  const skippedId = useId();
  const copy = worked ?? NOTHING;
  const canCopy = copy.shifts > 0 && !copy.tooMany;
  const line = canCopy
    ? t("copy.note")
    : copy.tooMany
      ? t.rich("copy.tooMany", { max: MAX_SHIFTS_IN_A_WEEK, ltr })
      : copy.days.some((day) => day.state === "kept")
        ? t("copy.nothing.kept")
        : t("copy.nothing.past");

  const dayLine = (day: CopyDay) => {
    switch (day.state) {
      case "copied":
        return day.replaced > 0
          ? t("copy.days.replaced", { count: day.copied, was: day.replaced })
          : t("copy.days.copied", { count: day.copied });
      case "kept":
        return t("copy.days.kept");
      case "none":
        return t("copy.days.none");
      case "past":
        return t("copy.days.past");
    }
  };

  const skippedFor = (reason: CopySkip["reason"]) =>
    copy.skipped.filter((skip) => skip.reason === reason);
  const gone = new Set(skippedFor("gone").map((skip) => skip.user)).size;
  const skipped = copy.skipped.length > 0;

  return (
    <Sheet
      open={open && worked !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("copy.title")}
      subtitle={t.rich("copy.subtitle", {
        from: dayMonth(source.start),
        to: dayMonth(addDays(source.start, 6)),
        ltr,
      })}
      closeLabel={t("close")}
      // With no switch, nothing in the body takes the keyboard: the body
      // does, so its days still scroll by keys on a small screen.
      readingLabel={copy.staffedDays > 0 ? undefined : t("copy.title")}
      footer={
        <>
          <p className="px-1 text-center text-base text-ink-2">{line}</p>
          {canCopy ? (
            <Button size="lg" onClick={onCopy}>
              {t("copy.submit", { count: copy.shifts })}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col pb-1">
        <p className="px-3 pt-1 text-base text-ink-2">{t("copy.intro")}</p>
        {source.published ? null : (
          <p className="px-3 pt-2 text-base text-ink-2">
            {t("copy.draftSource")}
          </p>
        )}
        {canCopy ? (
          <p className="px-3 pt-3 font-semibold text-md text-ink">
            {t("copy.summary", { shifts: copy.shifts, people: copy.people })}
          </p>
        ) : null}

        {/* Days with people on them: kept as they are, unless replaced. Above
            the days, so it is in sight on a phone as the sheet opens, and what
            it does shows in the rows under it. */}
        {copy.staffedDays > 0 ? (
          <ListGroup className="mt-3 bg-elevated shadow-none">
            <FieldRow
              label={t("copy.replace.label")}
              hint={t("copy.replace.hint", { count: copy.staffedDays })}
              hintId={hintId}
              htmlFor={switchId}
            >
              <Switch
                id={switchId}
                checked={replace}
                onChange={onReplace}
                aria-describedby={hintId}
              />
            </FieldRow>
          </ListGroup>
        ) : null}

        <SheetSection title={t("copy.daysTitle")}>
          {copy.days.map((day) => (
            <ListRow
              key={day.date}
              title={t("day", {
                day: weekday(day.date),
                date: dayMonth(day.date),
              })}
              subtitle={dayLine(day)}
            />
          ))}
        </SheetSection>

        {skipped ? (
          <section aria-labelledby={skippedId} className="mt-2 flex flex-col">
            <h3
              id={skippedId}
              className="px-3 pt-3 font-semibold text-ink text-md"
            >
              {t("copy.skippedTitle")}
            </h3>
            {NAMED.map((reason) => {
              const people = skippedFor(reason);
              if (people.length === 0) return null;
              return (
                <SheetSection
                  key={reason}
                  level={4}
                  title={
                    reason === "offStaff"
                      ? t("copy.offStaff")
                      : t(`groups.${reason}`)
                  }
                >
                  {people.map((skip) => (
                    <ListRow
                      key={`${skip.user}-${skip.shift.day}-${skip.shift.start}-${skip.shift.name}`}
                      title={nameOf(skip.user)}
                      subtitle={t("copy.skippedOn", {
                        shift: skip.shift.name,
                        day: weekday(skip.shift.day),
                      })}
                    />
                  ))}
                </SheetSection>
              );
            })}
            {gone > 0 ? (
              <p className="px-3 pt-3 text-base text-ink-2">
                {t("copy.gone", { count: gone })}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
