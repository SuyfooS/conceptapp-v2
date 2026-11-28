"use client";

import type { PushAskState } from "@domain/push";
import { useTranslations } from "next-intl";
import { PushAskTodayCard } from "../(app)/notifications/push-ask-today";

/** Each of the card's states, in the order a person meets them. */
const STATES: readonly PushAskState[] = [
  "off",
  "working",
  "on",
  "denied",
  "failed",
  "install",
];

/**
 * Today's card that offers notifications on the phone (closing the pilot,
 * PR 6), in each of its states and the gallery's language: before a press,
 * a press on its way, what came of it, and an iPhone's Safari with the steps
 * to the home screen. No browser is asked, and nothing is behind its
 * buttons; Today's twin (`/design/shell/today/worker?push=off`) presses them.
 * Each without its region, since all of them share a name.
 */
export function GalleryPushAsk() {
  const t = useTranslations("design");
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-ink-2 text-sm">{t("pushAskHint")}</p>
      {STATES.map((state) => (
        <div key={state} className="flex flex-col gap-2">
          <p className="px-1 font-medium text-ink-2 text-sm">
            {t(`pushAskStates.${state}`)}
          </p>
          <PushAskTodayCard
            state={state}
            device="phone"
            settingsHref="/design/shell/notifications/settings"
            landmark={false}
          />
        </div>
      ))}
    </div>
  );
}
