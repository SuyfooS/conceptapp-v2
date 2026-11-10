import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplateEditor } from "../../../../../(app)/lists/templates/template-editor";
import { demoSaveTemplate, demoTemplateChange } from "../../actions";
import { demoTemplateEditor, demoTemplates } from "../../data";
import { demoTemplatePaths } from "../../paths";

export const generateStaticParams = () =>
  demoTemplates.map((template) => ({ id: template.id }));

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ changed?: string; as?: string; state?: string }>;
};

// One of the restaurant's templates in its editor, saving itself into
// nothing. `?changed=1` is the editor opened again after someone else's save
// overtook this one; `?as=viewing` the team viewing the restaurant as a
// manager, which only reads; `?state=barGone` the restaurant after its bar
// was removed, so the bar's order can't be saved and says why;
// `?state=shiftGone` the restaurant after its evening shift left the
// settings, so the bar's closing, which follows it, holds the saves and says
// so on top; `?state=demo` a demo business, which takes no photos, so the
// weekly cleaning's photo item stays optional and its sheet says why. The
// removed one (t-stock-count) is only read.
export default function ShellTemplate({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ id }, { changed, as, state }] = await Promise.all([
    params,
    searchParams,
  ]);
  const data = demoTemplateEditor(
    id,
    changed !== undefined,
    as === "viewing",
    state === "barGone" ? "dep-bar" : undefined,
    state === "shiftGone" ? "evening" : undefined,
    state === "demo",
  );
  if (!data) notFound();
  return (
    <TemplateEditor
      key={`${id}:${changed ?? ""}:${as ?? ""}:${state ?? ""}`}
      data={data}
      actions={{ save: demoSaveTemplate, archive: demoTemplateChange }}
      paths={demoTemplatePaths()}
    />
  );
}
