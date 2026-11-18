import { Card } from "@ui/card";
import { EmptyState } from "@ui/empty-state";
import { MessagesSquare } from "lucide-react";
import { currentWording } from "../../current-wording";
import { moduleMetadata } from "../../module-screen";
import { translator } from "../../wording";
import { chatAccess } from "../chat-access";

export const generateMetadata = () => moduleMetadata("chat");

// The chat list. On a phone the list is the screen (the layout draws it);
// from tablet up it stays at the start, and the place beside it says to
// choose a conversation.
export default async function ChatPage() {
  const [access, wording] = await Promise.all([chatAccess(), currentWording()]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const t = translator(wording, "app.chat");
  return (
    <Card
      padding="none"
      className="sticky top-8 hidden min-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] items-center md:flex xl:col-span-2 xl:min-h-[calc(100dvh-4rem)]"
    >
      <EmptyState
        headingLevel="h2"
        icon={<MessagesSquare />}
        title={t("list.choose.title")}
        body={t("list.choose.body")}
      />
    </Card>
  );
}
