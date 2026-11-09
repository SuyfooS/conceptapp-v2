import { Suspense } from "react";
import { MeView } from "../../../(app)/me/me-view";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../actions";
import { business, teamMembers, teamProfiles } from "../data";
import {
  demoRemovePhotoAction,
  demoSaveProfileAction,
  demoSetPhotoAction,
} from "./actions";

type Props = { searchParams: Promise<{ state?: string }> };

// The real profile with mock data: Shiran, the shift manager, with her photo,
// a line about herself, the "dots" cover and the feminine form. ?state=empty
// has none of them yet; ?state=demo is a demo business, where photos stay as
// they are and there's no line, but a cover and a form can be chosen.
export default function ShellMe({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const shiran = teamMembers.find((m) => m.userId === "shiran");
  const profile = teamProfiles.shiran;
  const empty = state === "empty";
  const demo = state === "demo";
  return (
    <MeView
      wording={baseWording}
      signOut={demoSignOut}
      actions={{
        setPhoto: demoSetPhotoAction,
        removePhoto: demoRemovePhotoAction,
        saveProfile: demoSaveProfileAction,
      }}
      home="/design/shell"
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
