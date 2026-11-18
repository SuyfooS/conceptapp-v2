"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { Eye, Lock, Server, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useChat } from "./chat-provider";

/** The notice's lines, each with its mark: the same here and in the details. */
export function WhoSeesLines({
  lines,
  className,
}: {
  lines: {
    private: ReactNode;
    groups: ReactNode;
    kept: ReactNode;
    stored: ReactNode;
  };
  className?: string;
}) {
  const items: { key: string; icon: ReactNode; text: ReactNode }[] = [
    { key: "private", icon: <Lock />, text: lines.private },
    { key: "groups", icon: <Eye />, text: lines.groups },
    { key: "kept", icon: <Timer />, text: lines.kept },
    { key: "stored", icon: <Server />, text: lines.stored },
  ];
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {items.map(({ key, icon, text }) => (
        <li key={key} className="flex items-start gap-2.5 text-base text-ink">
          <span
            aria-hidden="true"
            className="mt-0.5 flex shrink-0 text-ink-2 [&_svg]:size-4"
          >
            {icon}
          </span>
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Who sees what in chat, the first time someone opens it in a business (the
 * notice at collection, §11.1 and §15 of the chat plan): private chats, groups
 * and management, how long things are kept, and where the chats are stored.
 * In a demo business it says what is true there instead: whoever comes in
 * reads every chat, and messages go after an hour. "הבנתי" puts it away, and
 * the database keeps that per person and business; `onSeen` then puts the
 * keyboard's focus where the screen goes on. The details column says it again.
 */
export function ChatNotice({
  level,
  onSeen,
  className,
}: {
  level: 2 | 3;
  /** The card is going: where the focus goes on, which held its button. */
  onSeen?: () => void;
  className?: string;
}) {
  const t = useTranslations("app.chat.notice");
  const chat = useChat();
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <Card padding="lg" className={cn("flex flex-col gap-4", className)}>
      <Heading className="font-semibold text-md text-ink">{t("title")}</Heading>
      <WhoSeesLines
        lines={{
          private: chat.demo ? t("demoPrivate") : t("private"),
          groups: t("groups"),
          kept: chat.demo
            ? t("demoKept")
            : t.rich("kept", {
                days: chat.fileDays,
                ltr: (chunks) => <span dir="ltr">{chunks}</span>,
              }),
          stored: t("stored", { business: chat.businessName }),
        }}
      />
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          chat.seeNotice();
          onSeen?.();
        }}
      >
        {t("ok")}
      </Button>
    </Card>
  );
}
