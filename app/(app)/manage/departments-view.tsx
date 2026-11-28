import type { ManageReadOnly } from "@domain/manage-access";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { type AppWording, translator } from "../wording";
import {
  type DepartmentPeople,
  DepartmentsEditor,
  type EditedDepartment,
  type SaveDepartmentMembers,
  type SaveDepartments,
} from "./departments-editor";

/**
 * The business's departments, for its owner and managers: the groups lists go
 * to, such as reception or the warehouse, and, while taking orders is on
 * (waiter mode P2), those that prepare what is ordered, such as the kitchen,
 * each saying then how many of the menu's items it prepares. Also on the
 * design demo.
 */
export function DepartmentsView({
  departments,
  people,
  save,
  saveMembers,
  readOnly,
  backHref,
  on = { lists: true, menu: false },
  itemsByDepartment,
  wording,
}: {
  departments: EditedDepartment[];
  people: DepartmentPeople;
  save: SaveDepartments;
  saveMembers: SaveDepartmentMembers;
  /**
   * Why nothing here saves, said in one line: a view session, or the person
   * at view on the management page. Null when it saves.
   */
  readOnly: ManageReadOnly;
  backHref: string;
  /** What reads the departments: lists, taking orders' menu, or both. */
  on?: { lists: boolean; menu: boolean };
  /** How many of the menu's items each prepares, by its id, while taking orders is on. */
  itemsByDepartment?: ReadonlyMap<string, number>;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={t("departments.title")}
        subtitle={t(
          on.menu && !on.lists
            ? "departments.subtitleMenu"
            : "departments.subtitle",
        )}
      />
      {readOnly ? (
        <p className="text-ink-2">
          {readOnly === "viewing" ? t("viewOnly") : t("readOnly.manage")}
        </p>
      ) : null}
      <DepartmentsEditor
        departments={departments}
        people={people}
        disabled={readOnly !== null}
        save={save}
        saveMembers={saveMembers}
        on={on}
        itemsByDepartment={itemsByDepartment}
      />
    </PageBody>
  );
}
