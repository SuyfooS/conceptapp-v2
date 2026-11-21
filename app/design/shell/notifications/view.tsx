import type { ModuleKey } from "@domain/modules";
import {
  buildInbox,
  groupsFor,
  type NotificationRow,
} from "@domain/notifications";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { InboxView } from "../../../(app)/notifications/inbox-view";
import { type AppWording, baseWording } from "../../../(app)/wording";
import { demoReadAllNotifications } from "../actions";
import { DEMO_READER, demoInboxLookups, demoInboxNow } from "./data";

/** The modules the demo business has on, unless a page says otherwise. */
const DEMO_MODULES: readonly ModuleKey[] = ["scheduling", "time_clock"];

/**
 * The real inbox with the demo's rows, as Shiran, the shift manager, reads
 * it. Its lines are plain links that stay inside the demo, and so does the
 * way to the settings. A page with lines about orders (waiter mode P8b)
 * gives its moment, its modules, the restaurant's words and where those
 * lines lead in the order twin (`lead`).
 */
export function InboxDemo({
  unread,
  earlier,
  now = demoInboxNow,
  enabled = DEMO_MODULES,
  wording = baseWording,
  lead,
}: {
  unread: NotificationRow[];
  earlier: NotificationRow[];
  now?: string;
  enabled?: readonly ModuleKey[];
  wording?: AppWording;
  lead?: (href: `/${string}`) => string | null;
}) {
  return (
    <InboxView
      unread={buildInbox(unread, demoInboxLookups, DEMO_READER)}
      earlier={buildInbox(earlier, demoInboxLookups, DEMO_READER)}
      older={null}
      olderPage={false}
      groups={groupsFor("manager", enabled)}
      now={now}
      timeZone={ISRAEL_TIME_ZONE}
      open={null}
      readAll={demoReadAllNotifications}
      paths={{
        self: "/design/shell/notifications",
        home: "/design/shell",
        base: "/design/shell",
        lead,
      }}
      wording={wording}
      settings="/design/shell/notifications/settings"
    />
  );
}
