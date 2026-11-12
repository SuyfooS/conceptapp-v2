import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { Bell, Settings } from "lucide-react";
import { type AppWording, translator } from "../wording";

/**
 * The way to the notification settings, as one row: on the profile ("התראות")
 * and in the inbox ("הגדרות ההתראות"), saying what is chosen there.
 */
export function NotificationSettingsLink({
  href,
  wording,
  from,
  className,
}: {
  href: string;
  wording: AppWording;
  /** Where it sits: the profile names the subject, the inbox the screen. */
  from: "profile" | "inbox";
  className?: string;
}) {
  const t = translator(wording, "app.notifications");
  return (
    <ListGroup className={cn("min-w-0", className)}>
      <ListRow
        href={href}
        leading={from === "profile" ? <Bell /> : <Settings />}
        title={from === "profile" ? t("title") : t("settings.row")}
        subtitle={t("settings.rowHint")}
      />
    </ListGroup>
  );
}
