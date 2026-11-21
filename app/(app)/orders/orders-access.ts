import { getDepartments } from "@db/departments";
import { getOrderPeople } from "@db/orders";
import { departmentsOf } from "@domain/departments";
import { canWrite } from "@domain/view-as";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { currentOrderMode, type OrderModeReach } from "./order-mode";
import type { OrdersFrame } from "./orders-types";

/**
 * Who the mode's screens and actions are for, once per request (waiter mode
 * P4): someone on the staff, or the team viewing as a role on it, of a
 * business with taking orders on, whom the mode gives an item
 * (`currentOrderMode`). Null for anyone else, who gets the not-found screen.
 * With the people and departments its screens name, and the person's own
 * live departments (they never take back what went to one). While viewing,
 * every screen reads and nothing saves. The database decides every read and
 * write again.
 */
export const ordersAccess = cache(async () => {
  const [member, enabled, reach] = await Promise.all([
    currentMember(),
    currentModules(),
    currentOrderMode(),
  ]);
  const membership = member?.membership;
  if (!member || !membership || !enabled.includes("order_taking") || !reach) {
    return null;
  }
  const businessId = membership.business.id;
  const [settings, names, departments] = await Promise.all([
    currentModuleSettings("order_taking"),
    getOrderPeople(businessId),
    getDepartments(businessId),
  ]);
  const all = departments === "notYet" ? [] : departments;
  return {
    userId: member.userId,
    businessId,
    viewing: !canWrite(member.viewing),
    reach,
    timeZone: membership.business.place.timeZone,
    lateAfterMinutes: settings.lateAfterMinutes,
    names,
    departments: all,
    own: departmentsOf(all, member.userId, { live: true }),
  } as const;
});

export type OrdersAccess = NonNullable<
  Awaited<ReturnType<typeof ordersAccess>>
>;

/** What the mode's screens in the browser are told about the person and the business. */
export function frameOf(access: OrdersAccess): OrdersFrame {
  const { mode } = access.reach;
  return {
    business: access.businessId,
    userId: access.userId,
    viewing: access.viewing,
    takes: mode.takes,
    runs: mode.runs,
    clock: mode.clock,
    prepares: mode.departments,
    own: access.own,
    names: Object.fromEntries(access.names),
    departments: Object.fromEntries(
      access.departments.map((d) => [d.id, d.name]),
    ),
    departmentOrder: access.departments.map((d) => d.id),
    lateAfterMinutes: access.lateAfterMinutes,
    timeZone: access.timeZone,
  };
}

export type { OrderModeReach };
