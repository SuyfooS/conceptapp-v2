import { dateIn } from "@domain/availability";
import { chatDay } from "@domain/chat-days";
import { ImmersiveScreen } from "@ui/immersive-screen";
import { PageBody } from "@ui/page";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ChatDetails } from "../chat-details";
import { ChatDemoMark, ChatList } from "../chat-list";
import { ConversationDemo, type DemoBubble } from "../conversation-demo";
import {
  CHAT_DEMO_NOW,
  CHAT_DEMO_READER,
  CHAT_DEMO_TODAY,
  CHAT_DEMO_ZONE,
  chatDemoConversation,
  chatDemoFailed,
  chatDemoIds,
  chatDemoLongDate,
  chatDemoPerson,
} from "../data";
import { chatDetailsClass, chatPaneClass } from "../panes";

export const generateStaticParams = () =>
  chatDemoIds().map((conversation) => ({ conversation }));

type Props = {
  params: Promise<{ conversation: string }>;
  searchParams: Promise<{ state?: string }>;
};

// One of Shiran's conversations: on a phone the whole screen, with no tab
// bar and the composer in its place; on a tablet beside the list; on a
// desktop between the list and its details. What she writes goes, arrives
// and gets one answer, and nothing is stored. A person on the team she hasn't
// written to yet (/design/chat/uri) opens an empty private chat, and the
// removed department (/design/chat/desserts) reads but takes nothing.
// `?state=failed` adds a message of hers that didn't go, with its retry.
export default function ChatDemoConversationPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ conversation }, { state }] = await Promise.all([
    params,
    searchParams,
  ]);
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

  const messages: DemoBubble[] = chat.messages.map((m) => ({
    id: m.id,
    author: m.author,
    authorName: chatDemoPerson(m.author)?.name ?? "",
    at: m.at,
    body: m.body,
    removedBy: m.removedBy,
  }));
  if (state === "failed" && !chat.closed) {
    messages.push({
      id: "failed",
      author: CHAT_DEMO_READER,
      authorName: "",
      at: CHAT_DEMO_NOW,
      body: chatDemoFailed,
      failed: true,
    });
  }
  const days = new Set([
    ...messages.map((m) => dateIn(new Date(m.at), CHAT_DEMO_ZONE)),
    CHAT_DEMO_TODAY,
  ]);
  const dayLabels = Object.fromEntries(
    [...days].map((day) => {
      const which = chatDay(day, CHAT_DEMO_TODAY);
      const label =
        which.kind === "today"
          ? t("day.today")
          : which.kind === "yesterday"
            ? t("day.yesterday")
            : chatDemoLongDate(day);
      return [day, label];
    }),
  );
  const reply =
    chat.reply && !chat.closed
      ? {
          author: chat.reply.author,
          authorName: chatDemoPerson(chat.reply.author)?.name ?? "",
          body: chat.reply.body,
        }
      : null;

  return (
    <PageBody className="pb-0 md:pb-0 xl:pb-6">
      <ImmersiveScreen />
      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[minmax(0,360px)_minmax(20rem,1fr)_minmax(0,320px)]">
        <div className={`hidden md:block ${chatPaneClass}`}>
          <ChatList heading="h2" current={chat.id} />
        </div>
        <ConversationDemo
          key={state ?? ""}
          kind={chat.kind}
          title={title}
          subtitle={subtitle}
          leading={<ChatDemoMark chat={chat} />}
          backHref="/design/chat"
          reader={CHAT_DEMO_READER}
          messages={messages}
          dayLabels={dayLabels}
          timeZone={CHAT_DEMO_ZONE}
          now={CHAT_DEMO_NOW}
          seenUpTo={chat.seenUpTo ?? null}
          blocked={chat.closed ? t("conversation.closed") : null}
          empty={
            chat.kind === "direct"
              ? t("conversation.emptyPrivate")
              : t("conversation.emptyGroup")
          }
          reply={reply}
        />
        <ChatDetails
          chat={chat}
          title={title}
          subtitle={subtitle}
          className={chatDetailsClass}
        />
      </div>
    </PageBody>
  );
}
