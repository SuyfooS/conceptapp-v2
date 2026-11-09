import type { TeamPerson } from "@db/team";
import { avatarHue, firstNameOf } from "@domain/people";
import { displayIsraeliMobile } from "@domain/phone";
import { formArg, type ProfileSaveResult } from "@domain/profile";
import { ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import { Phone } from "lucide-react";
import { getFormatter } from "next-intl/server";
import { ProfileFrame, profileAvatarRing } from "../../me/profile-frame";
import { type AppWording, translator } from "../../wording";
import { BioLine, BioState, BioUndo, PersonActions } from "./bio-control";

/**
 * A colleague's profile, `/team/[person]`, as an owner or manager reads it:
 * the same top as their own /me, in their cover and this business's colour,
 * their line about themselves, a way to call them, and a way to delete a line
 * that is hurtful or out of place. The first part of the person page; role
 * changes, deactivation and name fixes come later. Also rendered with mock
 * data on /design/shell/team/[person].
 */
export async function PersonView({
  data,
  timeZone,
  canClear,
  clearBio,
  teamHref,
  wording,
}: {
  data: TeamPerson;
  /** The business's zone, for the month they joined. */
  timeZone: string;
  /** The viewer may delete this person's line (`mayClearBio`, not viewing). */
  canClear: boolean;
  /** `clearBioAction`, or the design demo's stand-in. */
  clearBio: (personId: string, seenBio: string) => Promise<ProfileSaveResult>;
  /** Where "back" leads: the Team screen, or the demo's. */
  teamHref: string;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const format = await getFormatter();
  const name = data.name ?? t("team.noName");
  const first = data.name ? firstNameOf(data.name) : name;
  const form = formArg(data.addressForm);
  const subtitle = t("me.since", {
    role: t(`team.roles.${data.role}`),
    date: format.dateTime(new Date(data.since), {
      month: "long",
      year: "numeric",
      timeZone,
    }),
  });

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
          <PersonActions
            call={
              data.phone ? (
                <ListRow
                  href={`tel:${data.phone}`}
                  leading={<Phone />}
                  title={t("team.person.call", { name: first })}
                  subtitle={
                    <span dir="ltr">{displayIsraeliMobile(data.phone)}</span>
                  }
                />
              ) : null
            }
            clearLabel={t("team.person.clearBio")}
            clearHint={t("team.person.clearBioHint", { name: first, form })}
          />
        </ProfileFrame>
      </BioState>
    </PageBody>
  );
}
