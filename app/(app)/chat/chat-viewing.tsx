import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { EyeOff } from "lucide-react";
import { type AppWording, translator } from "../wording";

/**
 * Chat while the ConceptApp team views the business as a role: the tab stays,
 * so the bar reads as the role's does, and the screen says only that chats
 * aren't shown. Nothing of any chat is read for it (the database reads a view
 * session nothing either).
 */
export function ChatViewingView({ wording }: { wording: AppWording }) {
  const t = translator(wording);
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader title={t("modules.chat.name")} />
      <EmptyState
        headingLevel="h2"
        icon={<EyeOff />}
        body={t("app.chat.viewing")}
        className="md:py-16"
      />
    </PageBody>
  );
}
