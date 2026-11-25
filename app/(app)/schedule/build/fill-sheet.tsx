"use client";

import { missingAvailability } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import {
  FILL_MAX_DAYS,
  FILL_REST_HOURS,
  type FillRule,
  type WeekFill,
} from "@domain/fill-week";
import type { TeamMember } from "@domain/team";
import { Button, type ButtonProps } from "@ui/button";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { useFocusWhenGone } from "@ui/use-focus-after";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, type RefObject, useId, useRef } from "react";
import {
  type FillReason,
  fillDays,
  fillLine,
  fillPeople,
  fillReason,
} from "./fill-reasons";
import { SheetSection } from "./sheet-section";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * A part of the sheet's body under its own heading ("לפי ימים", "לפי
 * אנשים"): an h3, the dialog's title being the sheet's name, with its rows
 * or groups under it.
 */
function FillPart({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-2 flex flex-col">
      <h3 id={id} className="px-3 pt-3 font-semibold text-ink text-md">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Hours and numbers inside a sentence put together as text (a person and the
 * rule that stopped them): held left to right in Unicode isolates, as
 * `<ltr>` holds them on screen.
 */
const isolate = (chunks: string) => `⁦${chunks}⁩`;

/** Before the sheet first opens: nothing worked out yet. */
const NOTHING: WeekFill = {
  week: [],
  shifts: [],
  places: 0,
  people: 0,
  openBefore: 0,
  openAfter: 0,
  answered: 0,
  byPerson: [],
  unplaced: [],
};

/**
 * What filling the week from the staff's availability would do, before
 * anything changes on the screen ("מילוי מהזמינות"): how many places and
 * people, the rules it keeps, that it checks nobody's age, who sent no
 * availability (and so is never placed) with the way to remind them while
 * the week is next week's, else to place them by hand, who sent some and
 * gets no shift, each shift that has an open place, day by day: who goes
 * on it, and why a place stays open, and each one who answered, fewest
 * shifts first: their shifts and hours after the fill, and how many of them
 * the fill gave. The week's hours are the business's (`weekHours`, its
 * `fillWeekHours` setting), as the rule read them. Its main action puts the
 * fill on the screen; nothing is saved or sent until the dock's buttons are
 * pressed, and the sheet says so. With nobody to place it says why instead
 * (`fillLine`), and each shift still says what keeps it open; once the clock
 * has begun the last shift with an open place, it says nothing is left to
 * fill. It is drawn closed before anything is worked out (`fill` null), as
 * the builder's other sheets are, so it opens inside the business's colour.
 */
export function FillWeekSheet({
  open,
  fill: worked,
  dates,
  team,
  answers,
  remindHref,
  clock,
  weekHours,
  onFill,
  onClose,
  nameOf,
  weekday,
}: {
  open: boolean;
  /** What the fill would do; null before it was first worked out. */
  fill: WeekFill | null;
  /** The week's days, for its first and last. */
  dates: readonly string[];
  /** The staff: who owes availability is everyone but an owner. */
  team: readonly Pick<TeamMember, "userId" | "role">[];
  /** Who sent availability for the week. */
  answers: readonly { userId: string }[];
  /**
   * Where the team's availability is, with its reminder, while the builder
   * shows the week that screen covers (next week); null otherwise, the week
   * running now, whose answers can no longer come: then the sheet says to
   * place people by hand.
   */
  remindHref: string | null;
  /** Days away are known (the time clock is on): the sheet says they count. */
  clock: boolean;
  /** The most hours a week the fill gives anyone, as the rule read it. */
  weekHours: number;
  onFill: () => void;
  onClose: () => void;
  /** A name on the team, by id. */
  nameOf: (userId: string) => string;
  /** A date's weekday in words ("ראשון"). */
  weekday: (date: string) => string;
}) {
  const t = useTranslations("app.build");
  const locale = useLocale();
  /** The line above the sheet's button, or in its place. */
  const lineRef = useRef<HTMLParagraphElement>(null);
  const fill = worked ?? NOTHING;
  const canFill = fill.places > 0;
  const line = t(`fill.${fillLine(fill, remindHref !== null)}`);

  /** Names, by name, joined as the screens join them. */
  const names = (users: readonly string[]) =>
    users
      .map(nameOf)
      .sort((a, b) => a.localeCompare(b, locale))
      .join(", ");

  // Staff who owe availability and sent none, never an owner: the fill
  // places none of them, and the manager can still put them on by hand.
  const missing = missingAvailability(
    team,
    answers.map((answer) => answer.userId),
  ).map((member) => member.userId);
  const remind = remindHref !== null && missing.length > 0;

  /** The rule that stopped someone, in a few words. */
  const ruleWords = (rule: FillRule): string => {
    switch (rule) {
      case "away":
        return t("fill.rule.away");
      case "busy":
        return t("fill.rule.busy");
      case "sameDay":
        return t("fill.rule.sameDay");
      case "rest":
        return t.markup("fill.rule.rest", {
          hours: FILL_REST_HOURS,
          ltr: isolate,
        });
      case "days":
        return t.markup("fill.rule.days", {
          days: FILL_MAX_DAYS,
          ltr: isolate,
        });
      case "hours":
        return t.markup("fill.rule.hours", { hours: weekHours, ltr: isolate });
    }
  };

  /**
   * A place left open in words (`fillReason`): Shabbat while no answer
   * covers the shift; else nobody (else, once anyone is on it) covers it
   * whole, with how many cover a part; or everyone who does, each with the
   * first rule that stopped them, by name. A shift that reaches into
   * Shabbat says its time beside the last two.
   */
  const reasonWords = (reason: FillReason): ReactNode => {
    if (reason.why === "shabbat") {
      return t.rich(
        reason.side === "friday" ? "fill.why.friday" : "fill.why.saturday",
        { time: reason.time, ltr },
      );
    }
    const words =
      reason.why === "blocked"
        ? t("fill.why.blocked", {
            people: [...reason.blocked]
              .sort((a, b) =>
                nameOf(a.user).localeCompare(nameOf(b.user), locale),
              )
              .map(({ user, rule }) =>
                t("fill.why.blockedOne", {
                  name: nameOf(user),
                  rule: ruleWords(rule),
                }),
              )
              .join(", "),
          })
        : [
            reason.others ? t("fill.why.nobodyElse") : t("fill.why.nobody"),
            reason.partial > 0
              ? t("fill.why.partial", { count: reason.partial })
              : null,
          ]
            .filter((part) => part !== null)
            .join(" ");
    const { shabbat } = reason;
    if (!shabbat) return words;
    return (
      <>
        {words}{" "}
        {t.rich(
          shabbat.side === "friday"
            ? "fill.why.fridayToo"
            : "fill.why.saturdayToo",
          { time: shabbat.time, ltr },
        )}
      </>
    );
  };

  const days = fillDays(fill);
  const people = fillPeople(fill.byPerson, nameOf, locale);

  return (
    <Sheet
      open={open && worked !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("fill.title")}
      subtitle={t.rich("fill.subtitle", {
        from: dayMonth(dates[0] ?? ""),
        to: dayMonth(dates.at(-1) ?? dates[0] ?? ""),
        ltr,
      })}
      closeLabel={t("close")}
      // With no link to the team's availability, nothing in the body takes
      // the keyboard: the body does, so its days still scroll by keys on a
      // small screen.
      readingLabel={remind ? undefined : t("fill.title")}
      footer={
        <>
          {/* Where the focus goes should the clock take the button away
              under it: the line says then that nothing is left to fill. */}
          <p
            ref={lineRef}
            tabIndex={-1}
            className="px-1 text-center text-base text-ink-2 outline-none"
          >
            {line}
          </p>
          {canFill ? (
            <FillButton size="lg" onClick={onFill} line={lineRef}>
              {t("fill.submit", { count: fill.places })}
            </FillButton>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col pb-1">
        <p className="px-3 pt-1 text-base text-ink-2">{t("fill.intro")}</p>
        {canFill ? (
          <p className="px-3 pt-3 font-semibold text-md text-ink">
            {t("fill.summary", { places: fill.places, people: fill.people })}
            {fill.openAfter > 0
              ? ` ${t("fill.leftOpen", { count: fill.openAfter })}`
              : null}
          </p>
        ) : null}
        <p className="px-3 pt-3 text-base text-ink-2">
          {t.rich("fill.rules", {
            days: FILL_MAX_DAYS,
            hours: weekHours,
            rest: FILL_REST_HOURS,
            ltr,
          })}
          {/* Days away are read only while the time clock is on: with it
              off the sheet says nothing of what it can't see. */}
          {clock ? ` ${t("fill.away")}` : null}
          {/* Minors are placed like everyone (Orel, 25.11): the manager
              checks, so the sheet says the fill doesn't, in every business. */}
          {` ${t("fill.age")}`}
        </p>
        {missing.length > 0 ? (
          <p className="px-3 pt-3 text-base text-ink">
            {t("fill.noAnswer", { names: names(missing) })}{" "}
            {/* Next week's can still be sent; the week running now's can't,
                so the way left is by hand. */}
            {remindHref
              ? t.rich("fill.remind", {
                  link: (chunks) => (
                    <Link
                      href={remindHref}
                      className="font-medium text-ink underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })
              : t("fill.byHand")}
          </p>
        ) : null}
        {fill.unplaced.length > 0 ? (
          <p className="px-3 pt-3 text-base text-ink-2">
            {t("fill.unplaced", { names: names(fill.unplaced) })}
          </p>
        ) : null}

        {days.length > 0 ? (
          <FillPart title={t("fill.daysTitle")}>
            {days.map((day) => (
              <SheetSection
                key={day.date}
                level={4}
                title={t("day", {
                  day: weekday(day.date),
                  date: dayMonth(day.date),
                })}
              >
                {day.shifts.map((shift) => {
                  const now = fill.week[shift.index];
                  if (!now) return null;
                  const reason = fillReason(shift, now.assignees.length);
                  return (
                    <ListRow
                      key={shift.index}
                      title={t.rich("fill.shiftTitle", {
                        name: now.name,
                        start: now.start,
                        end: now.end,
                        ltr,
                      })}
                      subtitle={
                        <>
                          {shift.added.length > 0 ? (
                            <span className="block">
                              {t("fill.adds", {
                                names: names(shift.added.map((a) => a.user)),
                              })}
                            </span>
                          ) : null}
                          {reason ? (
                            <span className="block">
                              {t("fill.stillOpen", { count: shift.open })}{" "}
                              {reasonWords(reason)}
                            </span>
                          ) : null}
                        </>
                      }
                    />
                  );
                })}
              </SheetSection>
            ))}
          </FillPart>
        ) : null}

        {/* Each one who answered, with their week after the fill: read
            only, fewest shifts first. */}
        {people.length > 0 ? (
          <FillPart title={t("fill.peopleTitle")}>
            <ListGroup className="mt-2 bg-elevated shadow-none">
              {people.map((person) => (
                <ListRow
                  key={person.user}
                  title={person.name}
                  subtitle={t.rich("fill.person", {
                    shifts: person.shifts,
                    hours: person.hours,
                    added: person.added,
                    ltr,
                  })}
                />
              ))}
            </ListGroup>
          </FillPart>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * "מילוי # מקומות". On a draft of the week running now the clock can take it
 * away under the focus, as the last shift with an open place begins: the
 * focus goes to the line above it (`line`), which says then that nothing is
 * left to fill, so the reason is heard rather than only the sheet's name
 * (`useFocusWhenGone`). Pressed, it goes with the sheet, which leaves the
 * focus to the toast's "ביטול".
 */
function FillButton({
  line,
  ...props
}: Omit<ButtonProps, "ref"> & { line: RefObject<HTMLElement | null> }) {
  const button = useRef<HTMLButtonElement>(null);
  useFocusWhenGone(button, () => [line.current]);
  return <Button ref={button} {...props} />;
}
