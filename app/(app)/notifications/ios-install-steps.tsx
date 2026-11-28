"use client";

import { cn } from "@ui/cn";
import { BellRing, Share, SquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * How an iPhone or iPad puts the app on its home screen, where its
 * notifications come (`app.notifications.push.iosHint`): Safari's share
 * button, "הוספה למסך הבית", then opening it from there and signing in
 * again. In the notification settings, and on Today's card in Safari. Each
 * step with its icon beside it, which says nothing of its own.
 */
export function IosInstallSteps({ className }: { className?: string }) {
  const t = useTranslations("app.notifications.push.iosHint");
  return (
    <ol className={cn("flex flex-col gap-2 text-ink", className)}>
      <li className="flex items-center gap-2">
        <Share aria-hidden="true" className="size-5 shrink-0 text-ink-2" />
        {t("share")}
      </li>
      <li className="flex items-center gap-2">
        <SquarePlus aria-hidden="true" className="size-5 shrink-0 text-ink-2" />
        {t("add")}
      </li>
      <li className="flex items-center gap-2">
        <BellRing aria-hidden="true" className="size-5 shrink-0 text-ink-2" />
        {t("open")}
      </li>
    </ol>
  );
}
