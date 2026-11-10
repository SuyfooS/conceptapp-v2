import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import {
  archiveListTemplateAction,
  saveListTemplateAction,
} from "../../actions";
import {
  currentTemplateEditor,
  listsAccess,
  listsPaths,
  templatePaths,
} from "../../lists";
import { TemplateEditor } from "../template-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.lists.templates");
  return { title: t("title") };
}

// One template in its editor, for whoever manages lists. A template they may
// not read does not exist for them; anyone else who opens lists goes back to
// Lists. `?changed=` comes back from a save someone else's had overtaken:
// the editor opens afresh with the latest and says so.
export default async function ListTemplatePage({
  params,
  searchParams,
}: PageProps<"/lists/templates/[id]">) {
  const [{ id }, { changed }] = await Promise.all([params, searchParams]);
  const stamp = typeof changed === "string" ? changed : "";
  const [data, access] = await Promise.all([
    currentTemplateEditor(id, stamp !== ""),
    listsAccess(),
  ]);
  if (!access) notFound();
  if (!data) {
    if (access.canManage) notFound();
    redirect(listsPaths.lists);
  }
  const t = translator(baseWording, "app.lists");
  return (
    <TemplateEditor
      // Afresh whenever the stored template moved on: a reload after a
      // refused save starts from what is stored now.
      key={`${id}:${data.template?.version ?? 0}:${stamp}`}
      data={data}
      actions={{
        save: saveListTemplateAction.bind(null, access.businessId),
        archive: archiveListTemplateAction.bind(null, access.businessId),
      }}
      paths={templatePaths(t("title"))}
    />
  );
}
