import { Suspense } from "react";
import { MyDocumentsSection } from "../../../(app)/chat/documents/my-documents";
import { FileSummary } from "../../../(app)/me/file-summary";
import { MeView } from "../../../(app)/me/me-view";
import { ModeRows } from "../../../(app)/mode-rows";
import { NotificationSettingsLink } from "../../../(app)/notifications/settings-link";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../actions";
import { business, demoOrdersMode, teamMembers, teamProfiles } from "../data";
import {
  demoRemovePhotoAction,
  demoSaveProfileAction,
  demoSetPhotoAction,
} from "./actions";
import { fileScreenDemo } from "./file/data";

type Props = { searchParams: Promise<{ state?: string; file?: string }> };

// The real profile with mock data: Shiran, the shift manager, with her photo,
// a line about herself, the "dots" cover and the feminine form. ?state=empty
// has none of them yet; ?state=demo is a demo business, where photos stay as
// they are and there's no line, but a cover and a form can be chosen. The
// way to the notification settings stays in the demo, and a demo business
// has none. ?file=missing adds her hiring file as Noa's twin has it, stopped
// at the account (the card and the five rows); ?file=done, every part in;
// ?file=lean, a business that asks neither the address nor the account
// (two rows fewer); ?file=contact, one that asks for an emergency contact
// too (its row), each as Noa's twin has it (H5b).
export default function ShellMe({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, file } = await searchParams;
  const shiran = teamMembers.find((m) => m.userId === "shiran");
  const profile = teamProfiles.shiran;
  const empty = state === "empty";
  const demo = state === "demo";
  return (
    <MeView
      wording={baseWording}
      // Waiter mode's way in, to the twin (P4).
      modes={<ModeRows rows={[{ ...demoOrdersMode, open: false }]} />}
      signOut={demoSignOut}
      actions={{
        setPhoto: demoSetPhotoAction,
        removePhoto: demoRemovePhotoAction,
        saveProfile: demoSaveProfileAction,
      }}
      home="/design/shell"
      file={
        file === "missing" ||
        file === "done" ||
        file === "lean" ||
        file === "contact" ? (
          <FileSummary
            data={
              fileScreenDemo(file === "done" ? "done" : "stopped", "he", {
                ask: file === "lean" || file === "contact" ? file : "all",
              }).data
            }
            wording={baseWording}
            base="/design/shell"
          />
        ) : null
      }
      documents={
        <MyDocumentsSection
          wording={baseWording}
          href="/design/chat/documents?as=manager"
          office={false}
          toConfirm={0}
        />
      }
      notifications={
        demo ? null : (
          <NotificationSettingsLink
            href="/design/shell/notifications/settings"
            wording={baseWording}
            from="profile"
          />
        )
      }
      data={{
        name: shiran?.name ?? "",
        photo: empty ? null : (shiran?.photo ?? null),
        role: "manager",
        businessName: business.name,
        timeZone: "Asia/Jerusalem",
        since: profile?.since ?? null,
        locked: demo ? "demo" : null,
        about: {
          bio: empty || demo ? null : (profile?.bio ?? null),
          cover: empty ? "glow" : (profile?.cover ?? "glow"),
          addressForm: empty ? null : (shiran?.addressForm ?? null),
          locked: null,
          demo,
        },
      }}
    />
  );
}
