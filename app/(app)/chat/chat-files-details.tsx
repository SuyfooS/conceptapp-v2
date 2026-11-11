"use client";

import { dateIn } from "@domain/availability";
import { chatDay, chatShortDate, messageTime } from "@domain/chat-days";
import { chatFileSize } from "@domain/chat-files";
import { AttachmentList } from "@ui/attachment-chip";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ChatPicturesGrid, type DetailsPicture } from "./chat-pictures-grid";
import { useChat } from "./chat-provider";

/** A PDF of the conversation, as its details show it (`ChatPdf` in @db/chat-files). */
export type DetailsPdf = {
  id: string;
  authorId: string | null;
  /** ISO instant. */
  createdAt: string;
  body: string | null;
  /** Its name as kept; null when none was. */
  name: string | null;
  /** In bytes. */
  size: number | null;
  /** Its download, the app's own route. */
  fileSrc: string;
};

/**
 * A conversation's latest files in its details (C4, C5): its pictures, each
 * opening the whole of it, then its PDFs, newest first, in one card a row
 * each (`AttachmentList`), each a download with who sent it and when. The
 * server drew them: what the conversation on screen shows as removed, or as
 * no longer kept, leaves at once (`filesGone`); with nothing left, it says
 * there are no files yet.
 */
export function ChatDetailsFiles({
  pictures,
  pdfs,
  surface,
}: {
  pictures: readonly DetailsPicture[];
  pdfs: readonly DetailsPdf[];
  /** The PDFs' card, as the page's other lists: in a sheet, a sheet's card's. */
  surface?: string;
}) {
  const t = useTranslations("app.chat");
  const format = useFormatter();
  const chat = useChat();
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const today = dateIn(new Date(chat.now), chat.timeZone);
  const kept = (id: string) => !chat.filesGone.has(id.toLowerCase());
  const shownPdfs = pdfs.filter((pdf) => kept(pdf.id));
  const anyPicture = pictures.some((picture) => kept(picture.id));

  function meta(size: number | null): ReactNode {
    if (size === null) return null;
    const shown = chatFileSize(size);
    const value = format.number(shown.value, { maximumFractionDigits: 1 });
    return shown.unit === "mb"
      ? t.rich("pdf.sizeMb", { size: value, ltr })
      : t.rich("pdf.sizeKb", { size: value, ltr });
  }

  /** Who sent it and when: "נועה כהן · אתמול · 07:41". */
  function sent(pdf: DetailsPdf): ReactNode {
    const own = pdf.authorId?.toLowerCase() === chat.readerId.toLowerCase();
    const name = own
      ? t("pdf.me")
      : ((pdf.authorId ? chat.names[pdf.authorId.toLowerCase()] : null) ??
        t("list.noName"));
    const time = messageTime(pdf.createdAt, chat.timeZone);
    const which = chatDay(
      dateIn(new Date(pdf.createdAt), chat.timeZone),
      today,
    );
    if (which.kind === "today") {
      return t.rich("pdf.sent", { name, time, ltr });
    }
    const day =
      which.kind === "yesterday"
        ? t("day.yesterday")
        : chatShortDate(which.day, today);
    return t.rich("pdf.sentDay", { name, time, day, ltr });
  }

  return (
    <>
      {!anyPicture && shownPdfs.length === 0 ? (
        <p className="px-1 text-ink-2">{t("details.noFiles")}</p>
      ) : null}
      <ChatPicturesGrid pictures={pictures} />
      {shownPdfs.length > 0 ? (
        <AttachmentList
          className={surface}
          files={shownPdfs.map((pdf) => ({
            id: pdf.id,
            name: pdf.name ?? t("pdf.unnamed"),
            meta: meta(pdf.size),
            detail: sent(pdf),
            href: pdf.fileSrc,
            label: t("pdf.download"),
          }))}
        />
      ) : null}
    </>
  );
}
