"use client";

import { dateIn } from "@domain/availability";
import { chatDay, chatShortDate, messageTime } from "@domain/chat-days";
import { MessageImageView } from "@ui/message-image";
import { PhotoSheet } from "@ui/photo-sheet";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useChat } from "./chat-provider";

/** A picture of the conversation, as its details show it (`ChatPicture` in @db/chat-files). */
export type DetailsPicture = {
  id: string;
  authorId: string | null;
  /** ISO instant. */
  createdAt: string;
  body: string | null;
  fileSrc: string;
  thumbSrc: string;
};

type Opened = {
  /** Its message. */
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  subtitle: ReactNode;
};

/**
 * A conversation's latest pictures, newest first, in its details (C4): each
 * opens the whole of it in a sheet, with who sent it, when, and what was
 * written with it, and each is named with who sent it and when, so pictures
 * from one person can be told apart. The server drew them: one the
 * conversation on screen shows as removed, or as no longer kept, leaves at
 * once (`picturesGone`), and its sheet closes; with none left, it says there
 * are none yet. One no longer there by the time it is looked at says so in
 * its place.
 */
export function ChatPicturesGrid({
  pictures,
}: {
  pictures: readonly DetailsPicture[];
}) {
  const t = useTranslations("app.chat");
  const chat = useChat();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const today = dateIn(new Date(chat.now), chat.timeZone);
  const shown = pictures.filter(
    (picture) => !chat.picturesGone.has(picture.id.toLowerCase()),
  );
  const openedGone =
    open && opened !== null && chat.picturesGone.has(opened.id.toLowerCase());
  useEffect(() => {
    if (openedGone) setOpen(false);
  }, [openedGone]);

  /** When it was sent, for its sheet: its time today, else its day too. */
  function when(at: string): ReactNode {
    const { time, day } = sentAt(at);
    return day === null
      ? t.rich("image.when", { time, ltr })
      : t.rich("image.whenDay", { time, day, ltr });
  }

  /** The same, heard after its name in the grid ("נשלחה אתמול · 07:41"). */
  function sentWhen(at: string): ReactNode {
    const { time, day } = sentAt(at);
    return day === null
      ? t.rich("image.sent", { time, ltr })
      : t.rich("image.sentDay", { time, day, ltr });
  }

  function sentAt(at: string): { time: string; day: string | null } {
    const time = messageTime(at, chat.timeZone);
    const which = chatDay(dateIn(new Date(at), chat.timeZone), today);
    if (which.kind === "today") return { time, day: null };
    return {
      time,
      day:
        which.kind === "yesterday"
          ? t("day.yesterday")
          : chatShortDate(which.day, today),
    };
  }

  function altOf(picture: DetailsPicture): string {
    if (picture.authorId?.toLowerCase() === chat.readerId.toLowerCase()) {
      return t("image.altOwn");
    }
    const name = picture.authorId
      ? chat.names[picture.authorId.toLowerCase()]
      : null;
    return t("image.alt", { name: name ?? t("list.noName") });
  }

  return (
    <>
      {shown.length === 0 ? (
        <p className="px-1 text-ink-2">{t("details.noPictures")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map((picture) => {
            const alt = altOf(picture);
            return (
              <li key={picture.id} className="min-w-0">
                <MessageImageView
                  size="aspect-square w-full"
                  image={{
                    kind: "shown",
                    src: picture.thumbSrc,
                    alt,
                    detail: sentWhen(picture.createdAt),
                    retry: t("image.retry"),
                    open: {
                      label: t("image.open"),
                      onOpen: (trigger) => {
                        opener.current = trigger;
                        setOpened({
                          id: picture.id,
                          src: picture.fileSrc,
                          alt,
                          caption: picture.body,
                          subtitle: when(picture.createdAt),
                        });
                        setOpen(true);
                      },
                    },
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      <PhotoSheet
        open={open}
        onOpenChange={setOpen}
        photo={opened}
        subtitle={opened?.subtitle}
        closeLabel={t("image.close")}
        loadingLabel={t("image.loading")}
        unavailable={t("image.unavailable")}
        returnFocus={() =>
          opener.current?.isConnected ? opener.current : undefined
        }
      />
    </>
  );
}
