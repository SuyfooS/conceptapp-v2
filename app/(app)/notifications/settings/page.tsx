import { getNotificationPreferences } from "@db/notification-preferences";
import { pushAllowed } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { alwaysOnPhone, groupsFor } from "@domain/notifications";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";
import { baseWording, translator } from "../../wording";
import { setNotificationPreferencesAction } from "../preferences-actions";
import { PushSwitch } from "../push-switch";
import { NotificationSettingsView } from "./settings-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.notifications.settings");
  return { title: t("title") };
}

// The signed-in person's own choices for their phone, read under their own
// session. Not while the module is off for the business, and not while
// viewing as someone: these are theirs alone, as the inbox is. The switch
// for this phone shows where push is set up; a demo business, whose lines
// never reach a phone, says so and offers nothing to choose.
export default async function NotificationSettingsPage() {
  const [member, enabled, wording] = await Promise.all([
    currentMember(),
    currentModules(),
    currentWording(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    member.viewing ||
    !enabled.includes("notifications")
  ) {
    notFound();
  }
  const push = pushConfig();
  const allowed = await pushAllowed(member.userId);
  const preferences =
    allowed === false ? null : await getNotificationPreferences();
  return (
    <NotificationSettingsView
      preferences={preferences}
      groups={groupsFor(membership.role, enabled)}
      always={alwaysOnPhone(membership.role, enabled).length > 0}
      device={
        push && allowed === true ? (
          <PushSwitch publicKey={push.publicKey} demo={false} />
        ) : null
      }
      save={setNotificationPreferencesAction}
      now={new Date().toISOString()}
      backHref="/notifications"
      wording={wording}
    />
  );
}
