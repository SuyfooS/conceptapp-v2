import { activityByDay, buildActivity } from "@domain/activity";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { ActivityView } from "../../../../(app)/manage/activity/activity-view";
import {
  modulesToManage,
  settingDefaults,
} from "../../../../(app)/manage/manage";
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
        buildActivity(demoActivityRows, demoActivityLookups, settingDefaults()),
        ISRAEL_TIME_ZONE,
        demoNow,
      )}
      timeZone={ISRAEL_TIME_ZONE}
      older={null}
      earlier={false}
      manageable={modulesToManage(demoModuleRows)}
      clockOn
      paths={demoActivityPaths}
    />
  );
}
