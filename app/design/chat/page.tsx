import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PageBody } from "@ui/page";
import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ChatList } from "./chat-list";
import { chatPaneClass } from "./panes";

type Props = { searchParams: Promise<{ state?: string }> };

// Shiran's chat list. On a phone it is the screen; from tablet up the list
// stays at the start and the conversation chosen opens beside it, so with
// none chosen the rest says to choose one. `?state=empty` is a business
// where nobody wrote yet, and `?state=demo` a demo business, where everyone
// who comes in reads what is written.
export default function ChatDemoList({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const t = await getTranslations("app.chat");
  const empty = state === "empty";
  return (
    <PageBody>
      <div
        className={cn(
          !empty &&
            "md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-6",
        )}
      >
        <div className={cn(!empty && chatPaneClass)}>
          <ChatList heading="h1" demo={state === "demo"} empty={empty} />
        </div>
        {empty ? null : (
          <Card
            padding="none"
            className="sticky top-8 hidden min-h-[calc(100dvh-env(safe-area-inset-bottom)-10.5rem)] items-center md:flex xl:min-h-[calc(100dvh-4rem)]"
          >
            <EmptyState
              headingLevel="h2"
              icon={<MessagesSquare />}
              title={t("list.choose.title")}
              body={t("list.choose.body")}
            />
          </Card>
        )}
      </div>
    </PageBody>
  );
}
