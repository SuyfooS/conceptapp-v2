"use client";

import { CHAT_MESSAGE_MAX, chatPreview } from "@domain/chat";
import { Avatar } from "@ui/avatar";
import { Button } from "@ui/button";
import { ChatHeader } from "@ui/chat-header";
import { ChatGroupMark, ChatRow } from "@ui/chat-row";
import { Composer } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import { ListGroup } from "@ui/list-row";
import { MessageBubble, type MessageStatus } from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import { Building, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { portraits } from "./portraits";

/** The gallery's day and its eve, so the dividers and times never move. */
const YESTERDAY = "2026-11-02";
const TODAY = "2026-11-03";
const at = (day: string, time: string) => `${day}T${time}:00.000+02:00`;

type Sent = { id: number; body: string; sending: boolean };

/**
 * The chat's parts (C2): rows of the list, a conversation with its title,
 * days, bubbles in every state and the composer, which sends into the
 * sample, and the composer where nobody can write. The whole screens, in
 * the three device shapes, are at /design/chat.
 */
export function GalleryChat() {
  const t = useTranslations("design");
  const tc = useTranslations("app.chat");
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const [retry, setRetry] = useState<"failed" | "sending" | "seen">("failed");
  const [below, setBelow] = useState(false);

  function send(body: string) {
    const id = Date.now();
    setSent((list) => [...list, { id, body, sending: true }]);
    setDraft("");
    // A moment on the way, as the real one has; nothing is stored.
    setTimeout(
      () =>
        setSent((list) =>
          list.map((each) =>
            each.id === id ? { ...each, sending: false } : each,
          ),
        ),
      700,
    );
  }

  const retried: MessageStatus =
    retry === "failed"
      ? {
          kind: "failed",
          label: tc("conversation.failed"),
          onRetry: () => {
            setRetry("sending");
            setTimeout(() => setRetry("seen"), 700);
          },
        }
      : retry === "sending"
        ? { kind: "sending", label: tc("conversation.sending") }
        : { kind: "seen", label: tc("conversation.seen") };
  const own = { name: tc("message.own"), shown: false };
  const tooLong = tc.rich("conversation.tooLong", {
    max: CHAT_MESSAGE_MAX,
    ltr: (chunks) => <span dir="ltr">{chunks}</span>,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">{t("chatText")}</p>
      <ListGroup>
        <ChatRow
          href="/design/chat/team"
          leading={<ChatGroupMark icon={<Building />} />}
          title={tc("list.team")}
          preview={tc("list.from", {
            name: t("person1"),
            preview: chatPreview(t("chatSample1")),
          })}
          time={{ label: "08:05", at: at(TODAY, "08:05") }}
          unread={{ count: 3, label: tc("list.unread", { count: 3 }) }}
          waiting={tc("list.waiting")}
        />
        <ChatRow
          href="/design/chat/kitchen"
          leading={<ChatGroupMark icon={<Users />} />}
          title={t("chatKitchen")}
          preview={tc("list.from", {
            name: t("person2"),
            preview: chatPreview(t("chatSample5")),
          })}
          time={{ label: tc("day.yesterday"), at: at(YESTERDAY, "16:12") }}
          muted={tc("list.muted")}
        />
        <ChatRow
          href="/design/chat/maya"
          current
          leading={<Avatar name={t("person1")} photo={portraits.maya} />}
          title={t("person1")}
          preview={tc("list.fromYou", {
            preview: chatPreview(t("chatSample2")),
          })}
          time={{ label: "1.11", at: at("2026-11-01", "19:40") }}
        />
      </ListGroup>

      <div className="flex flex-col">
        <ChatHeader
          floating={false}
          headingLevel="h3"
          back={{ href: "/design/chat", label: tc("conversation.back") }}
          leading={<ChatGroupMark icon={<Users />} />}
          title={t("chatKitchen")}
          subtitle={tc("conversation.departmentNote")}
        />
        <section aria-label={tc("conversation.log")} className="pb-4">
          <DayDivider label={tc("day.yesterday")} day={YESTERDAY} level={3} />
          <MessageBubble
            own={false}
            run="first"
            author={{ name: t("person2"), shown: true }}
            content={{ kind: "text", body: t("chatSample1") }}
            time={{ label: "18:30", at: at(YESTERDAY, "18:30") }}
          />
          <MessageBubble
            own={false}
            run="last"
            author={{ name: t("person2"), shown: false }}
            content={{ kind: "text", body: t("chatSample5") }}
            time={{ label: "18:31", at: at(YESTERDAY, "18:31") }}
          />
          <MessageBubble
            own
            author={own}
            content={{ kind: "text", body: t("chatSample2") }}
            time={{ label: "18:40", at: at(YESTERDAY, "18:40") }}
          />
          <MessageBubble
            own={false}
            author={{ name: t("person3"), shown: true }}
            content={{ kind: "removed", label: tc("message.removedByManager") }}
            time={{ label: "18:52", at: at(YESTERDAY, "18:52") }}
          />
          <DayDivider label={tc("day.today")} day={TODAY} level={3} />
          <MessageBubble
            own={false}
            author={{ name: t("person1"), shown: true }}
            content={{ kind: "text", body: t("chatSample3") }}
            time={{ label: "07:52", at: at(TODAY, "07:52") }}
          />
          <MessageBubble
            own={false}
            author={{ name: t("person3"), shown: true }}
            content={{ kind: "text", body: t("chatSample4") }}
            time={{ label: "07:58", at: at(TODAY, "07:58") }}
          />
          <MessageBubble
            own
            run="first"
            author={own}
            content={{ kind: "removed", label: tc("message.removedOwn") }}
            time={{ label: "08:01", at: at(TODAY, "08:01") }}
          />
          <MessageBubble
            own
            run={sent.length > 0 ? "middle" : "last"}
            author={own}
            content={{ kind: "text", body: t("chatSample7") }}
            time={{ label: "08:02", at: at(TODAY, "08:02") }}
            status={retried}
          />
          {sent.map((each, i) => (
            <MessageBubble
              key={each.id}
              own
              run={i === sent.length - 1 ? "last" : "middle"}
              author={own}
              content={{ kind: "text", body: each.body }}
              time={{ label: "08:12", at: at(TODAY, "08:12") }}
              status={
                each.sending
                  ? { kind: "sending", label: tc("conversation.sending") }
                  : null
              }
            />
          ))}
        </section>
        <Composer
          floating={false}
          label={tc("conversation.placeholder")}
          sendLabel={tc("conversation.send")}
          value={draft}
          onValueChange={setDraft}
          onSend={send}
          tooLong={tooLong}
          above={
            <NewBelow
              shown={below}
              label={tc("conversation.newBelow")}
              onClick={() => setBelow(false)}
            />
          }
        />
      </div>
      <Button
        variant="secondary"
        aria-pressed={below}
        onClick={() => setBelow(!below)}
        className="self-start"
      >
        {t("chatNewBelow")}
      </Button>
      <Composer
        floating={false}
        label={tc("conversation.placeholder")}
        sendLabel={tc("conversation.send")}
        value=""
        onValueChange={() => {}}
        onSend={() => {}}
        tooLong={tooLong}
        blocked={tc("conversation.closed")}
      />
      <p className="text-ink-2">{t("chatImmersive")}</p>
      <Button asChild variant="secondary" className="w-full">
        <Link href="/design/chat">{t("chatDemo")}</Link>
      </Button>
    </div>
  );
}
