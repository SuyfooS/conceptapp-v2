import { photoAllowed } from "@db/profile-photos";
import { pushAllowed } from "@db/push/devices";
import { displayIsraeliMobile } from "@domain/phone";
import { profilePhotoSrc } from "@domain/profile-photos";
import type { Metadata } from "next";
import { signOut } from "../../(auth)/actions";
import { currentBusinesses } from "../businesses";
import { currentDocumentsHome } from "../chat/documents/documents";
import { documentsAccess } from "../chat/documents/documents-access";
import { MyDocumentsSection } from "../chat/documents/my-documents";
import { currentWording } from "../current-wording";
import { SwitchBusinessSection } from "../home/my-businesses";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import { NotificationSettingsLink } from "../notifications/settings-link";
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
  const [member, wording, enabled, businesses, documents, documentsHome] =
    await Promise.all([
      currentMember(),
      currentWording(),
      currentModules(),
      currentBusinesses(),
      documentsAccess(),
      currentDocumentsHome(),
    ]);
  const membership = member?.membership;
  // The layout has already sent these people elsewhere.
  if (!member || !membership) return null;

  // While viewing as a role nothing changes; otherwise the database says
  // whether the person is in a demo business that keeps its people.
  let locked: PhotoLock | null = "viewOnly";
  // The way to the notification settings: not while viewing as someone, not
  // with the module off, and not in a demo business, whose lines never reach
  // a phone (the inbox says so).
  const notificationsOn = !member.viewing && enabled.includes("notifications");
  let canPush: boolean | null = false;
  if (!member.viewing) {
    const [allowed, pushes] = await Promise.all([
      photoAllowed(member.userId),
      notificationsOn ? pushAllowed(member.userId) : false,
    ]);
    locked = allowed === "yes" ? null : allowed;
    canPush = pushes;
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
      notifications={
        notificationsOn && canPush !== false ? (
          <NotificationSettingsLink
            href="/notifications/settings"
            wording={wording}
            from="profile"
          />
        ) : null
      }
      businesses={
        <SwitchBusinessSection businesses={businesses} wording={wording} />
      }
      documents={
        documents ? (
          <MyDocumentsSection
            wording={wording}
            href="/chat/documents"
            office={documents.office}
            toConfirm={documentsHome?.toConfirmCount ?? 0}
          />
        ) : null
      }
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
