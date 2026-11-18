import { notFound } from "next/navigation";
import { TemplateEditor } from "../../../../../(app)/lists/templates/template-editor";
import { demoSaveTemplate, demoTemplateChange } from "../../actions";
import { demoTemplateEditor } from "../../data";
import { demoTemplatePaths } from "../../paths";

// A new template on the demo: it saves itself into nothing once it has a
// name and an item.
export default function ShellNewTemplate() {
  const data = demoTemplateEditor("new", false);
  if (!data) notFound();
  return (
    <TemplateEditor
      data={data}
      actions={{ save: demoSaveTemplate, archive: demoTemplateChange }}
      paths={demoTemplatePaths()}
    />
  );
}
