import { getListTemplatesForTeam } from "@db/lists";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { templatesScreen } from "@/app/(app)/lists/templates/templates-data";
import { TemplatesView } from "@/app/(app)/lists/templates/templates-view";
import { restoreTeamListTemplateAction } from "../actions";
import { teamListsSetup, teamTemplatePaths } from "./team-lists";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.lists.templates");
  return { title: t("title") };
}

// A business's list templates as the team sets them up: the same screen its
// list managers have, with the console's own actions. `?removed=` is one just
// removed in its editor, with its undo.
export default async function TeamListTemplatesPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]/lists">) {
  const [{ slug }, { removed }] = await Promise.all([params, searchParams]);
  const setup = await teamListsSetup(slug);
  if (!setup) notFound();
  const [templates, paths] = await Promise.all([
    getListTemplatesForTeam(setup.business.id),
    teamTemplatePaths(slug),
  ]);
  return (
    <TemplatesView
      data={templatesScreen({
        templates: templates === "notYet" ? [] : templates,
        departments: setup.departments,
        shifts: setup.shifts,
        removed: typeof removed === "string" ? removed : undefined,
        readOnly: false,
      })}
      restore={restoreTeamListTemplateAction.bind(null, setup.business.id)}
      paths={paths}
    />
  );
}
