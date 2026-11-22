"use client";

import type { Form101Setup, NoticeNames } from "@domain/employee-file-settings";
import { displayIsraeliPhone } from "@domain/phone";
import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";
import { ltr } from "./flow-kit";

/**
 * "למה מבקשים את הפרטים האלה" (issue #82 §4.3), one tap away on every step:
 * why the business asks, what is required and what isn't, who sees the
 * details and where they go, who keeps them and where, and the person's
 * rights. It names who the business set (H5b): the employer by law,
 * whoever prepares the payroll, the approved system Form 101 is filled in
 * at (by its site, left to right, until it is named), and the phone for
 * questions; each left out, or said without a name, until it is set. The
 * holders are the owner and the accountant until the grants (H6) can say
 * more; while step 2 shows an emergency contact (`emergency`), it says the
 * managers see that contact too, as the step does
 * (`public.team_emergency_contacts`).
 */
export function NoticeSheet({
  open,
  onOpenChange,
  business,
  names,
  form101,
  emergency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
  names: NoticeNames;
  form101: Form101Setup;
  /** The emergency contact on screen (`parts.emergency`), asked or held. */
  emergency: boolean;
}) {
  const t = useTranslations("app.file");
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("notice.title")}
      closeLabel={t("actions.close")}
      readingLabel={t("notice.title")}
    >
      <NoticeBody
        business={business}
        names={names}
        form101={form101}
        emergency={emergency}
      />
    </Sheet>
  );
}

/** The notice's words, as the sheet shows them. */
export function NoticeBody({
  business,
  names,
  form101,
  emergency,
}: {
  business: string;
  names: NoticeNames;
  form101: Form101Setup;
  emergency: boolean;
}) {
  const t = useTranslations("app.file");
  return (
    <div className="flex flex-col gap-3 px-2 pb-2 text-pretty text-base">
      <p>{t("notice.purpose", { business })}</p>
      {names.employer ? (
        <p>{t("notice.employer", { employer: names.employer })}</p>
      ) : null}
      <p>{t("notice.fields")}</p>
      <p>
        {names.payrollProvider
          ? t("notice.whoProvider", {
              business,
              provider: names.payrollProvider,
            })
          : t("notice.who", { business })}
      </p>
      {emergency ? <p>{t("notice.emergency")}</p> : null}
      {form101.way === "link" ? (
        <p>
          {form101.provider
            ? t("notice.form101Vendor", {
                business,
                provider: form101.provider,
              })
            : t.rich("notice.form101Site", {
                business,
                domain: form101.domain,
                ltr,
              })}
        </p>
      ) : null}
      <p>{t("notice.conceptapp", { business })}</p>
      <p>
        {names.phone
          ? t.rich("notice.rightsPhone", {
              business,
              phone: displayIsraeliPhone(names.phone),
              ltr,
            })
          : t("notice.rights", { business })}
      </p>
    </div>
  );
}
