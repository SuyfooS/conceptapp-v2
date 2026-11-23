import { turnstileSiteKey } from "@db/env";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { currentMember } from "../../../member";
import { baseWording, translator } from "../../../wording";
import {
  acknowledgeBankAction,
  acknowledgeDutiesAction,
  confirmFileCodeAction,
  keepFileOpenAction,
  lockFileAction,
  markDirectGroupAction,
  revealHolderFieldAction,
  sendFileCodeAction,
} from "./actions";
import { currentHolderFile } from "./holder-file";
import { HolderFileView } from "./holder-file-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team.file.page");
  return { title: t("metaTitle") };
}

// A manager's or a worker's hiring file, for whoever holds the files
// (profile H6a): the owners and the accountant, and whoever an owner gives
// people.files; a view session gets words only, and anyone else the
// not-found screen, as does the module off. The signed-in person's own file
// is /me/file. The address names the person and nothing else: no value is
// ever in a URL. Dynamic and per person, so it answers no-store, and
// nothing here is cached; the file itself is read only once the duties are
// confirmed and an SMS code opened the files on this device. A holder's
// writes there (H6b-1) are bound to the person too.
export default async function HolderFilePage({
  params,
}: PageProps<"/team/[person]/file">) {
  const [{ person }, member] = await Promise.all([params, currentMember()]);
  if (member && person === member.userId) redirect("/me/file");
  const [screen, wording] = await Promise.all([
    currentHolderFile(person),
    currentWording(),
  ]);
  if (screen.kind === "closed") notFound();
  const business = screen.head.businessId;
  return (
    <HolderFileView
      screen={screen}
      paths={{ profile: `/team/${screen.head.personId}`, team: "/team" }}
      // For this business (and the reveal and the writes for this person)
      // only: an action held past a switch is refused.
      actions={{
        acknowledge: acknowledgeDutiesAction.bind(null, business),
        sendCode: sendFileCodeAction.bind(null, business),
        confirmCode: confirmFileCodeAction.bind(null, business),
        reveal: revealHolderFieldAction.bind(
          null,
          business,
          screen.head.personId,
        ),
        keepOpen: keepFileOpenAction.bind(null, business),
        lock: lockFileAction.bind(null, business),
        acknowledgeBank: acknowledgeBankAction.bind(
          null,
          business,
          screen.head.personId,
        ),
        markDirect: markDirectGroupAction.bind(
          null,
          business,
          screen.head.personId,
        ),
      }}
      captcha={{ siteKey: turnstileSiteKey() }}
      wording={wording}
    />
  );
}
