import { activityByDay, buildActivity } from "@domain/activity";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { ActivityView } from "../../../../(app)/manage/activity/activity-view";
import {
  departmentsOn,
  modulesToManage,
  settingDefaults,
} from "../../../../(app)/manage/manage";
import { baseWording } from "../../../../(app)/wording";
import {
  demoActivityLookups,
  demoActivityRows,
  demoModuleRows,
  demoNow,
} from "../../data";
import { demoActivityPaths } from "./paths";

// The real activity log with the demo business's rows, on the demo's
// Wednesday, as its owner reads it: every area, and a setting's line leads to
// every module whose settings are theirs, the hiring file's too.
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
      manageable={modulesToManage(demoModuleRows, "owner")}
      clockOn
      departmentsOn={departmentsOn(demoModuleRows)}
      everyArea
      paths={demoActivityPaths}
      wording={baseWording}
    />
  );
}
