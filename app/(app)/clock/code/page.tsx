import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { clockPaths } from "../clock";
import { currentCodeScreen } from "./code";
import { CodeScreen } from "./code-screen";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.clock.code");
  return { title: t("title") };
}

// The clock's code on an owner's or manager's own phone, for the team to type
// as they come and go. Not there for anyone else.
export default async function ClockCodePage() {
  const data = await currentCodeScreen();
  if (!data) notFound();
  return (
    <CodeScreen
      data={data}
      issueUrl="/clock/code/issue"
      paths={{ team: clockPaths.team, settings: "/manage/time_clock" }}
    />
  );
}
