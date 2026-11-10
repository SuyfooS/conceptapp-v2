import { timeIn } from "@domain/shabbat";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../../wording";
import type { ListActions, ListScreenData } from "../list-types";
import {
  closedWords,
  dueChip,
  dueWords,
  fromWords,
  holderWords,
  ltr,
  personName,
} from "../list-words";
import { ListScreen } from "./list-screen";

/**
 * One list, in the business's words: who it is for and who asked, by when,
 * why it is only read here, its details and what happened to it. The filling
 * itself is the client's (ListScreen). Also on /design/shell/lists with mock
 * data.
 */
export function ListView({
  data,
  actions,
  backHref,
  wording,
}: {
  data: ListScreenData;
  actions: ListActions;
  backHref: string;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.lists");
  const { list, lookups, userId, timeZone } = data;
  const now = new Date(data.now);
  const holder = holderWords(t, list.holder, lookups, userId);
  // The same, inside a sentence ("sent to the kitchen").
  const holderTo = holderWords(t, list.holder, lookups, userId, "to");
  const from = fromWords(t, list, lookups);
  const at = (instant: string) => timeIn(new Date(instant), timeZone);

  const readOnly: ReactNode =
    data.readOnly === "finished"
      ? closedWords(t, list, lookups, timeZone)
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
  const timeline: { key: string; text: ReactNode; note?: string | null }[] = [
    {
      key: "sent",
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
        text: from
          ? t.rich("list.timeline.passedFrom", { ...values, from })
          : t.rich("list.timeline.passed", values),
        note: pass.note ? t("list.timeline.note", { note: pass.note }) : null,
      };
    }),
    ...(list.status === "finished" && list.finishedAt
      ? [
          {
            key: "finished",
            text: t.rich("list.timeline.finished", {
              name: personName(t, lookups, list.finishedBy),
              time: at(list.finishedAt),
              ltr,
            }),
          },
        ]
      : []),
    ...(list.status === "cancelled" && list.closedAt
      ? [
          {
            key: "cancelled",
            text: t.rich("list.timeline.cancelled", {
              name: personName(t, lookups, list.closedBy),
              time: at(list.closedAt),
              ltr,
            }),
          },
        ]
      : []),
    ...(list.status === "missed"
      ? [{ key: "missed", text: t("list.timeline.missed") }]
      : []),
  ];

  return (
    <ListScreen
      // A list that finished, opened again or closed starts the screen anew.
      // One passed on keeps it, with the word that it went.
      key={`${list.id}:${list.status}:${list.finishedAt ?? ""}`}
      data={data}
      actions={actions}
      backHref={backHref}
      words={{
        holder,
        due: dueChip(t, list, now, timeZone, data.timing),
        readOnly,
        details,
        timeline,
      }}
    />
  );
}
