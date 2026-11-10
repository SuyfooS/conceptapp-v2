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
  const t = await getTranslations("app.lists.templates.editor");
  return { title: t("newTitle") };
}

// A new template for the business, made by the team in the console.
export default async function TeamNewListTemplatePage({
  params,
}: PageProps<"/admin/businesses/[slug]/lists/new">) {
  const { slug } = await params;
  const setup = await teamListsSetup(slug);
  if (!setup) notFound();
  const [paths, times] = await Promise.all([
    teamTemplatePaths(slug),
    setup.times("", null),
  ]);
  return (
    <TemplateEditor
      data={templateEditor({
        template: null,
        departments: setup.departments,
        shifts: setup.shifts,
        readOnly: false,
        changed: false,
        times,
      })}
      actions={{
        save: saveTeamListTemplateAction.bind(null, setup.business.id),
        archive: archiveTeamListTemplateAction.bind(null, setup.business.id),
      }}
      paths={paths}
    />
  );
}
