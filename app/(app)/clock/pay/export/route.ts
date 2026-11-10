import { notePayrollExport } from "@db/payroll";
import { currentPayrollFile } from "./export-data";
import { fileResponse, isPrefetch, noFile, ownRequest } from "./file";

/**
 * The month's file for payroll (payroll P8, plan §11): `GET ?month=YYYY-MM`,
 * nothing else in the address. With the person's own session, for whoever may
 * open the pay screens (`clock.payroll`, or the team viewing as an
 * accountant); 404 for anyone else and for a month that isn't one. The file
 * is built, then logged (`payroll.export`), and only then sent: if the row
 * can't be written, no file goes out. The screen links here with a plain
 * `<a download>`, never a `<Link>`, so no prefetch builds or logs one, and a
 * prefetch or another site's link gets nothing.
 */
export async function GET(request: Request): Promise<Response> {
  if (isPrefetch(request)) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  if (!ownRequest(request)) return noFile();

  const month = new URL(request.url).searchParams.get("month");
  const file = await currentPayrollFile(month);
  if (!file) return noFile();

  try {
    await notePayrollExport(file.businessId, {
      month: file.month,
      people: file.people,
      shifts: file.shifts,
      engineVersion: file.engineVersion,
    });
  } catch (error) {
    // No row, no file. A refusal here (42501) means the screens let someone
    // through the database doesn't: the same answer as no access.
    const code = (error as { code?: string } | null)?.code;
    if (code === "42501") return noFile();
    console.error(
      "noting the file for payroll failed",
      error instanceof Error ? error.message : code,
    );
    return noFile(500);
  }
  return fileResponse(file);
}

/**
 * Next answers HEAD with GET unless a route says otherwise, which would build
 * and log a file that never goes out. Only GET takes the file.
 */
export function HEAD(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "private, no-store" },
  });
}
