import type { WordingEntry } from "@domain/wording";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { getTranslations } from "next-intl/server";
import { WordingEditor } from "./wording-editor";
import type { SaveWording } from "./wording-types";

/**
 * A business's sentences, for the ConceptApp team. Also on /design/console
 * with mock sentences and a stand-in save.
 */
export async function WordingView({
  name,
  backHref,
  entries,
  save,
}: {
  name: string;
  backHref: string;
  entries: WordingEntry[];
  save: SaveWording;
}) {
  const t = await getTranslations("admin.wording");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: name }}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <WordingEditor entries={entries} save={save} />
    </PageBody>
  );
}
