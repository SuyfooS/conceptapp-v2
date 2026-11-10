import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { restoreListTemplateAction } from "../actions";
import {
  currentTemplatesScreen,
  listsAccess,
  listsPaths,
  templatePaths,
} from "../lists";
import { TemplatesView } from "./templates-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.lists.templates");
  return { title: t("title") };
}

// The business's templates, for whoever manages lists. Anyone else who opens
// lists goes back to Lists; whoever can't gets the not-found screen.
// `?removed=` is a template just removed in its editor, with its undo.
export default async function ListTemplatesPage({
  searchParams,
}: PageProps<"/lists/templates">) {
  const { removed } = await searchParams;
  const [data, access, wording] = await Promise.all([
    currentTemplatesScreen(typeof removed === "string" ? removed : undefined),
    listsAccess(),
    currentWording(),
  ]);
  if (!access) notFound();
  if (!data) redirect(listsPaths.lists);
  const t = translator(wording, "app.lists");
  return (
    <TemplatesView
      data={data}
      restore={restoreListTemplateAction.bind(null, access.businessId)}
      paths={templatePaths(t("title"))}
    />
  );
}
