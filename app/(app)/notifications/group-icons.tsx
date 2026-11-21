import type { NotificationGroup } from "@domain/notifications";
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Repeat,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

/** Each group's mark: the inbox's lines and side card, and the settings. */
export const GROUP_ICONS: Record<NotificationGroup, ReactNode> = {
  schedule: <CalendarDays />,
  swaps: <Repeat />,
  clock: <Clock />,
  approvals: <ClipboardCheck />,
  team: <Users />,
  lists: <ListChecks />,
  chat: <MessageCircle />,
  documents: <FileText />,
  // Taking orders' own mark (its manifest's "pad"), for any kind of business.
  orders: <NotebookPen />,
};
