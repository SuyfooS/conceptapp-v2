import { dateIn } from "@domain/availability";
import { messageTime } from "@domain/chat-days";
import { PageBody } from "@ui/page";
import { getTranslations } from "next-intl/server";
import { ChatList } from "../chat-list";
import {
  CHAT_DEMO_READER,
  CHAT_DEMO_TODAY,
  CHAT_DEMO_ZONE,
  chatDemoConversation,
  chatDemoConversations,
  chatDemoEarlierAnnouncement,
  chatDemoPeople,
  chatDemoPerson,
  chatDemoShortDate,
} from "../data";
import { chatPaneClass } from "../panes";
import { AnnouncementsDemo, type DemoAnnouncement } from "./announcements-demo";

// Shiran's announcements from management (C3), the app's
// /chat/announcements: the whole team's pinned one waiting for her "קראתי"
// (the one accent card), her earlier one in the kitchen's group under it,
// and her main action, "פרסום הודעה מההנהלה", which asks for the group and
// opens its composer as an announcement. From tablet up the list stays
// beside it, its row marked.
export default async function ChatDemoAnnouncements() {
  const t = await getTranslations("app.chat");
  const team = chatDemoConversation("team");
  const pinnedMessage = team?.messages.find(
    (m) => m.id === team.pinned?.message,
  );
  const shown: DemoAnnouncement[] = [];
  if (team?.pinned && pinnedMessage?.body) {
    const confirmed = Object.keys(team.pinned.confirmedBy).length;
    shown.push({
      id: pinnedMessage.id,
      conversation: team.id,
      pinned: true,
      own: pinnedMessage.author === CHAT_DEMO_READER,
      authorName: chatDemoPerson(pinnedMessage.author)?.name ?? "",
      time: messageTime(pinnedMessage.at, CHAT_DEMO_ZONE),
      day: null,
      body: pinnedMessage.body,
      where: t("announcement.inTeam"),
      readers: {
        count: confirmed,
        total: chatDemoPeople.filter((p) => p.id !== pinnedMessage.author)
          .length,
      },
    });
  }
  const earlier = chatDemoEarlierAnnouncement;
  const kitchen = chatDemoConversation(earlier.conversation);
  const earlierDay = dateIn(new Date(earlier.message.at), CHAT_DEMO_ZONE);
  shown.push({
    id: earlier.message.id,
    conversation: earlier.conversation,
    pinned: false,
    own: earlier.message.author === CHAT_DEMO_READER,
    authorName: chatDemoPerson(earlier.message.author)?.name ?? "",
    time: messageTime(earlier.message.at, CHAT_DEMO_ZONE),
    day: earlierDay === CHAT_DEMO_TODAY ? null : chatDemoShortDate(earlierDay),
    body: earlier.message.body,
    where: t("announcement.inGroup", { group: kitchen?.name ?? "" }),
    readers: null,
  });
  // Management posts in any group still open.
  const groups = chatDemoConversations
    .filter((c) => c.kind !== "direct" && !c.closed)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.kind === "team" ? t("list.team") : (c.name ?? ""),
    }));
  return (
    <PageBody>
      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6">
        <div className={`hidden md:block ${chatPaneClass}`}>
          <ChatList heading="h2" current="announcements" />
        </div>
        <AnnouncementsDemo announcements={shown} groups={groups} />
      </div>
    </PageBody>
  );
}
