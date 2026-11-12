import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  type DocumentsDemoReader,
  documentsDemoIds,
  documentsDemoPage,
} from "../data";
import { DemoDocument } from "../demo-screens";

export const generateStaticParams = () =>
  documentsDemoIds().map((id) => ({ id }));

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string; state?: string }>;
};

// One document (chat C7) with mock rows, by default as the owner reads it:
// Noa's sick note (`/sick-note`) shown as a photo, its file deleted with a
// reason (`?state=remove` opens the reasons) and put back (`?state=removed`);
// the procedure Shiran sent (`/procedure`, `?as=manager` as its sender) with
// who opened and confirmed it. `?as=staff` is Noa's: the payslip asking for
// her "קראתי ואישרתי" (`/payslip`), and her sick note just sent, with its
// "ביטול" (`/sick-note?as=staff&state=sent`).
export default function DocumentsDemoDocumentPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ id }, { as, state }] = await Promise.all([params, searchParams]);
  const reader: DocumentsDemoReader =
    as === "staff" || as === "manager" ? as : "office";
  const data = documentsDemoPage(
    id,
    reader,
    state === "sent" || state === "removed" ? state : null,
  );
  if (!data) notFound();
  return (
    <DemoDocument
      data={data}
      justSent={state === "sent"}
      openRemoval={state === "remove"}
    />
  );
}
