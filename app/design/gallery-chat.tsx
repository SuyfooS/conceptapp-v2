"use client";

import { CHAT_MESSAGE_MAX, chatPreview } from "@domain/chat";
import { UNDO_SHOWN_MS } from "@domain/chat-announce";
import { AnnouncementCard } from "@ui/announcement-card";
import { Avatar } from "@ui/avatar";
import { Button } from "@ui/button";
import { ChatHeader } from "@ui/chat-header";
import { ChatGroupMark, ChatRow } from "@ui/chat-row";
import { Composer } from "@ui/composer";
import { DayDivider } from "@ui/day-divider";
import { ListGroup, ListRow } from "@ui/list-row";
import { MessageBubble, type MessageStatus } from "@ui/message-bubble";
import { NewBelow } from "@ui/new-below";
import { PICKED_PHOTO_ACCEPT } from "@ui/photo-encode";
import { PhotoSheet } from "@ui/photo-sheet";
import { Sheet } from "@ui/sheet";
import { StatusToast } from "@ui/status-toast";
import { Building, Copy, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { listPhotos } from "./list-photos";
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
      <GalleryAnnouncements />
      <GalleryPictures />
      <p className="text-ink-2">{t("chatImmersive")}</p>
      <Button asChild variant="secondary" className="w-full">
        <Link href="/design/chat">{t("chatDemo")}</Link>
      </Button>
    </div>
  );
}

/**
 * The chat's parts of C4: a picture in a message, which opens whole in a
 * sheet; one on its way; one whose file is no longer kept; the composer's
 * attach button with a picture chosen, and as a demo business has it. Nothing
 * is picked or stored here: the demo at /design/chat makes a picked photo
 * ready as the app does.
 */
function GalleryPictures() {
  const t = useTranslations("design");
  const tc = useTranslations("app.chat");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(true);
  const [draft, setDraft] = useState(t("chatPictureSample"));
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const alt = tc("image.alt", { name: t("person1") });
  const tooLong = tc.rich("conversation.tooLong", {
    max: CHAT_MESSAGE_MAX,
    ltr,
  });
  const openPhoto = {
    label: tc("image.open"),
    onOpen: () => setOpen(true),
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">{t("chatPicturesText")}</p>
      <div>
        <MessageBubble
          own={false}
          author={{ name: t("person1"), shown: true }}
          content={{
            kind: "image",
            body: t("chatPictureSample"),
            image: {
              kind: "shown",
              src: listPhotos.kitchen,
              alt,
              open: openPhoto,
              retry: tc("image.retry"),
            },
          }}
          time={{ label: "07:41", at: at(TODAY, "07:41") }}
        />
        <MessageBubble
          own
          author={{ name: tc("message.own"), shown: false }}
          content={{
            kind: "image",
            body: null,
            image: {
              kind: "shown",
              src: listPhotos.kitchen,
              alt: tc("image.altOwn"),
              open: openPhoto,
              busy: true,
              retry: tc("image.retry"),
            },
          }}
          time={{ label: "08:12", at: at(TODAY, "08:12") }}
          status={{ kind: "sending", label: tc("conversation.sending") }}
        />
        <MessageBubble
          own={false}
          author={{ name: t("person3"), shown: true }}
          content={{
            kind: "image",
            body: t("chatSample1"),
            image: { kind: "gone", label: tc("message.fileGone") },
          }}
          time={{ label: "18:20", at: at(YESTERDAY, "18:20") }}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        {t("chatPictureSheet")}
      </Button>
      <PhotoSheet
        open={open}
        onOpenChange={setOpen}
        photo={{
          src: listPhotos.kitchen,
          alt,
          caption: t("chatPictureSample"),
        }}
        subtitle={tc.rich("image.when", { time: "07:41", ltr })}
        closeLabel={tc("image.close")}
        loadingLabel={tc("image.loading")}
        unavailable={tc("image.unavailable")}
      />
      <p className="text-ink-2">{t("chatAttachText")}</p>
      <Composer
        floating={false}
        label={tc("conversation.placeholder")}
        sendLabel={tc("conversation.send")}
        value={draft}
        onValueChange={setDraft}
        onSend={() => {
          setDraft("");
          setChosen(false);
        }}
        tooLong={tooLong}
        attach={{
          label: tc("conversation.attach"),
          accept: PICKED_PHOTO_ACCEPT,
          onPick: () => setChosen(true),
        }}
        attached={
          chosen
            ? {
                src: listPhotos.kitchen,
                alt: tc("image.chosen"),
                busyLabel: tc("image.preparing"),
                readyLabel: tc("image.ready"),
                remove: {
                  label: tc("image.remove"),
                  onRemove: () => setChosen(false),
                },
              }
            : null
        }
      />
      <Composer
        floating={false}
        label={tc("conversation.placeholder")}
        sendLabel={tc("conversation.send")}
        value=""
        onValueChange={() => {}}
        onSend={() => {}}
        tooLong={tooLong}
        attach={{
          label: tc("conversation.attach"),
          refused: tc("fileFailure.demo"),
        }}
      />
    </div>
  );
}

/**
 * The chat's parts of C3: an announcement pinned under a conversation's
 * title, as its readers and as its author see it; one in the conversation;
 * a message's actions, with the undo after removing; the composer's switch
 * for a message from management. Nothing is stored.
 */
function GalleryAnnouncements() {
  const t = useTranslations("design");
  const tc = useTranslations("app.chat");
  const [confirmed, setConfirmed] = useState(false);
  const [announce, setAnnounce] = useState(true);
  const [draft, setDraft] = useState("");
  const [removed, setRemoved] = useState(false);
  const [actions, setActions] = useState(false);
  const [toast, setToast] = useState<{ text: string; stamp: number } | null>(
    null,
  );
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const byline = tc.rich("announcement.byline", {
    name: t("person2"),
    time: "08:10",
    ltr,
  });
  const tooLong = tc.rich("conversation.tooLong", {
    max: CHAT_MESSAGE_MAX,
    ltr,
  });

  function remove() {
    setActions(false);
    setRemoved(true);
    setToast({ text: tc("messageActions.removed"), stamp: Date.now() });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2">{t("chatAnnounceText")}</p>
      <ChatHeader
        floating={false}
        headingLevel="h3"
        back={{ href: "/design/chat", label: tc("conversation.back") }}
        leading={<ChatGroupMark icon={<Building />} />}
        title={tc("list.team")}
        subtitle={tc("conversation.teamNote")}
        below={
          <AnnouncementCard
            tone="accent"
            headingLevel="h3"
            label={tc("announcement.label")}
            byline={byline}
            body={t("chatAnnounceSample")}
            confirm={{
              confirmed,
              label: tc("announcement.confirm"),
              confirmedLabel: tc("announcement.confirmed"),
              onConfirm: () => setConfirmed(true),
              note: tc("announcement.whoSees"),
            }}
          />
        }
      />
      <p className="text-ink-2">{t("chatAuthorView")}</p>
      <AnnouncementCard
        headingLevel="h3"
        label={tc("announcement.label")}
        byline={byline}
        body={t("chatAnnounceSample")}
        readers={{
          label: tc.rich("announcement.readBy", {
            count: confirmed ? 2 : 1,
            total: 3,
            ltr,
          }),
          href: "/design/chat/team?state=readers",
        }}
        unpin={{ label: tc("announcement.unpin"), onClick: () => {} }}
        footer={tc("announcement.more", { count: 1 })}
      />
      <div>
        <MessageBubble
          own={false}
          author={{ name: t("person2"), shown: true }}
          content={{
            kind: "announcement",
            body: t("chatAnnounceSample"),
            label: tc("announcement.label"),
          }}
          time={{ label: "08:10", at: at(TODAY, "08:10") }}
        />
        <MessageBubble
          own={false}
          author={{ name: t("person1"), shown: true }}
          content={
            removed
              ? { kind: "removed", label: tc("message.removedByManager") }
              : { kind: "text", body: t("chatSample6") }
          }
          time={{ label: "08:14", at: at(TODAY, "08:14") }}
          actions={
            removed
              ? null
              : {
                  label: tc("messageActions.open"),
                  onOpen: () => setActions(true),
                }
          }
        />
      </div>
      <p className="text-ink-2">{t("chatActionsText")}</p>
      <Sheet
        open={actions}
        onOpenChange={setActions}
        title={tc("messageActions.title")}
        closeLabel={tc("messageActions.close")}
      >
        <div className="flex flex-col gap-3 px-2 pb-2">
          <p className="rounded-card bg-elevated px-4 py-3 text-ink-2">
            {t("chatSample6")}
          </p>
          <ListGroup className="bg-elevated shadow-none">
            <ListRow
              leading={<Copy />}
              title={tc("messageActions.copy")}
              onClick={() => {
                setActions(false);
                setToast({
                  text: tc("messageActions.copied"),
                  stamp: Date.now(),
                });
              }}
            />
            <ListRow
              leading={<Trash2 />}
              title={
                <span className="text-danger">
                  {tc("messageActions.remove")}
                </span>
              }
              subtitle={tc("messageActions.removeHint")}
              onClick={remove}
            />
          </ListGroup>
        </div>
      </Sheet>
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast ? String(toast.stamp) : undefined}
        duration={removed ? UNDO_SHOWN_MS : 4000}
        action={
          removed
            ? {
                label: tc("messageActions.undo"),
                onClick: () => {
                  setRemoved(false);
                  setToast({
                    text: tc("messageActions.restored"),
                    stamp: Date.now(),
                  });
                },
              }
            : null
        }
      />
      <p className="text-ink-2">{t("chatComposerAnnounce")}</p>
      <Composer
        floating={false}
        label={tc("conversation.placeholder")}
        sendLabel={announce ? tc("announcement.send") : tc("conversation.send")}
        value={draft}
        onValueChange={setDraft}
        onSend={() => setDraft("")}
        tooLong={tooLong}
        toggle={{
          label: tc("announcement.switch"),
          checked: announce,
          onChange: setAnnounce,
          hint: tc("announcement.switchHint"),
        }}
      />
    </div>
  );
}
