"use client";

import type { Menu } from "@domain/order-taking";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import type { MenuPaths } from "../menu-parts";
import type { MenuDepartment, MenuReach, SaveCategories } from "../menu-types";
import { CategoriesEditor } from "./categories-editor";

/**
 * The menu's categories (waiter mode P2): what each is called, where its
 * items are prepared, and the menu's order. For whoever runs the menu; a
 * view as such a role reads it and changes nothing. Also on the twin.
 */
export function CategoriesView({
  menu,
  departments,
  reach,
  save,
  paths,
  eyebrow,
}: {
  menu: Menu;
  departments: MenuDepartment[];
  reach: MenuReach;
  save: SaveCategories;
  paths: Pick<MenuPaths, "menu" | "departments">;
  eyebrow?: string;
}) {
  const t = useTranslations("app.orders.categories");
  const tm = useTranslations("app.orders.menu");
  const tn = useTranslations("modules");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.menu, label: tm("title") }}
        eyebrow={eyebrow ?? tn("order_taking.name")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      {reach.readOnly === "viewing" ? (
        <p className="text-ink-2">{tm("readOnly.viewing")}</p>
      ) : null}
      <CategoriesEditor
        categories={menu.categories}
        items={menu.items}
        departments={departments}
        disabled={!reach.edits}
        save={save}
        departmentsHref={paths.departments}
        version={menu.version}
      />
    </PageBody>
  );
}
