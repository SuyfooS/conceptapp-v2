import { messageTime } from "@domain/chat-days";
import { chatFileSize, DEFAULT_CHAT_FILE_DAYS } from "@domain/chat-files";
import { AttachmentList } from "@ui/attachment-chip";
import { Avatar } from "@ui/avatar";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { VisibilityNote } from "@ui/visibility-note";
import { Building, Clock3, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  CHAT_DEMO_READER,
  CHAT_DEMO_ZONE,
  type ChatDemoConversation,
  chatDemoPerson,
} from "./data";
import { DemoMute } from "./demo-mute";
import { demoPdfHref } from "./demo-pdf";
import { DemoPictures } from "./demo-pictures";

type DetailsProps = {
  chat: ChatDemoConversation;
  title: string;
  subtitle: string;
};

/**
 * A conversation's details in the demo, the same in their three places as
 * the app's (ChatDetailsBody): the phone's /design/chat/<id>/info, the
 * tablet's sheet from the title (`inSheet`: a sheet's cards) and the
 * desktop's column. Its face and who sees it, mute (C3), and its people: a
 * group's members, or a private chat's other person with the way to their
 * profile; its latest pictures and PDFs, newest first, and how long they are
 * kept (C4, C5).
 */
export function ChatDemoDetailsBody({
  chat,
  title,
  subtitle,
  inSheet = false,
}: DetailsProps & { inSheet?: boolean }) {
  const t = useTranslations("app.chat");
  const format = useFormatter();
  const surface = inSheet ? "bg-elevated shadow-none" : undefined;
  const person =
    chat.kind === "direct" ? chatDemoPerson(chat.person ?? "") : null;
  const members = chat.members.flatMap((id) => {
    const found = chatDemoPerson(id);
    return found ? [found] : [];
  });
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const pictures = chat.messages
    .filter((m) => m.photo && !m.removedBy)
    .reverse()
    .map((m) => ({
      id: m.id,
      src: m.photo ?? "",
      alt:
        m.author === CHAT_DEMO_READER
          ? t("image.altOwn")
          : t("image.alt", { name: chatDemoPerson(m.author)?.name ?? "" }),
      caption: m.body,
      time: messageTime(m.at, CHAT_DEMO_ZONE),
    }));
  const pdfs = chat.messages
    .filter((m) => m.pdf && !m.removedBy)
    .reverse()
    .flatMap((m) => {
      if (!m.pdf) return [];
      const size = chatFileSize(m.pdf.size);
      const value = format.number(size.value, { maximumFractionDigits: 1 });
      return [
        {
          id: m.id,
          name: m.pdf.name,
          meta:
            size.unit === "mb"
              ? t.rich("pdf.sizeMb", { size: value, ltr })
              : t.rich("pdf.sizeKb", { size: value, ltr }),
          detail: t.rich("pdf.sent", {
            name:
              m.author === CHAT_DEMO_READER
                ? t("pdf.me")
                : (chatDemoPerson(m.author)?.name ?? ""),
            time: messageTime(m.at, CHAT_DEMO_ZONE),
            ltr,
          }),
        },
      ];
    });
  return (
    <>
      <Card
        padding="lg"
        className={cn("flex flex-col items-center gap-3 text-center", surface)}
      >
        {person ? (
          <Avatar name={person.name} photo={person.photo} size="xl" />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-24 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-10"
          >
            {chat.kind === "team" ? <Building /> : <Users />}
          </span>
        )}
        <h2 className="text-balance font-bold text-lg">{title}</h2>
        {person ? <p className="text-ink-2 text-sm">{person.line}</p> : null}
        <VisibilityNote
          icon={chat.kind === "direct" ? "lock" : "eye"}
          className="text-start"
        >
          {subtitle}
        </VisibilityNote>
      </Card>
      <ListGroup className={surface}>
        {person ? (
          <ListRow
            href={`/design/shell/team/${person.id}`}
            leading={<Avatar name={person.name} photo={person.photo} />}
            title={t("details.profile", { name: person.name })}
          />
        ) : null}
        <DemoMute muted={chat.muted ?? false} />
      </ListGroup>
      {person ? null : (
        <PageSection
          title={
            chat.kind === "department"
              ? t("details.departmentMembers")
              : t("details.members")
          }
          action={
            <span className="text-ink-2 text-sm">
              {t("details.membersCount", { count: members.length })}
            </span>
          }
        >
          <PersonList className={surface}>
            {members.map((member) => (
              <PersonRow
                key={member.id}
                name={member.name}
                photo={member.photo}
                title={member.name}
                subtitle={member.line}
              />
            ))}
          </PersonList>
          {/* Management reads every department's group, as the app says. */}
          {chat.kind === "department" ? (
            <VisibilityNote className="px-1">
              {t("details.alsoManagement")}
            </VisibilityNote>
          ) : null}
        </PageSection>
      )}
      <PageSection title={t("details.files")}>
        {pictures.length === 0 && pdfs.length === 0 ? (
          <p className="px-1 text-ink-2">{t("details.noFiles")}</p>
        ) : null}
        {pictures.length > 0 ? <DemoPictures pictures={pictures} /> : null}
        {pdfs.length > 0 ? (
          <AttachmentList
            className={surface}
            files={pdfs.map((pdf) => ({
              id: pdf.id,
              name: pdf.name,
              meta: pdf.meta,
              detail: pdf.detail,
              href: demoPdfHref("ConceptApp demo"),
              saveAs: pdf.name,
              label: t("pdf.download"),
            }))}
          />
        ) : null}
        <p className="flex items-start gap-1.5 px-1 text-ink-2 text-sm">
          <Clock3 aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span className="min-w-0">
            {t.rich("info.filesKept", { days: DEFAULT_CHAT_FILE_DAYS, ltr })}
          </span>
        </p>
      </PageSection>
    </>
  );
}

/** The desktop's details column (from 1280px): the details beside the conversation. */
export function ChatDetails({
  className,
  ...props
}: DetailsProps & { className?: string }) {
  const t = useTranslations("app.chat");
  return (
    <section
      aria-label={t("details.label")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a column that may scroll with nothing to focus inside must take the keyboard itself (axe scrollable-region-focusable)
      tabIndex={0}
      className={cn(
        "flex flex-col gap-6 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <ChatDemoDetailsBody {...props} />
    </section>
  );
}
