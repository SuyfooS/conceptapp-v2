import "server-only";
import { countClockStationsForTeam } from "@db/clock-stations";
import { getPayAccessForTeam } from "@db/payroll";
import { hasPublishedWeekForTeam } from "@db/schedule";
import {
  enabledModules,
  type ModuleRow,
  readModuleSettings,
} from "@domain/modules";
import {
  type SetupModuleFacts,
  setupPay,
  storedShabbatAnswer,
} from "@domain/setup";
import { manifestFor, manifests } from "@modules/registry";

/**
 * What the console's checklist reads from a business's modules (closing the
 * pilot, PR 16), each only while its module is on: scheduling's job roles,
 * regular shifts and stored Shabbat answer, from the rows already read, and
 * whether a week was ever published; the time clock's code, where it is
 * shown, and its stations running while the code is on; and who sees pay,
 * where it applies (`pays`, `payAccessFrom`) and the person may read it. The
 * team isn't a member of the business, so RLS shows it none of these: each is
 * read with the secret key, and callers check first that the person is on
 * the team. Nothing here changes anything.
 */
export async function setupModuleFacts(
  businessId: string,
  rows: readonly ModuleRow[],
  pays: boolean,
): Promise<SetupModuleFacts> {
  const enabled = enabledModules(manifests, rows);
  const stored = (key: "scheduling" | "time_clock") =>
    rows.find((row) => row.key === key)?.settings;
  const scheduling = enabled.includes("scheduling")
    ? readModuleSettings(manifestFor("scheduling"), stored("scheduling"))
    : null;
  const clock = enabled.includes("time_clock")
    ? readModuleSettings(manifestFor("time_clock"), stored("time_clock"))
    : null;
  const [published, stations, pay] = await Promise.all([
    scheduling ? hasPublishedWeekForTeam(businessId) : false,
    // Only a code that is on is shown anywhere.
    clock?.requirePunchCode ? countClockStationsForTeam(businessId) : 0,
    pays ? getPayAccessForTeam(businessId) : null,
  ]);
  return {
    scheduling: scheduling
      ? {
          positions: scheduling.positions.length,
          patterns: scheduling.shifts.length,
          published,
          // What is stored, before the manifest's default.
          closedOnShabbat: storedShabbatAnswer(stored("scheduling")),
        }
      : null,
    timeClock: clock
      ? {
          requirePunchCode: clock.requirePunchCode,
          codeDisplay: clock.codeDisplay,
          stations,
        }
      : null,
    pay: pay ? setupPay(pay.roles, pay.people) : null,
  };
}
