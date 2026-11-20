"use client";

import { CategoriesView } from "../../../../../(app)/orders/menu/categories/categories-view";
import { saveCategories } from "../../../changes";
import { paths, useOrderWords } from "../../../parts";
import { twinDepartments } from "../../../real-menu";
import { useTwinMenu } from "../menu-twin";

/**
 * The real categories screen on the twin's menu (waiter mode P2): renamed,
 * moved, added and removed with an undo, in the twin's store, so the menu
 * and the floor's picker follow.
 */
export function CategoriesTwin() {
  const { t } = useOrderWords();
  const { menu, data, update } = useTwinMenu();
  return (
    <CategoriesView
      menu={menu}
      departments={twinDepartments()}
      reach={{ edits: true, runsMenu: true, readOnly: null, marks: true }}
      save={(list) => {
        const saved = saveCategories(data, list);
        update(() => saved.data);
        return Promise.resolve({ ok: true, value: saved.ids });
      }}
      paths={{ menu: paths.menu, departments: paths.departments }}
      eyebrow={t("mode")}
    />
  );
}
