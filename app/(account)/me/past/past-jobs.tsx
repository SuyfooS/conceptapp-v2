import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { FolderClock } from "lucide-react";
import { createFormatter } from "next-intl";
import { type AppWording, translator } from "../../../(app)/wording";
import type { PastJob } from "./past-file-types";

/**
 * "עבודות קודמות" (profile H5c): a row for each business the person left
 * whose file they can still read (`currentPastJobs`), "התיק שלי ב{business}"
 * with the month they were on the team until, in Israel's zone (a
 * business's own can't be read after leaving). On the profile, after "העסקים
 * שלי", and on the screen of someone with no business. Each link carries
 * the business's id and nothing else. Hebrew, as both screens are. Also
 * drawn on their twins, whose rows lead to the old file's twin (`hrefOf`).
 */
export function PastJobsSection({
  jobs,
  wording,
  hrefOf = (id) => `/me/past/${id}`,
}: {
  jobs: readonly PastJob[];
  wording: AppWording;
  hrefOf?: (businessId: string) => string;
}) {
  const t = translator(wording, "app.past");
  const tm = translator(wording, "app.me.file");
  const format = createFormatter({
    locale: wording.locale ?? "he",
    timeZone: ISRAEL_TIME_ZONE,
  });
  return (
    <PageSection title={t("section")}>
      <ListGroup>
        {jobs.map((job) => (
          <ListRow
            key={job.businessId}
            href={hrefOf(job.businessId)}
            leading={<FolderClock />}
            title={tm("title", { business: job.name })}
            subtitle={t("until", {
              date: format.dateTime(new Date(job.leftAt), {
                month: "long",
                year: "numeric",
                timeZone: ISRAEL_TIME_ZONE,
              }),
            })}
          />
        ))}
      </ListGroup>
    </PageSection>
  );
}
