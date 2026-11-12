import { getAnnouncements } from "@db/chat";
import { chatListRows } from "@domain/chat-sync";
import { currentWording } from "../../../current-wording";
import { moduleMetadata } from "../../../module-screen";
import { translator } from "../../../wording";
import {
  announcementReadersAction,
  confirmAnnouncementAction,
} from "../../actions";
import { currentChatDirectory, currentChatInbox } from "../../chat";
import { chatAccess } from "../../chat-access";
import { chatTitleText } from "../../chat-paths";
import {
  type AnnouncementShown,
  AnnouncementsView,
  type PublishGroup,
} from "./announcements-view";

export const generateMetadata = () => moduleMetadata("chat");

// Every announcement from management in the person's groups (plan §11.4),
// pinned ones first, each with its state for them: waiting for their
// "קראתי", confirmed, or, for its author and management, how many confirmed.
// For announcers the main action is "פרסום הודעה מההנהלה", which asks for the
// group and opens its composer as an announcement; everyone else has none.
// Nothing for a view session (the layout says why), and nothing of a private
// chat, where there are no announcements.
export default async function AnnouncementsPage() {
  const [access, wording] = await Promise.all([chatAccess(), currentWording()]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const businessId = access.businessId;
  const [announcements, inbox, directory] = await Promise.all([
    getAnnouncements(businessId, access.userId, access.canModerate),
    currentChatInbox(businessId),
    currentChatDirectory(businessId),
  ]);
  const t = translator(wording, "app.chat");
  const rows = chatListRows(inbox.rows, directory);
  const words = {
    team: t("list.team"),
    department: t("list.department"),
    noName: t("list.noName"),
    former: t("list.former"),
  };
  const groups = new Map(
    rows
      .filter((row) => row.kind !== "direct")
      .map((row) => [
        row.conversation,
        {
          conversation: row.conversation,
          kind: row.kind,
          title: chatTitleText(row.title, null, words),
          closed: row.closed,
        },
      ]),
  );
  const names = directory.members;

  const shown: AnnouncementShown[] = announcements.flatMap((item) => {
    const group = groups.get(item.conversation);
    if (!group || item.message.body === null) return [];
    const author = item.message.authorId
      ? (names.get(item.message.authorId.toLowerCase())?.name ?? null)
      : null;
    return [
      {
        ...item,
        group: group.kind === "team" ? null : group.title,
        author,
      },
    ];
  });
  // Where an announcer may post: the groups they read, open ones only.
  const publishIn: PublishGroup[] = access.canAnnounce
    ? [...groups.values()]
        .filter((group) => !group.closed)
        .map(({ conversation, kind, title }) => ({ conversation, kind, title }))
    : [];

  return (
    <AnnouncementsView
      readerId={access.userId}
      moderates={access.canModerate}
      timeZone={access.timeZone}
      now={new Date().toISOString()}
      announcements={shown}
      publishIn={access.canAnnounce ? publishIn : null}
      confirm={confirmAnnouncementAction.bind(null, businessId)}
      readers={announcementReadersAction.bind(null, businessId)}
    />
  );
}
