import { Suspense } from "react";
import { demoFileReviews } from "../../data";
import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

type Props = { searchParams: Promise<{ files?: string }> };

// Uri, the owner, on no shift. In a business that uses the hiring file
// (H6b-1), ?files=reviews has the accounts to look at: Itay's "לא שיניתי",
// then Maya's new one, each leading to the file's twin.
export default function ShellTodayOwner({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { files } = await searchParams;
  return (
    <TodayDemo
      data={{
        ...todayScenarios.owner(),
        reviews: files === "reviews" ? demoFileReviews : null,
      }}
    />
  );
}
