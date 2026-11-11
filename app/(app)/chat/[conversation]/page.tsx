import { currentWording } from "../../current-wording";
import { moduleMetadata } from "../../module-screen";
import { chatAccess } from "../chat-access";
import { ConversationPageView } from "../conversation-page";

// Titles say only "צ'אט": a name in the tab's title would stay in the
// browser's history.
export const generateMetadata = () => moduleMetadata("chat");

// One conversation the person reads (ConversationPageView says which): one
// they may not read is the same not-found screen as one that doesn't exist.
export default async function ConversationPage({
  params,
  searchParams,
}: PageProps<"/chat/[conversation]">) {
  const [{ conversation }, query, access, wording] = await Promise.all([
    params,
    searchParams,
    chatAccess(),
    currentWording(),
  ]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  return (
    <ConversationPageView
      access={access}
      conversationId={conversation}
      toPerson={null}
      announceFirst={query.announce === "1"}
      wording={wording}
    />
  );
}
