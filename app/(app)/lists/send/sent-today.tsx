import type { ListSummary } from "@domain/lists";
import { cn } from "@ui/cn";
import { PageSection } from "@ui/page";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import type { ListLookups } from "../list-types";
import { holderWords, openedWords, progressWords } from "../list-words";

const th = "px-3 py-2.5 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-3 py-2.5 align-middle";

export type SentTodayData = {
  lists: ListSummary[];
  lookups: ListLookups;
  userId: string;
  timeZone: string;
  now: string;
};

/**
 * What the person sent today, newest first: a small table beside the send
 * screen on a computer, each list leading to itself. Also on
 * /design/shell/lists/send with mock data.
 */
export function SentToday({
  data,
  wording,
  href,
}: {
  data: SentTodayData;
  /** The business's words. */
  wording: AppWording;
  href: (id: string) => string;
}) {
  const t = translator(wording, "app.lists");
  const now = new Date(data.now);
  return (
    <PageSection title={t("send.sentToday")}>
      {data.lists.length === 0 ? (
        <p className="px-1 text-ink-2">{t("send.sentNone")}</p>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <table className="w-full border-collapse text-base">
            <caption className="sr-only">{t("send.sentToday")}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t("send.columns.list")}
                </th>
                <th scope="col" className={th}>
                  {t("send.columns.to")}
                </th>
                <th scope="col" className={th}>
                  {t("send.columns.at")}
                </th>
                <th scope="col" className={th}>
                  {t("send.columns.progress")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lists.map((list) => (
                <tr key={list.id}>
                  <td className={td}>
                    <Link
                      href={href(list.id)}
                      className="-my-2 flex min-h-11 items-center rounded-[10px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {list.name}
                    </Link>
                  </td>
                  <td className={cn(td, "text-ink-2")}>
                    {holderWords(t, list.holder, data.lookups, data.userId)}
                  </td>
                  <td className={cn(td, "text-ink-2")}>
                    <span dir="ltr">
                      {openedWords(list, now, data.timeZone)}
                    </span>
                  </td>
                  <td className={cn(td, "text-ink-2")}>
                    {list.status === "open"
                      ? progressWords(t, list.progress)
                      : list.status === "finished"
                        ? t("card.finished")
                        : list.status === "cancelled"
                          ? t("card.cancelled")
                          : t("card.missed")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}
