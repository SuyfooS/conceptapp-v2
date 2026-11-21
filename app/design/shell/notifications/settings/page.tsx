import type { ModuleKey } from "@domain/modules";
import {
  alwaysOnPhone,
  DEFAULT_NOTIFICATION_PREFERENCES,
  groupsFor,
  type NotificationPreferences,
  shiftSkipsQuiet,
} from "@domain/notifications";
import { Suspense } from "react";
import { NotificationSettingsView } from "../../../../(app)/notifications/settings/settings-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSaveNotificationPreferences } from "../actions";
import { demoInboxNow } from "../data";
import { DemoDevice } from "./demo-device";

type Props = { searchParams: Promise<{ state?: string }> };

// The modules the demo business has on.
const ENABLED: readonly ModuleKey[] = ["scheduling", "time_clock", "chat"];
// ?state=orders: taking orders on too (waiter mode P8b).
const WITH_ORDERS: readonly ModuleKey[] = [...ENABLED, "order_taking"];

// Late on Monday night, within the quiet hours.
const QUIET_NOW = "2026-11-02T21:40:00.000Z";

// The real notification settings with mock choices, as Shiran, the shift
// manager, has them: everything reaches her phone, no quiet hours.
// ?state=quiet: swaps kept off the phone, quiet hours 22:00 to 07:00 and
// quiet now, no details on the lock screen. ?state=demo: a demo business,
// which has nothing to choose. ?state=orders: a worker where taking orders
// is on, with quiet hours: "הזמנות מוכנות" among the groups, and the line
// saying they still come during a shift (P8b).
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
  const orders = state === "orders";
  const role = orders ? "worker" : "manager";
  const enabled = orders ? WITH_ORDERS : ENABLED;
  const groups = groupsFor(role, enabled);
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
        : orders
          ? {
              ...DEFAULT_NOTIFICATION_PREFERENCES,
              pushOff: [],
              quiet: { from: "22:00", to: "07:00" },
            }
          : { ...DEFAULT_NOTIFICATION_PREFERENCES, pushOff: [] };
  return (
    <NotificationSettingsView
      key={state ?? "default"}
      preferences={preferences}
      groups={groups}
      always={alwaysOnPhone(role, enabled).length > 0}
      shift={shiftSkipsQuiet(groups, enabled)}
      device={<DemoDevice />}
      save={demoSaveNotificationPreferences}
      now={quiet ? QUIET_NOW : demoInboxNow}
      backHref="/design/shell/notifications"
      wording={baseWording}
    />
  );
}
