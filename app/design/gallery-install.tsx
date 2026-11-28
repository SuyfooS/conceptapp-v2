"use client";

import type { InstallBrowser, InstallState } from "@domain/install";
import { useTranslations } from "next-intl";
import { InstallView } from "../(app)/notifications/install-button";
import { PushAskTodayCard } from "../(app)/notifications/push-ask-today";

/** Each state's label in the gallery (`design.installAppStates`). */
type StateKey =
  | "ready"
  | "prompting"
  | "installed"
  | "dismissed"
  | "menuChrome"
  | "menuOther";

/** Each state the install button shows, in the order a person meets them. */
const STATES: readonly {
  key: StateKey;
  state: InstallState;
  browser: InstallBrowser;
}[] = [
  { key: "ready", state: "ready", browser: "chrome" },
  { key: "prompting", state: "prompting", browser: "chrome" },
  { key: "installed", state: "installed", browser: "chrome" },
  { key: "dismissed", state: "dismissed", browser: "chrome" },
  { key: "menuChrome", state: "menu", browser: "chrome" },
  { key: "menuOther", state: "menu", browser: "other" },
];

/**
 * The install button on Android (closing the pilot, PR 7), in the gallery's
 * language: in Today's notifications card with Chrome's offer there, then
 * each state as the notification settings draw it, Chrome's offer, Chrome
 * asking, installed, declined, and with no offer, in Chrome and in another
 * browser. No browser is asked and nothing is behind its button; the twins
 * (`/design/shell/today/worker?push=off&install=ready`,
 * `/design/shell/notifications/settings?install=ready`) press it. Each
 * without its region, since all of them share a name.
 */
export function GalleryInstall() {
  const t = useTranslations("design");
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-ink-2 text-sm">{t("installAppHint")}</p>
      <div className="flex flex-col gap-2">
        <p className="px-1 font-medium text-ink-2 text-sm">
          {t("installAppStates.card")}
        </p>
        <PushAskTodayCard
          state="off"
          device="phone"
          settingsHref="/design/shell/notifications/settings"
          landmark={false}
          install={
            <InstallView
              state="ready"
              browser="chrome"
              shape="card"
              className="mt-2"
            />
          }
        />
      </div>
      {STATES.map(({ key, state, browser }) => (
        <div key={key} className="flex flex-col gap-2">
          <p className="px-1 font-medium text-ink-2 text-sm">
            {t(`installAppStates.${key}`)}
          </p>
          <InstallView
            state={state}
            browser={browser}
            shape="settings"
            landmark={false}
          />
        </div>
      ))}
    </div>
  );
}
