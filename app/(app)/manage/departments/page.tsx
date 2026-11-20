import { getDepartments } from "@db/departments";
import { getMenu } from "@db/order-taking";
import { getColleagues } from "@db/team";
import { enabledModules, isStaff } from "@domain/modules";
import { itemsByDepartment } from "@domain/order-taking";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { saveDepartmentMembersAction, saveDepartmentsAction } from "../actions";
import { DepartmentsView } from "../departments-view";
import { departmentsOn, manageAccess, menuOn } from "../manage";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage.departments");
  return { title: t("title") };
}

// The business's departments, for whoever sees the management page (and the
// team viewing as a role that does), saved by whoever edits it, while lists
// or taking orders are on, which read them; with taking orders, how many of
// the menu's items each prepares.
export default async function ManageDepartmentsPage() {
  const access = await manageAccess();
  if (!access || !departmentsOn(access.rows)) notFound();
  const menu = menuOn(access.rows);
  const [departments, people, wording, read] = await Promise.all([
    getDepartments(access.businessId),
    getColleagues(access.businessId),
    currentWording(),
    menu ? getMenu(access.businessId) : null,
  ]);
  return (
    <DepartmentsView
      departments={
        departments === "notYet"
          ? []
          : departments.filter((d) => d.archivedAt === null)
      }
      // A department is people on the staff: never an accountant.
      people={people
        .filter((p) => isStaff(p.role))
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          photo: p.photo,
        }))}
      save={saveDepartmentsAction}
      saveMembers={saveDepartmentMembersAction}
      readOnly={access.readOnly}
      backHref="/manage"
      on={{
        lists: enabledModules(manifests, access.rows).includes("lists"),
        menu,
      }}
      itemsByDepartment={
        read !== null && typeof read === "object"
          ? itemsByDepartment(read)
          : undefined
      }
      wording={wording}
    />
  );
}
