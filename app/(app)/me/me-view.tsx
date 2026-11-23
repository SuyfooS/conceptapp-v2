import type { Role } from "@domain/modules";
import type { NamedRole } from "@domain/role-access";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import type { SignOutAction } from "@/app/sign-out-form";
import { roleLabel } from "../team/role-label";
import { type AppWording, translator } from "../wording";
import {
  type AboutLock,
  type MeAbout,
  type MeActions,
  type PhotoLock,
  ProfileEditor,
} from "./profile-editor";

export type { AboutLock, MeAbout, MeActions, PhotoLock };

/** What the profile screen shows about the signed-in person. */
export type MeData = {
  /**
   * Their name as the business shows them (its own for them, else theirs),
   * or their number as the sidebar shows it.
   */
  name: string;
  /** Their own name (`profiles.full_name`), the one "השם שלי" changes; null for none. */
  ownName: string | null;
  /**
   * The name the business keeps for them over their own (`keptNameOf`),
   * which "השם שלי" doesn't change; null for none.
   */
  keptName: string | null;
  /** Their photo (`profilePhotoSrc`), or null for initials. */
  photo: string | null;
  role: Role;
  /**
   * The role the business named that they hold, built on `role` (the roles
   * plan's R11b): said by its name, as their colleagues read it. Null or
   * missing for none.
   */
  namedRole?: Pick<NamedRole, "name"> | null;
  /** Whose colour the covers are drawn in. */
  businessName: string;
  /** The business's zone, for the month they joined. */
  timeZone: string;
  /** When they joined the business (ISO); null while viewing as a role. */
  since: string | null;
  /** Why the photo can't change here, if it can't. */
  locked: PhotoLock | null;
  /** The line about them, the cover and the form of address. */
  about: MeAbout;
};

/**
 * The profile, `/me`: who the person is to their colleagues (their photo, a
 * line about them, a cover in the business's colour, how the app addresses
 * them) and the way out of the account (it moved here from Today). Reached
 * from the avatar on Today and, on desktop, the sidebar's foot. Also rendered
 * with mock data on /design/shell/me, where `home` leads back into the demo.
 */
export async function MeView({
  data,
  wording,
  signOut,
  actions,
  notifications,
  businesses,
  documents,
  modes,
  file,
  past,
  home = "/home",
}: {
  data: MeData;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
  /** `signOut`, or the design demo's stand-in. */
  signOut: SignOutAction;
  actions: MeActions;
  /** The way to the notification settings, where there is one. */
  notifications?: ReactNode;
  /** The switch between businesses, for someone in more than one. */
  businesses?: ReactNode;
  /** "המסמכים שלי" (chat C7), where documents are the person's. */
  documents?: ReactNode;
  /** The ways into the modes the person is in (waiter mode, P4). */
  modes?: ReactNode;
  /** The person's own hiring file (profile H5a), where it is on for them. */
  file?: ReactNode;
  /** The businesses they left whose file they can still read (profile H5c). */
  past?: ReactNode;
  home?: string;
}) {
  const t = translator(wording, "app");
  const format = await getFormatter();
  // A role the business named by its name, with its base, as the team
  // screen says it of them (R11b).
  const role = roleLabel(t, data.role, data.namedRole);
  const subtitle = data.since
    ? t("me.since", {
        role,
        date: format.dateTime(new Date(data.since), {
          month: "long",
          year: "numeric",
          timeZone: data.timeZone,
        }),
      })
    : role;

  return (
    <ProfileEditor
      name={data.name}
      ownName={data.ownName}
      keptName={data.keptName}
      photo={data.photo}
      subtitle={subtitle}
      locked={data.locked}
      about={data.about}
      businessName={data.businessName}
      home={home}
      actions={actions}
      signOut={signOut}
      notifications={notifications}
      businesses={businesses}
      documents={documents}
      modes={modes}
      file={file}
      past={past}
    />
  );
}
