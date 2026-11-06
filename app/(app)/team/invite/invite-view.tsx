import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { getTranslations } from "next-intl/server";
import { InviteForm } from "./invite-form";

/** Also rendered on /design/shell/team/invite. */
export async function TeamInviteView(props: Parameters<typeof InviteForm>[0]) {
  const t = await getTranslations("app.team");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: props.teamHref, label: t("title") }}
        title={t("invite.title")}
        subtitle={t("invite.subtitle")}
      />
      <InviteForm {...props} />
    </PageBody>
  );
}
