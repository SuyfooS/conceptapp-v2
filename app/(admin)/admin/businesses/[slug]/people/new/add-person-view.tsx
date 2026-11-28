import { ROLES, type Role } from "@domain/modules";
import type { Wording } from "@domain/wording";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { getTranslations } from "next-intl/server";
import type { InviteState } from "@/app/(app)/team/actions";
import { InviteForm } from "@/app/(app)/team/invite/invite-form";
import { WordingProvider } from "@/app/(app)/wording-provider";

/**
 * The ConceptApp team adds a person to a business, in any role: the same form
 * an owner gets on the Team screen, ending in a link to send on, on WhatsApp
 * to the number added or copied; an owner's goes with the owner's own
 * sentence, anyone else's with the business's, as /team sends it (closing
 * the pilot, PR 4). Also rendered on /design/console with a stand-in action.
 */
export async function AddPersonView({
  name,
  businessHref,
  defaultRole,
  invite,
  whatsappToNumber = false,
  inviteWording = {},
}: {
  name: string;
  businessHref: string;
  /** The role to start with, e.g. an owner from the checklist. */
  defaultRole?: Role;
  /** `addPersonAction` bound to the business, or the demo's stand-in. */
  invite: (prev: InviteState, form: FormData) => Promise<InviteState>;
  /**
   * WhatsApp to the number added: the real page's, behind the database. A
   * twin's made-up numbers may be someone's, so by default WhatsApp asks
   * whom to send to.
   */
  whatsappToNumber?: boolean;
  /**
   * The business's own sentences for what the link goes out with
   * (`inviteShareWording`), as /team sends it: the real page's. The app's by
   * default.
   */
  inviteWording?: Wording;
}) {
  const t = await getTranslations("admin.addPerson");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: businessHref, label: name }}
        title={t("title")}
        subtitle={t("subtitle", { name })}
      />
      <WordingProvider overrides={inviteWording}>
        <InviteForm
          // The built-in roles: the console gives no role a business named.
          roles={ROLES.map((role) => ({ role, namedRole: null }))}
          back={{ href: businessHref, label: t("back", { name }) }}
          defaultRole={defaultRole}
          invite={invite}
          share={{ business: name, toNumber: whatsappToNumber }}
          ownerWords
        />
      </WordingProvider>
    </PageBody>
  );
}
