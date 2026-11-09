import { demoEarlier, demoUnread } from "./data";
import { InboxDemo } from "./view";

// The inbox on the demo's Tuesday morning: three lines new, four read.
export default function ShellNotifications() {
  return <InboxDemo unread={demoUnread} earlier={demoEarlier} />;
}
