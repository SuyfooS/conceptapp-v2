import { getConversation } from "@db/chat";
import { canSeeTeam } from "@domain/team";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { moduleMetadata } from "../../../module-screen";
import { currentModuleSettings } from "../../../modules";
import { translator } from "../../../wording";
import { muteChatAction } from "../../actions";
import {
  byName,
  chatPeople,
  currentChatDepartments,
  currentChatDirectory,
} from "../../chat";
import { chatAccess } from "../../chat-access";
import { ChatDetailsBody } from "../../chat-details";
import { ChatPageHeader } from "../../chat-page-header";
import { chatPaths, chatTitleText } from "../../chat-paths";
import { groupMembers } from "../../conversation-page";

// Titles say only "צ'אט": a name in the tab's title would stay in the
// browser's history.
export const generateMetadata = () => moduleMetadata("chat");

// A conversation's details on a phone, its own page (plan §11.3): its people
// (a department's, and the line that management sees it too), mute, the
// other person's profile in a private chat, and who sees what. A tablet opens
// the same in a sheet from the title, and a desktop has them beside the
// conversation. One the person may not read is the same not-found screen as
// one that doesn't exist. Its title takes the focus when the conversation's,
// pressed to open it, went (kept hidden for going back).
export default async function ConversationInfoPage({
  params,
}: PageProps<"/chat/[conversation]/info">) {
  const [{ conversation }, access, wording] = await Promise.all([
    params,
    chatAccess(),
    currentWording(),
  ]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const businessId = access.businessId;
  const view = await getConversation(businessId, conversation, access.userId);
  if (!view) notFound();

  const [settings, directory, departments] = await Promise.all([
    currentModuleSettings("chat"),
    currentChatDirectory(businessId),
    currentChatDepartments(businessId),
  ]);
  const t = translator(wording, "app.chat");
  const people = chatPeople(directory, departments, wording);
  const other = view.otherPerson
    ? (people.get(view.otherPerson.toLowerCase()) ?? null)
    : null;
  const title = chatTitleText(view.title, other?.name ?? null, {
    team: t("list.team"),
    department: t("list.department"),
    noName: t("list.noName"),
    former: t("list.former"),
  });
  const subtitle = access.demo
    ? t("list.demoNote")
    : view.kind === "team"
      ? t("conversation.teamNote")
      : view.kind === "department"
        ? t("conversation.departmentNote")
        : t("conversation.privateNote");

  return (
    <div className="flex min-w-0 flex-col gap-6 md:max-w-2xl xl:col-span-2">
      <ChatPageHeader
        back={{
          href: chatPaths.conversation(view.id),
          label: t("info.back"),
        }}
        title={t("info.open")}
      />
      <ChatDetailsBody
        conversation={view.id}
        kind={view.kind}
        title={title}
        subtitle={subtitle}
        person={other}
        profileHref={
          other?.active && canSeeTeam(access.role) ? `/team/${other.id}` : null
        }
        members={byName(groupMembers(view, people, departments))}
        businessName={access.businessName}
        fileDays={settings.fileDays}
        demo={access.demo}
        mute={muteChatAction.bind(null, businessId)}
        wording={wording}
      />
    </div>
  );
}
