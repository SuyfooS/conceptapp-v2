import { Suspense } from "react";
import { MeView } from "../../../(app)/me/me-view";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../actions";
import { teamMembers } from "../data";
import { demoRemovePhotoAction, demoSetPhotoAction } from "./actions";

type Props = { searchParams: Promise<{ state?: string }> };

// The real profile with mock data: Shiran, the shift manager, with her photo.
// ?state=empty has no photo yet; ?state=demo is a demo business, where
// photos stay as they are.
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
  return (
    <MeView
      wording={baseWording}
      signOut={demoSignOut}
      actions={{
        setPhoto: demoSetPhotoAction,
        removePhoto: demoRemovePhotoAction,
      }}
      home="/design/shell"
      data={{
        name: shiran?.name ?? "",
        photo: state === "empty" ? null : (shiran?.photo ?? null),
        role: "manager",
        timeZone: "Asia/Jerusalem",
        since: "2026-03-02T08:00:00.000Z",
        locked: state === "demo" ? "demo" : null,
      }}
    />
  );
}
