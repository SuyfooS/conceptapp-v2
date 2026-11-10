import { getListTemplateForTeam } from "@db/lists";
import { isUuid } from "@domain/activity";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TemplateEditor } from "@/app/(app)/lists/templates/template-editor";
import { templateEditor } from "@/app/(app)/lists/templates/templates-data";
import {
  archiveTeamListTemplateAction,
  saveTeamListTemplateAction,
} from "../../actions";
import { teamListsSetup, teamTemplatePaths } from "../team-lists";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.lists.templates");
  return { title: t("title") };
}

// One of a business's templates in the editor its list managers have, as the
// team sets it up, with the console's own actions. The team sends nothing.
export default async function TeamListTemplatePage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]/lists/[id]">) {
  const [{ slug, id }, { changed }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const setup = await teamListsSetup(slug);
  if (!setup) notFound();
  const [template, paths] = await Promise.all([
    getListTemplateForTeam(setup.business.id, id),
    teamTemplatePaths(slug),
  ]);
  if (!template || template === "notYet") notFound();
  const stamp = typeof changed === "string" ? changed : "";
  return (
    <TemplateEditor
      key={`${id}:${template.version}:${stamp}`}
      data={templateEditor({
        template,
        departments: setup.departments,
        shifts: setup.shifts,
        readOnly: false,
        changed: stamp !== "",
      })}
      actions={{
        save: saveTeamListTemplateAction.bind(null, setup.business.id),
        archive: archiveTeamListTemplateAction.bind(null, setup.business.id),
      }}
      paths={paths}
    />
  );
}
