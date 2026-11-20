import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MenuImportView } from "../../../../../(app)/orders/menu/import/import-view";
import { demoPastedMenu, orderDemoMenu } from "../../../../order-taking/data";
import { twinDepartments, twinMenu } from "../../../../order-taking/real-menu";
import { demoImportMenu } from "../../../actions";
import { setups } from "../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// A business's menu copied in by the team (waiter mode P2), on the twin's
// restaurant menu, with a café's paste and a stand-in that stores nothing.
export default async function ConsoleMenuImportDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  const t = await getTranslations("admin.settings");
  const settings = `/design/console/businesses/${slug}/settings`;
  return (
    <MenuImportView
      existing={twinMenu({ menu: orderDemoMenu, soldOut: [] }, 1)}
      departments={twinDepartments()}
      importMenu={demoImportMenu}
      paths={{
        back: { href: settings, label: t("title") },
        done: { href: settings, label: t("title") },
        departments: settings,
      }}
      eyebrow={setup.business.name}
      initialPaste={demoPastedMenu}
    />
  );
}
