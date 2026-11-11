import { isUuid } from "@domain/activity";
import { canSeeTeam } from "@domain/team";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { moduleMetadata } from "../../../module-screen";
import { currentModuleSettings } from "../../../modules";
import { muteChatAction } from "../../actions";
import {
  chatPeople,
  currentChatDepartments,
  currentChatDirectory,
  currentChatInbox,
} from "../../chat";
import { chatAccess } from "../../chat-access";
import { chatPaths } from "../../chat-paths";
import {
  boundChatActions,
  ConversationPageView,
} from "../../conversation-page";
import { ConversationView } from "../../conversation-view";

export const generateMetadata = () => moduleMetadata("chat");

// Someone's private chat with the person: the one they have, shown here as at
// its own address, or an empty one that their first message makes (the
// database makes it, for the two of them only). The screen stays where it is
// once that first message goes, so this address shows the chat from then on.
// Someone not on the staff now with no chat yet, the person themselves, or an
// address that names nobody, is not found or goes back to the list.
export default async function WithPersonPage({
  params,
}: PageProps<"/chat/with/[person]">) {
  const [{ person }, access, wording] = await Promise.all([
    params,
    chatAccess(),
    currentWording(),
  ]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  if (!isUuid(person)) notFound();
  const id = person.toLowerCase();
  if (id === access.userId.toLowerCase()) redirect(chatPaths.list);
  const businessId = access.businessId;

  const [inbox, directory, departments, settings] = await Promise.all([
    currentChatInbox(businessId),
    currentChatDirectory(businessId),
    currentChatDepartments(businessId),
    currentModuleSettings("chat"),
  ]);
  const existing = inbox.rows.find(
    (row) => row.kind === "direct" && row.otherPerson === id,
  );
  if (existing) {
    return (
      <ConversationPageView
        access={access}
        conversationId={existing.conversation}
        toPerson={id}
        wording={wording}
      />
    );
  }
  const other = chatPeople(directory, departments, wording).get(id);
  if (!other?.active) notFound();

  return (
    <ConversationView
      readerId={access.userId}
      conversation={null}
      toPerson={id}
      kind="direct"
      title={{ kind: "direct", person: { kind: "member", name: other.name } }}
      otherPerson={other}
      messages={[]}
      people={[]}
      older={false}
      seenUpTo={null}
      block={null}
      members={[]}
      profileHref={canSeeTeam(access.role) ? `/team/${other.id}` : null}
      businessName={access.businessName}
      fileDays={settings.fileDays}
      demo={access.demo}
      actions={boundChatActions(businessId)}
      pinned={[]}
      powers={{ announce: false, moderate: false }}
      announceFirst={false}
      mute={muteChatAction.bind(null, businessId)}
      wording={wording}
    />
  );
}
