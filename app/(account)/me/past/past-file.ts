import "server-only";
import { getEmployeeFile } from "@db/employee-files";
import { isUuid } from "@domain/activity";
import { cityOf } from "@domain/cities";
import { unstable_rethrow } from "next/navigation";
import { currentDepartures } from "../../../(app)/departures";
import { currentMember } from "../../../(app)/member";
import { fileHolds } from "./past-file-parts";
import type { PastFileScreen, PastFrame, PastJob } from "./past-file-types";

/*
 * A former worker's own file in a business they left (profile H5c), read
 * under their own session through `public.employee_file`, which answers
 * `'self'` for a membership in any state and logs nothing for it, and
 * `'off'` while the module is off there. Only a business among their
 * departures (`own_departures`), checked before any file is read; never in
 * a view session; the person always the session's own, never an id from
 * the browser. Never cached: the answer is the person's, for this request
 * alone. Nothing here logs a value: a failure logs its code and kind.
 */

type Member = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

/** A read's failure, by its code and its kind, never its message: a message could carry a value. */
function logFailure(what: string, error: unknown): void {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(what, code, kind);
}

/**
 * The business the address names, when the signed-in person really left
 * it: an id, among their departures (off the team, `left_at` set), so never
 * one they are back in (/me/file serves that) or never were in. Null for
 * anything else, before any file is read.
 */
async function pastJobOf(
  business: unknown,
): Promise<{ member: Member; job: PastJob } | null> {
  if (!isUuid(business)) return null;
  const member = await currentMember();
  if (!member) return null;
  // The database's ids are lower case; an address may not be.
  const id = business.toLowerCase();
  const job = (await currentDepartures()).find(
    (departure) => departure.businessId.toLowerCase() === id,
  );
  return job ? { member, job } : null;
}

function frameOf(member: Member, job: PastJob): PastFrame {
  return {
    job,
    locale: member.profile.locale,
    back: member.membership ? "profile" : "list",
  };
}

/**
 * The old file's screen, or why not: not found for anything that isn't a
 * business they left; their own words while viewing as a role (no file is
 * read), with the module off there now, with nothing of theirs in it, or
 * without the keys here.
 */
export async function currentPastFile(
  business: unknown,
): Promise<PastFileScreen> {
  let frame: PastFrame | null = null;
  try {
    const found = await pastJobOf(business);
    if (!found) return { kind: "closed" };
    const { member, job } = found;
    frame = frameOf(member, job);
    // The database would only log a refusal, and a view in another
    // business wouldn't stop its 'self'.
    if (member.viewing) return { kind: "viewing", ...frame };

    const read = await getEmployeeFile(job.businessId, member.userId);
    if (!read.ok) {
      if (read.failure !== "denied") return { kind: "unavailable", ...frame };
      if (read.reason === "off") return { kind: "off", ...frame };
      if (read.reason === "viewing") return { kind: "viewing", ...frame };
      return { kind: "closed" };
    }
    // Their own, or nothing: a holder's read is never drawn here.
    if (read.access !== "self") return { kind: "closed" };
    if (!fileHolds(read)) return { kind: "empty", ...frame };
    return {
      kind: "file",
      data: {
        ...frame,
        demo: read.demo,
        file: read.file,
        address: read.address,
        city: cityOf(read.address?.cityCode ?? read.file?.city_code),
        email: read.email,
        workLanguage: read.workLanguage,
        documentName: read.documentName,
        holderName: read.holderName,
        emergency: read.emergency,
        masked: read.masked,
        taxYears: read.taxYears,
      },
    };
  } catch (error) {
    // Next's own throws (a prefetch's render stopping at a request-time
    // read, a redirect) go on to Next: they are no failure of the file.
    unstable_rethrow(error);
    logFailure("reading a past file failed", error);
    return frame ? { kind: "unavailable", ...frame } : { kind: "closed" };
  }
}

/**
 * "עבודות קודמות": the businesses the person left whose file they can
 * still read, latest first: the module on there and something of theirs in
 * it, each read once. None for nobody signed in or a view session; a read
 * refused or failed leaves that business out, and anything else that went
 * wrong leaves the list empty, which never takes the profile or the screen
 * of someone with no business down with it.
 */
export async function currentPastJobs(): Promise<PastJob[]> {
  try {
    const member = await currentMember();
    if (!member || member.viewing) return [];
    const departures = await currentDepartures();
    const open = await Promise.all(
      departures.map(async (job) => {
        try {
          const read = await getEmployeeFile(job.businessId, member.userId);
          return read.ok && read.access === "self" && fileHolds(read)
            ? job
            : null;
        } catch (error) {
          unstable_rethrow(error);
          logFailure("reading a past file for the list failed", error);
          return null;
        }
      }),
    );
    return open.filter((job): job is PastJob => job !== null);
  } catch (error) {
    unstable_rethrow(error);
    logFailure("listing past files failed", error);
    return [];
  }
}

/**
 * Who reveals a number of their old file (the action, ./actions.ts): the
 * session's own person, for a business they left, never in a view session.
 * Nothing is read of the file here.
 */
export async function pastReader(
  business: unknown,
): Promise<
  { userId: string; businessId: string } | { failure: "failed" | "viewOnly" }
> {
  const found = await pastJobOf(business);
  if (!found) return { failure: "failed" };
  if (found.member.viewing) return { failure: "viewOnly" };
  return { userId: found.member.userId, businessId: found.job.businessId };
}
