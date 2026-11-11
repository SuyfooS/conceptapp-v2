import type { ChatKind } from "@domain/chat";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { PersonAvatar, PersonList, PersonRow } from "@ui/person-row";
import { VisibilityNote } from "@ui/visibility-note";
import { Building, Users } from "lucide-react";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import { WhoSeesLines } from "./chat-notice";

/** Someone the details column lists. */
export type DetailsPerson = {
  id: string;
  name: string | null;
  photo: string | null;
  /** Their role or departments. */
  line: string | null;
};

/**
 * The desktop's details column (from 1280px; phones and tablets get theirs
 * in C3): the conversation's face, who sees it, its people (the whole team,
 * or a department's people and the management that reads every department's
 * group, or a private chat's other person, with the way to their profile for
 * an owner or manager), and who sees what in chat, the notice again (in a
 * demo business, as it is there). Muting and files come with C3 and C4.
 */
export function ChatDetails({
  kind,
  title,
  subtitle,
  person,
  profileHref,
  members,
  businessName,
  fileDays,
  demo,
  wording,
}: {
  kind: ChatKind;
  title: string;
  subtitle: string;
  /** A private chat: the other person. */
  person: DetailsPerson | null;
  /** Their profile, for someone who reads the team; null for anyone else. */
  profileHref: string | null;
  /** A group: the whole staff, or the department's people, now. */
  members: DetailsPerson[];
  businessName: string;
  fileDays: number;
  /** A demo business: anyone at its door reads every chat. */
  demo: boolean;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.chat");
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  return (
    <section
      aria-label={t("details.label")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a column that may scroll with nothing to focus inside must take the keyboard itself (axe scrollable-region-focusable)
      tabIndex={0}
      className={cn(
        "hidden flex-col gap-6 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        "xl:sticky xl:top-8 xl:flex xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:pb-4",
      )}
    >
      <Card
        padding="lg"
        className="flex flex-col items-center gap-3 text-center"
      >
        {person ? (
          <PersonAvatar name={person.name} photo={person.photo} size="xl" />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-24 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-10"
          >
            {kind === "team" ? <Building /> : <Users />}
          </span>
        )}
        <h2 className="text-balance font-bold text-lg">{title}</h2>
        {person?.line ? (
          <p className="text-ink-2 text-sm">{person.line}</p>
        ) : null}
        <VisibilityNote
          icon={kind === "direct" && !demo ? "lock" : "eye"}
          className="text-start"
        >
          {subtitle}
        </VisibilityNote>
      </Card>
      {person && profileHref ? (
        <ListGroup>
          <ListRow
            href={profileHref}
            leading={<PersonAvatar name={person.name} photo={person.photo} />}
            title={t("details.profile", { name: title })}
          />
        </ListGroup>
      ) : null}
      {kind === "team" && members.length > 0 ? (
        <PageSection
          title={t("details.members")}
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
                title={member.name ?? t("list.noName")}
                subtitle={member.line}
              />
            ))}
          </PersonList>
        </PageSection>
      ) : null}
      {kind === "department" ? (
        // Its people, and management: the moderators read every
        // department's group, so who sees it is never only its people.
        <PageSection
          title={t("details.departmentMembers")}
          action={
            members.length > 0 ? (
              <span className="text-ink-2 text-sm">
                {t("details.membersCount", { count: members.length })}
              </span>
            ) : undefined
          }
        >
          {members.length > 0 ? (
            <PersonList>
              {members.map((member) => (
                <PersonRow
                  key={member.id}
                  name={member.name}
                  photo={member.photo}
                  title={member.name ?? t("list.noName")}
                  subtitle={member.line}
                />
              ))}
            </PersonList>
          ) : null}
          <VisibilityNote className="px-1">
            {t("details.alsoManagement")}
          </VisibilityNote>
        </PageSection>
      ) : null}
      <PageSection title={t("notice.title")}>
        <Card padding="lg">
          <WhoSeesLines
            lines={{
              private: demo ? t("notice.demoPrivate") : t("notice.private"),
              groups: t("notice.groups"),
              kept: demo
                ? t("notice.demoKept")
                : t.rich("notice.kept", { days: fileDays, ltr }),
              stored: t("notice.stored", { business: businessName }),
            }}
          />
        </Card>
      </PageSection>
    </section>
  );
}
