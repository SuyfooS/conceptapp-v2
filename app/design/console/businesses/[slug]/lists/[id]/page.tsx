import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplateEditor } from "../../../../../../(app)/lists/templates/template-editor";
import {
  demoSaveTemplate,
  demoTemplateChange,
} from "../../../../../shell/lists/actions";
import {
  demoTemplateEditor,
  demoTemplates,
} from "../../../../../shell/lists/data";
import { setups } from "../../../../data";
import { consoleTemplatePaths } from "../paths";

export const generateStaticParams = () =>
  Object.keys(setups).flatMap((slug) =>
    demoTemplates.map((template) => ({ slug, id: template.id })),
  );

type Props = { params: Promise<{ slug: string; id: string }> };

// One template in the editor as the team has it in the console: the same
// editor, nothing to send, saving into nothing.
export default function ConsoleTemplateDemo({ params }: Props) {
  return (
    <Suspense>
      <Demo params={params} />
    </Suspense>
  );
}

async function Demo({ params }: Props) {
  const { slug, id } = await params;
  const data = setups[slug] ? demoTemplateEditor(id, false) : null;
  if (!data) notFound();
  return (
    <TemplateEditor
      data={data}
      actions={{ save: demoSaveTemplate, archive: demoTemplateChange }}
      paths={consoleTemplatePaths(slug)}
    />
  );
}
