import { CodeScreen } from "../../../../(app)/clock/code/code-screen";
import { business } from "../../data";

// The real code screen, as a manager sees it, asking a stand-in route for
// codes that nothing stores.
export default function ShellClockCode() {
  return (
    <CodeScreen
      data={{
        businessName: business.name,
        required: true,
        owner: false,
        viewOnly: false,
        stationsOnly: false,
      }}
      issueUrl="/design/shell/clock/code/issue"
      paths={{
        team: "/design/shell/clock/team",
        settings: "/design/shell/manage/time_clock",
      }}
    />
  );
}
