import { getEmployeeFile } from "@db/employee-files";
import { z } from "zod";
import { sameOriginRequest } from "@/app/origin";
import { rememberBankChangeSeen } from "../../business-cookie";
import { fileWriter, logged } from "../../me/file/file-writer";

/** Nothing to read in it, and never kept by a cache on the way. */
function answer(status: number): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * What the card sends: the business it was drawn for and the database's
 * moment of the change it told (`FileToday.bank.changedAt`).
 */
const SEEN = z
  .object({
    business: z.string().max(64),
    changedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/**
 * "אני שיניתי" or "הבנתי" on Today's bank change (H5b, `BankChangeCard`),
 * once its undo's time is up: that change is kept as seen on this device
 * (`rememberBankChangeSeen`), so Today stops telling it here. Only the
 * change the card was drawn for: the file is read again now, and when its
 * account changed since (someone else, a moment ago), nothing is kept and
 * the answer is 409, so Today, drawn again, tells the newer change. A moment
 * the page didn't get from the server can only fail to match, or hide the
 * current change on the sender's own device, which they could do anyway.
 * The person is the session's; refused while viewing as a role, for a
 * business other than the one open now, with the module off or off the
 * staff (`fileWriter`), and for a request another site sends; a signed-out
 * device is sent to sign in before it gets here. A route rather than a
 * server action, for the reason `sendHide` (../hide-request.ts) gives: a
 * hide sent on leaving Today reaches another page's worker, and Next drops
 * the Set-Cookie of an action forwarded from there.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return answer(403);
  const body = SEEN.safeParse(await request.json().catch(() => null));
  if (!body.success) return answer(400);
  const who = await fileWriter(body.data.business);
  if ("failure" in who) return answer(403);
  try {
    const read = await getEmployeeFile(who.businessId, who.userId);
    if (!read.ok) return answer(read.failure === "denied" ? 403 : 503);
    const changedAt = read.file?.bank_changed_at ?? null;
    if (
      changedAt === null ||
      Date.parse(changedAt) !== Date.parse(body.data.changedAt)
    ) {
      return answer(409);
    }
    await rememberBankChangeSeen({
      business: who.businessId,
      person: who.userId,
      changedAt,
    });
    return answer(204);
  } catch (error) {
    logged("keeping a bank change seen failed", error);
    return answer(500);
  }
}
