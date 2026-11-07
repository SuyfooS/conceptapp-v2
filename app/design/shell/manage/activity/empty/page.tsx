import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { ActivityView } from "../../../../../(app)/manage/activity/activity-view";
import { modulesToManage } from "../../../../../(app)/manage/manage";
import { demoModuleRows } from "../../../data";
import { demoActivityPaths } from "../paths";

// The activity log of a business where nothing has happened yet.
export default function ShellManageActivityEmpty() {
  return (
    <ActivityView
      days={[]}
      timeZone={ISRAEL_TIME_ZONE}
      older={null}
      earlier={false}
      manageable={modulesToManage(demoModuleRows)}
      clockOn
      paths={demoActivityPaths}
    />
  );
}
