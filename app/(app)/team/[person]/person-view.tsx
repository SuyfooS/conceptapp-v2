import type { TeamPerson } from "@db/team";
import type { FileStatus } from "@domain/employee-file";
import { fileLineOf } from "@domain/file-holders";
import { avatarHue, firstNameOf } from "@domain/people";
import { displayIsraeliMobile } from "@domain/phone";
import { formArg, type ProfileSaveResult } from "@domain/profile";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import { CircleCheck, FolderLock, MessageCircle, Phone } from "lucide-react";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import { ProfileFrame, profileAvatarRing } from "../../me/profile-frame";
import { type AppWording, type Translator, translator } from "../../wording";
import { type Format, groupsWords } from "../file-lines";
import { roleLabel } from "../role-label";
import type { MemberChangeActions } from "../team-change-types";
import { BioLine, BioState, BioUndo, PersonActions } from "./bio-control";
import { FileCard, type FileCardWords } from "./file-card";
import {
  type MemberChangesData,
  MemberChangesState,
  MemberLeft,
  MemberRemoval,
  WhileOnTeam,
} from "./member-changes";
import { MemberNameState, ShownName, TeamPlace } from "./member-name";

/**
 * What the viewer may change about the person's place on the team: the name
 * the business shows for them, their role among `roles`, and taking them off
 * it.
 */
export type PersonChanges = Pick<
  MemberChangesData,
  | "roles"
  | "beyond"
  | "namedRoles"
  | "ownerOnly"
  | "pay"
  | "ahead"
  | "clockedIn"
  | "clockHref"
  | "scheduleHref"
> & { actions: MemberChangeActions };

/**
 * How complete the person's hiring file is, for whoever sees the team or
 * holds the files (profile H6a, `currentTeamFiles`): a holder's words or a
 * count, never a value.
 */
export type FileCardData = {
  status: FileStatus;
  /** Holder words (the database's detail), or counts. */
  reader: "holder" | "team";
  /** The ConceptApp team viewing as a role: counts only, and says so. */
  viewing: boolean;
  /** The file's own screen, for a holder. */
  fileHref: string | null;
  /** The link to complete it may be sent: never while viewing. */
  share: boolean;
  businessName: string;
  form101: boolean;
};

/**
 * The card's words while anything needs action (a part missing, or for a
 * holder an account to look at), or null for a file that is complete.
 */
export function fileCardWords(
  t: Translator<"app">,
  format: Format,
  card: FileCardData,
  name: string,
  first: string,
): FileCardWords | null {
  const line = fileLineOf(card.status);
  const missing = line.kind !== "complete";
  const review = line.kind !== "count" && line.bankReview !== null;
  if (!missing && !review) return null;
  const lines = [
    line.kind === "groups"
      ? t("team.file.card.missingGroups", {
          groups: groupsWords(t, format, line.groups),
        })
      : line.kind === "count"
        ? t("team.file.card.missingCount", { count: line.count })
        : null,
    review ? t("team.file.card.bankReview") : null,
  ].filter((text): text is string => text !== null);
  return {
    title: t("team.file.card.title", { name }),
    lines,
    note: card.viewing
      ? t("team.file.viewing")
      : card.reader === "holder"
        ? null
        : t("team.file.card.onlyHolders"),
    share:
      missing && card.share
        ? {
            label: t("team.file.card.share"),
            title: t("team.file.card.shareTitle"),
            message: t("team.file.card.shareMessage", {
              first,
              business: card.businessName,
            }),
          }
        : null,
    open: card.fileHref
      ? { href: card.fileHref, label: t("team.file.card.open") }
      : null,
  };
}

/**
 * A colleague's profile, `/team/[person]`, as whoever sees the team reads it:
 * the same top as their own /me, in their cover and this business's colour,
 * their line about themselves, a way to call them, and a way to delete a line
 * that is hurtful or out of place. Whoever may invite to their role
 * (`changes`) changes their role and takes them off the team from here
 * (Orel, 14 November 2026), and fixes the name the business shows for them:
 * the business's own name for them, shown everywhere in it and only in it,
 * their own name untouched (ROADMAP "תיקון שם"). A minor shows until when
 * (payroll P5): the schedule needs it, and only that day, never a birth date
 * or the rest of their details for payroll. While the hiring file is on
 * (H6a, `fileCard`), a manager's or a worker's file comes first: the page's
 * one accent card while anything is missing, with "שליחת קישור להשלמה" and,
 * for a holder, "פתיחת התיק"; a quiet row once it is complete. Also
 * rendered with mock data on /design/shell/team/[person].
 */
export async function PersonView({
  data,
  fileCard = null,
  youthUntil = null,
  timeZone,
  canClear,
  clearBio,
  teamHref,
  messageHref = null,
  changes = null,
  wording,
}: {
  data: TeamPerson;
  /** How complete their hiring file is (H6a); null with none to show. */
  fileCard?: FileCardData | null;
  /** A minor's 18th birthday, from `public.team_youth`; null for an adult. */
  youthUntil?: string | null;
  /** The business's zone, for the month they joined. */
  timeZone: string;
  /** The viewer may delete this person's line (`mayClearBio`, not viewing). */
  canClear: boolean;
  /** `clearBioAction`, or the design demo's stand-in. */
  clearBio: (personId: string, seenBio: string) => Promise<ProfileSaveResult>;
  /** Where "back" leads: the Team screen, or the demo's. */
  teamHref: string;
  /**
   * Their private chat with the viewer (`/chat/with/<id>`), when the viewer
   * is in chat and they are on the staff; null otherwise, and while viewing.
   */
  messageHref?: string | null;
  /**
   * Their role and their place on the team, when the viewer may change them
   * (`canRemoveMember`, not viewing, a business that takes invites); null
   * otherwise.
   */
  changes?: PersonChanges | null;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const format = await getFormatter();
  const name = data.name ?? t("team.noName");
  const first = data.name ? firstNameOf(data.name) : name;
  const form = formArg(data.addressForm);
  const subtitle = t("me.since", {
    // A role the business named by its name, with its base (R11b).
    role: roleLabel(t, data.role, data.namedRole),
    date: format.dateTime(new Date(data.since), {
      month: "long",
      year: "numeric",
      timeZone,
    }),
  });

  const cardWords = fileCard
    ? fileCardWords(t, format, fileCard, name, first)
    : null;
  // A complete file: a quiet row, the file's own screen for a holder.
  const fileRow =
    fileCard && !cardWords ? (
      <ListGroup>
        {fileCard.fileHref ? (
          <ListRow
            href={fileCard.fileHref}
            leading={<FolderLock />}
            title={t("team.file.card.completeRow")}
            subtitle={t("team.file.card.open")}
          />
        ) : (
          <ListRow
            leading={<CircleCheck />}
            title={t("team.file.line.complete")}
          />
        )}
      </ListGroup>
    ) : null;

  // What the page offers while they are on the team.
  const offers = (
    <>
      {cardWords ? <FileCard words={cardWords} /> : fileRow}
      {youthUntil ? (
        <ListGroup>
          <ListRow
            title={t.rich("team.person.youth", {
              ltr: (chunks: ReactNode) => <span dir="ltr">{chunks}</span>,
              until: format.dateTime(new Date(`${youthUntil}T12:00:00Z`), {
                month: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }),
            })}
            subtitle={t("team.person.youthHint")}
          />
        </ListGroup>
      ) : null}
      <PersonActions
        call={
          messageHref || data.phone ? (
            <>
              {messageHref ? (
                <ListRow
                  href={messageHref}
                  leading={<MessageCircle />}
                  title={t("team.person.message")}
                />
              ) : null}
              {data.phone ? (
                <ListRow
                  href={`tel:${data.phone}`}
                  leading={<Phone />}
                  title={t("team.person.call", { name: first })}
                  subtitle={
                    <span dir="ltr">{displayIsraeliMobile(data.phone)}</span>
                  }
                />
              ) : null}
            </>
          ) : null
        }
        place={changes ? <TeamPlace /> : null}
        clearLabel={t("team.person.clearBio")}
        clearHint={t("team.person.clearBioHint", { name: first, form })}
      />
      {changes ? <MemberRemoval /> : null}
    </>
  );

  const frame = (
    <ProfileFrame
      label={name}
      cover={data.cover}
      hue={avatarHue(data.name ?? "")}
      back={{ href: teamHref, label: t("team.title") }}
      avatar={
        <PersonAvatar
          name={data.name}
          photo={data.photo}
          size="xl"
          className={profileAvatarRing}
        />
      }
      identity={
        <>
          <PageHeader
            // The name a fix just wrote, before the page is read again.
            title={changes ? <ShownName none={t("team.noName")} /> : name}
            subtitle={subtitle}
          />
          <BioLine noBio={t("team.person.noBio", { name: first, form })} />
          <BioUndo message={t("team.person.bioCleared", { name })} />
        </>
      }
    >
      {changes ? (
        <MemberChangesState
          data={{
            personId: data.userId,
            name,
            first,
            form,
            role: {
              role: data.role,
              namedRole: data.namedRole?.id ?? null,
            },
            teamHref,
            roles: changes.roles,
            beyond: changes.beyond,
            namedRoles: changes.namedRoles,
            ownerOnly: changes.ownerOnly,
            pay: changes.pay,
            ahead: changes.ahead,
            clockedIn: changes.clockedIn,
            clockHref: changes.clockHref,
            scheduleHref: changes.scheduleHref,
          }}
          actions={changes.actions}
        >
          <WhileOnTeam>{offers}</WhileOnTeam>
          <MemberLeft />
        </MemberChangesState>
      ) : (
        offers
      )}
    </ProfileFrame>
  );

  return (
    <PageBody className="max-w-5xl">
      <BioState
        personId={data.userId}
        bio={data.bio}
        canClear={canClear}
        clearBio={clearBio}
      >
        {changes ? (
          <MemberNameState
            personId={data.userId}
            name={data.name}
            rename={changes.actions.rename}
          >
            {frame}
          </MemberNameState>
        ) : (
          frame
        )}
      </BioState>
    </PageBody>
  );
}
