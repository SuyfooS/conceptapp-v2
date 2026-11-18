import { Suspense } from "react";
import { TemplatesView } from "../../../../(app)/lists/templates/templates-view";
import { demoTemplateChange } from "../actions";
import { demoEmptyTemplatesScreen, demoTemplatesScreen } from "../data";
import { demoTemplatePaths } from "../paths";

type Props = {
  searchParams: Promise<{ removed?: string; state?: string; as?: string }>;
};

// The real screen of templates as Shiran has it: the restaurant's lists by
// department, one removed. `?removed=` shows one just removed in its editor,
// with its undo; `?state=empty` a business with none left; `?as=viewing` the
// team viewing the restaurant as a manager, which only reads.
export default function ShellTemplates({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { removed, state, as } = await searchParams;
  const viewing = as === "viewing";
  return (
    <TemplatesView
      data={
        state === "empty"
          ? demoEmptyTemplatesScreen(viewing)
          : demoTemplatesScreen(removed, viewing)
      }
      restore={demoTemplateChange}
      paths={demoTemplatePaths()}
    />
  );
}
