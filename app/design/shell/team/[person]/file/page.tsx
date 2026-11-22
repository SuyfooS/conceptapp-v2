import { notFound } from "next/navigation";
import { Suspense } from "react";
import type {
  HolderFileHead,
  HolderFileScreen,
} from "../../../../../(app)/team/[person]/file/holder-file-types";
import { HolderFileView } from "../../../../../(app)/team/[person]/file/holder-file-view";
import { baseWording } from "../../../../../(app)/wording";
import {
  business,
  demoHolderFile,
  teamFileStatus,
  teamMembers,
  teamProfiles,
} from "../../../data";
import {
  demoAcknowledgeDutiesAction,
  demoConfirmFileCodeAction,
  demoKeepFileOpenAction,
  demoLockFileAction,
  demoRevealHolderAction,
  demoSendFileCodeAction,
} from "./actions";

export const generateStaticParams = () =>
  teamMembers
    .filter((member) => teamFileStatus[member.userId])
    .map((member) => ({ person: member.userId }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ state?: string; as?: string }>;
};

const STATES = [
  "duties",
  "locked",
  "code",
  "open",
  "viewing",
  "unavailable",
  "limit",
  "review",
] as const;
type State = (typeof STATES)[number];

// A manager's or a worker's hiring file as a holder reads it (profile H6a),
// with the demo's mock files, drawn by the real view. By default the
// duties, which "אישור ושליחת קוד" takes on to the code's boxes; the twin
// takes 123456 and opens the file (`?state=open`), whose numbers show for a
// minute, and "נעילת התיק" or a quarter of an hour idle lock it again.
// `?state=locked` is the file after the duties, waiting for a code; `code`
// its boxes up; `viewing` the ConceptApp team viewing as a role; `unavailable`
// a deployment that can't open files; `limit` the open file over the hour's
// 30 people; `review` Noa's account one she said she didn't change. As the
// owner, who sees the team, it leads back to the profile; `?as=accountant`
// reads it files-only, back to the team's files.
export default function ShellHolderFile(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { state, as }] = await Promise.all([params, searchParams]);
  const member = teamMembers.find((m) => m.userId === person);
  if (!member || !teamFileStatus[person]) notFound();
  const which: State = STATES.find((s) => s === state) ?? "duties";
  const accountant = as === "accountant";
  const head: HolderFileHead = {
    personId: member.userId,
    name: member.name,
    role: member.role,
    namedRole: member.namedRole ?? null,
    addressForm: member.addressForm,
    since: teamProfiles[person]?.since ?? "2026-09-01T08:00:00.000Z",
    seesTeam: !accountant,
    businessId: "demo-restaurant",
    businessName: business.name,
    timeZone: "Asia/Jerusalem",
  };
  const keep = accountant ? "&as=accountant" : "";
  const here = `/design/shell/team/${person}/file`;
  const screen: Exclude<HolderFileScreen, { kind: "closed" }> =
    which === "open" || which === "limit" || which === "review"
      ? {
          kind: "open",
          head,
          data: demoHolderFile(person, which === "review" ? "disputed" : null),
        }
      : which === "code"
        ? { kind: "locked", head }
        : { kind: which, head };
  return (
    <HolderFileView
      screen={screen}
      paths={{
        profile: `/design/shell/team/${person}?file=holder`,
        team: "/design/shell/team?file=accountant",
        twin: {
          opened: `${here}?state=open${keep}`,
          locked: `${here}?state=locked${keep}`,
        },
      }}
      actions={{
        acknowledge: demoAcknowledgeDutiesAction,
        sendCode: demoSendFileCodeAction,
        confirmCode: demoConfirmFileCodeAction,
        reveal: demoRevealHolderAction.bind(null, which),
        keepOpen: demoKeepFileOpenAction,
        lock: demoLockFileAction,
      }}
      code={which === "code" ? { tail: "0014" } : undefined}
      wording={baseWording}
    />
  );
}
