import "server-only";
import {
  getEmployeeFile,
  getFileHolderState,
  hasEmployeeKeys,
} from "@db/employee-files";
import { getTeamPerson } from "@db/team";
import { isUuid } from "@domain/activity";
import { unstable_rethrow } from "next/navigation";
import { currentFilesReader } from "../../file-access";
import { holderFileOf } from "./holder-file-parts";
import type { HolderFileHead, HolderFileScreen } from "./holder-file-types";
import { fileOpenFor } from "./step-up";

/**
 * Someone's hiring file as the signed-in holder reads it (profile H6a),
 * decided on each request, in this order, so nothing that logs is asked
 * before its turn: who reads the files here (`currentFilesReader`: a holder,
 * or a view session, which reads none); whether the person is a manager or
 * a worker on the team; whether this deployment can open a file at all
 * (no keys, no SMS); whether the holder confirmed today's duties, asked
 * without a log (`public.file_holder_state`); whether their files are open
 * on this device (the step-up's cookie); and only then the file, under
 * their own session, which logs `employee.view` once a day. Never cached;
 * an error logs its code and kind, never a message, and shows the screen
 * that can't open a file.
 */
export async function currentHolderFile(
  person: string,
): Promise<HolderFileScreen> {
  let head: HolderFileHead | null = null;
  try {
    const reader = await currentFilesReader();
    if (reader.kind === "none") return { kind: "closed" };
    if (reader.kind === "team" && !reader.viewing) return { kind: "closed" };
    if (!isUuid(person)) return { kind: "closed" };
    const place =
      reader.kind === "holder"
        ? {
            businessId: reader.holder.businessId,
            businessName: reader.holder.businessName,
            timeZone: reader.holder.timeZone,
          }
        : {
            businessId: reader.businessId,
            businessName: reader.businessName,
            timeZone: reader.timeZone,
          };
    const data = await getTeamPerson(place.businessId, person);
    // Owners' files aren't shown in H6a, and an accountant keeps none.
    if (!data || (data.role !== "manager" && data.role !== "worker")) {
      return { kind: "closed" };
    }
    head = {
      personId: data.userId,
      name: data.name,
      role: data.role,
      namedRole: data.namedRole ?? null,
      addressForm: data.addressForm,
      since: data.since,
      // A view as the accountant reads the files alone: back to the team's
      // files, never to a profile that sends it here again.
      seesTeam:
        reader.kind === "holder" ? reader.holder.seesTeam : reader.seesTeam,
      ...place,
    };
    if (reader.kind === "team") return { kind: "viewing", head };
    const { holder } = reader;
    if (!hasEmployeeKeys()) return { kind: "unavailable", head };

    const state = await getFileHolderState(holder.businessId);
    switch (state) {
      case "off":
      case "not_member":
      case "not_holder":
        return { kind: "closed" };
      case "viewing":
        return { kind: "viewing", head };
      case "unavailable":
        return { kind: "unavailable", head };
      case "ack":
        return { kind: "duties", head };
      case "ready":
        break;
    }
    if (!(await fileOpenFor(holder.businessId, holder.userId))) {
      return { kind: "locked", head };
    }

    // Logged (`employee.view`, once a day per person): only now.
    const read = await getEmployeeFile(holder.businessId, person);
    if (!read.ok) {
      if (read.failure !== "denied") return { kind: "unavailable", head };
      switch (read.reason) {
        case "ack":
          return { kind: "duties", head };
        case "viewing":
          return { kind: "viewing", head };
        case "off":
        case "not_member":
          return { kind: "closed" };
        default:
          return { kind: "unavailable", head };
      }
    }
    if (read.access !== "holder") return { kind: "closed" };
    return {
      kind: "open",
      head,
      data: holderFileOf(read, holder.settings, holder.today),
    };
  } catch (error) {
    // Next's own throws (a prefetch's render stopping at a request-time
    // read, a redirect) go on to Next: they are no failure of the file.
    unstable_rethrow(error);
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    // The error's kind, never its message: a message could carry a value.
    const kind = error instanceof Error ? error.name : typeof error;
    console.error("reading a holder's file failed", code, kind);
    return head ? { kind: "unavailable", head } : { kind: "closed" };
  }
}
