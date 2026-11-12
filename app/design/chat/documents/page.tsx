import { Suspense } from "react";
import { type DocumentsDemoReader, documentsDemoScreen } from "./data";
import { DemoDocuments } from "./demo-screens";

type Props = {
  searchParams: Promise<{ as?: string; state?: string; person?: string }>;
};

// The documents (chat C7) with mock rows. By default the owner's, the
// office's: on a phone "מחכה לך" or everyone by person, on a tablet the
// people beside the chosen one's documents (`?person=noa`), on a desktop the
// table with its filters and preview, with the one notice to keep a copy
// (`?state=seen` once read). `?as=staff` is Noa's "המסמכים שלי", `?as=manager`
// Shiran's with what she sent ("שלחת"). `?state=empty` has nothing yet.
export default function DocumentsDemoPage({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { as, state, person } = await searchParams;
  const reader: DocumentsDemoReader =
    as === "staff" || as === "manager" ? as : "office";
  return (
    <DemoDocuments
      data={documentsDemoScreen(reader, {
        empty: state === "empty",
        notice: state !== "seen",
        person: typeof person === "string" ? person : null,
      })}
    />
  );
}
