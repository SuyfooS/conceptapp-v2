import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { seeDocumentsNoticeAction } from "./actions";
import { currentDocumentsScreen } from "./documents";
import { documentsAccess } from "./documents-access";
import { DOCUMENTS_BASE } from "./documents-paths";
import { DocumentsScreen } from "./documents-screen";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.chat.documents");
  return { title: t("title") };
}

// The documents (chat C7): the office's every one, or a person's own.
// `?person=` is the office's chosen person, on a tablet and a phone. The
// layout has sent anyone else to the not-found screen, and says what a view
// session sees.
export default async function DocumentsPage({
  searchParams,
}: PageProps<"/chat/documents">) {
  const [{ person }, access] = await Promise.all([
    searchParams,
    documentsAccess(),
  ]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const data = await currentDocumentsScreen(
    typeof person === "string" ? person : undefined,
  );
  if (!data) notFound();
  return (
    <DocumentsScreen
      data={data}
      base={DOCUMENTS_BASE}
      seeNotice={seeDocumentsNoticeAction.bind(null, data.business)}
    />
  );
}
