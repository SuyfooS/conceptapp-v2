import type { MenuImportRow } from "@domain/menu-import";
import type {
  ItemInput,
  Menu,
  MenuCategory,
  OptionGroup,
  OrderPlace,
} from "@domain/order-taking";
import { orderDemoDepartments, orderDemoTables } from "./data";
import type {
  Category,
  ChoiceGroup,
  DepartmentKey,
  MenuItem,
  Place,
  Menu as TwinMenuRows,
} from "./model";
import type { DemoData } from "./scenario";

/*
 * The twin's rows as the real menu screens read them (waiter mode P2): S0's
 * store stays the one store, so what the menu marks sold out greys the
 * picker on the floor too, and the real screens draw it as the app does. And
 * back: what a real screen saves, as S0's rows. Pure, so it is tested
 * (order-taking.test.ts).
 */

/** A department as the menu's screens name it. */
export type TwinDepartment = { id: string; name: string; live: boolean };

/** The twin's departments, live, and one removed when a screen shows it so. */
export function twinDepartments(
  removed: readonly TwinDepartment[] = [],
): TwinDepartment[] {
  return [
    ...orderDemoDepartments.map((d) => ({
      id: d.key,
      name: d.name,
      live: true,
    })),
    ...removed,
  ];
}

const groupOf = (group: ChoiceGroup): OptionGroup => ({
  id: group.id,
  name: group.name,
  min: group.min,
  max: group.max,
  options: group.options.map((option) => ({
    id: option.id,
    name: option.name,
    priceAgorot: option.price,
  })),
});

const choiceGroupOf = (group: OptionGroup): ChoiceGroup => ({
  id: group.id,
  name: group.name,
  min: group.min,
  max: group.max,
  options: group.options.map((option) => ({
    id: option.id,
    name: option.name,
    price: option.priceAgorot,
  })),
});

/** The twin's tables, as places. */
export const twinPlaces = (
  tables: readonly Place[] = orderDemoTables,
): OrderPlace[] =>
  tables.map((table) => ({
    id: table.id,
    name: table.name ?? "",
  }));

/**
 * The twin's menu as `public.order_menu` gives one: its categories, the items
 * of each in that order (one whose category was removed is left out with
 * it), each going where its category does and sold out as the store says,
 * at the version the twin counts.
 */
export function twinMenu(
  data: Pick<DemoData, "menu" | "soldOut">,
  version: number,
  places: OrderPlace[] = twinPlaces(),
): Menu {
  const categories: MenuCategory[] = data.menu.categories.map((c) => ({
    id: c.id,
    name: c.name,
    department: c.department,
  }));
  return {
    version,
    categories,
    items: categories.flatMap((category) =>
      data.menu.items
        .filter((item) => item.categoryId === category.id)
        .map((item) => ({
          id: item.id,
          category: item.categoryId,
          name: item.name,
          description: null,
          priceAgorot: item.price,
          department: null,
          route: category.department,
          available: !data.soldOut.includes(item.id),
          optionGroups: item.groups.map(groupOf),
          version: 1,
        })),
    ),
    places,
  };
}

/**
 * The menu with one category's department removed: it still names it, and
 * its items, going nowhere now, say so (the twin's `?state=noRoute`).
 */
export function withoutDepartment(
  menu: Menu,
  categoryId: string,
  removedId: string,
): Menu {
  return {
    ...menu,
    categories: menu.categories.map((c) =>
      c.id === categoryId ? { ...c, department: removedId } : c,
    ),
    items: menu.items.map((item) =>
      item.category === categoryId && item.department === null
        ? { ...item, route: null }
        : item,
    ),
  };
}

const isDepartmentKey = (key: string): key is DepartmentKey =>
  orderDemoDepartments.some((d) => d.key === key);

/** An item a real screen saved, as S0's row: its choices as they were sent. */
export function fromItemInput(input: ItemInput, id: string): MenuItem {
  return {
    id,
    categoryId: input.category,
    name: input.name,
    price: input.priceAgorot,
    groups: (input.optionGroups ?? []).map(choiceGroupOf),
  };
}

/**
 * The twin's categories saved whole, as `public.set_menu_categories` saves
 * them: in the order sent, renamed and moved; one left out is gone, its items
 * kept for its undo; one sent again by its id comes back with them; one with
 * no id is new, by `newId`. A department the twin doesn't have keeps the
 * category's own. Returns the rows and the ids in order.
 */
export function savedCategories(
  rows: TwinMenuRows,
  list: readonly { id?: string; name: string; department: string }[],
  newId: () => string,
): { menu: TwinMenuRows; ids: string[] } {
  const categories: Category[] = list.map((entry) => {
    const before = entry.id
      ? rows.categories.find((c) => c.id === entry.id)
      : undefined;
    return {
      id: entry.id ?? newId(),
      name: entry.name.trim(),
      department: isDepartmentKey(entry.department)
        ? entry.department
        : (before?.department ?? "kitchen"),
    };
  });
  return {
    menu: { ...rows, categories },
    ids: categories.map((c) => c.id),
  };
}

/**
 * A checked paste as `public.import_menu` writes it, onto S0's rows: a
 * category the menu has by that name (case aside) takes the items after it
 * and keeps its department; a new one goes last, to the department chosen.
 */
export function importedRows(
  rows: TwinMenuRows,
  imported: readonly MenuImportRow[],
  newId: () => string,
): { menu: TwinMenuRows; categories: number; items: number } {
  const categories = [...rows.categories];
  const items = [...rows.items];
  let current: Category | null = null;
  let added = 0;
  let addedItems = 0;
  for (const row of imported) {
    if ("category" in row) {
      const { name, department } = row.category;
      current =
        categories.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
        null;
      if (!current) {
        current = {
          id: newId(),
          name,
          department: isDepartmentKey(department) ? department : "kitchen",
        };
        categories.push(current);
        added += 1;
      }
    } else if (current) {
      items.push({
        id: newId(),
        categoryId: current.id,
        name: row.item.name,
        price: row.item.priceAgorot,
        groups: (row.item.optionGroups ?? []).map(choiceGroupOf),
      });
      addedItems += 1;
    }
  }
  return {
    menu: { categories, items },
    categories: added,
    items: addedItems,
  };
}
