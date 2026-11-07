import { activityByDay, buildActivity } from "@domain/activity";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { ActivityView } from "../../../../(app)/manage/activity/activity-view";
import { modulesToManage } from "../../../../(app)/manage/manage";
import {
  demoActivityLookups,
  demoActivityRows,
  demoModuleRows,
  demoNow,
} from "../../data";
import { demoActivityPaths } from "./paths";

// The real activity log with the demo business's rows, on the demo's Wednesday.
export default function ShellManageActivity() {
  return (
    <ActivityView
      days={activityByDay(
        buildActivity(demoActivityRows, demoActivityLookups),
        ISRAEL_TIME_ZONE,
        demoNow,
      )}
      timeZone={ISRAEL_TIME_ZONE}
      older={102}
      earlier={false}
      manageable={modulesToManage(demoModuleRows)}
      clockOn
      paths={demoActivityPaths}
    />
  );
}
