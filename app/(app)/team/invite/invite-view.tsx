import { PageBody, PageHeader } from "@ui/page";
import { getTranslations } from "next-intl/server";
import { InviteForm } from "./invite-form";

/** Also rendered on /design/shell/team/invite. */
export async function TeamInviteView(props: Parameters<typeof InviteForm>[0]) {
  const t = await getTranslations("app.team.invite");
  return (
    <PageBody>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="w-full max-w-xl">
        <InviteForm {...props} />
      </div>
    </PageBody>
  );
}
