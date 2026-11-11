import { PageBody, PageHeader } from "@ui/page";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ChatDemoDetailsBody } from "../../chat-details";
import { ChatList } from "../../chat-list";
import { chatDemoConversation, chatDemoIds, chatDemoPerson } from "../../data";
import { chatPaneClass } from "../../panes";

export const generateStaticParams = () =>
  chatDemoIds().map((conversation) => ({ conversation }));

type Props = { params: Promise<{ conversation: string }> };

// A conversation's details as a phone opens them from its title (C3), the
// app's /chat/<id>/info: its face and who sees it, mute, its people, and
// back to the conversation. From tablet up the list stays beside it, as it
// does beside every chat screen; the tablet itself opens the same in a sheet
// over the conversation, and the desktop has them in its third column.
export default function ChatDemoInfoPage({ params }: Props) {
  return (
    <Suspense>
      <Demo params={params} />
    </Suspense>
  );
}

async function Demo({ params }: Props) {
  const { conversation } = await params;
  const chat = chatDemoConversation(conversation);
  if (!chat) notFound();
  const t = await getTranslations("app.chat");
  const person =
    chat.kind === "direct" ? chatDemoPerson(chat.person ?? "") : null;
  const title =
    chat.kind === "team"
      ? t("list.team")
      : chat.kind === "department"
        ? (chat.name ?? "")
        : (person?.name ?? "");
  const subtitle =
    chat.kind === "team"
      ? t("conversation.teamNote")
      : chat.kind === "department"
        ? t("conversation.departmentNote")
        : t("conversation.privateNote");
  return (
    <PageBody>
      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6">
        <div className={`hidden md:block ${chatPaneClass}`}>
          <ChatList heading="h2" current={chat.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 md:max-w-2xl">
          <PageHeader
            back={{
              href: `/design/chat/${chat.id}`,
              label: t("info.back"),
            }}
            title={t("info.open")}
          />
          <ChatDemoDetailsBody chat={chat} title={title} subtitle={subtitle} />
        </div>
      </div>
    </PageBody>
  );
}
