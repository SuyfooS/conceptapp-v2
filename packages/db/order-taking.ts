import "server-only";
import { type MenuImportRow, menuImportRows } from "@domain/menu-import";
import {
  type CategoryInput,
  categoriesInput,
  type ItemInput,
  itemInput,
  type Menu,
  menuSchema,
  type PlaceInput,
  placesInput,
} from "@domain/order-taking";
import { z } from "zod";
import type { Json } from "./database.types";
import { type MenuFailure, menuFailureOf } from "./menu-failures";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Taking orders: the menu and the places
 * (supabase/migrations/20261117000500_order_taking_menu.sql). The read runs
 * as the signed-in person (`public.order_menu`: the staff, and a view as a
 * role on it, while the module is on). Writes run with the secret key for
 * `actorId`; the database checks who may do what, and callers check the
 * actor is the signed-in person and not viewing as someone else. Every input
 * is parsed here with the rules the database checks, and every answer is
 * parsed before it reaches a screen.
 */

/** Why a write was refused, for the screens' words (@db/menu-failures). */
export type { MenuFailure } from "./menu-failures";

/** A write's answer. */
export type MenuWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: MenuFailure };

const refused = (failure: MenuFailure) => ({ ok: false, failure }) as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

const savedSchema = z.object({ id: z.uuid(), version: z.int().min(1) });
const idsSchema = z.array(z.uuid());
const importedSchema = z.object({
  categories: z.int().min(0),
  items: z.int().min(0),
});

/**
 * The business's menu and places for the signed-in person
 * (`public.order_menu`): "same" when `knownVersion` is still the menu's,
 * "closed" for anyone it isn't for or while the module is off, and
 * "notYet" before the migration reaches the project.
 */
export async function getMenu(
  businessId: string,
  knownVersion?: number,
): Promise<Menu | "same" | "closed" | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_menu", {
    business: businessId,
    ...(knownVersion === undefined ? {} : { known_version: knownVersion }),
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    if (error.code === "P0002") return "closed";
    throw error;
  }
  if (data === null) return "same";
  const menu = menuSchema.safeParse(data);
  if (!menu.success) {
    console.error("reading the menu failed", menu.error.message);
    throw new Error("The menu came back in a shape the app doesn't read");
  }
  return menu.data;
}

/**
 * Saves the business's categories, in order (`public.set_menu_categories`):
 * one left out is removed, a removed one sent again by its id comes back,
 * one with no id is added. Returns their ids, in order.
 */
export async function setMenuCategories(
  actorId: string,
  businessId: string,
  categories: readonly CategoryInput[],
  at?: Date,
): Promise<MenuWrite<string[]>> {
  const parsed = categoriesInput.safeParse(categories);
  if (!parsed.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("set_menu_categories", {
    actor: actorId,
    business: businessId,
    categories: parsed.data as Json,
    ...atTime(at),
  });
  if (error) return refused(menuFailureOf(error, "saving the categories"));
  const ids = idsSchema.safeParse(data);
  return ids.success ? { ok: true, value: ids.data } : refused("failed");
}

/**
 * Adds an item (no id) or saves one (`public.save_menu_item`). `knownVersion`
 * is the version the editor read: a save behind it is refused ("changed").
 * Returns the item's id and its version now.
 */
export async function saveMenuItem(
  actorId: string,
  businessId: string,
  item: ItemInput,
  knownVersion?: number,
  at?: Date,
): Promise<MenuWrite<{ id: string; version: number }>> {
  const parsed = itemInput.safeParse(item);
  if (!parsed.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("save_menu_item", {
    actor: actorId,
    business: businessId,
    item: parsed.data as Json,
    ...(knownVersion === undefined ? {} : { known_version: knownVersion }),
    ...atTime(at),
  });
  if (error) return refused(menuFailureOf(error, "saving an item"));
  const saved = savedSchema.safeParse(data);
  return saved.success ? { ok: true, value: saved.data } : refused("failed");
}

/** Removes an item from the menu (`public.archive_menu_item`). */
export async function archiveMenuItem(
  actorId: string,
  businessId: string,
  itemId: string,
  at?: Date,
): Promise<MenuWrite<null>> {
  const { error } = await createAdminClient().rpc("archive_menu_item", {
    actor: actorId,
    business: businessId,
    item: itemId,
    ...atTime(at),
  });
  return error
    ? refused(menuFailureOf(error, "removing an item"))
    : { ok: true, value: null };
}

/** Brings a removed item back: the undo (`public.restore_menu_item`). */
export async function restoreMenuItem(
  actorId: string,
  businessId: string,
  itemId: string,
  at?: Date,
): Promise<MenuWrite<null>> {
  const { error } = await createAdminClient().rpc("restore_menu_item", {
    actor: actorId,
    business: businessId,
    item: itemId,
    ...atTime(at),
  });
  return error
    ? refused(menuFailureOf(error, "restoring an item"))
    : { ok: true, value: null };
}

/**
 * Marks an item sold out, or back (`public.set_menu_item_available`): by
 * whoever runs the menu, or someone on the staff in the department it goes
 * to.
 */
export async function setMenuItemAvailable(
  actorId: string,
  businessId: string,
  itemId: string,
  available: boolean,
  at?: Date,
): Promise<MenuWrite<null>> {
  const { error } = await createAdminClient().rpc("set_menu_item_available", {
    actor: actorId,
    business: businessId,
    item: itemId,
    is_available: available,
    ...atTime(at),
  });
  return error
    ? refused(menuFailureOf(error, "marking an item sold out"))
    : { ok: true, value: null };
}

/**
 * Writes a pasted menu in one go (`public.import_menu`), as
 * @domain/menu-import's `importRows` makes it: nothing is written if any row
 * is refused. Returns how many categories and items it added.
 */
export async function importMenu(
  actorId: string,
  businessId: string,
  rows: readonly MenuImportRow[],
  at?: Date,
): Promise<MenuWrite<{ categories: number; items: number }>> {
  const parsed = menuImportRows.safeParse(rows);
  if (!parsed.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("import_menu", {
    actor: actorId,
    business: businessId,
    rows: parsed.data as Json,
    ...atTime(at),
  });
  if (error) return refused(menuFailureOf(error, "importing a menu"));
  const imported = importedSchema.safeParse(data);
  return imported.success
    ? { ok: true, value: imported.data }
    : refused("failed");
}

/**
 * Saves the business's places, in order (`public.set_order_places`): one
 * left out is removed, a removed one sent again by its id comes back, one
 * with no id is added. Returns their ids, in order.
 */
export async function setOrderPlaces(
  actorId: string,
  businessId: string,
  places: readonly PlaceInput[],
  at?: Date,
): Promise<MenuWrite<string[]>> {
  const parsed = placesInput.safeParse(places);
  if (!parsed.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("set_order_places", {
    actor: actorId,
    business: businessId,
    places: parsed.data as Json,
    ...atTime(at),
  });
  if (error) return refused(menuFailureOf(error, "saving the places"));
  const ids = idsSchema.safeParse(data);
  return ids.success ? { ok: true, value: ids.data } : refused("failed");
}
