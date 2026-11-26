import type { Role, Viewer } from "@domain/modules";
import {
  importRolesOf,
  type KnownInvite,
  knownTeamOf,
} from "@domain/people-import";
import { inviteChoices, namedRoleShown } from "@domain/team";
import { Suspense } from "react";
import { baseWording, translator } from "../../../../(app)/wording";
import { demoNamedRole, teamInvites, teamMembers, teamToday } from "../../data";
import { againInvites, againMembers, importPastes } from "./data";
import { ImportTwin } from "./import-twin";

type Props = {
  searchParams: Promise<{ state?: string; fail?: string }>;
};

const STATES = [
  "empty",
  "whatsapp",
  "sheet",
  "problems",
  "again",
  "tooMany",
  "done",
  "removed",
] as const;
type State = (typeof STATES)[number];

// The people import ("הזמנה מרשימה") as the demo restaurant's owner sees
// it, on the twin's team: its members and its two invites, each with a link
// made, and the restaurant's named role. The pastes are a clinic's, a
// shop's and a cleaning crew's (./data). ?state=whatsapp a list from
// WhatsApp; ?state=sheet a sheet copied with its title, header, ID column
// and wage; ?state=problems lines to fix, with two headings, the owner's
// own line left out and a heading block to remove at once; ?state=again the
// sheet a second time, its invites waiting, sent or joined since;
// ?state=tooMany 320 people; ?state=done the WhatsApp list imported;
// ?state=removed and taken back, "ביטול" still offered. &fail=import makes
// the import refuse, &fail=undo its taking back. Everything is read on the
// device, and the stand-ins write nothing anywhere (./import-twin).
export default function ShellTeamImport({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state: asked, fail: failing } = await searchParams;
  const fail = failing === "import" || failing === "undo" ? failing : undefined;
  const state: State = STATES.includes(asked as State)
    ? (asked as State)
    : "empty";
  const viewer: Viewer = { role: "owner", perms: [] };
  const tr = translator(baseWording, "app.roles");
  const labels: Record<Role, string> = {
    owner: tr("owner"),
    manager: tr("manager"),
    worker: tr("worker"),
    accountant: tr("accountant"),
  };
  const roles = importRolesOf({
    choices: inviteChoices(viewer, [demoNamedRole], []),
    named: [namedRoleShown(demoNamedRole)],
    labels,
  });
  // The twin's invites have had their links made, as the Team twin shows them.
  const invites: KnownInvite[] = teamInvites.map((invite) => ({
    id: invite.id,
    phone: invite.phone,
    name: invite.name,
    role: invite.role,
    namedRole: invite.namedRole?.id ?? null,
    linkPending: false,
    expired: Date.parse(invite.expiresAt) <= teamToday.getTime(),
    touchable: invite.role === "manager" || invite.role === "worker",
  }));
  const again = state === "again";
  const known = knownTeamOf(
    [...teamMembers, ...(again ? againMembers : [])],
    [...invites, ...(again ? againInvites : [])],
  );
  const paste =
    state === "whatsapp" || state === "done" || state === "removed"
      ? importPastes.whatsapp
      : state === "sheet" || state === "again"
        ? importPastes.sheet
        : state === "problems"
          ? importPastes.problems
          : state === "tooMany"
            ? importPastes.tooMany
            : "";
  return (
    <ImportTwin
      // A state of its own each, so a link from one to another starts afresh.
      key={`${state}:${fail ?? ""}`}
      roles={roles}
      known={known}
      initialPaste={paste}
      startAt={state === "done" || state === "removed" ? state : undefined}
      fail={fail}
    />
  );
}
