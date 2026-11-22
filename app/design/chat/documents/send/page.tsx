import { Suspense } from "react";
import { documentsDemoSend } from "../data";
import { DemoSend } from "../demo-screens";

type Props = {
  searchParams: Promise<{ to?: string; state?: string; space?: string }>;
};

// Sending a document (chat C7) with mock rows: Noa's to the business, a
// photo of a page or a PDF, with who sees it and, for a sick note, to send
// it alone. `?to=people` is Shiran's to people: a person, a department or
// the whole team as a count, and "לבקש אישור קריאה". `?state=demo` is a demo
// business, which takes no file: no title, no note, a sample goes. With
// `?to=people`, `?space=near|full` says the space for documents is filling
// or full, and `?state=tooMany` is a staff of 1,204 with "כל הצוות" chosen:
// more than one document takes, said, and nothing sent (bigger teams).
export default function DocumentsDemoSendPage({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { to, state, space } = await searchParams;
  const people = to === "people";
  const crowd = people && state === "tooMany";
  return (
    <DemoSend
      data={documentsDemoSend(people ? "manager" : "staff", state === "demo", {
        space: space === "near" || space === "full" ? space : null,
        crowd,
      })}
      initial={people ? "to_people" : "from_person"}
      initialAudience={crowd ? { kind: "everyone" } : undefined}
    />
  );
}
