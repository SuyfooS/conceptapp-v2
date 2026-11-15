import { Suspense } from "react";
import { NoBusinessScreen } from "../../../(app)/no-business";
import { business } from "../../shell/data";
import { demoSignOut } from "../actions";

type Props = { searchParams: Promise<{ state?: string }> };

// Signed in with no business. ?state=left: someone taken off the team of the
// demo restaurant, their last business, as they read it next time.
export default function NoBusinessDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <NoBusinessScreen
      signOut={demoSignOut}
      left={state === "left" ? business.name : null}
    />
  );
}
