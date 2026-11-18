import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { documentsAccess } from "./documents-access";
import { DocumentsViewingView } from "./documents-viewing";

/**
 * Every documents screen's frame (chat C7): for someone on the staff of a
 * business with documents on (their own) and for its office (owners, pay
 * holders, and accountants, who are in no chat and reach these through
 * their "מסמכים" tab); the not-found screen for anyone else, as with a
 * module that is off. Outside the conversations' frame (`(talk)`): no chat
 * list and no sync here. While the ConceptApp team views the business as a
 * role it says only that documents aren't shown, the tab staying as the
 * role's bar has it; nothing of any document is read for it.
 */
export default async function DocumentsLayout({
  children,
}: LayoutProps<"/chat/documents">) {
  const [access, wording] = await Promise.all([
    documentsAccess(),
    currentWording(),
  ]);
  if (!access) notFound();
  if (access.viewing) return <DocumentsViewingView wording={wording} />;
  return children;
}
