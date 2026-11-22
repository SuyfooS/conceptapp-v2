"use server";

import { revealEmployeeFields } from "@db/employee-files";
import { REVEAL_FIELDS } from "@domain/employee-file";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { RevealAnswer } from "../../../(app)/me/file/file-types";
import { logged } from "../../../(app)/me/file/file-writer";
import { pastReader } from "./past-file";

/*
 * A former worker's own number in a business they left (profile H5c),
 * bound on the page to that business: the session's own person, never in a
 * view session, only for a business among their departures (`pastReader`).
 * The database answers `'off'` with the module off there, and logs nothing
 * for a person's own reveal. The number is in this answer only: a POST's,
 * never cached and never in a URL. A failure logs its code.
 */

export async function revealPastAction(
  business: string,
  field: "id" | "bank_account",
): Promise<RevealAnswer> {
  try {
    const who = await pastReader(business);
    if ("failure" in who) return { ok: false, failure: who.failure };
    const which = z.enum(REVEAL_FIELDS).safeParse(field);
    if (!which.success) return { ok: false, failure: "invalid" };
    const revealed = await revealEmployeeFields(who.businessId, who.userId, [
      which.data,
    ]);
    if (!revealed.ok) return { ok: false, failure: revealed.failure };
    return {
      ok: true,
      value: which.data === "id" ? revealed.id : revealed.bankAccount,
    };
  } catch (error) {
    // Next's own throws go on to Next: they are no failure of the reveal.
    unstable_rethrow(error);
    return { ok: false, ...logged("revealing a past number failed", error) };
  }
}
