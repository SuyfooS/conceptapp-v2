"use client";

import { Sheet } from "@ui/sheet";
import { useTranslations } from "next-intl";

/**
 * "למה מבקשים את הפרטים האלה" (issue #82 §4.3), one tap away on every step:
 * why the business asks, what is required and what isn't, who sees the
 * details and where they go, who keeps them and where, and the person's
 * rights. It names the holders as they are today, the owner and the
 * accountant, and whoever prepares the payroll without a name, until each
 * business's settings (H5b) and grants (H6) can say more.
 */
export function NoticeSheet({
  open,
  onOpenChange,
  business,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: string;
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
      <div className="flex flex-col gap-3 px-2 pb-2 text-pretty text-base">
        <p>{t("notice.purpose", { business })}</p>
        <p>{t("notice.fields")}</p>
        <p>{t("notice.who", { business })}</p>
        <p>{t("notice.conceptapp", { business })}</p>
        <p>{t("notice.rights", { business })}</p>
      </div>
    </Sheet>
  );
}
