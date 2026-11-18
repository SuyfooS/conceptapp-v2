import type { Businesses } from "../../(app)/businesses";
import { baseWording, translator } from "../../(app)/wording";
import { demoChooseBusiness } from "./actions";
import { demoBusinesses, demoBusinessHere } from "./data";

/**
 * The demo's accountant's businesses as the switcher shows them (payroll
 * P3b), with the app's own words and a stand-in switch.
 */
export function demoSwitcher(): Businesses {
  const t = translator(baseWording, "app");
  return {
    list: demoBusinesses.map((business) => ({
      ...business,
      role: t(`roles.${business.role}`),
      current: business.id === demoBusinessHere,
    })),
    action: demoChooseBusiness,
  };
}
