import { useTranslations } from "next-intl";
import { BusinessesView } from "../../(admin)/admin/businesses-view";
import { demoSignOut } from "./actions";
import { businesses, consoleUser } from "./data";

// The console's real first screen, with mock businesses.
export default function ConsoleDemo() {
  const t = useTranslations("admin.roles");
  return (
    <BusinessesView
      businesses={businesses}
      canCreate
      basePath="/design/console"
      account={{ name: consoleUser.name, role: t("platform_admin") }}
      signOut={demoSignOut}
    />
  );
}
