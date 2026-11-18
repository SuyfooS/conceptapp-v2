import "server-only";
import { canSwitchBusiness } from "@domain/businesses";
import type { BusinessChoice, ChooseBusiness } from "@ui/business-switcher";
import { cache } from "react";
import { chooseBusinessAction } from "./business-switch";
import { currentMember } from "./member";
import { translator, wordingFrom } from "./wording";

/** The person's businesses as the switcher shows them, and the switch. */
export type Businesses = { list: BusinessChoice[]; action: ChooseBusiness };

/**
 * The businesses the signed-in person can switch between (payroll P3b), once
 * per request: null for someone in one business, and while viewing as
 * someone, so nobody else ever sees a switcher. In the switcher's order,
 * their place on a staff first, each with their role there in that
 * business's own words (a kind of business may rename its roles), so a row
 * reads the same whichever business the person is in, and their unread
 * lines there.
 */
export const currentBusinesses = cache(async (): Promise<Businesses | null> => {
  const member = await currentMember();
  if (
    !member?.membership ||
    member.viewing ||
    !canSwitchBusiness(member.businesses.length)
  ) {
    return null;
  }
  const here = member.membership.business.id;
  return {
    list: member.businesses.map((own) => ({
      id: own.business.id,
      name: own.business.name,
      accent: own.business.accent,
      role: translator(
        wordingFrom(own.business.wording),
        "app",
      )(`roles.${own.role}`),
      unread: own.unread.all,
      current: own.business.id === here,
    })),
    action: chooseBusinessAction,
  };
});
