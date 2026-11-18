import { dateIn } from "@domain/availability";
import { dayMonth } from "@domain/availability-form";
import { byTime, fixRuns, listTimeline } from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../../wording";
import type { ListActions, ListScreenData } from "../list-types";
import {
  closedWords,
  dueChip,
  dueWords,
  fixOverWords,
  fixUntilWords,
  fromWords,
  holderWords,
  ltr,
  personName,
} from "../list-words";
import { ListScreenFrame } from "./list-screen";

/**
 * One list, in the business's words: who it is for and who asked, by when,
 * why it is only read here, its details and what happened to it, its fixes
 * after a close among them (L6b-1), and until when someone given "תיקון
 * רשימות שנסגרו" may still fix it, or when that ended (L6b-2). The filling
 * and the fixing themselves are the client's (ListScreen). Also on
 * /design/shell/lists with mock data, where `fixing` opens it being fixed.
 */
export function ListView({
  data,
  actions,
  backHref,
  wording,
  fixing = false,
}: {
  data: ListScreenData;
  actions: ListActions;
  backHref: string;
  /** The business's words. */
  wording: AppWording;
  /** Opens a list it may fix (`can.fix`) being fixed: the demo's twin. */
  fixing?: boolean;
}) {
  const t = translator(wording, "app.lists");
  const { list, lookups, userId, timeZone } = data;
  const now = new Date(data.now);
  const holder = holderWords(t, list.holder, lookups, userId);
  // The same, inside a sentence ("sent to the kitchen").
  const holderTo = holderWords(t, list.holder, lookups, userId, "to");
  const from = fromWords(t, list, lookups);
  // A time, with its day when that isn't the list's (closed late at night,
  // opened again the next morning), as the lines under its items say it.
  const listDay = dateIn(new Date(list.opensAt), timeZone);
  const at = (instant: string) => {
    const when = new Date(instant);
    const day = dateIn(when, timeZone);
    const time = timeIn(when, timeZone);
    return day === listDay ? time : `${dayMonth(day)}, ${time}`;
  };

  const readOnly: ReactNode =
    data.readOnly === "finished"
      ? closedWords(t, list, lookups, timeZone, now)
      : data.readOnly === "missed"
        ? t("list.readOnly.missed")
        : data.readOnly === "cancelled"
          ? t("list.readOnly.cancelled")
          : data.readOnly === "elsewhere"
            ? // Passed on since it was sent: where it is now.
              list.passes.length > 0
              ? t("list.readOnly.passedElsewhere", { to: holderTo })
              : t("list.readOnly.elsewhere", { to: holderTo })
            : data.readOnly === "viewOnly"
              ? t("list.readOnly.viewOnly")
              : null;

  const details: { key: string; label: string; value: ReactNode }[] = [
    { key: "for", label: t("list.details.for"), value: holder },
    ...(from
      ? [{ key: "from", label: t("list.details.from"), value: from }]
      : []),
    {
      key: "sent",
      label:
        list.origin === "scheduled"
          ? t("list.details.opened")
          : t("list.details.sent"),
      value:
        list.origin === "scheduled"
          ? t.rich("list.details.openedAt", { time: at(list.opensAt), ltr })
          : t.rich("list.details.sentBy", {
              name: personName(t, lookups, list.sentBy),
              time: at(list.opensAt),
              ltr,
            }),
    },
    ...(list.dueAt
      ? [
          {
            key: "due",
            label: t("list.details.due"),
            // The time itself, late or not, open or closed.
            value: dueWords(t, list.dueAt, now, timeZone),
          },
        ]
      : []),
  ];

  // Where it was sent: who holds it now, until it is passed on. Then the
  // department its first pass came from, or no one named when it came from
  // a person, a shift or a role, whose people the list no longer keeps.
  const [firstPass] = list.passes;
  const sentTo = !firstPass
    ? holderTo
    : firstPass.fromDepartment
      ? t("card.to.department", {
          name:
            lookups.departments[firstPass.fromDepartment] ??
            t("card.aDepartment"),
        })
      : null;
  // Its fixes after a close (L6b-1): one line per person's run of them.
  const fixes = fixRuns(list.changes).map((run) => ({
    key: run.key,
    at: run.at,
    text: t.rich("list.timeline.fixed", {
      count: run.items,
      name: personName(t, lookups, run.by),
      time: at(run.at),
      ltr,
    }),
  }));
  // How it closed and opened again (L6a): each close a reopen undid, the
  // reopen, and how it is closed now, the undo left out.
  const closes = listTimeline(list, list.reopens).map((event) => {
    const values = {
      name: personName(t, lookups, event.by),
      time: event.at ? at(event.at) : "",
      ltr,
    };
    return {
      key: event.key,
      at: event.at,
      text:
        event.kind === "missed"
          ? t("list.timeline.missed")
          : t.rich(`list.timeline.${event.kind}`, values),
    };
  });
  // Every entry in time order: sent, passed on, closed and opened again.
  const timeline: {
    key: string;
    at: string | null;
    text: ReactNode;
    note?: string | null;
  }[] = byTime([
    {
      key: "sent",
      at: list.opensAt,
      text:
        list.origin === "scheduled"
          ? t.rich("list.timeline.opened", { time: at(list.opensAt), ltr })
          : sentTo === null
            ? t.rich("list.timeline.sentBy", {
                name: personName(t, lookups, list.sentBy),
                time: at(list.opensAt),
                ltr,
              })
            : t.rich("list.timeline.sent", {
                name: personName(t, lookups, list.sentBy),
                to: sentTo,
                time: at(list.opensAt),
                ltr,
              }),
    },
    // Each pass from where to where, and the note that came with it (L5).
    ...list.passes.map((pass) => {
      const to =
        lookups.departments[pass.toDepartment] ?? t("card.aDepartment");
      const from = pass.fromDepartment
        ? lookups.departments[pass.fromDepartment]
        : undefined;
      const values = {
        to,
        name: personName(t, lookups, pass.passedBy),
        time: at(pass.passedAt),
        ltr,
      };
      return {
        key: pass.id,
        at: pass.passedAt,
        text: from
          ? t.rich("list.timeline.passedFrom", { ...values, from })
          : t.rich("list.timeline.passed", values),
        note: pass.note ? t("list.timeline.note", { note: pass.note }) : null,
      };
    }),
    ...closes,
    ...fixes,
  ]);
  // When the window of someone given "תיקון רשימות שנסגרו" ends or ended
  // (L6b-2): on the server's clock, or when the screen's timer reaches it.
  const fixEnd = data.fixEndedAt ?? data.fixUntil;

  return (
    <ListScreenFrame
      // A list that finished, opened again, closed or was fixed (L6b-1)
      // starts the screen anew; what it said on the way stays (the frame's).
      // One passed on keeps it, with the word that it went.
      screenKey={`${list.id}:${list.status}:${list.finishedAt ?? ""}:${list.fixedAt ?? ""}`}
      fixing={fixing}
      data={data}
      actions={actions}
      backHref={backHref}
      words={{
        holder,
        due: dueChip(t, list, now, timeZone, data.timing),
        readOnly,
        // Someone given "תיקון רשימות שנסגרו" (L6b-2): until when they may,
        // and once that is over, when it ended and who still fixes it.
        fixUntil: data.fixUntil
          ? fixUntilWords(t, data.fixUntil, now, timeZone)
          : null,
        fixOver: fixEnd ? fixOverWords(t, fixEnd, now, timeZone) : null,
        details,
        timeline,
      }}
    />
  );
}
