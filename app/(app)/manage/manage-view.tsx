import type { ModuleKey } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { SlidersHorizontal, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { moduleIcons } from "../module-icons";

/**
 * The way into everything a business can change by itself. Each module that is
 * on brings its row, so a new module needs nothing here. `base` keeps the links
 * inside the demo, which also renders this on /design/shell/manage.
 */
export function ManageView({
  modules,
  base = "",
  home,
  team,
}: {
  modules: ModuleKey[];
  base?: string;
  home: string;
  team: string;
}) {
  const t = useTranslations("app.manage");
  const tm = useTranslations("modules");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: home, label: t("home") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <ListGroup className="md:max-w-2xl">
        {modules.map((key) => {
          const nav = manifestFor(key).nav;
          return (
            <ListRow
              key={key}
              href={`${base}/manage/${key}`}
              leading={nav ? moduleIcons[nav.icon] : <SlidersHorizontal />}
              title={tm(`${key}.name`)}
              subtitle={t(`summary.${key}`)}
            />
          );
        })}
        <ListRow
          href={team}
          leading={<Users />}
          title={t("team.title")}
          subtitle={t("team.subtitle")}
        />
      </ListGroup>
    </PageBody>
  );
}
