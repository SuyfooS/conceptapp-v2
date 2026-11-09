import type { Role } from "@domain/modules";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import {
  type MeActions,
  type PhotoLock,
  ProfileEditor,
} from "./profile-editor";

export type { MeActions, PhotoLock };

/** What the profile screen shows about the signed-in person. */
export type MeData = {
  /** Their full name, or their number as the sidebar shows it. */
  name: string;
  /** Their photo (`profilePhotoSrc`), or null for initials. */
  photo: string | null;
  role: Role;
  /** The business's zone, for the month they joined. */
  timeZone: string;
  /** When they joined the business (ISO); null while viewing as a role. */
  since: string | null;
  /** Why the photo can't change here, if it can't. */
  locked: PhotoLock | null;
};

/**
 * The profile, `/me`: who the person is to their colleagues, their photo, and
 * the way out of the account (it moved here from Today). Reached from the
 * avatar on Today and, on desktop, the sidebar's foot. Also rendered with
 * mock data on /design/shell/me, where `home` leads back into the demo.
 */
export async function MeView({
  data,
  wording,
  signOut,
  actions,
  notifications,
  home = "/home",
}: {
  data: MeData;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
  /** `signOut`, or the design demo's stand-in. */
  signOut: () => Promise<void>;
  actions: MeActions;
  /** The switch for notifications on this phone, where there is one. */
  notifications?: ReactNode;
  home?: string;
}) {
  const t = translator(wording, "app");
  const format = await getFormatter();
  const role = t(`team.roles.${data.role}`);
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
      photo={data.photo}
      subtitle={subtitle}
      locked={data.locked}
      home={home}
      actions={actions}
      signOut={signOut}
      notifications={notifications}
    />
  );
}
