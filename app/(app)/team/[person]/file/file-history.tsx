import type { ActivityActor, ActivityEntry } from "@domain/activity";
import { FILE_HISTORY_SIZE } from "@domain/file-holders";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import type { createFormatter } from "next-intl";
import type { Translator } from "../../../wording";
import type { FileHistory } from "./holder-file-types";

type T = Translator<"app">;
type Format = ReturnType<typeof createFormatter>;

/**
 * One line of "מה קרה בתיק" in words: a change and which parts, the file
 * sent, a year's 101, the account confirmed or disputed, the parts handed
 * directly (as they stand after the change, as the log's own line says),
 * and a number shown. Anything else, the daily read of the file among them,
 * is left out (null). Names of parts only: the rows never held a value.
 */
export function historyLine(
  t: T,
  format: Format,
  entry: ActivityEntry,
): string | null {
  const { line } = entry;
  const list = (parts: string[]) => format.list(parts, { type: "conjunction" });
  switch (line.action) {
    case "employee.details":
      return line.fields.length === 0
        ? t("team.file.history.detailsPlain")
        : t("team.file.history.details", {
            fields: list(
              line.fields.map((field) =>
                t(`manage.activity.actions.employee.fields.${field}`),
              ),
            ),
          });
    case "employee.view": {
      const numbers = line.fields.filter((field) => field !== "file");
      return numbers.length === 0
        ? null
        : t("team.file.history.reveal", {
            fields: list(
              numbers.map((field) =>
                t(`manage.activity.actions.employee.viewFields.${field}`),
              ),
            ),
          });
    }
    case "employee.submit":
      return t("team.file.history.submit");
    case "employee.tax_year":
      return t("team.file.history.taxYear", {
        year: line.year,
        status: line.status,
      });
    case "employee.bank_ack":
      return t("team.file.history.bankAck");
    case "employee.bank_disputed":
      return t("team.file.history.bankDisputed");
    case "employee.direct":
      return line.groups.length === 0
        ? t("team.file.history.directCleared")
        : t("team.file.history.direct", {
            groups: list(
              line.groups.map((group) =>
                t(`manage.activity.actions.employee.groups.${group}`),
              ),
            ),
          });
    default:
      return null;
  }
}

/** Who did it, as the activity log names them. */
export function historyWho(t: T, actor: ActivityActor): string {
  switch (actor.kind) {
    case "member":
      return actor.name ?? t("manage.activity.who.noName");
    case "former":
      return t("manage.activity.who.former");
    case "team":
      return t("manage.activity.who.team");
    case "app":
      return t("manage.activity.who.app");
    default:
      return t("manage.activity.who.unknown");
  }
}

/**
 * "מה קרה בתיק" (profile H6b-1), after the file's parts: who changed or
 * showed what, and when, newest first, never a value. A list on a phone and
 * a tablet (what, then who and when), a table on a desktop with the same
 * words. Empty, it says nothing was recorded yet; unread, that it couldn't
 * be shown now, while the file stays open; past the newest 40, that only
 * those show here.
 */
export function FileHistorySection({
  t,
  format,
  history,
}: {
  t: T;
  /** In the business's zone. */
  format: Format;
  history: FileHistory;
}) {
  const lines = (history?.entries ?? []).flatMap((entry) => {
    const what = historyLine(t, format, entry);
    return what === null
      ? []
      : [
          {
            id: entry.id,
            what,
            who: historyWho(t, entry.actor),
            when: format.dateTime(new Date(entry.at), {
              day: "numeric",
              month: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ];
  });
  const quiet = (text: string) => (
    <Card padding="lg" className="md:max-w-2xl">
      <p className="text-ink-2">{text}</p>
    </Card>
  );
  return (
    <section
      aria-labelledby="file-history"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2
        id="file-history"
        tabIndex={-1}
        className="px-1 font-bold text-lg outline-none"
      >
        {t("team.file.history.title")}
      </h2>
      <p className="px-1 text-ink-2 md:max-w-2xl">
        {t("team.file.history.note")}
      </p>
      {history === null ? (
        quiet(t("team.file.history.failed"))
      ) : lines.length === 0 ? (
        quiet(t("team.file.history.empty"))
      ) : (
        <>
          <Card
            padding="none"
            className="overflow-hidden md:max-w-2xl xl:hidden"
          >
            <ol>
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-col gap-0.5 px-4 py-3 not-first:border-line not-first:border-t"
                >
                  <span className="text-pretty font-medium">{line.what}</span>
                  <span className="text-ink-2 text-sm">
                    {line.who}
                    {" · "}
                    <span dir="ltr">{line.when}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card padding="none" className="hidden overflow-hidden xl:block">
            {/* Its scroller is a region named by the caption, inside the
                section's own: a name apart, never the title again (axe
                landmark-unique). */}
            <DataTable
              caption={t("team.file.history.table")}
              columns={[
                { key: "what", label: t("team.file.history.columns.what") },
                { key: "who", label: t("team.file.history.columns.who") },
                { key: "when", label: t("team.file.history.columns.when") },
              ]}
              rows={lines.map((line) => ({
                key: String(line.id),
                cells: {
                  what: line.what,
                  who: line.who,
                  when: <span dir="ltr">{line.when}</span>,
                },
              }))}
            />
          </Card>
        </>
      )}
      {history?.more ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("team.file.history.more", { count: FILE_HISTORY_SIZE })}
        </p>
      ) : null}
    </section>
  );
}
