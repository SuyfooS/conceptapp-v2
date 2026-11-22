import { fileStaff } from "@domain/file-holders";
import type { Viewer } from "@domain/modules";
import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import type { TeamFiles } from "../../../(app)/team/file-status";
import { TeamView } from "../../../(app)/team/team-view";
import { baseWording } from "../../../(app)/wording";
import {
  demoNamedRole,
  teamFileStatusComplete,
  teamFileStatusFor,
  teamInvites,
  teamMembers,
  teamToday,
} from "../data";
import { demoCancelInviteAction, demoResendAction } from "./actions";

type Props = {
  searchParams: Promise<{ state?: string; file?: string; complete?: string }>;
};

// The real Team screen with mock people: three members' worth of the demo
// staff, one open invite and one expired, seen by an owner. Two of the
// workers hold the demo's named role, and the open invite is to it, each
// shown by its name with its base (the roles plan's R11b). Inviting and
// new links use the demo's stand-in actions (./actions), and so does
// deleting an invite, held for its undo. ?state=demo is a
// demo business, closed to invites (#80): no invite, no new links, and the
// line that says why. ?state=view is a worker raised to see the team without
// editing it (the roles plan's R6): everything read, no invite, no new
// links, no deleting, and the line under the title that says so. The hiring
// file's lines (profile H6a): ?file=holder as the owner, who reads what each
// file lacks; ?file=manager as the demo's manager, who reads only how many;
// ?file=accountant as the accountant, who holds the files without seeing
// the team: managers and workers alone, no numbers, no invites, each row
// leading to the file's twin as the accountant reads it (`?as=accountant`).
// &complete=1 with any of them has every file complete and its 101 accepted
// (H6b-2): each choice of the filter but everyone says it shows nobody.
export default function ShellTeam({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

/** The twin's status lines, as each reader reads them. */
function filesFor(
  file: string | undefined,
  complete: boolean,
): TeamFiles | null {
  if (file !== "holder" && file !== "manager" && file !== "accountant") {
    return null;
  }
  const reader = file === "manager" ? "team" : "holder";
  return {
    reader,
    filesOnly: file === "accountant",
    year: 2026,
    form101: true,
    timeZone: "Asia/Jerusalem",
    byPerson: complete
      ? teamFileStatusComplete(reader)
      : teamFileStatusFor(reader),
  };
}

async function Demo({ searchParams }: Props) {
  const { state, file, complete } = await searchParams;
  const demo = state === "demo";
  const files = filesFor(file, complete === "1");
  if (files?.filesOnly) {
    // The accountant reads names and roles only: no numbers, no invites.
    return (
      <TeamView
        team={buildTeam(
          fileStaff(teamMembers).map((m) => ({ ...m, phone: null })),
          [],
          teamToday,
        )}
        viewer={{
          role: "accountant",
          perms: ["clock.payroll", "people.files"],
        }}
        peopleHref="/design/shell/team"
        fileHref={(userId) => `/design/shell/team/${userId}/file?as=accountant`}
        resend={demoResendAction}
        files={files}
        wording={baseWording}
      />
    );
  }
  const viewer: Viewer =
    state === "view"
      ? { role: "worker", perms: ["team.view"] }
      : file === "manager"
        ? { role: "manager", perms: ["team.view", "team.edit"] }
        : { role: "owner", perms: [] };
  return (
    <TeamView
      team={buildTeam(teamMembers, demo ? [] : teamInvites, teamToday)}
      viewer={viewer}
      inviteHref={demo ? undefined : "/design/shell/team/invite"}
      peopleHref="/design/shell/team"
      resend={demoResendAction}
      cancel={demoCancelInviteAction}
      named={[demoNamedRole]}
      files={files}
      wording={baseWording}
    />
  );
}
