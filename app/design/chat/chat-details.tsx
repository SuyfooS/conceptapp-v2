import { Avatar } from "@ui/avatar";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { PersonList, PersonRow } from "@ui/person-row";
import { VisibilityNote } from "@ui/visibility-note";
import { Building, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChatDemoConversation, chatDemoPerson } from "./data";
import { DemoMute } from "./demo-mute";

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
 * profile. Files come with C4.
 */
export function ChatDemoDetailsBody({
  chat,
  title,
  subtitle,
  inSheet = false,
}: DetailsProps & { inSheet?: boolean }) {
  const t = useTranslations("app.chat");
  const surface = inSheet ? "bg-elevated shadow-none" : undefined;
  const person =
    chat.kind === "direct" ? chatDemoPerson(chat.person ?? "") : null;
  const members = chat.members.flatMap((id) => {
    const found = chatDemoPerson(id);
    return found ? [found] : [];
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
