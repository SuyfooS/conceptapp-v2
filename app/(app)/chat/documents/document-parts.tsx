"use client";

import { dateIn } from "@domain/availability";
import { chatShortDate, messageTime } from "@domain/chat-days";
import type {
  DocumentCategory,
  DocumentReader,
  DocumentRemoveReason,
} from "@domain/documents";
import {
  type DocumentShown,
  ownMark,
  recipientsSummary,
  stateFor,
} from "@domain/documents-screen";
import { Badge, type BadgeProps } from "@ui/badge";
import { ListRow } from "@ui/list-row";
import {
  ClipboardList,
  File,
  FilePen,
  FilePenLine,
  ReceiptText,
  Stethoscope,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { DocumentClock, DocumentPeople } from "./document-screen-types";

/*
 * What every documents screen shares on the browser (chat C7): the words a
 * document is told in (who it is from or to, when, where it stands for the
 * reader) and its row in a list. Its category's icon is drawn, never a
 * picture of its file: a list opens nothing.
 */

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** A category's icon. */
export function categoryIcon(category: DocumentCategory): ReactNode {
  switch (category) {
    case "sick_note":
      return <Stethoscope />;
    case "payslip":
      return <ReceiptText />;
    case "contract":
      return <FilePenLine />;
    case "procedure":
      return <ClipboardList />;
    case "form":
      return <FilePen />;
    case "other":
      return <File />;
    default: {
      const unhandled: never = category;
      return unhandled;
    }
  }
}

/** The words of documents, for one screen's people and clock. */
export function useDocumentWords(people: DocumentPeople, clock: DocumentClock) {
  const t = useTranslations("app.chat.documents");

  /** Someone's name, or what they are called without one. */
  function name(id: string | null): string {
    const person = id ? people[id.toLowerCase()] : undefined;
    if (person?.name) return person.name;
    return person?.former ? t("former") : t("noName");
  }

  /**
   * Someone with no name who is still here: the words that put "מ" or "ל"
   * before a name have their own for them ("מאדם בלי שם", never "מבלי שם").
   * Someone who left reads well glued ("ממי שכבר לא בצוות").
   */
  function nameless(id: string | null): boolean {
    const person = id ? people[id.toLowerCase()] : undefined;
    return !person?.name && !person?.former;
  }

  /** A day as the lists write it ("12.11", or with its year). */
  function day(iso: string | null): string {
    if (!iso) return "";
    return chatShortDate(dateIn(new Date(iso), clock.timeZone), clock.today);
  }

  /** A time of day on the business's clock ("08:05"). */
  function time(iso: string | null): string {
    return iso ? messageTime(iso, clock.timeZone) : "";
  }

  function category(document: Pick<DocumentShown, "category">): string {
    return t(`categories.${document.category}`);
  }

  function reason(code: DocumentRemoveReason | null): string {
    return t(`reasons.${code ?? "other"}`);
  }

  /**
   * Who a document is from or to, for its reader: their own to the business
   * ("לעסק"), someone's for the office ("מנועה כהן"), the business's to them
   * ("מהעסק"), or to whom it went for its sender and the office.
   */
  function who(document: DocumentShown, reader: DocumentReader): string {
    const me = reader.id.toLowerCase();
    if (document.direction === "from_person") {
      if (document.personId?.toLowerCase() === me) return t("row.toBusiness");
      return nameless(document.personId)
        ? t("row.fromNoName")
        : t("row.fromPerson", { name: name(document.personId) });
    }
    if (ownMark(document, reader) && document.authorId?.toLowerCase() !== me) {
      return t("row.fromBusiness");
    }
    const [only, ...more] = document.recipients;
    if (!only || more.length > 0) {
      return t("row.toMany", { count: document.recipients.length });
    }
    return nameless(only.personId)
      ? t("row.toNoName")
      : t("row.toPerson", { name: name(only.personId) });
  }

  /** Where a document stands for its reader, as a badge's words and tone. */
  function state(
    document: DocumentShown,
    reader: DocumentReader,
  ): { text: ReactNode; tone: NonNullable<BadgeProps["tone"]> } {
    const now = stateFor(document, reader);
    const mark = ownMark(document, reader);
    switch (now) {
      case "removed":
        return {
          text: t("removed", { reason: reason(document.removedReason) }),
          tone: "neutral",
        };
      case "sent": {
        if (document.direction === "from_person") {
          return { text: t("state.sent"), tone: "neutral" };
        }
        const marks = recipientsSummary(document.recipients);
        const count = document.asksConfirmation
          ? marks.confirmed
          : marks.opened;
        return {
          text: t.rich(
            document.asksConfirmation ? "state.confirms" : "state.opens",
            { count, total: marks.total, ltr },
          ),
          tone: count === marks.total ? "success" : "neutral",
        };
      }
      case "received":
        return document.direction === "from_person"
          ? {
              text: t.rich("state.received", {
                date: day(document.openedAt),
                ltr,
              }),
              tone: "success",
            }
          : {
              text: t.rich("state.opened", {
                date: day(mark?.openedAt ?? null),
                ltr,
              }),
              tone: "neutral",
            };
      case "waiting":
        return document.direction === "from_person"
          ? { text: t("state.waiting"), tone: "accent" }
          : { text: t("state.new"), tone: "accent" };
      case "toConfirm":
        return { text: t("state.toConfirm"), tone: "warning" };
      case "confirmed":
        return {
          text: t.rich("state.confirmed", {
            date: day(mark?.confirmedAt ?? null),
            ltr,
          }),
          tone: "success",
        };
      default: {
        const unhandled: never = now;
        return unhandled;
      }
    }
  }

  return { t, name, nameless, day, time, category, reason, who, state };
}

export type DocumentWords = ReturnType<typeof useDocumentWords>;

/** A document's state, as a badge. */
export function DocumentStateBadge({
  document,
  reader,
  words,
}: {
  document: DocumentShown;
  reader: DocumentReader;
  words: DocumentWords;
}) {
  const { text, tone } = words.state(document, reader);
  return <Badge tone={tone}>{text}</Badge>;
}

/**
 * A document's row: its category's icon, its title, who it is from or to and
 * when, and where it stands under them, to its page. At least 64px; its
 * words wrap.
 */
export function DocumentListRow({
  document,
  reader,
  words,
  href,
  current = false,
}: {
  document: DocumentShown;
  reader: DocumentReader;
  words: DocumentWords;
  href: string;
  current?: boolean;
}) {
  return (
    <ListRow
      href={href}
      current={current}
      leading={categoryIcon(document.category)}
      title={<span dir="auto">{document.title}</span>}
      subtitle={
        <span className="flex flex-col items-start gap-1.5 pt-0.5">
          <span>
            {words.t.rich("row.when", {
              who: words.who(document, reader),
              date: words.day(document.sentAt),
              ltr,
            })}
          </span>
          <DocumentStateBadge
            document={document}
            reader={reader}
            words={words}
          />
        </span>
      }
    />
  );
}

/** A file's size as people read it: KB under a megabyte, else MB with one decimal. */
export function documentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
