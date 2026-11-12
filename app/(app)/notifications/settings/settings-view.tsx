import type {
  NotificationGroup,
  NotificationPreferences,
} from "@domain/notifications";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../../wording";
import { PreferencesForm, type SavePreferences } from "./preferences-form";

/**
 * `/notifications/settings`: what reaches the person's phone, quiet hours and
 * the lock screen, each saved as it changes, so there is no button to press.
 * Their own choices, across every business they are in; the inbox shows
 * everything whatever they choose. In a demo business, whose lines never
 * reach a phone, it says so instead (`preferences` null). Also on the design
 * demo, /design/shell/notifications/settings.
 */
export function NotificationSettingsView({
  preferences,
  groups,
  always = false,
  device,
  save,
  now,
  backHref,
  wording,
}: {
  preferences: NotificationPreferences | null;
  groups: readonly NotificationGroup[];
  /** Lines about pay reach this person's phone whatever they switch off. */
  always?: boolean;
  /** The switch for this phone, where push is set up. */
  device?: ReactNode;
  save: SavePreferences;
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  /** The inbox. */
  backHref: string;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.notifications");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />
      {preferences ? (
        <PreferencesForm
          preferences={preferences}
          groups={groups}
          always={always}
          device={device}
          save={save}
          now={now}
        />
      ) : (
        <Card tone="flat" padding="lg" className="max-w-xl">
          <CardText>{t("settings.demo")}</CardText>
        </Card>
      )}
    </PageBody>
  );
}
