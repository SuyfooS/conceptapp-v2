import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import {
  confirmDocumentAction,
  removeDocumentAction,
  restoreDocumentAction,
} from "../actions";
import { currentDocumentPage } from "../documents";
import { documentsAccess } from "../documents-access";
import { DOCUMENTS_BASE } from "../documents-paths";
import { DocumentScreen } from "./document-screen";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words, never a document's own: a
  // tab's title is seen over a shoulder.
  const t = translator(baseWording, "app.chat.documents");
  return { title: t("title") };
}

// One document (chat C7): the not-found screen for one the person doesn't
// read, the same as for none, so ids can't be probed. `?sent=1` is one they
// just sent, with its "ביטול". Reading this page marks nothing; opening its
// file does (/document-files).
export default async function DocumentPage({
  params,
  searchParams,
}: PageProps<"/chat/documents/[id]">) {
  const [{ id }, { sent }, access] = await Promise.all([
    params,
    searchParams,
    documentsAccess(),
  ]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const data = await currentDocumentPage(id);
  if (!data) notFound();
  return (
    <DocumentScreen
      data={data}
      base={DOCUMENTS_BASE}
      justSent={sent === "1"}
      actions={{
        confirm: confirmDocumentAction.bind(null, data.business),
        remove: removeDocumentAction.bind(null, data.business),
        restore: restoreDocumentAction.bind(null, data.business),
      }}
    />
  );
}
