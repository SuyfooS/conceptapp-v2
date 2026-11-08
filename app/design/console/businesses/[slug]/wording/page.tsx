import { type MessageTree, wordingEntries } from "@domain/wording";
import { notFound } from "next/navigation";
import he from "@/messages/he.json";
import { WordingView } from "../../../../../(admin)/admin/businesses/[slug]/wording/wording-view";
import { demoSaveWording } from "../../../actions";
import { demoWording, setups } from "../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// The real wording editor, with a few demo sentences from the template and
// the business, and a save that checks but stores nothing.
export default async function ConsoleWordingDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <WordingView
      name={setup.business.name}
      backHref={`/design/console/businesses/${slug}`}
      entries={wordingEntries(
        he as MessageTree,
        demoWording.template,
        demoWording.business,
      )}
      save={demoSaveWording}
    />
  );
}
