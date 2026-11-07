import { ROLES } from "@domain/modules";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { getTranslations } from "next-intl/server";
import type { InviteState } from "@/app/(app)/team/actions";
import { InviteForm } from "@/app/(app)/team/invite/invite-form";

/**
 * The ConceptApp team adds a person to a business, in any role: the same form
 * an owner gets on the Team screen, ending in a link to send on. Also
 * rendered on /design/console with a stand-in action.
 */
export async function AddPersonView({
  name,
  businessHref,
  invite,
}: {
  name: string;
  businessHref: string;
  /** `addPersonAction` bound to the business, or the demo's stand-in. */
  invite: (prev: InviteState, form: FormData) => Promise<InviteState>;
}) {
  const t = await getTranslations("admin.addPerson");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: businessHref, label: name }}
        title={t("title")}
        subtitle={t("subtitle", { name })}
      />
      <InviteForm
        roles={ROLES}
        back={{ href: businessHref, label: t("back", { name }) }}
        invite={invite}
      />
    </PageBody>
  );
}
