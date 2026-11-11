"use client";

import { dateIn } from "@domain/availability";
import {
  CHAT_MESSAGE_MAX,
  type ChatCursor,
  type ChatKind,
  chatCursor,
  chatPreview,
  groupMessages,
} from "@domain/chat";
import {
  announcementState,
  type MessageAction,
  mergePinned,
  messageActions,
  shownPinned,
  UNDO_SHOWN_MS,
  waitsFor,
} from "@domain/chat-announce";
import { chatDay, inThisYear, messageTime } from "@domain/chat-days";
import {
  type ChatSendInput,
  type ChatSyncMessage,
  type ChatSyncPerson,
  chatMarks,
  heldInWindow,
  heldMarks,
  type PinnedAnnouncement,
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
import { AnnouncementCard } from "@ui/announcement-card";
import { ChatHeader } from "@ui/chat-header";
import { Composer, type ComposerAttach } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import {
  MessageBubble,
  type MessageContent,
  type MessageImage,
  type MessageStatus,
} from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import {
  encodeChatImage,
  PhotoReadError,
  PICKED_PHOTO_ACCEPT,
  photoDataUrl,
} from "@ui/photo-encode";
import { PhotoSheet } from "@ui/photo-sheet";
import { Spinner } from "@ui/spinner";
import { StatusToast } from "@ui/status-toast";
import { ChevronUp } from "lucide-react";
import Link from "next/link";
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
import {
  type ComposerNotice,
  type PictureFiles,
  pictureForm,
  pictureRefusal,
} from "./chat-pictures";
import { type SyncOpen, useChat } from "./chat-provider";
import type {
  ChatActionResult,
  ChatImageResult,
  ChatReaders,
} from "./chat-types";
import { InfoButton } from "./info-button";
import { MessageActionsSheet } from "./message-actions";
import { ReadersSheet } from "./readers-sheet";

/** What the screen asks the server to do, bound to the business it was drawn for. */
export type ConversationActions = {
  send: (
    input: ChatSendInput,
  ) => Promise<ChatActionResult<{ conversation: string; message: string }>>;
  /**
   * A picture, with what was written with it (C4): `pictureForm`'s fields,
   * the files as the phone made them ready (`encodeChatImage`).
   */
  sendImage: (form: FormData) => Promise<ChatImageResult>;
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
  /** "קראתי" on an announcement (C3). */
  confirm: (message: string) => Promise<ChatActionResult>;
  /** Its author or management pins an announcement again, or unpins it. */
  pin: (message: string, pin: boolean) => Promise<ChatActionResult>;
  /** One's own message anywhere, or management someone else's in a group. */
  remove: (message: string) => Promise<ChatActionResult>;
  /** "ביטול" right after removing. */
  restore: (message: string) => Promise<ChatActionResult>;
  /** Who of the group confirmed an announcement, for its author and management. */
  readers: (message: string) => Promise<ChatActionResult<ChatReaders>>;
};

/** What the reader may do in this conversation, beside writing. */
export type ConversationPowers = {
  /** chat.announce: "הודעה מההנהלה" in groups. */
  announce: boolean;
  /** chat.moderate: removes others' messages in groups, unpins any announcement. */
  moderate: boolean;
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
  /** Its pinned announcements, newest first, as the reader sees them (C3). */
  pinned: PinnedAnnouncement[];
  powers: ConversationPowers;
  /** A removed department's group: nothing is pinned there again. */
  closed: boolean;
  /** The composer opens as "הודעה מההנהלה" (/chat/<id>?announce=1). */
  announceFirst: boolean;
  /**
   * Its details, for the tablet's sheet from the title (the phone opens
   * /chat/<id>/info, the desktop has its column); null for a private chat
   * its first message hasn't made yet.
   */
  details: ReactNode | null;
  /**
   * Whether pictures can be sent here (C4, `chatFilesAllowed`): "demo" keeps
   * the attach button, which says a demo business takes no files; "notYet"
   * (the database hasn't the files yet) has none.
   */
  files: "yes" | "demo" | "notYet";
};

/**
 * A picture made ready on the phone, with what it is shown from here: data
 * URLs, which go with the screen (an object URL would stay until it was let
 * go, and a screen kept hidden for going back runs its clean-up while it
 * still shows them when it comes back).
 */
type Picture = PictureFiles & {
  /** The thumbnail: the bubble's, and the composer's. */
  preview: string;
  /** The whole picture: what opens in the sheet. */
  whole: string;
};

/** A picture opened in its sheet: whose bubble it is, and what it shows. */
type PhotoShown = {
  /** The message's id, or a draft's key while it goes. */
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  subtitle: ReactNode;
};

/**
 * What the toast says now, and its way back when it has one: whether its
 * button takes the focus as it shows, and the message whose actions take it
 * back once the toast goes.
 */
type Toast = {
  text: string;
  stamp: string;
  undo?: () => void;
  focus?: boolean;
  back?: string;
};

/**
 * Which message the actions sheet is for, by id: what it shows is the
 * message as it is now, never as it was when the sheet opened.
 */
type ActionsFor = { id: string };

/** This close to the foot of the page counts as reading the newest. */
const NEAR_END = 96;
/** How long "too many messages" stays over the field. */
const NOTICE_MS = 20_000;
/**
 * How long the screen reader line keeps what it said: read out by then, it
 * goes, so a message removed later isn't left there in words.
 */
const SAID_MS = 8_000;
/** This far scrolled once confirmed, an announcement under the title moves on. */
const MOVED_ON_PX = 24;
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
  const [notice, setNotice] = useState<ComposerNotice | null>(null);
  /** The picture that goes with the next message, once made ready (C4). */
  const [picked, setPicked] = useState<Picture | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** The newest pick: one made ready after another was picked changes nothing. */
  const picks = useRef(0);
  /**
   * The pictures sent from here, by draft: shown from the phone while they
   * go and once they arrived (nothing is fetched again), kept for retries.
   */
  const pictures = useRef(new Map<string, Picture>());
  const pickedNow = useRef<Picture | null>(null);
  useLayoutEffect(() => {
    pickedNow.current = picked;
  }, [picked]);
  /** The picture open in its sheet, kept while the sheet closes. */
  const [photo, setPhoto] = useState<PhotoShown | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const photoOpener = useRef<HTMLElement | null>(null);
  const [below, setBelow] = useState(false);
  const [ready, setReady] = useState(false);
  /**
   * What the screen reader line says now; a new one each time, so it's read.
   * With the message whose words it says, so they go when it is removed.
   */
  const [said, setSaid] = useState<{
    id: number;
    text: string;
    message: string | null;
  } | null>(null);
  const [pinned, setPinned] = useState(props.pinned);
  const canAnnounce = props.powers.announce && kind !== "direct";
  const [announce, setAnnounce] = useState(
    canAnnounce && props.announceFirst && !props.blocked,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [actionsFor, setActionsFor] = useState<ActionsFor | null>(null);
  const [readersFor, setReadersFor] = useState<string | null>(null);
  /** The button that opened who confirmed, for the focus once it closes. */
  const readersOpener = useRef<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /**
   * The announcement the reader confirmed here: it stays the card for the
   * rest of the visit, saying so, and the next one waiting never takes its
   * place under their finger (it is one tap away, through "ועוד").
   */
  const [keptTop, setKeptTop] = useState<string | null>(null);
  /**
   * Announcements that waited for the reader on this screen: under the title
   * until they confirm and move on.
   */
  const [stuck, setStuck] = useState<string[]>(() =>
    props.pinned.flatMap((p) =>
      waitsFor(p, chat.readerId) ? [p.message.id] : [],
    ),
  );
  useEffect(() => {
    const now = pinned.flatMap((p) =>
      waitsFor(p, reader) ? [p.message.id] : [],
    );
    if (now.some((id) => !stuck.includes(id))) {
      setStuck((ids) => [...new Set([...ids, ...now])]);
    }
  }, [pinned, reader, stuck]);

  const pinnedNow = useRef(pinned);
  useLayoutEffect(() => {
    pinnedNow.current = pinned;
  }, [pinned]);
  // Opened again from "פרסום הודעה מההנהלה" (the same screen, kept): the
  // switch goes on, as on a first visit; only when the address asks anew,
  // so a drawing again (the tab's count) never turns it back on.
  const askedAnnounce = useRef(props.announceFirst);
  const writable = !props.blocked;
  useEffect(() => {
    const asked = props.announceFirst;
    if (asked && !askedAnnounce.current && canAnnounce && writable) {
      setAnnounce(true);
    }
    askedAnnounce.current = asked;
    // Hidden for going back: shown again at that address, it asks anew.
    return () => {
      askedAnnounce.current = false;
    };
  }, [props.announceFirst, canAnnounce, writable]);
  /**
   * Messages and pins changed here and not yet answered: what a sync brings
   * of them waits, so a removal on its way doesn't flicker back.
   */
  const changing = useRef(new Set<string>());
  /**
   * Each change here that settled, with the number of the newest sync sent
   * then (`chat.sent`): what an answer to that one, or an older one, brings
   * of it is older than the screen, and waits too. Once settled, the next
   * sync compares the marks whatever the stamp (`chat.recheck`), so nothing
   * held back meanwhile stays behind.
   */
  const settledAt = useRef(new Map<string, number>());
  /**
   * The conversation's stamp from the last answer the screen took whole
   * (`cv=`): one that came while something here waited isn't taken, so the
   * route compares again.
   */
  const changedSeen = useRef<string | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);
  const toastCount = useRef(0);
  /** What opened the actions sheet, for the focus once it closes. */
  const actionsOpener = useRef<HTMLElement | null>(null);
  /**
   * What the toast says. With `focus`, its "ביטול" takes the keyboard's focus
   * as it shows when what was pressed went with the focus (it fell to the
   * page, the screen put it on the messages, or it is still in the sheet
   * that is closing): the way back is the next thing to reach, and waits
   * while the keyboard is there. `back` is the message whose actions take
   * the focus once the toast goes with it.
   */
  const showToast = useCallback(
    (
      text: string,
      options: { undo?: () => void; focus?: boolean; back?: string } = {},
    ) => {
      toastCount.current += 1;
      const active = document.activeElement;
      const lost =
        focusLost() ||
        (log.current !== null && active === log.current) ||
        (actionsOpener.current !== null && active === actionsOpener.current);
      setToast({
        text,
        stamp: String(toastCount.current),
        undo: options.undo,
        focus: Boolean(options.undo && options.focus && lost),
        back: options.back,
      });
    },
    [],
  );

  const held = useRef(messages);
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

  /** Says `text` once; `message` when it carries that message's words. */
  const say = useCallback((text: string, message: string | null = null) => {
    saidCount.current += 1;
    setSaid({ id: saidCount.current, text, message });
  }, []);
  // Read out by now: the line goes quiet, so nothing a message said stays in
  // it for a screen reader to find later.
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(
      () => setSaid((now) => (now?.id === said.id ? null : now)),
      SAID_MS,
    );
    return () => clearTimeout(timer);
  }, [said]);
  // The message it named was removed meanwhile: its words go from it at once.
  useEffect(() => {
    const named = said?.message;
    if (!named) return;
    if (messages.find((m) => m.id === named)?.removed) setSaid(null);
  }, [said, messages]);
  // What arrived from others, in words: set each drawing, with its names.
  const sayArrived = useRef<
    (arrived: ChatSyncMessage[], authors: readonly ChatSyncPerson[]) => void
  >(() => {});
  // What someone else removed of what is on screen, in words: never what it said.
  const sayRemoved = useRef<(removed: ChatSyncMessage[]) => void>(() => {});

  // The server drew the page again (the tab's count, a conversation kept for
  // going back): what it brings joins what is on screen, but for what the
  // reader is changing here, and the next sync compares the rest again (it
  // may have been drawn before a change of theirs that settled since; every
  // drawing brings its messages anew, which asks for that sync below).
  const drawnPinned = useRef(props.pinned);
  useEffect(() => {
    if (props.pinned === drawnPinned.current) return;
    drawnPinned.current = props.pinned;
    const server = props.pinned;
    setPinned((list) =>
      mergePinned(list, server, (id) => changing.current.has(id)),
    );
  }, [props.pinned]);
  const drawn = useRef(props.messages);
  useEffect(() => {
    if (props.messages === drawn.current) return;
    drawn.current = props.messages;
    const server = props.messages.filter((m) => !changing.current.has(m.id));
    setMessages((list) => mergeMessages(list, server));
    if (props.older) setHasOlder(true);
    addPeople(props.people);
    setSeenUpTo((seen) =>
      props.seenUpTo && (!seen || compareInstants(props.seenUpTo, seen) > 0)
        ? props.seenUpTo
        : seen,
    );
    chat.recheck();
  }, [
    props.messages,
    props.people,
    props.seenUpTo,
    props.older,
    addPeople,
    chat.recheck,
  ]);

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
    // A conversation shown anew asks the route to compare from scratch.
    changedSeen.current = null;
    const receive = (open: SyncOpen, asked: number) => {
      // What the reader is changing here, or changed since this was asked
      // for, stays as the screen has it: the next sync brings it again.
      const kept = (id: string) =>
        changing.current.has(id) || (settledAt.current.get(id) ?? 0) >= asked;
      const keptAny =
        changing.current.size > 0 ||
        [...settledAt.current.values()].some((n) => n >= asked);
      for (const [id, n] of settledAt.current) {
        if (n < asked) settledAt.current.delete(id);
      }
      addPeople(open.people);
      setSeenUpTo(open.seenUpTo);
      // Taken whole: the route compares again only once the conversation
      // changes since. Not while something here waited.
      if (open.changed !== undefined && !keptAny) {
        changedSeen.current = open.changed;
      }
      // What changed of what is on screen (C3): a message removed or put
      // back, a pin or an unpin, a "קראתי".
      if (open.pinned) {
        const server = open.pinned;
        setPinned((list) => mergePinned(list, server, kept));
      }
      const recent = (open.recent ?? []).filter((m) => !kept(m.id));
      if (recent.length > 0) {
        const before = new Map(held.current.map((m) => [m.id, m]));
        const goneByOthers = recent.filter((m) => {
          const had = before.get(m.id);
          return (
            had !== undefined &&
            !had.removed &&
            m.removed &&
            m.removedBy?.toLowerCase() !== reader.toLowerCase()
          );
        });
        setMessages((list) => {
          const had = new Map(list.map((m) => [m.id, m]));
          const changed = recent.filter((m) => {
            const was = had.get(m.id);
            return !was || changedMessage(was, m);
          });
          return changed.length > 0 ? mergeMessages(list, changed) : list;
        });
        if (goneByOthers.length > 0) sayRemoved.current(goneByOthers);
      }
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
          return !had || (!kept(m.id) && changedMessage(had, m));
        })
      ) {
        // The look again before the cursor brings what is on screen too:
        // only something new, or changed since, is drawn again.
        setMessages((list) =>
          mergeMessages(
            list,
            open.messages.filter((m) => !kept(m.id) || !known.has(m.id)),
          ),
        );
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
      marks: () => {
        const sent = heldMarks(held.current);
        return {
          marks: chatMarks(held.current, pinnedNow.current),
          from: sent.from,
          removed: sent.removed,
          changed: changedSeen.current,
        };
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

  // "Too many in a minute" goes once the minute has passed, and so does what
  // was said of a picture; a business switched since stays said.
  useEffect(() => {
    if (!notice || notice.key === "businessChanged") return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // What the server has now shows as itself, and a picture the phone held
  // for it is let go.
  useEffect(() => {
    const shown = shownMessages(messages);
    setOutgoing((list) => {
      const next = stillOutgoing(list, shown);
      if (next.length === list.length) return list;
      for (const item of list) {
        if (!next.includes(item)) pictures.current.delete(item.draft);
      }
      return next;
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

  /** The server has it: it shows as sent, and the screen goes on as its chat. */
  function delivered(
    item: OutgoingMessage,
    sent: { conversation: string; message: string },
  ) {
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
  }

  /** It didn't go: it stays, with its way to try again. */
  function undelivered(item: OutgoingMessage) {
    setOutgoing((list) =>
      list.map((m) => (m.draft === item.draft ? { ...m, state: "failed" } : m)),
    );
  }

  /**
   * A picture goes with what was written with it (C4), as the phone made it
   * ready. One that can't go as it is (a demo business, no room, a file the
   * server takes for none of the app's own) leaves the conversation and its
   * words go back to the field, so they can still be sent; any other failure
   * keeps it, with its way to try again under the same draft.
   */
  async function deliverPicture(item: OutgoingMessage) {
    const picture = pictures.current.get(item.draft);
    if (!picture) {
      undelivered(item);
      return;
    }
    const known = conversationNow.current;
    const form = pictureForm(
      picture,
      { draft: item.draft, words: item.body, announce: item.announce === true },
      known ? { conversation: known } : { toPerson: toPerson ?? "" },
    );
    let result: ChatImageResult;
    try {
      result = await actions.sendImage(form);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      delivered(item, result.value);
      return;
    }
    const refusal = pictureRefusal(result.failure);
    setNotice(refusal.notice);
    if (refusal.next === "drop") {
      setOutgoing((list) => list.filter((m) => m.draft !== item.draft));
      pictures.current.delete(item.draft);
      if (item.body) setText((now) => (now.trim() === "" ? item.body : now));
    } else {
      undelivered(item);
    }
    if (refusal.refresh) router.refresh();
  }

  async function deliver(item: OutgoingMessage) {
    if (item.picture) {
      await deliverPicture(item);
      return;
    }
    const known = conversationNow.current;
    const input: ChatSendInput = known
      ? {
          draft: item.draft,
          words: item.body,
          conversation: known,
          ...(item.announce ? { announce: true } : {}),
        }
      : { draft: item.draft, words: item.body, toPerson: toPerson ?? "" };
    let result: Awaited<ReturnType<ConversationActions["send"]>>;
    try {
      result = await actions.send(input);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      delivered(item, result.value);
      return;
    }
    undelivered(item);
    if (result.failure === "tooFast") {
      setNotice({ of: "conversation", key: "tooFast" });
    } else if (result.failure === "businessChanged") {
      setNotice({ of: "conversation", key: "businessChanged" });
    }
    // The chat closed, or the other person left: the screen says so now.
    else if (result.failure === "closed" || result.failure === "noAccess") {
      router.refresh();
    }
  }

  /**
   * A picture picked or taken for the next message: made ready here first
   * (`encodeChatImage`: upright, about 0.3 MB, with its thumbnail, nothing
   * from the camera inside), shown over the field until it goes, and said
   * when it can't be. A newer pick, or taking it out, wins over one still
   * being made ready.
   */
  async function pickPicture(file: File) {
    picks.current += 1;
    const mine = picks.current;
    setPicked(null);
    setPreparing(true);
    setNotice((now) => (now?.of === "fileFailure" ? null : now));
    try {
      const files = await encodeChatImage(file);
      const [preview, whole] = await Promise.all([
        photoDataUrl(files.thumb),
        photoDataUrl(files.full),
      ]);
      if (picks.current !== mine) return;
      setPicked({ full: files.full, thumb: files.thumb, preview, whole });
    } catch (error) {
      if (picks.current !== mine) return;
      setNotice({
        of: "fileFailure",
        key: error instanceof PhotoReadError ? error.problem : "unreadable",
      });
    } finally {
      if (picks.current === mine) setPreparing(false);
    }
  }

  /** "הסרת התמונה": the picture doesn't go, and the field is next. */
  function dropPicked() {
    picks.current += 1;
    setPreparing(false);
    setPicked(null);
    focusOnward(field, log);
  }

  function send(body: string) {
    const picture = pickedNow.current;
    const item: OutgoingMessage = {
      draft: newDraftId(),
      body,
      at: new Date().toISOString(),
      state: "sending",
      message: null,
      // A picture goes as a message: the pinned card shows words alone.
      ...(picture
        ? { picture: true }
        : announce && canAnnounce
          ? { announce: true }
          : {}),
    };
    if (picture) {
      pictures.current.set(item.draft, picture);
      pickedNow.current = null;
      setPicked(null);
    }
    setOutgoing((list) => [...list, item]);
    setText("");
    // One announcement at a time: what is written next is a message again.
    setAnnounce(false);
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

  /**
   * Runs a change of one message here: what a sync brings of it meanwhile
   * waits, `then` puts the screen as the answer says, and the next sync
   * compares the marks whatever the stamp (with the list too, when `list`
   * asks for a refused change), so a removal, an unpin or a "קראתי" by
   * someone else that came while this one was on its way is never lost.
   */
  async function changeOne(
    id: string,
    run: () => Promise<ChatActionResult>,
    then: (result: ChatActionResult) => void,
    options: { listIfRefused?: boolean } = {},
  ): Promise<void> {
    changing.current.add(id);
    let result: ChatActionResult;
    try {
      result = await run();
    } catch {
      result = { ok: false, failure: "failed" };
    }
    changing.current.delete(id);
    then(result);
    settledAt.current.set(id, chat.sent());
    chat.recheck({ list: !result.ok && options.listIfRefused === true });
  }

  /** Puts one message on screen as it was, or as it now is. */
  const replaceMessage = useCallback((message: ChatSyncMessage) => {
    setMessages((list) => list.map((m) => (m.id === message.id ? message : m)));
  }, []);
  /** Pins or unpins a message on screen, keeping all else of it. */
  const pinMessage = useCallback((id: string, pin: boolean) => {
    setMessages((list) =>
      list.map((m) => (m.id === id ? { ...m, pinned: pin } : m)),
    );
  }, []);
  /** One pinned announcement back at the top, as it was, the rest as they are. */
  const putPinned = useCallback((entry: PinnedAnnouncement) => {
    setPinned((list) =>
      mergePinned(list, [entry], (id) => id !== entry.message.id),
    );
  }, []);
  const dropPinned = useCallback((id: string) => {
    setPinned((list) => list.filter((p) => p.message.id !== id));
  }, []);
  const removedAs = (message: ChatSyncMessage): ChatSyncMessage => ({
    ...message,
    body: null,
    pinned: false,
    removed: true,
    removedBy: reader,
  });

  async function confirm(item: PinnedAnnouncement) {
    const id = item.message.id;
    setKeptTop(id);
    setConfirming(id);
    setPinned((list) =>
      list.map((p) => (p.message.id === id ? { ...p, confirmed: true } : p)),
    );
    if (conversation) {
      chat.changeRowLocally(conversation, (row) => ({
        ...row,
        pinnedWaiting: Math.max(0, row.pinnedWaiting - 1),
      }));
    }
    await changeOne(
      id,
      () => actions.confirm(id),
      (result) => {
        setConfirming(null);
        if (result.ok) return;
        if (conversation) {
          chat.changeRowLocally(conversation, (row) => ({
            ...row,
            pinnedWaiting: row.pinnedWaiting + 1,
          }));
        }
        if (result.failure === "closed" || result.failure === "noAccess") {
          // Removed or unpinned meanwhile: it goes now, its words with it.
          dropPinned(id);
          if (result.failure === "noAccess") router.refresh();
        } else {
          setPinned((list) =>
            list.map((p) =>
              p.message.id === id ? { ...p, confirmed: false } : p,
            ),
          );
        }
        showToast(t("announcement.confirmFailed"));
      },
      // The list's count came down here: the server's comes back with it.
      { listIfRefused: true },
    );
  }

  /**
   * Unpins an announcement, or pins it again: from its actions, from the
   * card, or from "ביטול" right after unpinning (`was`: the card as it was,
   * which comes back at once).
   */
  async function setPin(
    message: ChatSyncMessage,
    pin: boolean,
    from: "sheet" | "card" | "undo",
    was?: PinnedAnnouncement,
  ) {
    const id = message.id;
    const entry = pinnedNow.current.find((p) => p.message.id === id) ?? was;
    if (!pin) {
      dropPinned(id);
      pinMessage(id, false);
    } else if (entry) {
      putPinned({ ...entry, message: { ...entry.message, pinned: true } });
      pinMessage(id, true);
    }
    await changeOne(
      id,
      () => actions.pin(id, pin),
      (result) => {
        if (!result.ok) {
          if (!pin && entry) {
            putPinned(entry);
            pinMessage(id, true);
          } else if (pin && entry) {
            dropPinned(id);
            pinMessage(id, false);
          }
          showToast(t("messageActions.failed"));
          return;
        }
        if (pin) {
          pinMessage(id, true);
          showToast(t("announcement.pinned"));
        } else {
          showToast(t("announcement.unpinned"), {
            undo: () => void setPin(message, true, "undo", entry),
            focus: from !== "undo",
            back: id,
          });
        }
      },
    );
  }

  async function remove(message: ChatSyncMessage) {
    const own = message.authorId === reader;
    const entry = pinnedNow.current.find((p) => p.message.id === message.id);
    replaceMessage(removedAs(message));
    dropPinned(message.id);
    await changeOne(
      message.id,
      () => actions.remove(message.id),
      (result) => {
        if (!result.ok) {
          replaceMessage(message);
          if (entry) putPinned(entry);
          showToast(t("messageActions.failed"));
          return;
        }
        showToast(
          own ? t("messageActions.deleted") : t("messageActions.removed"),
          {
            undo: () => void restore(message, entry),
            focus: true,
            back: message.id,
          },
        );
      },
    );
  }

  /** "ביטול" right after removing: the message comes back as it was. */
  async function restore(
    message: ChatSyncMessage,
    entry: PinnedAnnouncement | undefined,
  ) {
    replaceMessage(message);
    if (message.pinned && entry) putPinned(entry);
    await changeOne(
      message.id,
      () => actions.restore(message.id),
      (result) => {
        if (!result.ok) {
          replaceMessage(removedAs(message));
          dropPinned(message.id);
          showToast(
            result.failure === "closed"
              ? t("messageActions.tooLate")
              : t("messageActions.failed"),
          );
          return;
        }
        showToast(t("messageActions.restored"));
      },
    );
  }

  /** Its words as they are now: never those of a message removed since. */
  async function copy(message: ChatSyncMessage) {
    if (message.removed || message.body === null) return;
    try {
      await navigator.clipboard.writeText(message.body);
      showToast(t("messageActions.copied"));
    } catch {
      showToast(t("messageActions.copyFailed"));
    }
  }

  function act(action: MessageAction) {
    const chosen = actionsFor;
    setActionsFor(null);
    if (!chosen) return;
    // The message as it is now: one removed meanwhile offers nothing.
    const message = held.current.find((m) => m.id === chosen.id);
    if (!message || !actionsOf(message).includes(action)) return;
    switch (action) {
      case "copy":
        void copy(message);
        return;
      case "delete":
      case "remove":
        void remove(message);
        return;
      case "pin":
        void setPin(message, true, "sheet");
        return;
      case "unpin":
        void setPin(message, false, "sheet");
        return;
      default: {
        const unhandled: never = action;
        return unhandled;
      }
    }
  }

  const actionsOf = (message: ChatSyncMessage): MessageAction[] =>
    messageActions(message, {
      readerId: reader,
      chat: kind,
      moderates: props.powers.moderate,
      closed: props.closed,
    });

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
          text:
            content.kind === "text"
              ? content.body
              : content.kind === "announcement"
                ? `${content.label}: ${content.body}`
                : content.kind === "image"
                  ? photoWords(content.body)
                  : content.label,
        }),
        content.kind === "removed" ? null : last.id,
      );
    };
    // Who took it out, as its bubble now says, and never what it said.
    sayRemoved.current = (removed) => {
      const last = removed.at(-1);
      const content = last ? contentOf(last) : null;
      if (content?.kind === "removed") say(content.label);
    };
  });

  /** A picture in words: "תמונה", with what was written with it. */
  function photoWords(caption: string | null): string {
    return caption
      ? t("list.photoWith", { caption: chatPreview(caption) })
      : t("list.photo");
  }

  /** When a message was sent, for its picture's sheet: its time, and its day before today. */
  function whenOf(at: string): ReactNode {
    const day = dateIn(new Date(at), chat.timeZone);
    const time = messageTime(at, chat.timeZone);
    return day === today
      ? t.rich("image.when", { time, ltr })
      : t.rich("image.whenDay", { time, day: dayLabel(day), ltr });
  }

  function openPhoto(shown: PhotoShown, trigger: HTMLElement) {
    photoOpener.current = trigger;
    setPhoto(shown);
    setPhotoOpen(true);
  }

  /**
   * A message's picture: its thumbnail, opening the whole picture; the line
   * that its file is no longer kept; or, where the answer brought no address
   * (an answer from before pictures), that it can't be shown now. The server's
   * copy always shows from its own address, the one everyone in the
   * conversation reads (kept a week in the browser's private cache): the
   * phone's copy is only for while it is on its way (outgoingContent), so the
   * picture never swaps source on whether an answer carried its draft.
   */
  function imageOf(message: ChatSyncMessage): MessageImage {
    if (message.fileGone) {
      return { kind: "gone", label: t("message.fileGone") };
    }
    const thumb = message.thumbSrc ?? null;
    const whole = message.fileSrc ?? null;
    if (!thumb || !whole) {
      return { kind: "gone", label: t("image.unavailable") };
    }
    const alt =
      message.authorId === reader
        ? t("image.altOwn")
        : t("image.alt", { name: nameOf(message.authorId) });
    return {
      kind: "shown",
      src: thumb,
      alt,
      retry: t("image.retry"),
      open: {
        label: t("image.open"),
        onOpen: (trigger) =>
          openPhoto(
            {
              id: message.id,
              src: whole,
              alt,
              caption: message.body,
              subtitle: whenOf(message.createdAt),
            },
            trigger,
          ),
      },
    };
  }

  /** One's own message on its way, or one that didn't go. */
  function outgoingContent(item: OutgoingMessage): MessageContent {
    if (item.picture) {
      const picture = pictures.current.get(item.draft);
      const alt = t("image.altOwn");
      const image: MessageImage = picture
        ? {
            kind: "shown",
            src: picture.preview,
            alt,
            busy: item.state === "sending",
            retry: t("image.retry"),
            open: {
              label: t("image.open"),
              onOpen: (trigger) =>
                openPhoto(
                  {
                    id: draftKey(item.draft),
                    src: picture.whole,
                    alt,
                    caption: item.body || null,
                    subtitle: whenOf(item.at),
                  },
                  trigger,
                ),
            },
          }
        : { kind: "gone", label: t("image.unavailable") };
      return { kind: "image", image, body: item.body || null };
    }
    return item.announce
      ? {
          kind: "announcement",
          body: item.body,
          label: t("announcement.label"),
        }
      : { kind: "text", body: item.body };
  }

  function contentOf(message: ChatSyncMessage): MessageContent {
    if (!message.removed && message.fileKind === "image") {
      return {
        kind: "image",
        image: imageOf(message),
        body: message.body,
        ...(message.kind === "announcement"
          ? { label: t("announcement.label") }
          : {}),
      };
    }
    if (!message.removed && message.body !== null) {
      return message.kind === "announcement"
        ? {
            kind: "announcement",
            body: message.body,
            label: t("announcement.label"),
          }
        : { kind: "text", body: message.body };
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

  // The pinned announcement under the title (plan §11.4): the one waiting
  // for the reader's "קראתי" stays there while the messages scroll; one
  // they confirmed, or their own, sits at the top of the conversation. One
  // confirmed here stays the card for the visit (`keptTop`).
  const keptItem = keptTop
    ? (pinned.find((p) => p.message.id === keptTop) ?? null)
    : null;
  const chosen = shownPinned(pinned, reader);
  const pinnedTop = keptItem ?? chosen.shown;
  const more = pinnedTop ? pinned.length - 1 : 0;
  const topId = pinnedTop?.message.id ?? null;
  const topState = pinnedTop
    ? announcementState(
        {
          authorId: pinnedTop.message.authorId,
          confirmed: pinnedTop.confirmed,
        },
        reader,
      )
    : null;
  // Once it waited for the reader on this screen, it stays under the title
  // ("אישרת שקראת" where "קראתי" was) until they confirm it and move on.
  const waiting =
    topState === "waiting" || (topId !== null && stuck.includes(topId));
  const confirmedTop = topState === "confirmed";
  useEffect(() => {
    if (!topId || !confirmedTop || !stuck.includes(topId)) return;
    const from = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - from) < MOVED_ON_PX) return;
      setStuck((ids) => ids.filter((id) => id !== topId));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [topId, confirmedTop, stuck]);
  // The card changed under the focus (another one in its place, none any
  // more, or out from under the title): the messages take the focus, so the
  // keyboard goes on from there rather than the top of the page.
  const cardPlace = `${topId ?? ""}:${waiting ? "under" : "top"}`;
  const lastCardPlace = useRef(cardPlace);
  useEffect(() => {
    if (lastCardPlace.current === cardPlace) return;
    lastCardPlace.current = cardPlace;
    if (focusLost()) log.current?.focus({ preventScroll: true });
  }, [cardPlace]);

  const announcementCard =
    pinnedTop && pinnedTop.message.body !== null ? (
      <AnnouncementCard
        // A card of its own for each: another one never takes this one's
        // button, or the focus on it.
        key={pinnedTop.message.id}
        tone="accent"
        headingLevel="h2"
        label={t("announcement.label")}
        byline={(() => {
          const day = dateIn(
            new Date(pinnedTop.message.createdAt),
            chat.timeZone,
          );
          const time = messageTime(pinnedTop.message.createdAt, chat.timeZone);
          const name = nameOf(pinnedTop.message.authorId);
          return day === today
            ? t.rich("announcement.byline", { name, time, ltr })
            : t.rich("announcement.bylineDay", {
                name,
                time,
                day: dayLabel(day),
                ltr,
              });
        })()}
        body={pinnedTop.message.body}
        confirm={
          topState === "own"
            ? null
            : {
                confirmed: pinnedTop.confirmed,
                label: t("announcement.confirm"),
                confirmedLabel: t("announcement.confirmed"),
                onConfirm: () => void confirm(pinnedTop),
                pending: confirming === pinnedTop.message.id,
                note: t("announcement.whoSees"),
              }
        }
        readers={
          pinnedTop.readers
            ? {
                label: t.rich("announcement.readBy", {
                  count: pinnedTop.readers.count,
                  total: pinnedTop.readers.total,
                  ltr,
                }),
                onOpen: (trigger) => {
                  readersOpener.current = trigger;
                  setReadersFor(pinnedTop.message.id);
                },
              }
            : null
        }
        unpin={
          kind !== "direct" && (topState === "own" || props.powers.moderate)
            ? {
                label: t("announcement.unpin"),
                onClick: () => void setPin(pinnedTop.message, false, "card"),
              }
            : null
        }
        footer={
          more > 0 ? (
            <Link
              href={chatPaths.announcements}
              className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("announcement.more", { count: more })}
            </Link>
          ) : null
        }
      />
    ) : null;

  // The message the actions sheet is for, as it is now. Removed meanwhile,
  // or gone, it has nothing left to show: the sheet closes.
  const actionsMessage = actionsFor
    ? (messages.find((m) => m.id === actionsFor.id) ?? null)
    : null;
  const actionsGone =
    actionsFor !== null && (!actionsMessage || actionsMessage.removed);
  useEffect(() => {
    if (actionsGone) setActionsFor(null);
  }, [actionsGone]);
  const sheetMessage = actionsGone ? null : actionsMessage;

  // The picture open in its sheet went (removed, or its file no longer
  // kept): the sheet closes, and nothing of it stays on screen.
  const photoMessage =
    photo && !photo.id.startsWith("draft:")
      ? (messages.find((m) => m.id === photo.id) ?? null)
      : null;
  const photoGone =
    photoOpen &&
    photo !== null &&
    !photo.id.startsWith("draft:") &&
    (!photoMessage || photoMessage.removed || photoMessage.fileGone);
  useEffect(() => {
    if (photoGone) setPhotoOpen(false);
  }, [photoGone]);

  // The details' pictures beside it (the desktop's column, the tablet's
  // sheet) are drawn by the server: what this screen shows as removed, or as
  // no longer kept, leaves them at once, and what was put back returns.
  // A removed message has no file kind left: any removed one counts.
  const notePictures = chat.notePictures;
  useEffect(() => {
    const gone: string[] = [];
    const shown: string[] = [];
    for (const message of messages) {
      if (message.removed || message.fileGone) gone.push(message.id);
      else if (message.fileKind === "image") shown.push(message.id);
    }
    notePictures(gone, shown);
  }, [messages, notePictures]);

  // Pictures (C4): the attach button opens the phone's picker, which offers
  // its camera too; in a demo business it says why there is none.
  const attach: ComposerAttach | null =
    props.files === "yes"
      ? {
          label: t("conversation.attach"),
          accept: PICKED_PHOTO_ACCEPT,
          onPick: (file) => void pickPicture(file),
        }
      : props.files === "demo"
        ? { label: t("conversation.attach"), refused: t("fileFailure.demo") }
        : null;
  const picturing = picked !== null || preparing;
  // A picture goes as a message: the switch steps aside while one is chosen.
  const announcing = announce && canAnnounce && !picturing;

  /** Where the focus goes back to once a sheet closes: what opened it, else the messages. */
  const backTo = (opener: HTMLElement | null) =>
    opener?.isConnected && opener.getClientRects().length > 0
      ? opener
      : log.current;

  /** The toast went with the focus: to the message it brought back, else the messages. */
  function afterToast() {
    const id = toast?.back;
    const button = id
      ? log.current?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(id)}"] [data-message-actions]`,
        )
      : null;
    (button ?? log.current)?.focus({ preventScroll: true });
  }

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
        trailing={
          conversation && props.details ? (
            <InfoButton
              href={chatPaths.info(conversation)}
              details={props.details}
            />
          ) : null
        }
        below={waiting ? announcementCard : null}
        belowLabel={t("announcement.label")}
      />
      {!waiting && announcementCard ? (
        <div className="pt-3">{announcementCard}</div>
      ) : null}
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
                  const offered =
                    shown.kind === "message" ? actionsOf(shown.message) : [];
                  return (
                    <MessageBubble
                      key={key}
                      messageId={
                        shown.kind === "message" ? shown.message.id : undefined
                      }
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
                          : outgoingContent(shown.outgoing)
                      }
                      time={{
                        label: messageTime(item.createdAt, chat.timeZone),
                        at: item.createdAt,
                      }}
                      status={statusOf(shown)}
                      actions={
                        shown.kind === "message" && offered.length > 0
                          ? {
                              label: t("messageActions.open"),
                              onOpen: (trigger) => {
                                actionsOpener.current = trigger;
                                setActionsFor({ id: shown.message.id });
                              },
                            }
                          : null
                      }
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
        sendLabel={announcing ? t("announcement.send") : t("conversation.send")}
        value={text}
        onValueChange={setText}
        onSend={send}
        blocked={props.blocked}
        notice={
          notice
            ? notice.of === "conversation"
              ? t(`conversation.${notice.key}`)
              : t(`fileFailure.${notice.key}`)
            : null
        }
        tooLong={t.rich("conversation.tooLong", { max: CHAT_MESSAGE_MAX, ltr })}
        attach={attach}
        attached={
          picturing
            ? {
                src: picked?.preview ?? null,
                alt: t("image.chosen"),
                busyLabel: t("image.preparing"),
                readyLabel: t("image.ready"),
                remove: { label: t("image.remove"), onRemove: dropPicked },
              }
            : null
        }
        toggle={
          canAnnounce && !picturing
            ? {
                label: t("announcement.switch"),
                checked: announce,
                onChange: setAnnounce,
                hint: t("announcement.switchHint"),
              }
            : null
        }
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
      <MessageActionsSheet
        open={actionsFor !== null}
        onOpenChange={(open) => {
          if (!open) setActionsFor(null);
        }}
        quote={
          !sheetMessage || sheetMessage.removed
            ? null
            : sheetMessage.fileKind === "image"
              ? photoWords(sheetMessage.body)
              : sheetMessage.body
                ? chatPreview(sheetMessage.body, 160)
                : null
        }
        actions={sheetMessage ? actionsOf(sheetMessage) : []}
        onAction={act}
        // What opened it, while it is still there (a removed message's
        // button went with it), else the messages; the toast's "ביטול"
        // takes it from there when it comes.
        returnFocus={() => backTo(actionsOpener.current)}
      />
      <PhotoSheet
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        photo={photo}
        subtitle={photo?.subtitle}
        closeLabel={t("image.close")}
        loadingLabel={t("image.loading")}
        unavailable={t("image.unavailable")}
        returnFocus={() => backTo(photoOpener.current)}
      />
      <ReadersSheet
        message={readersFor}
        onClose={() => setReadersFor(null)}
        load={actions.readers}
        timeZone={chat.timeZone}
        now={chat.now}
        returnFocus={() => backTo(readersOpener.current)}
      />
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
        action={
          toast?.undo
            ? { label: t("messageActions.undo"), onClick: toast.undo }
            : null
        }
        focusAction={toast?.focus === true}
        onFocusLeave={afterToast}
      />
    </section>
  );
}
