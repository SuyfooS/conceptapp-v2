import { dayMonth } from "@domain/availability-form";
import { PageBody, PageHeader } from "@ui/page";
import { type AppWording, translator } from "../../wording";
import type { AvailabilityWeek } from "../week";
import {
  AvailabilityForm,
  type AvailabilityFormProps,
} from "./availability-form";

export type AvailabilityViewProps = {
  week: AvailabilityWeek;
  /** The due moment has passed. */
  late: boolean;
  save: AvailabilityFormProps["save"];
  /** The schedule screen this one sits under. */
  backHref: string;
  /** The business's words. */
  wording: AppWording;
};

/** Also rendered on /design/shell/schedule/availability. */
export function AvailabilityView({
  week,
  late,
  save,
  backHref,
  wording,
}: AvailabilityViewProps) {
  const t = translator(wording, "app.availability");
  const tm = translator(wording, "modules.scheduling");
  return (
    <PageBody>
      <PageHeader
        back={{ href: backHref, label: tm("name") }}
        eyebrow={t("subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
        })}
        title={t("title")}
      />
      <AvailabilityForm key={week.start} week={week} late={late} save={save} />
    </PageBody>
  );
}
