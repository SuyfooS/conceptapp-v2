import { PageBody } from "@ui/page";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { seeChatNoticeAction } from "./actions";
import { currentChatFrame } from "./chat";
import { chatAccess } from "./chat-access";
import { ChatProvider } from "./chat-provider";
import { ChatViewingView } from "./chat-viewing";
import { InboxPane } from "./inbox-pane";

/**
 * Every chat screen's frame (plan §11): on a phone one thing at a time, the
 * list on /chat and a conversation on its own, with the tab bar stepping
 * aside there; from tablet up the list stays at the start beside the
 * screen; from 1280px a conversation also has its details column. Not
 * drawn again when moving between them, so the list keeps its place and the
 * one sync goes on (ChatProvider).
 *
 * For someone on the staff of a business with chat on; anyone else gets the
 * not-found screen, as with a module that is off. While the ConceptApp team
 * views the business, it says only that chats aren't shown.
 */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const [access, wording] = await Promise.all([chatAccess(), currentWording()]);
  if (!access) notFound();
  if (access.viewing) return <ChatViewingView wording={wording} />;
  const frame = await currentChatFrame(access, wording);
  return (
    // One reader's chats in one business: when someone else signs in on this
    // browser, or the business changes, everything under it starts afresh,
    // the screens kept for going back included (cacheComponents keeps React
    // state across navigations, sign-in too): no list, draft or message of
    // the last person's stays.
    <ChatProvider
      key={`${access.userId.toLowerCase()}:${access.businessId.toLowerCase()}`}
      frame={frame}
      seeNotice={seeChatNoticeAction.bind(null, access.businessId)}
    >
      {/* A conversation sits on the foot of the screen, its composer where
          the phone's tab bar was (ImmersiveScreen marks it). */}
      <PageBody className="has-[[data-immersive]]:pb-0 md:has-[[data-immersive]]:pb-0 xl:has-[[data-immersive]]:pb-6">
        <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[minmax(0,360px)_minmax(20rem,1fr)_minmax(0,320px)]">
          <InboxPane />
          {children}
        </div>
      </PageBody>
    </ChatProvider>
  );
}
