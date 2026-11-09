import { photoAllowed } from "@db/profile-photos";
import { pushAllowed } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { displayIsraeliMobile } from "@domain/phone";
import { profilePhotoSrc } from "@domain/profile-photos";
import type { Metadata } from "next";
import { signOut } from "../../(auth)/actions";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import { PushSwitch } from "../notifications/push-switch";
import { baseWording, translator } from "../wording";
import { removeMyPhotoAction, setMyPhotoAction } from "./actions";
import { MeView, type PhotoLock } from "./me-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.me");
  return { title: t("metaTitle") };
}

// The signed-in person's own profile, for everyone in a business.
export default async function MePage() {
  const [member, wording, enabled] = await Promise.all([
    currentMember(),
    currentWording(),
    currentModules(),
  ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  let locked: PhotoLock | null = "viewOnly";
  // Notifications on this phone: not while viewing as someone, and not
  // without the VAPID settings or with the module off.
  const push =
    !member.viewing && enabled.includes("notifications") ? pushConfig() : null;
  let canPush: boolean | null = null;
  if (!member.viewing) {
    const [allowed, pushes] = await Promise.all([
      photoAllowed(member.userId),
      push ? pushAllowed(member.userId) : null,
    ]);
    locked = allowed === "yes" ? null : allowed;
    canPush = pushes;
  }

  return (
    <MeView
      wording={wording}
      signOut={signOut}
      actions={{ setPhoto: setMyPhotoAction, removePhoto: removeMyPhotoAction }}
      notifications={
        push && canPush !== null ? (
          <PushSwitch publicKey={push.publicKey} demo={!canPush} />
        ) : null
      }
      data={{
        name:
          member.name ??
          (member.phone ? displayIsraeliMobile(member.phone) : ""),
        photo: profilePhotoSrc(member.photoPath),
        role: membership.role,
        timeZone: membership.business.place.timeZone,
        since: membership.since,
        locked,
      }}
    />
  );
}
