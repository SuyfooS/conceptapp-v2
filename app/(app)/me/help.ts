import { getDepartments } from "@db/departments";
import { supportWhatsapp } from "@db/env";
import { getColleagues } from "@db/team";
import { getClockEditors } from "@db/time-clock";
import type { ClockEditor } from "@domain/ask-fix";
import { helpers, helpOf } from "@domain/help";
import { canOpenModule, isStaff } from "@domain/modules";
import { isDemoBusiness } from "@domain/passive-sign-in";
import { manifestFor } from "@modules/registry";
import { chatPaths } from "../chat/chat-paths";
import type { HoursFixerLink } from "../clock/clock-types";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import type { HelpData } from "./help-sheet";

/**
 * What "עזרה" on /me offers the signed-in person (closing the pilot, PR 15),
 * or null for no row: whom to ask in the business (`helpers`, the clock's own
 * choice: a worker asks whoever may edit the clock, else an owner; anyone
 * else an owner), each with their private chat's address where chat is open
 * to the person (written here, as the clock writes them), and, for an owner,
 * a manager or the accountant outside a demo business, ConceptApp's team on
 * WhatsApp where this deployment names its number (`supportWhatsapp`).
 * Nothing while viewing as someone. A read that fails leaves whom to ask
 * out, and says so in the log: the profile still opens, and ConceptApp's
 * team stays.
 */
export async function currentHelp(): Promise<HelpData | null> {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (!member || !membership || member.viewing) return null;
  const { business, role } = membership;
  const demo = isDemoBusiness(business.slug);
  const phone = supportWhatsapp();
  // As the clock and chat ask it: an accountant is in no chat.
  const chat =
    isStaff(role) && canOpenModule(manifestFor("chat"), enabled, membership);

  let fixers: HoursFixerLink[] = [];
  try {
    const clockOn = enabled.includes("time_clock");
    const [editors, departments] = await Promise.all([
      // Only a worker asks whoever may edit the clock; nobody may while it is off.
      role === "worker" && clockOn ? getClockEditors(business.id) : [],
      getDepartments(business.id),
    ]);
    const owners: ClockEditor[] =
      editors.length > 0
        ? editors.filter((editor) => editor.role === "owner")
        : (await getColleagues(business.id))
            .filter((colleague) => colleague.role === "owner")
            .map((owner) => ({
              id: owner.userId,
              role: owner.role,
              name: owner.name,
            }));
    fixers = helpers({
      role,
      person: member.userId,
      editors,
      owners,
      departments: departments === "notYet" ? [] : departments,
      chat,
    }).map((fixer) => ({
      ...fixer,
      href: fixer.chat ? chatPaths.withPerson(fixer.id) : null,
    }));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("whom to ask for help could not be read", code);
  }

  const help = helpOf({
    fixers,
    role,
    // Viewing as someone was answered above, before any read.
    viewing: false,
    demo,
    support: phone !== null,
  });
  if (!help) return null;
  return {
    ask: help.ask,
    team: help.team && phone !== null ? { phone } : null,
    business: business.name,
  };
}
