import { itemsByDepartment } from "@domain/order-taking";
import { orderDemoMenu } from "../../../order-taking/data";
import { twinMenu } from "../../../order-taking/real-menu";
import { demoDepartments } from "../../lists/data";

/**
 * How many of the menu twin's items each of the demo's departments prepares
 * (waiter mode P2): the twin's kitchen and bar are the demo's, by key.
 */
export function menuItemsByDepartment(): Map<string, number> {
  const counts = itemsByDepartment(
    twinMenu({ menu: orderDemoMenu, soldOut: [] }, 1),
  );
  return new Map(
    demoDepartments.flatMap((d) => {
      const count = counts.get(d.key);
      return count ? [[d.id, count] as const] : [];
    }),
  );
}
