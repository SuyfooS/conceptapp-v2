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

/**
 * The desktop's details column (from 1280px): the conversation's face, who
 * sees it, and its people: a group's members, or a private chat's other
 * person with the way to their profile. Muting and files come with C3 and C4.
 */
export function ChatDetails({
  chat,
  title,
  subtitle,
  className,
}: {
  chat: ChatDemoConversation;
  title: string;
  subtitle: string;
  className?: string;
}) {
  const t = useTranslations("app.chat");
  const person =
    chat.kind === "direct" ? chatDemoPerson(chat.person ?? "") : null;
  const members = chat.members.flatMap((id) => {
    const found = chatDemoPerson(id);
    return found ? [found] : [];
  });
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
      <Card
        padding="lg"
        className="flex flex-col items-center gap-3 text-center"
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
      {person ? (
        <ListGroup>
          <ListRow
            href={`/design/shell/team/${person.id}`}
            leading={<Avatar name={person.name} photo={person.photo} />}
            title={t("details.profile", { name: person.name })}
          />
        </ListGroup>
      ) : (
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
          <PersonList>
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
    </section>
  );
}
