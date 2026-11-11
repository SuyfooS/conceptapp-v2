"use client";

import { CHAT_MESSAGE_MAX, type ChatKind, groupMessages } from "@domain/chat";
import { messageTime } from "@domain/chat-days";
import { ChatHeader } from "@ui/chat-header";
import { Composer } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import {
  MessageBubble,
  type MessageContent,
  type MessageRun,
  type MessageStatus,
} from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

export type DemoBubble = {
  id: string;
  author: string;
  authorName: string;
  /** ISO instant. */
  at: string;
  /** Null once removed. */
  body: string | null;
  removedBy?: "author" | "management";
  sending?: boolean;
  failed?: boolean;
};

type Props = {
  kind: ChatKind;
  title: string;
  /** Who sees this conversation. */
  subtitle: string;
  leading: ReactNode;
  backHref: string;
  reader: string;
  messages: DemoBubble[];
  /** Each day's divider, written out on the server; today's is "היום". */
  dayLabels: Record<string, string>;
  timeZone: string;
  /** The demo's clock: what Shiran sends now is sent at this instant. */
  now: string;
  /** A private chat: the other person read hers up to here. */
  seenUpTo: string | null;
  /** Why nobody can write here, when so. */
  blocked: string | null;
  /** What an empty conversation says. */
  empty: string;
  /** How someone answers, once, when Shiran writes. */
  reply: { author: string; authorName: string; body: string } | null;
};

/** How long a sent message is on its way, and how long until the answer. */
const ON_THE_WAY_MS = 700;
const ANSWER_MS = 2200;
/** This close to the end of the page counts as reading the newest. */
const NEAR_END = 96;

const runOf = (index: number, length: number): MessageRun =>
  length === 1
    ? "single"
    : index === 0
      ? "first"
      : index === length - 1
        ? "last"
        : "middle";

function atEnd() {
  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - NEAR_END
  );
}

function toEnd(smooth: boolean) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: smooth && !reduced ? "smooth" : "instant",
  });
}

/**
 * A conversation of the demo, with the parts the real screen uses: the
 * floating title, the days and runs of messages in a polite log, and the
 * composer. What Shiran writes goes on its way, arrives, and is answered
 * once; nothing is stored. When the answer comes while she reads further up,
 * the page stays where it is and NewBelow says so.
 */
export function ConversationDemo({
  kind,
  title,
  subtitle,
  leading,
  backHref,
  reader,
  messages: initial,
  dayLabels,
  timeZone,
  now,
  seenUpTo,
  blocked,
  empty,
  reply,
}: Props) {
  const t = useTranslations("app.chat");
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(seenUpTo);
  const [below, setBelow] = useState(false);
  const toTheEnd = useRef(false);
  const sentCount = useRef(0);
  const answered = useRef(false);

  // A conversation opens at its newest, and so does one kept for going back
  // when it shows again (its effects run anew).
  useEffect(() => {
    toEnd(false);
  }, []);

  // One's own message takes the reader to it, and so does an answer while
  // they read the newest; anything else waits for NewBelow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message is what may move the page
  useEffect(() => {
    if (!toTheEnd.current) return;
    toTheEnd.current = false;
    toEnd(false);
  }, [messages]);

  useEffect(() => {
    if (!below) return;
    const onScroll = () => {
      if (atEnd()) setBelow(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [below]);

  function arrive(id: string) {
    setTimeout(
      () =>
        setMessages((list) =>
          list.map((m) => (m.id === id ? { ...m, sending: false } : m)),
        ),
      ON_THE_WAY_MS,
    );
  }

  function answer(after: string) {
    if (!reply || answered.current) return;
    answered.current = true;
    setTimeout(() => {
      const reading = atEnd();
      toTheEnd.current = reading;
      setMessages((list) => [
        ...list,
        {
          id: "answer",
          author: reply.author,
          authorName: reply.authorName,
          at: new Date(Date.parse(after) + 60_000).toISOString(),
          body: reply.body,
        },
      ]);
      if (kind === "direct") setSeen(after);
      if (!reading) setBelow(true);
    }, ANSWER_MS);
  }

  function send(body: string) {
    sentCount.current += 1;
    const id = `sent-${sentCount.current}`;
    const at = new Date(
      Date.parse(now) + sentCount.current * 1000,
    ).toISOString();
    toTheEnd.current = true;
    setMessages((list) => [
      ...list,
      { id, author: reader, authorName: "", at, body, sending: true },
    ]);
    setDraft("");
    arrive(id);
    answer(at);
  }

  function retry(id: string) {
    setMessages((list) =>
      list.map((m) =>
        m.id === id ? { ...m, failed: false, sending: true } : m,
      ),
    );
    arrive(id);
  }

  const lastSeen =
    kind === "direct" && seen
      ? messages
          .filter(
            (m) =>
              m.author === reader && !m.sending && !m.failed && m.at <= seen,
          )
          .at(-1)?.id
      : undefined;

  function statusOf(m: DemoBubble): MessageStatus | null {
    if (m.author !== reader) return null;
    if (m.failed) {
      return {
        kind: "failed",
        label: t("conversation.failed"),
        onRetry: () => retry(m.id),
      };
    }
    if (m.sending) return { kind: "sending", label: t("conversation.sending") };
    if (m.id === lastSeen)
      return { kind: "seen", label: t("conversation.seen") };
    return null;
  }

  function contentOf(m: DemoBubble): MessageContent {
    if (m.body !== null) return { kind: "text", body: m.body };
    return {
      kind: "removed",
      label:
        m.removedBy === "management"
          ? t("message.removedByManager")
          : m.author === reader
            ? t("message.removedOwn")
            : t("message.removed"),
    };
  }

  const days = groupMessages(
    messages.map((m) => ({
      ...m,
      authorId: m.author,
      createdAt: m.at,
      kind: "text" as const,
    })),
    timeZone,
  );

  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2.125rem)] md:min-h-[calc(100dvh-env(safe-area-inset-bottom)-8.5rem)] xl:min-h-[calc(100dvh-3.5rem)]"
    >
      <ChatHeader
        title={title}
        subtitle={subtitle}
        leading={leading}
        back={{ href: backHref, label: t("conversation.back") }}
      />
      <div
        role="log"
        aria-label={t("conversation.log")}
        className="flex flex-1 flex-col justify-end pb-4"
      >
        {messages.length === 0 ? (
          <p className="py-12 text-center text-ink-2">{empty}</p>
        ) : (
          days.map((day) => (
            <Fragment key={day.day}>
              <DayDivider label={dayLabels[day.day] ?? day.day} day={day.day} />
              {day.runs.flatMap((run) =>
                run.messages.map((m, i) => {
                  const own = m.author === reader;
                  return (
                    <MessageBubble
                      key={m.id}
                      own={own}
                      run={runOf(i, run.messages.length)}
                      author={
                        own
                          ? { name: t("message.own"), shown: false }
                          : {
                              name: m.authorName,
                              shown: kind !== "direct" && i === 0,
                            }
                      }
                      content={contentOf(m)}
                      time={{ label: messageTime(m.at, timeZone), at: m.at }}
                      status={statusOf(m)}
                    />
                  );
                }),
              )}
            </Fragment>
          ))
        )}
      </div>
      <Composer
        label={t("conversation.placeholder")}
        sendLabel={t("conversation.send")}
        value={draft}
        onValueChange={setDraft}
        onSend={send}
        blocked={blocked}
        tooLong={t.rich("conversation.tooLong", {
          max: CHAT_MESSAGE_MAX,
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
        above={
          <NewBelow
            shown={below}
            label={t("conversation.newBelow")}
            onClick={() => {
              setBelow(false);
              toEnd(true);
            }}
          />
        }
      />
    </section>
  );
}
