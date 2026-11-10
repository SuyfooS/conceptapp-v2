import { Suspense } from "react";
import { SendForm } from "../../../../(app)/lists/send/send-form";
import { SentToday } from "../../../../(app)/lists/send/sent-today";
import { baseWording } from "../../../../(app)/wording";
import { demoSendList } from "../actions";
import { demoSendForm, demoSentToday } from "../data";
import { demoListsPaths } from "../paths";

type Props = { searchParams: Promise<{ template?: string; state?: string }> };

// Sending a list on the demo: the restaurant's templates, a list typed now
// (`?template=new`), its people and this week's shifts. Sending goes back to
// Lists, which shows the list as just sent. `?state=kitchenGone` is the
// restaurant after its kitchen was removed: a kitchen template starts with
// nobody chosen, and says why.
export default function ShellSendList({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { template, state } = await searchParams;
  return (
    <SendForm
      key={state ?? ""}
      data={demoSendForm(template, state === "kitchenGone")}
      send={demoSendList}
      paths={{ lists: demoListsPaths.lists }}
      sentToday={
        <SentToday
          data={demoSentToday}
          wording={baseWording}
          href={demoListsPaths.list}
        />
      }
    />
  );
}
