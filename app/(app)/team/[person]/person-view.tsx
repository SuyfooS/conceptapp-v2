import type { TeamPerson } from "@db/team";
import { avatarHue, firstNameOf } from "@domain/people";
import { displayIsraeliMobile } from "@domain/phone";
import { formArg, type ProfileSaveResult } from "@domain/profile";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import { MessageCircle, Phone } from "lucide-react";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import { ProfileFrame, profileAvatarRing } from "../../me/profile-frame";
import { type AppWording, translator } from "../../wording";
import { roleLabel } from "../role-label";
import type { MemberChangeActions } from "../team-change-types";
import { BioLine, BioState, BioUndo, PersonActions } from "./bio-control";
import {
  type MemberChangesData,
  MemberChangesState,
  MemberLeft,
  MemberRemoval,
  MemberRoleRow,
  WhileOnTeam,
} from "./member-changes";

/**
 * What the viewer may change about the person's place on the team: their
 * role among `roles`, and taking them off it.
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
 * A colleague's profile, `/team/[person]`, as whoever sees the team reads it:
 * the same top as their own /me, in their cover and this business's colour,
 * their line about themselves, a way to call them, and a way to delete a line
 * that is hurtful or out of place. Whoever may invite to their role
 * (`changes`) changes their role and takes them off the team from here
 * (Orel, 14 November 2026); name fixes come later. A minor shows until when
 * (payroll P5): the schedule needs it, and only that day, never a birth date
 * or the rest of their details for payroll. Also rendered with mock data on
 * /design/shell/team/[person].
 */
export async function PersonView({
  data,
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

  // What the page offers while they are on the team.
  const offers = (
    <>
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
        role={changes ? <MemberRoleRow /> : null}
        clearLabel={t("team.person.clearBio")}
        clearHint={t("team.person.clearBioHint", { name: first, form })}
      />
      {changes ? <MemberRemoval /> : null}
    </>
  );

  return (
    <PageBody className="max-w-5xl">
      <BioState
        personId={data.userId}
        bio={data.bio}
        canClear={canClear}
        clearBio={clearBio}
      >
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
              <PageHeader title={name} subtitle={subtitle} />
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
      </BioState>
    </PageBody>
  );
}
