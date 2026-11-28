import { displayIsraeliMobile } from "@domain/phone";
import { Suspense } from "react";
import { PastJobsSection } from "../../../(account)/me/past/past-jobs";
import { MyDocumentsSection } from "../../../(app)/chat/documents/my-documents";
import { FileSummary } from "../../../(app)/me/file-summary";
import { HelpSection } from "../../../(app)/me/help-sheet";
import { MeView } from "../../../(app)/me/me-view";
import { ModeRows } from "../../../(app)/mode-rows";
import { NotificationSettingsLink } from "../../../(app)/notifications/settings-link";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../actions";
import {
  business,
  demoHelp,
  demoOrdersMode,
  shiranTeamName,
  teamMembers,
  teamProfiles,
} from "../data";
import {
  demoRemovePhotoAction,
  demoSaveProfileAction,
  demoSetPhotoAction,
} from "./actions";
import { fileScreenDemo, pastJobDemo } from "./file/data";

type Props = {
  searchParams: Promise<{
    state?: string;
    file?: string;
    past?: string;
    name?: string;
    help?: string;
    support?: string;
  }>;
};

// The real profile with mock data: Shiran, the shift manager, with her photo,
// a line about herself, the "dots" cover and the feminine form. ?state=empty
// has none of them yet; ?state=demo is a demo business, where photos stay as
// they are and there's no line, but a cover and a form can be chosen. The
// way to the notification settings stays in the demo, and a demo business
// has none. ?file=missing adds her hiring file as Noa's twin has it, stopped
// at the account (the card and the five rows); ?file=done, every part in;
// ?file=lean, a business that asks neither the address nor the account
// (two rows fewer); ?file=contact, one that asks for an emergency contact
// too (its row); ?file=later, sent with a pension fund still to choose (the
// card leads to the pension), each as Noa's twin has it (H5b), and each of
// its links to that twin in the same state. ?past=1 adds "עבודות קודמות"
// (H5c), a café she left, whose row leads to the old file's twin.
// ?name=kept is a business that keeps a name of its own for her ("השם שלי"
// says so, and her title stays its name); ?name=same, one that keeps her own
// name as its own (the row says nothing more, the sheet and the word after
// saving do, and the title stays it); ?name=none, someone nobody named (her
// number for a title, and the row asks for a name); ?name=marked, her own
// name saved with a right-to-left mark nobody sees, which the sheet saves
// clean as it opens. "עזרה" (closing the pilot, PR 15): as a manager she
// asks Uri, the owner, in chat, and reaches ConceptApp's team on WhatsApp
// (no number on the twin: WhatsApp asks whom to); ?support=off is a
// deployment with no number, so only Uri; ?help=name, chat off, so Uri is
// only named; ?state=demo, a demo business, with no ConceptApp team.
export default function ShellMe({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, file, past, name, help, support } = await searchParams;
  const shiran = teamMembers.find((m) => m.userId === "shiran");
  const profile = teamProfiles.shiran;
  const empty = state === "empty";
  const demo = state === "demo";
  const own =
    name === "none"
      ? null
      : name === "marked" && shiran?.name
        ? // A right-to-left mark, as an earlier claim may have copied it.
          `\u{200F}${shiran.name}`
        : (shiran?.name ?? null);
  const kept = name === "kept" ? shiranTeamName : name === "same" ? own : null;
  const helped = demoHelp({
    support: support !== "off",
    chat: help !== "name",
    demo,
  });
  return (
    <MeView
      wording={baseWording}
      // Waiter mode's way in, to the twin (P4).
      modes={<ModeRows rows={[{ ...demoOrdersMode, open: false }]} />}
      help={helped ? <HelpSection help={helped} /> : null}
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
        file === "later" ||
        file === "lean" ||
        file === "contact" ? (
          <FileSummary
            data={
              fileScreenDemo(
                file === "done" || file === "later" ? file : "stopped",
                "he",
                { ask: file === "lean" || file === "contact" ? file : "all" },
              ).data
            }
            wording={baseWording}
            base="/design/shell"
            query={
              file === "done" || file === "later"
                ? `state=${file}`
                : file === "lean" || file === "contact"
                  ? `ask=${file}`
                  : ""
            }
          />
        ) : null
      }
      past={
        past === "1" ? (
          <PastJobsSection
            jobs={[pastJobDemo]}
            wording={baseWording}
            hrefOf={() => "/design/screens/past-file"}
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
        name:
          kept ??
          own ??
          (shiran?.phone ? displayIsraeliMobile(shiran.phone) : ""),
        ownName: own,
        keptName: kept,
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
