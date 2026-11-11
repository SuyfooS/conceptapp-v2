"use client";

import { dateIn } from "@domain/availability";
import {
  CHAT_MESSAGE_MAX,
  type ChatCursor,
  type ChatKind,
  chatCursor,
  groupMessages,
} from "@domain/chat";
import { chatDay, inThisYear, messageTime } from "@domain/chat-days";
import {
  type ChatSendInput,
  type ChatSyncMessage,
  type ChatSyncPerson,
  heldInWindow,
} from "@domain/chat-sync";
import {
  bubbleKey,
  changedMessage,
  compareInstants,
  draftKey,
  mergeMessages,
  newestFromOthers,
  type OutgoingMessage,
  outgoingAsMessage,
  runPlace,
  seenMessageId,
  shownMessages,
  stillOutgoing,
} from "@domain/chat-thread";
import { ChatHeader } from "@ui/chat-header";
import { Composer } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import {
  MessageBubble,
  type MessageContent,
  type MessageStatus,
} from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import { Spinner } from "@ui/spinner";
import { ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { focusLost } from "./chat-focus";
import { ChatNotice } from "./chat-notice";
import { chatPaths } from "./chat-paths";
import { type SyncOpen, useChat } from "./chat-provider";
import type { ChatActionResult } from "./chat-types";

/** What the screen asks the server to do, bound to the business it was drawn for. */
export type ConversationActions = {
  send: (
    input: ChatSendInput,
  ) => Promise<ChatActionResult<{ conversation: string; message: string }>>;
  read: (conversation: string, upTo: string) => Promise<ChatActionResult>;
  older: (
    conversation: string,
    before: string,
  ) => Promise<
    ChatActionResult<{
      messages: ChatSyncMessage[];
      people: ChatSyncPerson[];
      more: boolean;
    }>
  >;
};

type Props = {
  /**
   * Null for a private chat its first message will make; the screen goes on
   * as that chat once it is made.
   */
  conversation: string | null;
  /** A private chat's other person, on its own address (/chat/with/…). */
  toPerson: string | null;
  kind: ChatKind;
  title: string;
  /** Who sees this conversation. */
  subtitle: string;
  leading: ReactNode;
  /** The newest page, oldest first. */
  messages: ChatSyncMessage[];
  /** Names and photos for the people who wrote them. */
  people: ChatSyncPerson[];
  /** Older messages wait above the first. */
  older: boolean;
  /** A private chat: how far the other person read it ("נקראה"). */
  seenUpTo: string | null;
  /** Why nobody may write here now, when so. */
  blocked: ReactNode | null;
  /** What an empty conversation says. */
  empty: string;
  actions: ConversationActions;
};

/** This close to the foot of the page counts as reading the newest. */
const NEAR_END = 96;
/** How long "too many messages" stays over the field. */
const NOTICE_MS = 20_000;
/** Where a keyboard or a trackpad is: the field may take the focus. */
const FINE_POINTER = "(pointer: fine)";

/**
 * Where the keyboard's focus goes when what held it goes away (NewBelow
 * pressed, a message tried again, the notice put away): the field to write
 * in where there is a keyboard to write with, else the messages, so a
 * phone's keyboard doesn't open by itself. Never moves the page.
 */
function focusOnward(
  field: RefObject<HTMLTextAreaElement | null>,
  log: RefObject<HTMLDivElement | null>,
) {
  const fine = window.matchMedia(FINE_POINTER).matches;
  const target = (fine ? field.current : null) ?? log.current;
  target?.focus({ preventScroll: true });
}

function atEnd(): boolean {
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

/** The browser's own id for a message, kept for its retries. */
function newDraftId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // An address that isn't https (a phone on the office's network) has no
  // randomUUID: a version 4 id by hand.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const cursorOf = (message: ChatSyncMessage | undefined): ChatCursor | null =>
  message ? { at: message.createdAt, id: message.id } : null;

type Shown =
  | { kind: "message"; message: ChatSyncMessage }
  | { kind: "outgoing"; outgoing: OutgoingMessage };

/**
 * A conversation (plan §11.2): the floating title with who sees it, the
 * messages by day and in runs by one author, and the composer at the foot,
 * where the phone's tab bar was. It keeps itself up to date through the chat
 * screens' one sync while it is on screen, marks what the reader saw as read
 * while the page is visible and they are at the newest, loads 50 older
 * messages at a time when they scroll up (keeping their place), and never
 * moves the page under them: new messages below say so instead. A message
 * shows at once as being sent, with its own id, so a retry never sends it
 * twice; one that didn't go says so and tries again. A new private chat's
 * first message makes it, and the screen goes on as that chat where it is:
 * nothing is drawn again under the writer, and the keyboard stays.
 *
 * The messages are a log screen readers don't read out as it grows (older
 * pages come in above it, a long gap at once); a line of its own says what
 * arrived from others, and that older messages came in.
 */
export function ConversationScreen(props: Props) {
  const { toPerson, kind, actions } = props;
  const t = useTranslations("app.chat");
  const format = useFormatter();
  const router = useRouter();
  const chat = useChat();
  const reader = chat.readerId;

  const [conversation, setConversation] = useState(props.conversation);
  // Sending reads the newest, never the one its drawing had.
  const conversationNow = useRef(conversation);
  useLayoutEffect(() => {
    conversationNow.current = conversation;
  }, [conversation]);
  // A new private chat drawn again once its first message made it (the same
  // address shows it now): the screen is that chat already.
  useEffect(() => {
    if (props.conversation && !conversationNow.current) {
      conversationNow.current = props.conversation;
      setConversation(props.conversation);
    }
  }, [props.conversation]);

  const [messages, setMessages] = useState(props.messages);
  const [people, setPeople] = useState(
    () => new Map(props.people.map((p) => [p.id, p])),
  );
  const [hasOlder, setHasOlder] = useState(props.older);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [seenUpTo, setSeenUpTo] = useState(props.seenUpTo);
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<"tooFast" | "businessChanged" | null>(
    null,
  );
  const [below, setBelow] = useState(false);
  const [ready, setReady] = useState(false);
  /** What the screen reader line says now; a new one each time, so it's read. */
  const [said, setSaid] = useState<{ id: number; text: string } | null>(null);

  const held = useRef(messages);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const saidCount = useRef(0);
  /** A retry's button goes once it is sending, maybe with the focus. */
  const refocus = useRef(false);
  const toTheEnd = useRef(false);
  /** The page's distance from its foot before older messages went in above. */
  const keepFromEnd = useRef<number | null>(null);
  const olderBusy = useRef(false);
  // The newest message from others already marked read: what the list
  // already counts as read when the chat opens.
  const [readAtOpen] = useState(() =>
    chat.rows.find((r) => r.conversation === conversation)?.unread === 0
      ? (newestFromOthers(props.messages, reader)?.createdAt ?? null)
      : null,
  );
  const marked = useRef<string | null>(readAtOpen);

  useLayoutEffect(() => {
    held.current = messages;
  }, [messages]);

  const addPeople = useCallback((more: readonly ChatSyncPerson[]) => {
    if (more.length === 0) return;
    setPeople((known) => {
      const next = new Map(known);
      for (const person of more) next.set(person.id, person);
      return next;
    });
  }, []);

  const say = useCallback((text: string) => {
    saidCount.current += 1;
    setSaid({ id: saidCount.current, text });
  }, []);
  // What arrived from others, in words: set each drawing, with its names.
  const sayArrived = useRef<
    (arrived: ChatSyncMessage[], authors: readonly ChatSyncPerson[]) => void
  >(() => {});

  // The server drew the page again (the tab's count, a conversation kept for
  // going back): what it brings joins what is on screen.
  const drawn = useRef(props.messages);
  useEffect(() => {
    if (props.messages === drawn.current) return;
    drawn.current = props.messages;
    setMessages((list) => mergeMessages(list, props.messages));
    if (props.older) setHasOlder(true);
    addPeople(props.people);
    setSeenUpTo((seen) =>
      props.seenUpTo && (!seen || compareInstants(props.seenUpTo, seen) > 0)
        ? props.seenUpTo
        : seen,
    );
  }, [props.messages, props.people, props.seenUpTo, props.older, addPeople]);

  const markRead = useCallback(() => {
    if (!conversation || document.visibilityState !== "visible" || !atEnd()) {
      return;
    }
    const newest = newestFromOthers(held.current, reader);
    const last = held.current.at(-1);
    if (!newest || !last) return;
    if (
      marked.current &&
      compareInstants(newest.createdAt, marked.current) <= 0
    ) {
      return;
    }
    const before = marked.current;
    marked.current = newest.createdAt;
    chat.readLocally(conversation);
    actions
      .read(conversation, last.createdAt)
      .then((result) => {
        if (!result.ok && marked.current === newest.createdAt) {
          marked.current = before;
        }
      })
      .catch(() => {
        if (marked.current === newest.createdAt) marked.current = before;
      });
  }, [conversation, reader, actions, chat.readLocally]);
  // Listeners and the first look use the newest of it, never an old copy.
  const markReadNow = useRef(markRead);
  useLayoutEffect(() => {
    markReadNow.current = markRead;
  }, [markRead]);

  // Kept up to date while on screen; a conversation kept hidden for going
  // back stops asking, and asks at once when it shows again.
  useEffect(() => {
    if (!conversation) return;
    const receive = (open: SyncOpen) => {
      addPeople(open.people);
      setSeenUpTo(open.seenUpTo);
      if (open.messages.length === 0) return;
      const known = new Map(held.current.map((m) => [m.id, m]));
      const fresh = open.messages.filter((m) => !known.has(m.id));
      const arrived = fresh.filter((m) => m.authorId !== reader);
      const fromOthers = arrived.length > 0;
      if (fromOthers) sayArrived.current(arrived, open.people);
      const reading = atEnd();
      if (open.gap) {
        // More came than a page: these replace what is on screen.
        setMessages(open.messages);
        setHasOlder(true);
      } else if (
        fresh.length > 0 ||
        open.messages.some((m) => {
          const had = known.get(m.id);
          return !had || changedMessage(had, m);
        })
      ) {
        // The look again before the cursor brings what is on screen too:
        // only something new, or changed since, is drawn again.
        setMessages((list) => mergeMessages(list, open.messages));
      }
      if (fresh.length === 0) return;
      if (reading) toTheEnd.current = true;
      else if (fromOthers) setBelow(true);
    };
    return chat.watch({
      conversation,
      cursor: () => cursorOf(held.current.at(-1)),
      held: () => {
        const cursor = cursorOf(held.current.at(-1));
        return cursor ? heldInWindow(held.current, cursor) : null;
      },
      receive,
    });
  }, [conversation, reader, chat.watch, addPeople]);

  // A conversation opens at its newest, and so does one shown again. On a
  // phone the list it was opened from has just gone, and the focus with it:
  // the conversation's title takes it, so a screen reader starts there.
  useEffect(() => {
    toEnd(false);
    setReady(true);
    markReadNow.current();
    if (focusLost()) heading.current?.focus({ preventScroll: true });
  }, []);

  // New messages: to the newest when the reader was there or wrote one, and
  // what they now see is read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: what came is what may move the page
  useEffect(() => {
    if (toTheEnd.current) {
      toTheEnd.current = false;
      toEnd(false);
    }
    markReadNow.current();
  }, [messages, outgoing.length]);

  // Older messages went in above: the reader stays where they were.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the messages are what moved
  useLayoutEffect(() => {
    if (keepFromEnd.current === null) return;
    const top = document.documentElement.scrollHeight - keepFromEnd.current;
    keepFromEnd.current = null;
    window.scrollTo({ top, behavior: "instant" });
  }, [messages]);

  // At the newest again: nothing waits below, and it is read.
  useEffect(() => {
    const onScroll = () => {
      if (!atEnd()) return;
      setBelow(false);
      markReadNow.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") markReadNow.current();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // "Too many in a minute" goes once the minute has passed.
  useEffect(() => {
    if (notice !== "tooFast") return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // What the server has now shows as itself.
  useEffect(() => {
    const shown = shownMessages(messages);
    setOutgoing((list) => {
      const next = stillOutgoing(list, shown);
      return next.length === list.length ? list : next;
    });
  }, [messages]);

  // A retry's button went once it was sending: the focus goes on from it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry going out is what may have dropped it
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (focusLost()) focusOnward(field, log);
  }, [outgoing]);

  const loadOlder = useCallback(async () => {
    const first = held.current[0];
    if (!conversation || !first || olderBusy.current) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const result = await actions.older(
        conversation,
        chatCursor({ at: first.createdAt, id: first.id }),
      );
      if (result.ok) {
        keepFromEnd.current =
          document.documentElement.scrollHeight - window.scrollY;
        addPeople(result.value.people);
        setMessages((list) => mergeMessages(list, result.value.messages));
        if (!result.value.more && document.activeElement === top.current) {
          // The button goes with the last of them: the messages keep the focus.
          log.current?.focus({ preventScroll: true });
        }
        setHasOlder(result.value.more);
        if (result.value.messages.length > 0) say(t("conversation.olderCame"));
      }
    } catch {
      // The button stays, to try again.
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }, [conversation, actions, addPeople, say, t]);

  // Older ones load as the reader nears the top, and go on loading while
  // they stay there (a new first message looks again).
  const top = useRef<HTMLButtonElement>(null);
  const firstId = messages[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new first message is what asks to look again
  useEffect(() => {
    const node = top.current;
    if (!node || !hasOlder || !ready) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadOlder();
      },
      { rootMargin: "400px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasOlder, ready, loadOlder, firstId]);

  async function deliver(item: OutgoingMessage) {
    const known = conversationNow.current;
    const input: ChatSendInput = known
      ? { draft: item.draft, words: item.body, conversation: known }
      : { draft: item.draft, words: item.body, toPerson: toPerson ?? "" };
    let result: Awaited<ReturnType<ConversationActions["send"]>>;
    try {
      result = await actions.send(input);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      const sent = result.value;
      setNotice(null);
      if (!conversationNow.current) {
        // The first message made the chat: the screen goes on as it, where
        // it is, and is kept up to date as it from now on.
        conversationNow.current = sent.conversation;
        setConversation(sent.conversation);
      }
      setOutgoing((list) =>
        list.map((m) =>
          m.draft === item.draft
            ? { ...m, state: "sent", message: sent.message }
            : m,
        ),
      );
      chat.syncNow();
      return;
    }
    setOutgoing((list) =>
      list.map((m) => (m.draft === item.draft ? { ...m, state: "failed" } : m)),
    );
    if (result.failure === "tooFast") setNotice("tooFast");
    else if (result.failure === "businessChanged") setNotice("businessChanged");
    // The chat closed, or the other person left: the screen says so now.
    else if (result.failure === "closed" || result.failure === "noAccess") {
      router.refresh();
    }
  }

  function send(body: string) {
    const item: OutgoingMessage = {
      draft: newDraftId(),
      body,
      at: new Date().toISOString(),
      state: "sending",
      message: null,
    };
    setOutgoing((list) => [...list, item]);
    setText("");
    toTheEnd.current = true;
    setBelow(false);
    chat.moved();
    void deliver(item);
  }

  function retry(item: OutgoingMessage) {
    const again: OutgoingMessage = { ...item, state: "sending" };
    refocus.current = true;
    setOutgoing((list) =>
      list.map((m) => (m.draft === item.draft ? again : m)),
    );
    chat.moved();
    void deliver(again);
  }

  const pending = stillOutgoing(outgoing, shownMessages(messages));
  const seenId =
    kind === "direct" ? seenMessageId(messages, reader, seenUpTo) : null;

  const days = groupMessages(
    [
      ...messages.map((message) => ({
        authorId: message.authorId,
        createdAt: message.createdAt,
        kind: message.kind,
        shown: { kind: "message", message } as Shown,
      })),
      ...pending.map((item) => ({
        ...outgoingAsMessage(item, reader),
        shown: { kind: "outgoing", outgoing: item } as Shown,
      })),
    ],
    chat.timeZone,
  );
  const today = dateIn(new Date(chat.now), chat.timeZone);

  function dayLabel(day: string): string {
    const which = chatDay(day, today);
    if (which.kind === "today") return t("day.today");
    if (which.kind === "yesterday") return t("day.yesterday");
    // Messages are kept for good: a day of another year says which.
    return format.dateTime(new Date(`${day}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(inThisYear(day, today) ? {} : { year: "numeric" }),
      timeZone: "UTC",
    });
  }

  const nameOf = (id: string | null) =>
    (id ? people.get(id.toLowerCase())?.name : null) ?? t("list.noName");

  // The sync's answers say what arrived with this drawing's words and names.
  useLayoutEffect(() => {
    sayArrived.current = (arrived, authors) => {
      const last = arrived.at(-1);
      if (!last) return;
      if (arrived.length > 1) {
        say(t("conversation.arrivedMany", { count: arrived.length }));
        return;
      }
      const author = last.authorId
        ? (authors.find((p) => p.id === last.authorId?.toLowerCase())?.name ??
          nameOf(last.authorId))
        : nameOf(null);
      const content = contentOf(last);
      say(
        t("conversation.arrived", {
          name: author,
          text: content.kind === "text" ? content.body : content.label,
        }),
      );
    };
  });

  function contentOf(message: ChatSyncMessage): MessageContent {
    if (!message.removed && message.body !== null) {
      return { kind: "text", body: message.body };
    }
    const byAuthor = message.removedBy === message.authorId;
    return {
      kind: "removed",
      label: !byAuthor
        ? t("message.removedByManager")
        : message.authorId === reader
          ? t("message.removedOwn")
          : t("message.removed"),
    };
  }

  function statusOf(shown: Shown): MessageStatus | null {
    if (shown.kind === "outgoing") {
      const item = shown.outgoing;
      if (item.state === "failed") {
        return {
          kind: "failed",
          label: t("conversation.failed"),
          onRetry: () => retry(item),
        };
      }
      return item.state === "sending"
        ? { kind: "sending", label: t("conversation.sending") }
        : null;
    }
    return shown.message.id === seenId
      ? { kind: "seen", label: t("conversation.seen") }
      : null;
  }

  const nothing = messages.length === 0 && pending.length === 0;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

  return (
    <section
      aria-label={props.title}
      className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2.125rem)] min-w-0 flex-col md:min-h-[calc(100dvh-env(safe-area-inset-bottom)-8.5rem)] xl:min-h-[calc(100dvh-3.5rem)]"
    >
      <ChatHeader
        title={props.title}
        subtitle={props.subtitle}
        leading={props.leading}
        back={{ href: chatPaths.list, label: t("conversation.back") }}
        headingRef={heading}
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said ? <span key={said.id}>{said.text}</span> : null}
      </p>
      <div
        ref={log}
        role="log"
        // Not read out as it grows: older pages come in above it, and a gap's
        // messages all at once. The line above says what arrived.
        aria-live="off"
        aria-busy={loadingOlder || undefined}
        aria-label={t("conversation.log")}
        tabIndex={-1}
        className="flex flex-1 flex-col justify-end pb-4 outline-none"
      >
        {hasOlder ? (
          <div className="flex justify-center pt-4">
            <button
              ref={top}
              type="button"
              onClick={() => void loadOlder()}
              // Keeps the focus while they load, where disabled would drop it.
              aria-disabled={loadingOlder || undefined}
              className="pressable flex min-h-11 items-center gap-1.5 rounded-full px-4 font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {loadingOlder ? (
                <Spinner className="size-4" />
              ) : (
                <ChevronUp aria-hidden="true" className="size-4" />
              )}
              {loadingOlder
                ? t("conversation.loadingOlder")
                : t("conversation.older")}
            </button>
          </div>
        ) : null}
        {nothing ? (
          <p className="py-12 text-center text-ink-2">{props.empty}</p>
        ) : (
          days.map((day) => (
            <Fragment key={day.day}>
              <DayDivider label={dayLabel(day.day)} day={day.day} />
              {day.runs.flatMap((run) =>
                run.messages.map((item, index) => {
                  const own = item.authorId === reader;
                  const shown = item.shown;
                  // One's own keeps its key from being sent to arriving.
                  const key =
                    shown.kind === "message"
                      ? bubbleKey(shown.message)
                      : draftKey(shown.outgoing.draft);
                  return (
                    <MessageBubble
                      key={key}
                      own={own}
                      run={runPlace(index, run.messages.length)}
                      author={
                        own
                          ? { name: t("message.own"), shown: false }
                          : {
                              name: nameOf(item.authorId),
                              shown: kind !== "direct" && index === 0,
                            }
                      }
                      content={
                        shown.kind === "message"
                          ? contentOf(shown.message)
                          : { kind: "text", body: shown.outgoing.body }
                      }
                      time={{
                        label: messageTime(item.createdAt, chat.timeZone),
                        at: item.createdAt,
                      }}
                      status={statusOf(shown)}
                    />
                  );
                }),
              )}
            </Fragment>
          ))
        )}
      </div>
      {/* The notice at collection, before the first message: on a phone it
          sits where the conversation opens, at its foot, over the field. */}
      {chat.noticeSeen ? null : (
        <div className="pb-4 md:hidden">
          <ChatNotice level={2} onSeen={() => focusOnward(field, log)} />
        </div>
      )}
      <Composer
        label={t("conversation.placeholder")}
        sendLabel={t("conversation.send")}
        value={text}
        onValueChange={setText}
        onSend={send}
        blocked={props.blocked}
        notice={notice ? t(`conversation.${notice}`) : null}
        tooLong={t.rich("conversation.tooLong", { max: CHAT_MESSAGE_MAX, ltr })}
        fieldRef={field}
        above={
          <NewBelow
            shown={below}
            label={t("conversation.newBelow")}
            onClick={() => {
              setBelow(false);
              toEnd(true);
              // The pill goes once pressed: the focus goes on from it.
              focusOnward(field, log);
            }}
          />
        }
      />
    </section>
  );
}
