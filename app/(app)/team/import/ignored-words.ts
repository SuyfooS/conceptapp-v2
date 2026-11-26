import { isolate } from "@domain/bidi";
import type { IgnoredColumn } from "@domain/people-import";
import type { useTranslations } from "next-intl";

/** The import's words, as `useTranslations("app.team.import")` gives them. */
export type ImportT = ReturnType<typeof useTranslations<"app.team.import">>;

/**
 * What the paste leaves out, said under the field: the columns a header
 * named, by their headers ("העמודות ת.ז. ושכר לשעה לא נקלטות."), and those
 * with none, by their place ("עמודה 3 לא נקלטת."), never "העמודה עמודה 3".
 * Each place is held left to right, as `<ltr>` holds a number on screen.
 */
export function ignoredWords(
  ignored: readonly IgnoredColumn[],
  t: ImportT,
  locale: string,
): string[] {
  const list = (items: string[]) =>
    new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
  const named = ignored.flatMap((column) =>
    "header" in column ? [column.header] : [],
  );
  const placed = ignored.flatMap((column) =>
    "column" in column ? [isolate(String(column.column))] : [],
  );
  return [
    ...(named.length > 0
      ? [t("paste.ignored", { count: named.length, names: list(named) })]
      : []),
    ...(placed.length > 0
      ? [
          t("paste.ignoredAt", {
            count: placed.length,
            columns: list(placed),
          }),
        ]
      : []),
  ];
}
