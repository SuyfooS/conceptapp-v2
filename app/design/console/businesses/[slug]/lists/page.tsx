import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplatesView } from "../../../../../(app)/lists/templates/templates-view";
import { demoTemplateChange } from "../../../../shell/lists/actions";
import { demoTemplatesScreen } from "../../../../shell/lists/data";
import { setups } from "../../../data";
import { consoleTemplatePaths } from "./paths";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ removed?: string }>;
};

// A business's templates as the team sets them up, with the restaurant's mock
// templates and stand-in actions.
export default function ConsoleTemplatesDemo({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ slug }, { removed }] = await Promise.all([params, searchParams]);
  if (!setups[slug]) notFound();
  return (
    <TemplatesView
      data={demoTemplatesScreen(removed)}
      restore={demoTemplateChange}
      paths={consoleTemplatePaths(slug)}
    />
  );
}
