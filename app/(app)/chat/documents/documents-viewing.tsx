import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { EyeOff } from "lucide-react";
import { type AppWording, translator } from "../../wording";

/**
 * Documents while the ConceptApp team views the business as a role (plan
 * §11.9): the screen says only that documents aren't shown, in chat's words
 * for both. Nothing of any document is read for it, and the database reads
 * a view session none either.
 */
export function DocumentsViewingView({ wording }: { wording: AppWording }) {
  const t = translator(wording, "app.chat");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader title={t("documents.title")} />
      <EmptyState
        headingLevel="h2"
        icon={<EyeOff />}
        body={t("viewing")}
        className="md:py-16"
      />
    </PageBody>
  );
}
