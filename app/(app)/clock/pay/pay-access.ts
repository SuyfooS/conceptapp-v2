import { isStaff } from "@domain/modules";
import { canSeePay, defaultPayMonth } from "@domain/payroll-access";
import { canSeeTeam } from "@domain/team";
import { monthOf } from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { cache } from "react";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";

/**
 * The signed-in person and their business, when the clock is on and they hold
 * pay access (`clock.payroll`, from `public.my_permissions`: owners and
 * accountants always, a view only as an accountant). Null otherwise: the pay
 * screens then don't exist for them. Its own file, so the month's loaders
 * (`pay.ts`) and the hours engine's (`pay-month.ts`) both read it.
 */
export const payAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    !enabled.includes("time_clock") ||
    !canSeePay(membership)
  ) {
    return null;
  }
  const timeZone = membership.business.place.timeZone;
  const today = clockAt(new Date(), timeZone).date;
  const staff = isStaff(membership.role);
  return {
    userId: member.userId,
    businessId: membership.business.id,
    role: membership.role,
    timeZone,
    today,
    /** Someone from ConceptApp viewing: they read pay, and change nothing. */
    viewOnly: !canWrite(member.viewing),
    currentMonth: monthOf(today),
    defaultMonth: defaultPayMonth(today),
    /** Managers and owners fix and confirm hours on the team's hours. */
    fixes: canSeeTeam(membership.role),
    /**
     * They type a birth date (payroll P5): an owner or the accountant, the
     * circle that will hold the hiring file. Never in a view.
     */
    birth:
      canWrite(member.viewing) &&
      (membership.role === "owner" || membership.role === "accountant"),
    back: !staff
      ? null
      : canSeeTeam(membership.role)
        ? ("team" as const)
        : ("clock" as const),
  };
});

export type PayAccess = NonNullable<Awaited<ReturnType<typeof payAccess>>>;
