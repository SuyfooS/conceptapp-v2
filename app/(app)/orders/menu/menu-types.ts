import type { MenuFailure } from "@db/menu-failures";
import type { MenuImportRow } from "@domain/menu-import";
import type {
  CategoryInput,
  ItemInput,
  MenuItem,
  PlaceInput,
} from "@domain/order-taking";

/*
 * What the menu's screens and their actions share (waiter mode P2), in the
 * app, in the console and on the twins, which pass stand-ins that store
 * nothing.
 */

/** What a person may do on the menu's screens, and why not. */
export type MenuReach = {
  /** Saves anything on the menu: runs it, and isn't viewing. */
  edits: boolean;
  /** Runs the menu (order_taking.edit), or the role viewed as does. */
  runsMenu: boolean;
  /** Why only "נגמר" saves, if anything: a view session, or not running the menu. */
  readOnly: "viewing" | "menu" | null;
  /** Marks "נגמר" at all: never while viewing. */
  marks: boolean;
};

/** Why an action was refused: the database's reasons, and the server's own. */
export type MenuActionFailure = MenuFailure | "viewOnly" | "businessChanged";

export type MenuActionResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; failure: MenuActionFailure };

/**
 * An item's save: refused as "changed" when someone saved it since, with the
 * item as it is now (null when it is gone), so the sheet shows it.
 */
export type SaveItemResult =
  | { ok: true; value: { id: string; version: number } }
  | {
      ok: false;
      failure: MenuActionFailure;
      current?: MenuItem | null;
    };

export type MenuActions = {
  /** Adds an item (no id), or saves one from the version it read. */
  saveItem: (
    item: ItemInput,
    knownVersion: number | null,
  ) => Promise<SaveItemResult>;
  archiveItem: (id: string) => Promise<MenuActionResult>;
  restoreItem: (id: string) => Promise<MenuActionResult>;
  setAvailable: (id: string, available: boolean) => Promise<MenuActionResult>;
};

/** Saves the categories whole, in order: their ids back, in order. */
export type SaveCategories = (
  categories: CategoryInput[],
) => Promise<MenuActionResult<string[]>>;

/** Saves the places whole, in order: their ids back, in order. */
export type SavePlaces = (
  places: PlaceInput[],
) => Promise<MenuActionResult<string[]>>;

/** Writes a checked paste in one go: how many categories and items it added. */
export type ImportMenu = (
  rows: MenuImportRow[],
) => Promise<MenuActionResult<{ categories: number; items: number }>>;

/** A department as the menu's screens name it: live ones can be chosen. */
export type MenuDepartment = { id: string; name: string; live: boolean };
