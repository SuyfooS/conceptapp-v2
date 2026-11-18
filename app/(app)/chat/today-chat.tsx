import { dateIn } from "@domain/availability";
import { chatShortDate, messageTime } from "@domain/chat-days";
import { ListGroup, ListRow } from "@ui/list-row";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import { confirmAnnouncementAction } from "./actions";
import type { ChatHomeData } from "./chat";
import { chatPaths } from "./chat-paths";
import { TodayAnnouncement } from "./today-announcement";
import { TodayChatSection } from "./today-chat-section";

/**
 * Chat's part of Today (plan §11.4): the pinned announcements waiting for
 * the person's "קראתי", each with a quiet button (Today keeps its own main
 * action), and one row with how many conversations have something new, to
 * /chat. Documents to confirm join it with C7. `path` keeps the links inside
 * the demo on /design/shell. Once one is confirmed, the focus goes on to the
 * next (TodayChatSection).
 */
export function TodayChat({
  data,
  wording,
  path,
  className,
}: {
  data: ChatHomeData;
  /** The business's words. */
  wording: AppWording;
  path: (to: string) => string;
  className?: string;
}) {
  const t = translator(wording, "app.chat");
  const today = dateIn(new Date(data.now), data.timeZone);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const confirm = confirmAnnouncementAction.bind(null, data.business);
  return (
    <TodayChatSection
      title={t("today.title")}
      waiting={data.waiting.map((item) => item.id)}
      className={className}
      action={
        <Link
          href={path(chatPaths.list)}
          className="-my-2.5 flex min-h-11 items-center rounded-full text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("today.all")}
        </Link>
      }
    >
      {data.waiting.map((item) => {
        const day = dateIn(new Date(item.createdAt), data.timeZone);
        const time = messageTime(item.createdAt, data.timeZone);
        const name = item.author ?? t("list.noName");
        return (
          <TodayAnnouncement
            key={item.id}
            message={item.id}
            byline={
              day === today
                ? t.rich("announcement.byline", { name, time, ltr })
                : t.rich("announcement.bylineDay", {
                    name,
                    time,
                    day: chatShortDate(day, today),
                    ltr,
                  })
            }
            where={
              item.group
                ? t("announcement.inGroup", { group: item.group })
                : t("announcement.inTeam")
            }
            href={path(chatPaths.conversation(item.conversation))}
            body={item.body}
            confirm={confirm}
          />
        );
      })}
      <ListGroup>
        <ListRow
          href={path(chatPaths.list)}
          leading={<MessageCircle />}
          title={t("list.label")}
          subtitle={t("today.chats", { count: data.chatsWithNew })}
        />
      </ListGroup>
    </TodayChatSection>
  );
}
