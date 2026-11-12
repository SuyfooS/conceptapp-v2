import { documentsAllowed } from "@db/documents";
import { holdsPermission, isStaff } from "@domain/modules";
import { isDemoBusiness } from "@domain/passive-sign-in";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";

/**
 * Who the documents' screens, actions and routes are for, once per request
 * (chat C7): a business with documents on (today: chat is on,
 * private.documents_on), and someone on its staff (their own documents both
 * ways) or in its office (every document: owners, accountants and holders of
 * clock.payroll, private.in_office). An accountant is in the office and on no
 * staff, so this, not `chatAccess`, opens /chat/documents for them. Null for
 * anyone else.
 *
 * While the ConceptApp team views a business as a role, `viewing` is true:
 * the screens say documents aren't shown then ("בצפייה לא רואים שיחות
 * ומסמכים") and the actions and routes refuse, and the database reads such a
 * session nothing anyway (private.sees_document has no branch for it).
 */
export const documentsAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (!member || !membership || !enabled.includes("chat")) return null;
  const { role, perms, business } = membership;
  const staff = isStaff(role);
  // The office is who holds pay access (time_clock's clock.payroll), as the
  // database's private.in_office says: owners and accountants always.
  const office = holdsPermission(
    manifestFor("time_clock"),
    role,
    perms,
    "clock.payroll",
  );
  if (!staff && !office) return null;
  return {
    userId: member.userId,
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    role,
    timeZone: business.place.timeZone,
    viewing: member.viewing !== null,
    /** A demo business: its documents are samples, with no title or note typed. */
    demo: isDemoBusiness(business.slug),
    /** On the staff: sends documents to the business, reads their own. */
    staff,
    /** In the office: reads every document of the business, removes files with a reason. */
    office,
    /**
     * Sends documents to people (private.sends_documents): an owner, a holder
     * of chat.send_documents (managers by default), or the office.
     */
    sends:
      office ||
      holdsPermission(manifestFor("chat"), role, perms, "chat.send_documents"),
  };
});

export type DocumentsAccess = NonNullable<
  Awaited<ReturnType<typeof documentsAccess>>
>;

/**
 * Whether the business takes a document's own file (a photo or a PDF), once
 * per request: "yes"; "demo" for a demo business that doesn't (its
 * documents are samples, `sendDocumentSampleAction`); "notYet" before the
 * migration reaches the project.
 */
export const documentFilesAllowed = cache(
  async (businessId: string): Promise<"yes" | "demo" | "notYet"> => {
    try {
      return await documentsAllowed(businessId);
    } catch (error) {
      console.error(
        "whether documents take files could not be read",
        (error as { code?: string } | null)?.code ?? "without a code",
      );
      return "notYet";
    }
  },
);
