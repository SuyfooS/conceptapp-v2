import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { type AppWording, translator } from "../../wording";
import { InviteForm } from "./invite-form";

/** Also rendered on /design/shell/team/invite. */
export function TeamInviteView({
  teamHref,
  wording,
  ...props
}: Omit<Parameters<typeof InviteForm>[0], "back"> & {
  teamHref: string;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.team");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: teamHref, label: t("title") }}
        title={t("invite.title")}
        subtitle={t("invite.subtitle")}
      />
      <InviteForm
        {...props}
        back={{ href: teamHref, label: t("invite.backToTeam") }}
      />
    </PageBody>
  );
}
