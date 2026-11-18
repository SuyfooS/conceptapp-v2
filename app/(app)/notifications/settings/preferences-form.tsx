"use client";

import {
  DEFAULT_QUIET_HOURS,
  type NotificationGroup,
  type NotificationPreferenceChange,
  type NotificationPreferences,
  type PreferencesFailure,
  type PreferencesSaveResult,
  type QuietHours,
  quietEnd,
  SWITCHABLE_GROUPS,
} from "@domain/notifications";
import { timeIn } from "@domain/shabbat";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { Switch } from "@ui/switch";
import { ltrInputClass } from "@ui/text-field";
import { LockKeyhole, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { TYPING_MS, useDraft } from "../../manage/use-draft";
import { GROUP_ICONS } from "../group-icons";

/** Saves one change: `setNotificationPreferencesAction`, or the demo's. */
export type SavePreferences = (
  change: NotificationPreferenceChange,
) => Promise<PreferencesSaveResult>;

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** The choices with one change made, as the screen shows them at once. */
function applied(
  choices: NotificationPreferences,
  what: NotificationPreferenceChange,
): NotificationPreferences {
  switch (what.kind) {
    case "group":
      return {
        ...choices,
        // In the screen's order, each group once.
        pushOff: SWITCHABLE_GROUPS.filter((item) =>
          item === what.group ? !what.on : choices.pushOff.includes(item),
        ),
      };
    case "quiet":
      return { ...choices, quiet: what.hours };
    case "previews":
      return { ...choices, previews: what.on };
  }
}

/** The one choice a change made, back as the database last said it. */
function restored(
  choices: NotificationPreferences,
  what: NotificationPreferenceChange,
  stored: NotificationPreferences,
): NotificationPreferences {
  switch (what.kind) {
    case "group":
      return applied(choices, {
        kind: "group",
        group: what.group,
        on: !stored.pushOff.includes(what.group),
      });
    case "quiet":
      return applied(choices, { kind: "quiet", hours: stored.quiet });
    case "previews":
      return applied(choices, { kind: "previews", on: stored.previews });
  }
}

/** Which choice a change is about, so a later change to it has the last word. */
const choiceOf = (what: NotificationPreferenceChange) =>
  what.kind === "group" ? `group:${what.group}` : what.kind;

/**
 * The person's own choices for their phone, each saved the moment it
 * changes, as in a phone's settings: which groups reach it (a switch for each
 * group their role gets here), quiet hours with their two times, and whether
 * the lock screen shows the line. What didn't save goes back and says why.
 * Phone: one section under another, this device first. Tablet: this device
 * above the groups, beside quiet hours above the lock screen. Desktop: three
 * columns, this device and the groups, then quiet hours, then the lock
 * screen. Each column holds its sections in the order they are read, so the
 * keyboard goes down one column before the next, and a section that shows
 * nothing (no push here, or a browser without it) leaves no space. `device`
 * is the switch for this phone (`PushSwitch`), where push is set up.
 */
export function PreferencesForm({
  preferences,
  groups,
  always = false,
  device,
  save,
  now,
}: {
  preferences: NotificationPreferences;
  /** The groups to offer, in order (`groupsFor` the person's role). */
  groups: readonly NotificationGroup[];
  /** Lines about pay reach this person's phone whatever they switch off (`alwaysOnPhone`). */
  always?: boolean;
  device?: ReactNode;
  save: SavePreferences;
  /** ISO timestamp of the moment the screen is read, for "quiet now". */
  now: string;
}) {
  const t = useTranslations("app.notifications");
  const [shown, setShown] = useState(preferences);
  // The choices as the database last said, to go back to when one fails.
  const confirmed = useRef(preferences);
  // The quiet hours to come back to when they are switched on again.
  const lastQuiet = useRef<QuietHours>(
    preferences.quiet ?? DEFAULT_QUIET_HOURS,
  );
  const latest = useRef<Record<string, number>>({});
  const [failure, setFailure] = useState<PreferencesFailure | null>(null);
  const [saved, setSaved] = useState(0);
  const [at, setAt] = useState(now);

  async function change(what: NotificationPreferenceChange) {
    const choice = choiceOf(what);
    const mine = (latest.current[choice] ?? 0) + 1;
    latest.current[choice] = mine;
    setShown((current) => applied(current, what));
    setFailure(null);
    let result: PreferencesSaveResult;
    try {
      result = await save(what);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      confirmed.current = result.preferences;
      const zone = result.preferences.timeZone;
      setShown((current) => ({ ...current, timeZone: zone }));
      setAt(new Date().toISOString());
      setSaved((count) => count + 1);
      return;
    }
    setFailure(result.failure);
    // Back as it was, unless it has been changed again since.
    if (latest.current[choice] === mine) {
      setShown((current) => restored(current, what, confirmed.current));
    }
  }

  const setQuiet = (hours: QuietHours | null) => {
    if (hours) lastQuiet.current = hours;
    return change({ kind: "quiet", hours });
  };

  const quietUntil = quietEnd(shown.quiet, shown.timeZone, new Date(at));

  return (
    <>
      <StatusToast
        message={saved > 0 ? t("settings.saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      {failure ? (
        <Card
          tone="float"
          padding="md"
          role="alert"
          className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-10 font-medium text-danger xl:top-4"
        >
          {t(`settings.failures.${failure}`)}
        </Card>
      ) : null}
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-3">
        {/* This device and the groups. Nothing in it (no push here, a
            browser without it, no groups): no column, no gap. */}
        <div className="flex min-w-0 flex-col gap-6 empty:hidden md:gap-8">
          {device}
          {groups.length > 0 ? (
            <PageSection title={t("settings.kinds.title")} className="min-w-0">
              <ListGroup>
                {groups.map((group) => (
                  <GroupRow
                    key={group}
                    group={group}
                    on={!shown.pushOff.includes(group)}
                    onChange={(on) => change({ kind: "group", group, on })}
                  />
                ))}
              </ListGroup>
              <p className="px-1 text-ink-2 text-sm">
                {t("settings.kinds.note")}
              </p>
              {always ? (
                <p className="px-1 text-ink-2 text-sm">
                  {t("settings.kinds.always")}
                </p>
              ) : null}
            </PageSection>
          ) : null}
        </div>

        {/* Quiet hours above the lock screen; a column each on a desktop. */}
        <div className="flex min-w-0 flex-col gap-6 md:gap-8 xl:contents">
          <QuietSection
            quiet={shown.quiet}
            until={quietUntil ? timeIn(quietUntil, shown.timeZone) : null}
            onSwitch={(on) => setQuiet(on ? lastQuiet.current : null)}
            onChange={setQuiet}
          />

          <PageSection title={t("settings.previews.title")} className="min-w-0">
            <ListGroup>
              <SwitchRow
                icon={<LockKeyhole />}
                title={t("settings.previews.label")}
                hint={t("settings.previews.hint")}
                checked={shown.previews}
                onChange={(on) => change({ kind: "previews", on })}
              />
            </ListGroup>
          </PageSection>
        </div>
      </div>
    </>
  );
}

/** A row with a switch at its end: named by its title, described by its hint. */
function SwitchRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const titleId = useId();
  const hintId = useId();
  return (
    <ListRow
      leading={icon}
      title={<span id={titleId}>{title}</span>}
      subtitle={<span id={hintId}>{hint}</span>}
      trailing={
        <Switch
          aria-labelledby={titleId}
          aria-describedby={hintId}
          checked={checked}
          onChange={onChange}
        />
      }
    />
  );
}

function GroupRow({
  group,
  on,
  onChange,
}: {
  group: NotificationGroup;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const t = useTranslations("app.notifications.groups");
  return (
    <SwitchRow
      icon={GROUP_ICONS[group]}
      title={t(`${group}.name`)}
      hint={t(`${group}.hint`)}
      checked={on}
      onChange={onChange}
    />
  );
}

/**
 * Quiet hours: off until switched on, then the hours last chosen here, or
 * 22:00 to 07:00. Each time saves once it is whole and isn't the other one;
 * "quiet now" says until when, while it is.
 */
function QuietSection({
  quiet,
  until,
  onSwitch,
  onChange,
  className,
}: {
  quiet: QuietHours | null;
  /** "HH:MM" quiet hours end at, while it is quiet now. */
  until: string | null;
  onSwitch: (on: boolean) => void;
  onChange: (hours: QuietHours) => void;
  className?: string;
}) {
  const t = useTranslations("app.notifications.settings");
  return (
    <PageSection title={t("quiet.title")} className={cn("min-w-0", className)}>
      <ListGroup>
        <SwitchRow
          icon={<Moon />}
          title={t("quiet.label")}
          hint={t("quiet.hint")}
          checked={quiet !== null}
          onChange={onSwitch}
        />
        {quiet ? <QuietTimes quiet={quiet} onChange={onChange} /> : null}
      </ListGroup>
      {quiet && until ? (
        <p className="px-1 font-medium text-sm">
          {t.rich("quiet.now", { time: until, ltr })}
        </p>
      ) : null}
      <p className="px-1 text-ink-2 text-sm">{t("quiet.note")}</p>
    </PageSection>
  );
}

function QuietTimes({
  quiet,
  onChange,
}: {
  quiet: QuietHours;
  onChange: (hours: QuietHours) => void;
}) {
  const t = useTranslations("app.notifications.settings");
  const fromId = useId();
  const toId = useId();
  const problemId = useId();
  const from = useDraft(
    quiet.from,
    (text) => CLOCK.test(text) && text !== quiet.to,
    (text) => onChange({ from: text, to: quiet.to }),
    TYPING_MS,
  );
  const to = useDraft(
    quiet.to,
    (text) => CLOCK.test(text) && text !== quiet.from,
    (text) => onChange({ from: quiet.from, to: text }),
    TYPING_MS,
  );
  // Both ends at the same time would leave no quiet hours.
  const same = from.draft === to.draft;
  const time = (
    id: string,
    draft: ReturnType<typeof useDraft>,
    invalid: boolean,
  ) => (
    <input
      id={id}
      type="time"
      dir="ltr"
      value={draft.draft}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? problemId : undefined}
      onChange={(event) => draft.edit(event.target.value)}
      onBlur={draft.leave}
      className={cn(rowPillInputClass, ltrInputClass)}
    />
  );
  return (
    <>
      <FieldRow label={t("quiet.from")} htmlFor={fromId}>
        {time(fromId, from, same)}
      </FieldRow>
      <FieldRow label={t("quiet.to")} htmlFor={toId}>
        {time(toId, to, same)}
      </FieldRow>
      {same ? (
        <p
          id={problemId}
          role="alert"
          className="px-4 pb-3 font-medium text-danger text-sm"
        >
          {t("failures.invalid")}
        </p>
      ) : null}
    </>
  );
}
