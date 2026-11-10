import {
  fileResponse,
  noFile,
  payrollFileOf,
} from "../../../../../(app)/clock/pay/export/file";
import { baseWording } from "../../../../../(app)/wording";
import { demoPayExport } from "../data";

// The demo's stand-in for /clock/pay/export: October's file for payroll from
// the pay demo's rows, built by the app's own code, logged nowhere. Only the
// demo's month has one.
export async function GET(request: Request): Promise<Response> {
  const demo = demoPayExport();
  const month = new URL(request.url).searchParams.get("month");
  if (month !== demo.meta.month) return noFile();
  return fileResponse(payrollFileOf({ ...demo, wording: baseWording }));
}
