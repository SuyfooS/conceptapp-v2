import { getDepartments } from "@db/departments";
import { getColleagues } from "@db/team";
import { isStaff } from "@domain/modules";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { saveDepartmentMembersAction, saveDepartmentsAction } from "../actions";
import { DepartmentsView } from "../departments-view";
import { listsOn, manageAccess } from "../manage";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage.departments");
  return { title: t("title") };
}

// The business's departments, for its owner and managers (and the team viewing
// as one), while lists are on: lists are what reads them today.
export default async function ManageDepartmentsPage() {
  const access = await manageAccess();
  if (!access || !listsOn(access.rows)) notFound();
  const [departments, people, wording] = await Promise.all([
    getDepartments(access.businessId),
    getColleagues(access.businessId),
    currentWording(),
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
      viewOnly={access.viewOnly}
      backHref="/manage"
      wording={wording}
    />
  );
}
