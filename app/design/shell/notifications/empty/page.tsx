import { InboxDemo } from "../view";

// The inbox before anything has happened: what will come here.
export default function ShellNotificationsEmpty() {
  return <InboxDemo unread={[]} earlier={[]} />;
}
