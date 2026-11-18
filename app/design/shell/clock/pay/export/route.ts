import {
  fileResponse,
  noFile,
  payrollFileOf,
} from "../../../../../(app)/clock/pay/export/file";
import { baseWording } from "../../../../../(app)/wording";
import { demoPayDifferences, demoPayExport } from "../data";

// The demo's stand-in for /clock/pay/export: October's file for payroll from
// the pay demo's rows, built by the app's own code, logged nowhere. Only the
// demo's month has one. `?close=` follows the screen's (`demoPayPathsFor`):
// "before" adds September's differences, closed and changed since (payroll
// P9), and "empty" is an October with no hours of its own and the same
// differences.
export async function GET(request: Request): Promise<Response> {
  const demo = demoPayExport();
  const asked = new URL(request.url).searchParams;
  if (asked.get("month") !== demo.meta.month) return noFile();
  const close = asked.get("close");
  if (close === "empty") {
    return fileResponse(
      payrollFileOf({
        ...demo,
        month: { ...demo.month, people: [] },
        people: [],
        differences: demoPayDifferences(),
        wording: baseWording,
      }),
    );
  }
  return fileResponse(
    payrollFileOf({
      ...demo,
      differences: close === "before" ? demoPayDifferences() : null,
      wording: baseWording,
    }),
  );
}
