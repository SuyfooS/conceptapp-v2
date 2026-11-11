"use client";

import type { ChatCursor } from "@domain/chat";
import {
  type ChatListRow,
  type ChatSyncAnswer,
  chatSyncAnswer,
  chatSyncHref,
  nextSyncDelay,
  waitingChats,
} from "@domain/chat-sync";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatActionResult } from "./chat-types";

/** Someone on the staff the new-message sheet offers. */
export type ChatContact = {
  id: string;
  name: string | null;
  photo: string | null;
  /** Their departments, or their role: who they are, in a word or two. */
  line: string | null;
};

/** What the chat screens share, as the layout drew it. */
export type ChatFrame = {
  /** The business the screens were drawn for: actions are bound to it. */
  business: string;
  businessName: string;
  readerId: string;
  timeZone: string;
  /** The list's version, for `/chat-sync`; null before the migration. */
  version: string | null;
  rows: ChatListRow[];
  /** Everyone the business has had, by id: names for "נועה: …" in the list. */
  names: Record<string, string | null>;
  /** Everyone else on the staff now, by name. */
  contacts: ChatContact[];
  /** The departments the reader is in (removed ones too). */
  myDepartments: string[];
  /** A demo business: everyone who comes in reads it. */
  demo: boolean;
  /** The reader has read the notice of who sees what. */
  noticeSeen: boolean;
  /** How many days chat files are kept (`fileDays`), for the notice. */
  fileDays: number;
  /** When the layout was drawn: the clock the first drawing reads. */
  now: string;
};

/** What `/chat-sync` brings of the conversation on screen. */
export type SyncOpen = NonNullable<ChatSyncAnswer["open"]>;

/** The conversation on screen, as it asks to be kept up to date. */
export type WatchedConversation = {
  conversation: string;
  /** Its newest message on screen, for `after=`. */
  cursor: () => ChatCursor | null;
  /**
   * How many it holds just before that (`heldInWindow`), for `n=`: the route
   * looks again there for one that arrived late.
   */
  held: () => number | null;
  receive: (open: SyncOpen) => void;
};

type ChatContextValue = Omit<ChatFrame, "rows" | "noticeSeen" | "now"> & {
  /** The list, as the last sync brought it. */
  rows: ChatListRow[];
  /** The clock the screens read, moved on with each sync. */
  now: number;
  noticeSeen: boolean;
  /** "הבנתי": the notice goes, and the database keeps that it was read. */
  seeNotice: () => void;
  /** Keeps a conversation up to date while it is on screen; returns the way out. */
  watch: (open: WatchedConversation) => () => void;
  /** Asks at once, as after sending. */
  syncNow: () => void;
  /** A message went: the conversation is moving, so it is asked often. */
  moved: () => void;
  /** The reader read a conversation: its count goes before the next sync. */
  readLocally: (conversation: string) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

/** The chat screens' shared state; only inside ChatProvider. */
export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat outside ChatProvider");
  return value;
}

type Loop = {
  version: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  busy: boolean;
  /** Asked again while a sync was on its way: once more after it. */
  again: boolean;
  failures: number;
  /** The last message sent or received, or when a conversation opened. */
  lastMove: number;
  open: WatchedConversation | null;
  /** A 404 asks the server to draw the screen again, once. */
  redrawn: boolean;
  controller: AbortController | null;
  /** The loop ran before: it is chat shown again. */
  shownBefore: boolean;
};

/** At least this long between two drawings for the tab's count. */
const REDRAW_EVERY_MS = 15_000;
/** And this long after the count moved, so a burst of syncs is one drawing. */
const REDRAW_AFTER_MS = 1_500;

/**
 * The chat screens' one sync with `/chat-sync` (plan §7): the list beside
 * every chat screen and the conversation on screen are asked together, as
 * often as `nextSyncDelay` says (every few seconds while a conversation
 * moves, every 30 for the list alone), at once when the page shows again,
 * after sending and when a conversation opens, and never while the page is
 * hidden. Nothing here keeps a session in the page (#80): the route reads
 * under the person's cookie. Signed out, the page loads again into sign-in.
 *
 * The Chat tab's count is drawn by the server: when the list's count moves,
 * the screen is drawn again, at most every 15 seconds.
 *
 * Its state is one reader's in one business: the layout keys it by both, so
 * someone else signing in on the same browser (a shared phone, the demo's
 * door) starts afresh, with nothing of the last person's kept in it.
 */
export function ChatProvider({
  frame,
  seeNotice,
  children,
}: {
  frame: ChatFrame;
  seeNotice: () => Promise<ChatActionResult>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(frame.rows);
  const [now, setNow] = useState(() => Date.parse(frame.now));
  const [noticeSeen, setNoticeSeen] = useState(frame.noticeSeen);
  const loop = useRef<Loop>({
    version: frame.version,
    timer: null,
    busy: false,
    again: false,
    failures: 0,
    lastMove: Date.now(),
    open: null,
    redrawn: false,
    controller: null,
    shownBefore: false,
  });
  const api = useRef<{ run: () => void; schedule: () => void } | null>(null);

  // A new drawing of the layout (the tab's count, the notice) brings the
  // server's list when it is newer than the one on screen.
  const drawnVersion = useRef(frame.version);
  useEffect(() => {
    if (frame.version === drawnVersion.current) return;
    drawnVersion.current = frame.version;
    loop.current.version = frame.version;
    setRows(frame.rows);
  }, [frame.version, frame.rows]);
  useEffect(() => {
    if (frame.noticeSeen) setNoticeSeen(true);
  }, [frame.noticeSeen]);

  useEffect(() => {
    const s = loop.current;
    let alive = true;

    const schedule = () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      if (!alive) return;
      const delay = nextSyncDelay({
        visible: document.visibilityState === "visible",
        screen: s.open ? "conversation" : "list",
        idleMs: Date.now() - s.lastMove,
        failures: s.failures,
      });
      if (delay !== null) s.timer = setTimeout(run, delay);
    };

    const apply = (
      answer: ChatSyncAnswer,
      open: WatchedConversation | null,
    ) => {
      setNow(Date.now());
      if (answer.inbox) {
        s.version = answer.inbox.version;
        setRows(answer.inbox.rows);
      }
      const brought = answer.open;
      if (brought && open && s.open === open) {
        if (brought.conversation !== open.conversation) return;
        if (brought.messages.length > 0) s.lastMove = Date.now();
        open.receive(brought);
      }
    };

    async function run() {
      if (!alive) return;
      if (s.busy) {
        s.again = true;
        return;
      }
      s.busy = true;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      const open = s.open;
      const controller = new AbortController();
      s.controller = controller;
      try {
        const response = await fetch(
          chatSyncHref({
            version: s.version,
            conversation: open?.conversation ?? null,
            after: open?.cursor() ?? null,
            held: open?.held() ?? null,
          }),
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) {
          // Signed out somewhere else: the page goes to sign-in.
          alive = false;
          window.location.reload();
          return;
        }
        if (response.status === 204) {
          s.failures = 0;
        } else if (response.status === 200) {
          const answer = chatSyncAnswer.safeParse(await response.json());
          if (answer.success) {
            s.failures = 0;
            apply(answer.data, open);
          } else {
            s.failures += 1;
          }
        } else {
          s.failures += 1;
          // Chat went off, the conversation went, or a view began: the
          // server says what is there now.
          if (response.status === 404 && !s.redrawn) {
            s.redrawn = true;
            router.refresh();
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        s.failures += 1;
      } finally {
        s.busy = false;
        s.controller = null;
      }
      if (!alive) return;
      if (s.again) {
        s.again = false;
        void run();
      } else {
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void run();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    api.current = { run: () => void run(), schedule };
    // Chat kept for going back (cacheComponents keeps it, asleep, while
    // another tab is open) asks at once when it shows again.
    if (s.shownBefore) void run();
    else schedule();
    s.shownBefore = true;
    return () => {
      alive = false;
      api.current = null;
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      s.controller?.abort();
      s.busy = false;
      s.again = false;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  const watch = useCallback((open: WatchedConversation) => {
    const s = loop.current;
    s.open = open;
    s.lastMove = Date.now();
    s.redrawn = false;
    // A conversation shown again (one kept for going back) may be behind.
    api.current?.run();
    return () => {
      if (s.open !== open) return;
      s.open = null;
      api.current?.schedule();
    };
  }, []);

  const syncNow = useCallback(() => api.current?.run(), []);
  const moved = useCallback(() => {
    loop.current.lastMove = Date.now();
  }, []);
  const readLocally = useCallback((conversation: string) => {
    setRows((list) =>
      list.map((row) =>
        row.conversation === conversation && row.unread > 0
          ? { ...row, unread: 0 }
          : row,
      ),
    );
  }, []);
  const seeNoticeNow = useCallback(() => {
    setNoticeSeen(true);
    seeNotice().catch(() => {
      // Shown again on the next visit: the database didn't keep it.
    });
  }, [seeNotice]);

  // The tab's count is the server's: draw it again when the list's moved.
  const waiting = waitingChats(rows);
  const drawnWaiting = waitingChats(frame.rows);
  const lastRedraw = useRef(0);
  useEffect(() => {
    if (waiting === drawnWaiting) return;
    const wait = Math.max(
      REDRAW_AFTER_MS,
      lastRedraw.current + REDRAW_EVERY_MS - Date.now(),
    );
    const timer = setTimeout(() => {
      lastRedraw.current = Date.now();
      router.refresh();
    }, wait);
    return () => clearTimeout(timer);
  }, [waiting, drawnWaiting, router]);

  const value = useMemo<ChatContextValue>(
    () => ({
      business: frame.business,
      businessName: frame.businessName,
      readerId: frame.readerId,
      timeZone: frame.timeZone,
      version: frame.version,
      names: frame.names,
      contacts: frame.contacts,
      myDepartments: frame.myDepartments,
      demo: frame.demo,
      fileDays: frame.fileDays,
      rows,
      now,
      noticeSeen,
      seeNotice: seeNoticeNow,
      watch,
      syncNow,
      moved,
      readLocally,
    }),
    [
      frame,
      rows,
      now,
      noticeSeen,
      seeNoticeNow,
      watch,
      syncNow,
      moved,
      readLocally,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
