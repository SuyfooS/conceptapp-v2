import type { ModuleKey } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { Badge } from "@ui/badge";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Building2, History, SlidersHorizontal, Users } from "lucide-react";
import { moduleIcons } from "../module-icons";
import { type AppWording, translator } from "../wording";

/**
 * The way into everything a business can change by itself: its own details,
 * then each module that is on, which brings its row, so a new module needs
 * nothing here. `base` keeps the links inside the demo, which also renders
 * this on /design/shell/manage.
 */
export function ManageView({
  modules,
  base = "",
  home,
  team,
  shabbatCity,
  wording,
}: {
  modules: ModuleKey[];
  base?: string;
  home: string;
  team: string;
  /** Whether the details ask for a Shabbat city, and whether it's missing. */
  shabbatCity: "missing" | "chosen" | "notAsked";
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage");
  const tm = translator(wording, "modules");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: home, label: t("home") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <ListGroup className="md:max-w-2xl">
        <ListRow
          href={`${base}/manage/business`}
          leading={<Building2 />}
          title={t("business.title")}
          subtitle={t(
            shabbatCity === "missing"
              ? "business.rowNoCity"
              : shabbatCity === "chosen"
                ? "business.row"
                : "business.rowNoShabbat",
          )}
          trailing={
            shabbatCity === "missing" ? (
              <Badge tone="warning">{t("business.noCity")}</Badge>
            ) : undefined
          }
        />
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
      {/* Looking back, apart from what's changed here. */}
      <ListGroup className="md:max-w-2xl">
        <ListRow
          href={`${base}/manage/activity`}
          leading={<History />}
          title={t("activity.title")}
          subtitle={t("activity.row")}
        />
      </ListGroup>
    </PageBody>
  );
}
