import { Suspense } from "react";
import { demoFileReviews } from "../../data";
import { demoAway } from "../../schedule/shifts/published";
import { TodayDemo } from "../demo";
import { todayScenarios } from "../scenarios";

type Props = { searchParams: Promise<{ files?: string; away?: string }> };

// Uri, the owner, on no shift. In a business that uses the hiring file
// (H6b-1), ?files=reviews has the accounts to look at: Itay's "לא שיניתי",
// then Maya's new one, each leading to the file's twin. ?away=1: Noa is
// away today and tomorrow (known issue 19): her place on this evening's
// shift says so, and "לא בעבודה היום" lists her, leading to her hours.
export default function ShellTodayOwner({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { files, away } = await searchParams;
  const data = todayScenarios.owner();
  const people = data.schedule?.published.people ?? [];
  return (
    <TodayDemo
      data={{
        ...data,
        reviews: files === "reviews" ? demoFileReviews : null,
        away:
          away === "1"
            ? {
                rows: demoAway.map((span) => ({
                  userId: span.userId,
                  name:
                    people.find((one) => one.userId === span.userId)?.name ??
                    null,
                  until: span.to,
                })),
                links: true,
              }
            : null,
      }}
    />
  );
}
