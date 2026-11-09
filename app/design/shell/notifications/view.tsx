import {
  buildInbox,
  groupsFor,
  type NotificationRow,
} from "@domain/notifications";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { InboxView } from "../../../(app)/notifications/inbox-view";
import { baseWording } from "../../../(app)/wording";
import { demoReadAllNotifications } from "../actions";
import { DEMO_READER, demoInboxLookups, demoInboxNow } from "./data";

/**
 * The real inbox with the demo's rows, as Shiran, the shift manager, reads
 * it. Its lines are plain links that stay inside the demo.
 */
export function InboxDemo({
  unread,
  earlier,
}: {
  unread: NotificationRow[];
  earlier: NotificationRow[];
}) {
  return (
    <InboxView
      unread={buildInbox(unread, demoInboxLookups, DEMO_READER)}
      earlier={buildInbox(earlier, demoInboxLookups, DEMO_READER)}
      older={null}
      olderPage={false}
      groups={groupsFor("manager", ["scheduling", "time_clock"])}
      now={demoInboxNow}
      timeZone={ISRAEL_TIME_ZONE}
      open={null}
      readAll={demoReadAllNotifications}
      paths={{
        self: "/design/shell/notifications",
        home: "/design/shell",
        base: "/design/shell",
      }}
      wording={baseWording}
    />
  );
}
