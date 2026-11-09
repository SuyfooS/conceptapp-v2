import { photoAllowed } from "@db/profile-photos";
import { displayIsraeliMobile } from "@domain/phone";
import { profilePhotoSrc } from "@domain/profile-photos";
import type { Metadata } from "next";
import { signOut } from "../../(auth)/actions";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { baseWording, translator } from "../wording";
import {
  removeMyPhotoAction,
  saveMyProfileAction,
  setMyPhotoAction,
} from "./actions";
import { MeView, type PhotoLock } from "./me-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.me");
  return { title: t("metaTitle") };
}

// The signed-in person's own profile, for everyone in a business.
export default async function MePage() {
  const [member, wording] = await Promise.all([
    currentMember(),
    currentWording(),
  ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  // While viewing as a role nothing changes; otherwise the database says
  // whether the person is in a demo business that keeps its people.
  let locked: PhotoLock | null = "viewOnly";
  if (!member.viewing) {
    const allowed = await photoAllowed(member.userId);
    locked = allowed === "yes" ? null : allowed;
  }
  const { profile } = member;

  return (
    <MeView
      wording={wording}
      signOut={signOut}
      actions={{
        setPhoto: setMyPhotoAction,
        removePhoto: removeMyPhotoAction,
        saveProfile: saveMyProfileAction,
      }}
      data={{
        name:
          member.name ??
          (member.phone ? displayIsraeliMobile(member.phone) : ""),
        photo: profilePhotoSrc(member.photoPath),
        role: membership.role,
        businessName: membership.business.name,
        timeZone: membership.business.place.timeZone,
        since: membership.since,
        locked,
        about: {
          bio: profile.bio,
          cover: profile.cover,
          addressForm: profile.addressForm,
          // Before the H2 migration reaches the project nothing here can be
          // kept yet; the photo has its own answer.
          locked: member.viewing ? "viewOnly" : profile.ready ? null : "notYet",
          demo: locked === "demo",
        },
      }}
    />
  );
}
