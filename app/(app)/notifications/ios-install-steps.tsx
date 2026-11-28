"use client";

import { cn } from "@ui/cn";
import { BellRing, Share, SquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * How an iPhone or iPad puts the app on its home screen, where its
 * notifications come (`app.notifications.push.iosHint`): Safari's share
 * button, at the bottom of an iPhone's screen and the top of an iPad's
 * (`device` "other", as `isPhone` says), "הוספה למסך הבית", then opening it
 * from there and signing in again. In the notification settings, and on
 * Today's card in Safari. Each step with its icon beside its first line,
 * which says nothing of its own. A list by its role too: Safari, the only
 * browser that shows it, reads a list drawn with no numbers as loose lines,
 * so VoiceOver would say neither the list nor how many steps it has.
 */
export function IosInstallSteps({
  device,
  className,
}: {
  device: "phone" | "other";
  className?: string;
}) {
  const t = useTranslations("app.notifications.push.iosHint");
  // The icons' 20px on the first line of 17px text (24px high).
  const icon = "mt-0.5 size-5 shrink-0 text-ink-2";
  return (
    // biome-ignore lint/a11y/noRedundantRoles: WebKit drops the role of a list drawn with no numbers
    <ol role="list" className={cn("flex flex-col gap-2 text-ink", className)}>
      <li className="flex items-start gap-2">
        <Share aria-hidden="true" className={icon} />
        {t("share", { device })}
      </li>
      <li className="flex items-start gap-2">
        <SquarePlus aria-hidden="true" className={icon} />
        {t("add")}
      </li>
      <li className="flex items-start gap-2">
        <BellRing aria-hidden="true" className={icon} />
        {t("open")}
      </li>
    </ol>
  );
}
