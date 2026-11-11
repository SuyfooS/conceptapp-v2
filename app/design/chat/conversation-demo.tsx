"use client";

import {
  CHAT_MESSAGE_MAX,
  type ChatKind,
  chatPreview,
  groupMessages,
} from "@domain/chat";
import {
  type MessageAction,
  messageActions,
  UNDO_SHOWN_MS,
} from "@domain/chat-announce";
import { messageTime } from "@domain/chat-days";
import { AnnouncementCard } from "@ui/announcement-card";
import { ChatHeader } from "@ui/chat-header";
import { Composer, type ComposerAttached } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import { ListGroup, ListRow } from "@ui/list-row";
import {
  MessageBubble,
  type MessageContent,
  type MessageRun,
  type MessageStatus,
} from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import {
  encodeChatImage,
  PhotoReadError,
  PICKED_PHOTO_ACCEPT,
  photoDataUrl,
} from "@ui/photo-encode";
import { PhotoSheet } from "@ui/photo-sheet";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Copy, Pin, PinOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { InfoButton } from "../../(app)/chat/info-button";

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
  /** An announcement from management (C3). */
  announcement?: boolean;
  /** Its picture (C4): an illustration, or a picture Shiran picked here. */
  photo?: string | null;
  /** Its picture is no longer kept: the message stays. */
  fileGone?: boolean;
};

/** Someone of the group, for the readers sheet. */
export type DemoReader = {
  id: string;
  name: string;
  photo: string | null;
  /** When they confirmed, as "08:07"; null: not yet. */
  at: string | null;
};

/** The group's pinned announcement, as Shiran sees it (C3). */
export type DemoPinned = {
  /** Its message among the bubbles. */
  id: string;
  authorName: string;
  /** "08:10". */
  time: string;
  body: string;
  /** Everyone it asks, Shiran among them. */
  readers: DemoReader[];
};

/** What the demo opens with: `?state=confirmed|readers|actions|photo`. */
export type DemoOpened = "confirmed" | "readers" | "actions" | "photo" | null;

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
  /** Its pinned announcement, if any (C3). */
  pinned?: DemoPinned | null;
  /**
   * Shiran manages: she removes others' messages in groups and unpins, and
   * posts announcements there ("הודעה מההנהלה").
   */
  moderates?: boolean;
  opened?: DemoOpened;
  /** `?announce=1`: the composer opens as "הודעה מההנהלה". */
  announceFirst?: boolean;
  /** The phone's details page, /design/chat/<id>/info. */
  infoHref: string;
  /** The details, for the tablet's sheet from the title. */
  details: ReactNode;
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

/** Whether a demo message was removed: by its author or by management. */
const removedOf = (m: DemoBubble) =>
  m.removedBy !== undefined ||
  (m.body === null && !m.photo && m.fileGone !== true);

/**
 * A conversation of the demo, with the parts the real screen uses: the
 * floating title, the days and runs of messages in a polite log, and the
 * composer. What Shiran writes goes on its way, arrives, and is answered
 * once; nothing is stored. When the answer comes while she reads further up,
 * the page stays where it is and NewBelow says so. A picture (C4) opens whole
 * in a sheet; one she picks is made ready here, as the app does, and shown
 * from the browser.
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
  pinned,
  moderates = false,
  opened = null,
  announceFirst = false,
  infoHref,
  details,
}: Props) {
  const t = useTranslations("app.chat");
  const [messages, setMessages] = useState(initial);
  // Management writes an announcement in a group with the composer's switch.
  const canAnnounce = moderates && kind !== "direct" && blocked === null;
  const [announce, setAnnounce] = useState(canAnnounce && announceFirst);
  const [confirmed, setConfirmed] = useState(opened === "confirmed");
  // Waiting for her "קראתי" when the screen opened, it stays under the title.
  const [stuck] = useState(opened !== "confirmed");
  const [pinShown, setPinShown] = useState(true);
  const [readersOpen, setReadersOpen] = useState(opened === "readers");
  const [actionsFor, setActionsFor] = useState<DemoBubble | null>(() =>
    opened === "actions"
      ? (initial.findLast((m) => m.author !== reader && m.body !== null) ??
        null)
      : null,
  );
  const [toast, setToast] = useState<{
    text: string;
    stamp: number;
    undo?: () => void;
  } | null>(null);
  const say = (text: string, undo?: () => void) =>
    setToast({ text, stamp: Date.now(), undo });
  const [draft, setDraft] = useState("");
  // A picture picked here: made ready as the app makes it, never sent.
  const [picked, setPicked] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A newer pick, or taking it out, wins over one still being made ready.
  const picks = useRef(0);
  const [photo, setPhoto] = useState<{
    src: string;
    alt: string;
    caption: string | null;
    time: string;
  } | null>(() => {
    const first =
      opened === "photo" ? initial.find((m) => m.photo && !m.removedBy) : null;
    return first?.photo
      ? {
          src: first.photo,
          alt: t("image.alt", { name: first.authorName }),
          caption: first.body,
          time: messageTime(first.at, timeZone),
        }
      : null;
  });
  const [photoOpen, setPhotoOpen] = useState(opened === "photo");
  // A picture goes as a message: the switch steps aside while one is chosen.
  const picturing = picked !== null || preparing;
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

  async function pick(file: File) {
    picks.current += 1;
    const mine = picks.current;
    setProblem(null);
    setPicked(null);
    setPreparing(true);
    try {
      const files = await encodeChatImage(file);
      const preview = await photoDataUrl(files.thumb);
      if (picks.current !== mine) return;
      setPicked(preview);
    } catch (error) {
      if (picks.current !== mine) return;
      setProblem(
        t(
          `fileFailure.${error instanceof PhotoReadError ? error.problem : "unreadable"}`,
        ),
      );
    } finally {
      if (picks.current === mine) setPreparing(false);
    }
  }

  /** "הסרת התמונה": the picture doesn't go, even one still being made ready. */
  function dropPicked() {
    picks.current += 1;
    setPicked(null);
    setPreparing(false);
  }

  function send(body: string) {
    const withPhoto = picked;
    setPicked(null);
    sentCount.current += 1;
    const id = `sent-${sentCount.current}`;
    const at = new Date(
      Date.parse(now) + sentCount.current * 1000,
    ).toISOString();
    toTheEnd.current = true;
    const asAnnouncement = announce && canAnnounce && !withPhoto;
    setMessages((list) => [
      ...list,
      {
        id,
        author: reader,
        authorName: "",
        at,
        body: body === "" ? null : body,
        sending: true,
        announcement: asAnnouncement,
        photo: withPhoto,
      },
    ]);
    setDraft("");
    // One announcement at a time: what is written next is a message again.
    setAnnounce(false);
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

  function actionsOf(m: DemoBubble): MessageAction[] {
    if (m.sending || m.failed) return [];
    const removed = removedOf(m);
    // The demo pins only the group's own announcement: one Shiran sends
    // here offers what any message of hers does.
    const theAnnouncement = m.announcement === true && m.id === pinned?.id;
    return messageActions(
      {
        authorId: m.author,
        kind: theAnnouncement ? "announcement" : "text",
        body: m.body,
        pinned: theAnnouncement && pinShown,
        removed,
      },
      { readerId: reader, chat: kind, moderates, closed: blocked !== null },
    );
  }

  function act(action: MessageAction) {
    const m = actionsFor;
    setActionsFor(null);
    if (!m) return;
    if (action === "copy") {
      say(t("messageActions.copied"));
      return;
    }
    if (action === "pin" || action === "unpin") {
      setPinShown(action === "pin");
      say(
        action === "pin"
          ? t("announcement.pinned")
          : t("announcement.unpinned"),
      );
      return;
    }
    const own = m.author === reader;
    setMessages((list) =>
      list.map((x) =>
        x.id === m.id
          ? {
              ...x,
              body: null,
              photo: null,
              fileGone: false,
              removedBy: own ? "author" : "management",
            }
          : x,
      ),
    );
    if (m.announcement) setPinShown(false);
    say(own ? t("messageActions.deleted") : t("messageActions.removed"), () => {
      setMessages((list) => list.map((x) => (x.id === m.id ? m : x)));
      if (m.announcement) setPinShown(true);
      say(t("messageActions.restored"));
    });
  }

  function contentOf(m: DemoBubble): MessageContent {
    if (!removedOf(m) && (m.photo || m.fileGone)) {
      const own = m.author === reader;
      const alt = own
        ? t("image.altOwn")
        : t("image.alt", { name: m.authorName });
      const src = m.photo;
      return {
        kind: "image",
        body: m.body,
        image:
          m.fileGone || !src
            ? { kind: "gone", label: t("message.fileGone") }
            : {
                kind: "shown",
                src,
                alt,
                busy: m.sending === true,
                retry: t("image.retry"),
                open: {
                  label: t("image.open"),
                  onOpen: () => {
                    setPhoto({
                      src,
                      alt,
                      caption: m.body,
                      time: messageTime(m.at, timeZone),
                    });
                    setPhotoOpen(true);
                  },
                },
              },
      };
    }
    if (m.body !== null && m.announcement) {
      return {
        kind: "announcement",
        body: m.body,
        label: t("announcement.label"),
      };
    }
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
      kind: m.announcement ? ("announcement" as const) : ("text" as const),
    })),
    timeZone,
  );

  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const readers = (pinned?.readers ?? []).map((r) =>
    r.id === reader && confirmed && !r.at ? { ...r, at: "08:12" } : r,
  );
  const card =
    pinned && pinShown ? (
      <AnnouncementCard
        tone="accent"
        label={t("announcement.label")}
        byline={t.rich("announcement.byline", {
          name: pinned.authorName,
          time: pinned.time,
          ltr,
        })}
        body={pinned.body}
        confirm={{
          confirmed,
          label: t("announcement.confirm"),
          confirmedLabel: t("announcement.confirmed"),
          onConfirm: () => setConfirmed(true),
          note: t("announcement.whoSees"),
        }}
        readers={
          moderates
            ? {
                label: t.rich("announcement.readBy", {
                  count: readers.filter((r) => r.at).length,
                  total: readers.length,
                  ltr,
                }),
                onOpen: () => setReadersOpen(true),
              }
            : null
        }
        unpin={
          moderates
            ? {
                label: t("announcement.unpin"),
                onClick: () => {
                  setPinShown(false);
                  say(t("announcement.unpinned"), () => {
                    setPinShown(true);
                    say(t("announcement.pinned"));
                  });
                },
              }
            : null
        }
      />
    ) : null;
  const icons: Record<MessageAction, ReactNode> = {
    copy: <Copy />,
    delete: <Trash2 />,
    remove: <Trash2 />,
    pin: <Pin />,
    unpin: <PinOff />,
  };
  const actionWords: Record<MessageAction, string> = {
    copy: t("messageActions.copy"),
    delete: t("messageActions.delete"),
    remove: t("messageActions.remove"),
    pin: t("announcement.pin"),
    unpin: t("announcement.unpin"),
  };

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
        trailing={<InfoButton href={infoHref} details={details} />}
        below={stuck ? card : null}
        belowLabel={t("announcement.label")}
      />
      {!stuck && card ? <div className="pt-3">{card}</div> : null}
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
                      actions={
                        actionsOf(m).length > 0
                          ? {
                              label: t("messageActions.open"),
                              onOpen: () => setActionsFor(m),
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
      <Composer
        label={t("conversation.placeholder")}
        sendLabel={
          announce && canAnnounce && !picturing
            ? t("announcement.send")
            : t("conversation.send")
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
        value={draft}
        onValueChange={setDraft}
        onSend={send}
        blocked={blocked}
        notice={problem}
        attach={{
          label: t("conversation.attach"),
          accept: PICKED_PHOTO_ACCEPT,
          onPick: (file) => void pick(file),
        }}
        attached={
          picked || preparing
            ? ({
                src: picked,
                alt: t("image.chosen"),
                busyLabel: t("image.preparing"),
                readyLabel: t("image.ready"),
                remove: { label: t("image.remove"), onRemove: dropPicked },
              } satisfies ComposerAttached)
            : null
        }
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
      <Sheet
        open={actionsFor !== null}
        onOpenChange={(open) => {
          if (!open) setActionsFor(null);
        }}
        title={t("messageActions.title")}
        closeLabel={t("messageActions.close")}
      >
        <div className="flex flex-col gap-3 px-2 pb-2">
          {actionsFor?.body ? (
            <p
              dir="auto"
              className="rounded-card bg-elevated px-4 py-3 text-start text-ink-2 wrap-anywhere"
            >
              {chatPreview(actionsFor.body, 160)}
            </p>
          ) : null}
          <ListGroup className="bg-elevated shadow-none">
            {(actionsFor ? actionsOf(actionsFor) : []).map((action) => (
              <ListRow
                key={action}
                leading={icons[action]}
                title={
                  action === "delete" || action === "remove" ? (
                    <span className="text-danger">{actionWords[action]}</span>
                  ) : (
                    actionWords[action]
                  )
                }
                subtitle={
                  action === "remove"
                    ? t("messageActions.removeHint")
                    : action === "delete"
                      ? t("messageActions.deleteHint")
                      : undefined
                }
                onClick={() => act(action)}
              />
            ))}
          </ListGroup>
        </div>
      </Sheet>
      {pinned ? (
        <Sheet
          open={readersOpen}
          onOpenChange={setReadersOpen}
          title={t("announcement.readers.title")}
          subtitle={t("announcement.readers.subtitle")}
          closeLabel={t("announcement.readers.close")}
          readingLabel={t("announcement.readers.title")}
        >
          <div className="flex flex-col gap-5 px-2 pb-2">
            <PageSection title={t("announcement.readers.confirmed")} level={3}>
              <PersonList className="bg-elevated shadow-none">
                {readers
                  .filter((r) => r.at)
                  .map((r) => (
                    <PersonRow
                      key={r.id}
                      name={r.name}
                      photo={r.photo}
                      title={r.name}
                      subtitle={t.rich("announcement.readers.at", {
                        time: r.at ?? "",
                        ltr,
                      })}
                    />
                  ))}
              </PersonList>
            </PageSection>
            <PageSection title={t("announcement.readers.waiting")} level={3}>
              <PersonList className="bg-elevated shadow-none">
                {readers
                  .filter((r) => !r.at)
                  .map((r) => (
                    <PersonRow
                      key={r.id}
                      name={r.name}
                      photo={r.photo}
                      title={r.name}
                    />
                  ))}
              </PersonList>
            </PageSection>
          </div>
        </Sheet>
      ) : null}
      <PhotoSheet
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        photo={photo}
        subtitle={
          photo ? t.rich("image.when", { time: photo.time, ltr }) : undefined
        }
        closeLabel={t("image.close")}
        loadingLabel={t("image.loading")}
        unavailable={t("image.unavailable")}
      />
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast ? String(toast.stamp) : undefined}
        duration={toast?.undo ? UNDO_SHOWN_MS : 4000}
        action={
          toast?.undo
            ? { label: t("messageActions.undo"), onClick: toast.undo }
            : null
        }
      />
    </section>
  );
}
