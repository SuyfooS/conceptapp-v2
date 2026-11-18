import {
  alwaysOnPhone,
  DEFAULT_NOTIFICATION_PREFERENCES,
  groupsFor,
  type NotificationPreferences,
} from "@domain/notifications";
import { Suspense } from "react";
import { NotificationSettingsView } from "../../../../(app)/notifications/settings/settings-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSaveNotificationPreferences } from "../actions";
import { demoInboxNow } from "../data";
import { DemoDevice } from "./demo-device";

type Props = { searchParams: Promise<{ state?: string }> };

// The modules the demo business has on.
const ENABLED = ["scheduling", "time_clock", "chat"] as const;

// Late on Monday night, within the quiet hours.
const QUIET_NOW = "2026-11-02T21:40:00.000Z";

// The real notification settings with mock choices, as Shiran, the shift
// manager, has them: everything reaches her phone, no quiet hours.
// ?state=quiet: swaps kept off the phone, quiet hours 22:00 to 07:00 and
// quiet now, no details on the lock screen. ?state=demo: a demo business,
// which has nothing to choose.
export default function ShellNotificationSettings({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const quiet = state === "quiet";
  const preferences: NotificationPreferences | null =
    state === "demo"
      ? null
      : quiet
        ? {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            pushOff: ["swaps"],
            quiet: { from: "22:00", to: "07:00" },
            previews: false,
          }
        : { ...DEFAULT_NOTIFICATION_PREFERENCES, pushOff: [] };
  return (
    <NotificationSettingsView
      key={state ?? "default"}
      preferences={preferences}
      groups={groupsFor("manager", ENABLED)}
      always={alwaysOnPhone("manager", ENABLED).length > 0}
      device={<DemoDevice />}
      save={demoSaveNotificationPreferences}
      now={quiet ? QUIET_NOW : demoInboxNow}
      backHref="/design/shell/notifications"
      wording={baseWording}
    />
  );
}
