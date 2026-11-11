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
import type { ChatActionResult } from "./chat-types";
import { MuteSwitch } from "./mute-switch";

/** Someone the details column lists. */
export type DetailsPerson = {
  id: string;
  name: string | null;
  photo: string | null;
  /** Their role or departments. */
  line: string | null;
};

/** What a conversation's details show, in all three of their places. */
export type ChatDetailsProps = {
  /** Null for a private chat its first message hasn't made yet: nothing to mute. */
  conversation: string | null;
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
  /** "בלי התראות מהשיחה הזאת" (C3), bound to the business. */
  mute: (conversation: string, muted: boolean) => Promise<ChatActionResult>;
  /** The business's words. */
  wording: AppWording;
};

/**
 * A conversation's details (plan §11.3): its face and who sees it, the way to
 * the other person's profile in a private chat (for an owner or manager),
 * mute, its people (the whole team, or a department's people and the line
 * that management reads every department's group too), and who sees what in
 * chat, the notice again (in a demo business, as it is there). The same on
 * the phone's /chat/<id>/info, in the tablet's sheet and in the desktop's
 * column; in the sheet its cards are a sheet's (`inSheet`). Files come with
 * C4.
 */
export function ChatDetailsBody({
  conversation,
  kind,
  title,
  subtitle,
  person,
  profileHref,
  members,
  businessName,
  fileDays,
  demo,
  mute,
  wording,
  headingLevel = "h2",
  inSheet = false,
}: ChatDetailsProps & {
  headingLevel?: "h1" | "h2";
  /** In a sheet (the tablet's): cards in a sheet's own colour, no shadow. */
  inSheet?: boolean;
}) {
  const t = translator(wording, "app.chat");
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const Heading = headingLevel;
  const surface = inSheet ? "bg-elevated shadow-none" : undefined;
  return (
    <>
      <Card
        padding="lg"
        className={cn("flex flex-col items-center gap-3 text-center", surface)}
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
        <Heading className="text-balance font-bold text-lg">{title}</Heading>
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
      {(person && profileHref) || conversation ? (
        <ListGroup className={surface}>
          {person && profileHref ? (
            <ListRow
              href={profileHref}
              leading={<PersonAvatar name={person.name} photo={person.photo} />}
              title={t("details.profile", { name: title })}
            />
          ) : null}
          {conversation ? (
            <MuteSwitch conversation={conversation} mute={mute} />
          ) : null}
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
          <PersonList className={surface}>
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
            <PersonList className={surface}>
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
        <Card padding="lg" className={surface}>
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
    </>
  );
}

/**
 * The desktop's details column (from 1280px): the details beside the
 * conversation. Phones open /chat/<id>/info, tablets a sheet from the title.
 */
export function ChatDetails(props: ChatDetailsProps) {
  const t = translator(props.wording, "app.chat");
  return (
    <section
      aria-label={t("details.label")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a column that may scroll with nothing to focus inside must take the keyboard itself (axe scrollable-region-focusable)
      tabIndex={0}
      className={cn(
        "hidden flex-col gap-6 rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        // Its parts keep their height and the column scrolls: in a capped
        // flex column a part that clips (the mute row's group) would shrink
        // to nothing.
        "xl:sticky xl:top-8 xl:flex xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:pb-4 [&>*]:shrink-0",
      )}
    >
      <ChatDetailsBody {...props} />
    </section>
  );
}
