"use server";

import {
  archiveMenuItem,
  getMenu,
  importMenu,
  type MenuWrite,
  restoreMenuItem,
  saveMenuItem,
  setMenuCategories,
  setMenuItemAvailable,
  setOrderPlaces,
} from "@db/order-taking";
import { menuImportRows } from "@domain/menu-import";
import { categoriesInput, itemInput, placesInput } from "@domain/order-taking";
import { refresh } from "next/cache";
import { z } from "zod";
import { type MenuAccess, menuAccess } from "./menu-access";
import type { MenuActionResult, SaveItemResult } from "./menu-types";

/*
 * The menu's writes as the signed-in person (waiter mode P2). Each is bound on
 * its page to the business it was drawn for: the business the app opens is
 * one cookie for the whole browser, so a save from a tab left open may arrive
 * after the person switched business, and is refused then, never written in
 * the other one (a whole list of categories or places would replace its
 * own). Never while viewing as someone. Every argument is parsed here, and
 * the database decides who may do what again. Each refreshes the screen, so
 * the views take the menu's new version.
 */

const id = z.uuid();
const version = z.int().min(1).nullable();

type Refusal = Extract<MenuActionResult, { ok: false }>;

/**
 * The person, when the write is theirs to try: someone on the staff with
 * taking orders on, in the business the screen was drawn for, not viewing,
 * and, unless it is "נגמר", running the menu.
 */
async function writer(
  business: unknown,
  needs: "edits" | "marks",
): Promise<MenuAccess | Refusal> {
  const access = await menuAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewing) return { ok: false, failure: "viewOnly" };
  if (needs === "edits" && !access.edits) {
    return { ok: false, failure: "noAccess" };
  }
  return access;
}

const refusedBefore = (access: MenuAccess | Refusal): access is Refusal =>
  "ok" in access;

/** The write's answer, after the screen is drawn again. */
function answered<T>(result: MenuWrite<T>): MenuActionResult<T> {
  refresh();
  return result;
}

/**
 * Adds an item, or saves one from the version the sheet read. Refused as
 * "changed" when someone saved it since, with the item as it is now, so the
 * sheet shows it and the person saves again.
 */
export async function saveItemAction(
  business: string,
  item: unknown,
  knownVersion: unknown,
): Promise<SaveItemResult> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const parsed = itemInput.safeParse(item);
  const seen = version.safeParse(knownVersion ?? null);
  if (!parsed.success || !seen.success) {
    return { ok: false, failure: "invalid" };
  }
  const result = await saveMenuItem(
    access.userId,
    access.businessId,
    parsed.data,
    seen.data ?? undefined,
  );
  if (!result.ok && result.failure === "changed" && parsed.data.id) {
    const menu = await getMenu(access.businessId);
    const current =
      typeof menu === "object"
        ? (menu.items.find((candidate) => candidate.id === parsed.data.id) ??
          null)
        : null;
    refresh();
    return { ok: false, failure: "changed", current };
  }
  return answered(result);
}

/** Removes an item from the menu; the undo brings it back. */
export async function archiveItemAction(
  business: string,
  itemId: unknown,
): Promise<MenuActionResult> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const item = id.safeParse(itemId);
  if (!item.success) return { ok: false, failure: "invalid" };
  return answered(
    await archiveMenuItem(access.userId, access.businessId, item.data),
  );
}

/** Brings a removed item back: the undo. */
export async function restoreItemAction(
  business: string,
  itemId: unknown,
): Promise<MenuActionResult> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const item = id.safeParse(itemId);
  if (!item.success) return { ok: false, failure: "invalid" };
  return answered(
    await restoreMenuItem(access.userId, access.businessId, item.data),
  );
}

/**
 * Marks an item sold out, or back: whoever runs the menu, or someone in the
 * department it goes to, which the database checks.
 */
export async function setAvailableAction(
  business: string,
  itemId: unknown,
  available: unknown,
): Promise<MenuActionResult> {
  const access = await writer(business, "marks");
  if (refusedBefore(access)) return access;
  const item = id.safeParse(itemId);
  const on = z.boolean().safeParse(available);
  if (!item.success || !on.success) return { ok: false, failure: "invalid" };
  return answered(
    await setMenuItemAvailable(
      access.userId,
      access.businessId,
      item.data,
      on.data,
    ),
  );
}

/** Saves the categories whole, in order: renamed, moved, added or removed. */
export async function saveCategoriesAction(
  business: string,
  categories: unknown,
): Promise<MenuActionResult<string[]>> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const parsed = categoriesInput.safeParse(categories);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  return answered(
    await setMenuCategories(access.userId, access.businessId, parsed.data),
  );
}

/** Saves the places whole, in order. */
export async function savePlacesAction(
  business: string,
  places: unknown,
): Promise<MenuActionResult<string[]>> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const parsed = placesInput.safeParse(places);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  return answered(
    await setOrderPlaces(access.userId, access.businessId, parsed.data),
  );
}

/** Writes a pasted menu, checked on the screen, in one go. */
export async function importMenuAction(
  business: string,
  rows: unknown,
): Promise<MenuActionResult<{ categories: number; items: number }>> {
  const access = await writer(business, "edits");
  if (refusedBefore(access)) return access;
  const parsed = menuImportRows.safeParse(rows);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  return answered(
    await importMenu(access.userId, access.businessId, parsed.data),
  );
}
