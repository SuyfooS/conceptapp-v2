import "server-only";
import type { NotificationLine } from "@domain/notifications";
import { type AppWording, translator } from "../wording";

type RangeLine = Extract<NotificationLine, { kind: "lists.out_of_range" }>;

/**
 * The title of a line about a reading outside its range: the item and the
 * list it was read in ("קריאה מחוץ לטווח בפתיחת מטבח: מקרר ראשי"), or, once
 * a reading of it is back inside the range (Orel, 17 November 2026), that it
 * is back. Only a settled line marked `backInRange` says so: one settled
 * another way some day reads as it did. `back` tells the inbox to leave out
 * the reading that was outside, which is no news then.
 */
export function outOfRangeTitle(
  line: RangeLine,
  settled: boolean,
  wording: AppWording,
): { title: string; back: boolean } {
  const t = translator(wording, "app.notifications.kinds.lists.out_of_range");
  const back = settled && line.backInRange;
  if (back) {
    return {
      title: line.label
        ? t("settledTitle", { name: line.name, label: line.label })
        : t("settledTitleNoLabel", { name: line.name }),
      back,
    };
  }
  return {
    title: line.label
      ? t("title", { name: line.name, label: line.label })
      : t("titleNoLabel", { name: line.name }),
    back,
  };
}
