import { isMissingFunction } from "./missing";

/*
 * Why a write to the menu or the places was refused, from what the database
 * said (supabase/migrations/20261117000500_order_taking_menu.sql), for the
 * screens' words. Kept apart from @db/order-taking, which is server only, so
 * it is tested on its own.
 */

/** Why a write was refused. */
export type MenuFailure =
  /** Not theirs to do (42501). */
  | "noAccess"
  /** Taking orders is off for the business (42501, hint 'off'). */
  | "off"
  /** An item, a category or a place the business doesn't have (P0002). */
  | "gone"
  /** A shape the database won't keep (22023). */
  | "invalid"
  /** A department that isn't live in the business (22023, hint 'route'). */
  | "route"
  /** A category that isn't live in the business (22023, hint 'category'). */
  | "category"
  /** Choices that don't hold (22023, hint 'choices'). */
  | "choices"
  /** A name the menu or the places have twice (23505). */
  | "taken"
  /** Changed since it was read (40001). */
  | "changed"
  /** Past the menu's caps (54000). */
  | "tooMany"
  /** A removed item, restored first (55000, hint 'archived'). */
  | "archived"
  /** An item whose category is removed (55000, hint 'category'). */
  | "categoryRemoved"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

/** What the database says when it refuses, as supabase-js passes it on. */
export type DatabaseRefusal = {
  code?: string;
  message: string;
  hint?: string | null;
};

/**
 * The failure a refusal means, by its code and its hint. A missing function
 * is "notYet", so a write that ships before its migration says the menu
 * isn't ready yet. `what` names the write in the server's log when nothing
 * else fits.
 */
export function menuFailureOf(
  error: DatabaseRefusal,
  what = "a menu write",
): MenuFailure {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
      return error.hint === "off" ? "off" : "noAccess";
    case "P0002":
      return "gone";
    case "22023":
      switch (error.hint) {
        case "route":
          return "route";
        case "category":
          return "category";
        case "choices":
          return "choices";
        default:
          return "invalid";
      }
    case "23505":
      return "taken";
    case "40001":
      return "changed";
    case "54000":
      return "tooMany";
    case "55000":
      return error.hint === "category" ? "categoryRemoved" : "archived";
    default:
      console.error(`${what} failed`, error.message);
      return "failed";
  }
}
