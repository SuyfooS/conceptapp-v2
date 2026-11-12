import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import {
  cancelDocumentPdfAction,
  finishDocumentPdfAction,
  sendDocumentPhotoAction,
  sendDocumentSampleAction,
  startDocumentPdfAction,
} from "../actions";
import { currentSendScreen } from "../documents";
import { documentsAccess } from "../documents-access";
import { DOCUMENTS_BASE } from "../documents-paths";
import { SendDocumentForm } from "./send-form";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.chat.documents.send");
  return { title: t("title") };
}

// Sending a document (chat C7): `?to=business` (the attach sheet's row and
// "המסמכים שלי"), `?to=people` (the office and other senders). Someone who
// may send neither way gets the not-found screen. Every write is bound to the
// business the screen was drawn for.
export default async function SendDocumentPage({
  searchParams,
}: PageProps<"/chat/documents/send">) {
  const [{ to }, access] = await Promise.all([searchParams, documentsAccess()]);
  // The layout says why there is nothing here.
  if (!access || access.viewing) return null;
  const data = await currentSendScreen();
  if (!data || (!data.toBusiness && !data.toPeople)) notFound();
  const business = data.business;
  return (
    <SendDocumentForm
      data={data}
      base={DOCUMENTS_BASE}
      initial={to === "people" ? "to_people" : "from_person"}
      actions={{
        photo: sendDocumentPhotoAction.bind(null, business),
        startPdf: startDocumentPdfAction.bind(null, business),
        finishPdf: finishDocumentPdfAction.bind(null, business),
        cancelPdf: cancelDocumentPdfAction.bind(null, business),
        sample: sendDocumentSampleAction.bind(null, business),
      }}
    />
  );
}
