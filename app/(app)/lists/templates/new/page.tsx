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
  const t = translator(baseWording, "app.lists.templates.editor");
  return { title: t("newTitle") };
}

// A new template, saved by itself once it has a name and an item, which then
// takes its own address. Only for whoever manages lists and isn't viewing.
export default async function NewListTemplatePage() {
  const [data, access] = await Promise.all([
    currentTemplateEditor(null, false),
    listsAccess(),
  ]);
  if (!access) notFound();
  if (!data)
    redirect(access.canManage ? listsPaths.templates : listsPaths.lists);
  const t = translator(baseWording, "app.lists");
  return (
    <TemplateEditor
      data={data}
      actions={{
        save: saveListTemplateAction.bind(null, access.businessId),
        archive: archiveListTemplateAction.bind(null, access.businessId),
      }}
      paths={templatePaths(t("title"))}
    />
  );
}
