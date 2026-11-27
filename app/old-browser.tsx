import { OldBrowserNotice } from "@ui/old-browser-notice";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const platform = (chunks: ReactNode) => (
  <strong className="font-semibold">{chunks}</strong>
);

/**
 * The notice for a browser older than the app needs, in the app's words
 * (`app.oldBrowser`): what to do on Android and on iPhone and iPad, whom to
 * tell when it can't be updated, and that the page can still be tried. Drawn
 * by the root layout on every page, where it stays hidden unless
 * app/globals.css shows it, and by the /design gallery, shown. No script of
 * its own.
 */
export function OldBrowser({
  shown,
  className,
}: {
  shown?: boolean;
  className?: string;
}) {
  const t = useTranslations("app.oldBrowser");
  return (
    <OldBrowserNotice title={t("title")} shown={shown} className={className}>
      <p>{t.rich("android", { b: platform })}</p>
      <p>{t.rich("iphone", { b: platform })}</p>
      <p>{t("cantUpdate")}</p>
      <p className="text-ink-2">{t("tryAnyway")}</p>
    </OldBrowserNotice>
  );
}
