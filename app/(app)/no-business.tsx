import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { Store } from "lucide-react";
import { CenteredScreen } from "@/app/centered-screen";
import { baseWording, translator } from "./wording";

/**
 * Signed in, but no business has added this number yet. Also rendered on
 * /design/screens/no-business.
 */
export async function NoBusinessScreen({
  signOut,
}: {
  /** `signOut`, or the design demo's stand-in. */
  signOut: () => Promise<void>;
}) {
  // No business, so no business's words.
  const t = translator(baseWording, "app");
  return (
    <CenteredScreen>
      <EmptyState
        icon={<Store />}
        title={t("noBusiness.title")}
        body={t("noBusiness.body")}
      >
        <form action={signOut} className="flex flex-col">
          <Button type="submit" variant="secondary" size="lg">
            {t("signOut")}
          </Button>
        </form>
      </EmptyState>
    </CenteredScreen>
  );
}
