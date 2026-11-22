import { Suspense } from "react";
import { PastJobsSection } from "../../../(account)/me/past/past-jobs";
import { NoBusinessScreen } from "../../../(app)/no-business";
import { baseWording } from "../../../(app)/wording";
import { business, leftBusiness } from "../../shell/data";
import { pastJobDemo } from "../../shell/me/file/data";
import { demoSignOut } from "../actions";

type Props = { searchParams: Promise<{ state?: string; past?: string }> };

// Signed in with no business. ?state=left: someone taken off the team of the
// demo restaurant, their last business, as they read it next time. ?past=1:
// "עבודות קודמות" under it (profile H5c), whose row leads to the old file's
// twin; with ?state=left the business left is then the café the list names.
export default function NoBusinessDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, past } = await searchParams;
  const listed = past === "1";
  return (
    <NoBusinessScreen
      signOut={demoSignOut}
      left={
        state === "left" ? (listed ? leftBusiness.name : business.name) : null
      }
      past={
        listed ? (
          <PastJobsSection
            jobs={[pastJobDemo]}
            wording={baseWording}
            hrefOf={() => "/design/screens/past-file?from=none"}
          />
        ) : null
      }
    />
  );
}
