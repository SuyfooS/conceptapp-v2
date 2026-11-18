import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BusinessesView } from "../../(admin)/admin/businesses-view";
import { demoSignOut } from "./actions";
import { businesses, consoleUser, demoStorage } from "./data";

type Props = { searchParams: Promise<{ storage?: string }> };

// The console's real first screen, with mock businesses and how full the
// free plan is (`?storage=high`: past 700 MB, the businesses' space adding up
// past the 900 MB where new chat files stop; `?storage=full`: past those
// 900 MB, new chat files refused now).
export default function ConsoleDemo({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const [{ storage }, t] = await Promise.all([
    searchParams,
    getTranslations("admin.roles"),
  ]);
  return (
    <BusinessesView
      businesses={businesses}
      canCreate
      basePath="/design/console"
      account={{ name: consoleUser.name, role: t("platform_admin") }}
      signOut={demoSignOut}
      storage={demoStorage(
        storage === "high" || storage === "full" ? storage : "low",
      )}
    />
  );
}
